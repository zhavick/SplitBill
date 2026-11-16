import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { preprocessReceiptImage } from './image-preprocessor.js';
import { MockOcrEngine } from './ocr-engine.js';
import { stitchAndCleanReceiptData } from './stitching.js';
import { LocalReceiptStorage } from './storage.js';

function createMultipartPayload(
  fields: Record<string, string>,
  file: { name: string; filename: string; buffer: Buffer; contentType: string },
) {
  const boundary = '----SplitBillFormBoundary' + Math.random().toString(36).substring(2);
  const crlf = '\r\n';
  let body = '';
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="${key}"${crlf}${crlf}`;
    body += `${value}${crlf}`;
  }
  body += `--${boundary}${crlf}`;
  body += `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"${crlf}`;
  body += `Content-Type: ${file.contentType}${crlf}${crlf}`;

  const headerBuf = Buffer.from(body, 'utf-8');
  const footerBuf = Buffer.from(`${crlf}--${boundary}--${crlf}`, 'utf-8');
  const payload = Buffer.concat([headerBuf, file.buffer, footerBuf]);

  return {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  };
}

describe('Receipt OCR & Preprocessing Pipeline (Step 4)', () => {
  let app: FastifyInstance;
  let sampleImageBuffer: Buffer;

  beforeAll(async () => {
    // Buat gambar uji coba 2000x1200px menggunakan sharp
    sampleImageBuffer = await sharp({
      create: {
        width: 2000,
        height: 1200,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();

    const mockOcr = new MockOcrEngine({
      merchantName: 'Warung Nasi Sambal Bakar',
      date: '2026-11-16',
      items: [
        { name: 'Ayam Sambal Bakar', qty: 2, unitPrice: 25000, totalPrice: 50000 },
        { name: 'Nasi Putih Pulen', qty: 2, unitPrice: 6000, totalPrice: 12000 },
        { name: 'Es Jeruk Segar', qty: 2, unitPrice: 8000, totalPrice: 16000 },
      ],
      subtotal: 78000,
      discount: 0,
      serviceCharge: 0,
      tax: 7800,
      rounding: 0,
      grandTotal: 85800,
    });

    app = buildApp({
      receiptStorage: new LocalReceiptStorage(),
      ocrEngine: mockOcr,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Image Preprocessor: resize max 1600px, EXIF rotate, contrast normalize & JPEG 85%', async () => {
    const processed = await preprocessReceiptImage(sampleImageBuffer);
    expect(processed.format).toBe('jpeg');
    expect(processed.width).toBeLessThanOrEqual(1600);
    expect(processed.buffer.length).toBeGreaterThan(0);
    expect(processed.size).toBe(processed.buffer.length);
  });

  it('2. Multi-Shot Stitching: de-duplikasi baris tumpang tindih & ID unik per item', () => {
    const rawData = {
      merchantName: 'Resto Panjang',
      items: [
        { name: 'Item 1', qty: 1, unitPrice: 10000, totalPrice: 10000 },
        { name: 'Item 2', qty: 1, unitPrice: 15000, totalPrice: 15000 },
        // Item 2 difoto ulang di awal shot 2 (tumpang tindih / overlap)
        { name: 'Item 2', qty: 1, unitPrice: 15000, totalPrice: 15000 },
        { name: 'Item 3', qty: 2, unitPrice: 20000, totalPrice: 40000 },
      ],
      subtotal: 65000,
      discount: 0,
      serviceCharge: 0,
      tax: 6500,
      rounding: 0,
      grandTotal: 71500,
    };

    const cleaned = stitchAndCleanReceiptData(rawData);
    // Item 2 hanya boleh ada 1 kali
    expect(cleaned.items.length).toBe(3);
    expect(cleaned.items.map((i) => i.name)).toEqual(['Item 1', 'Item 2', 'Item 3']);
    // Tiap item punya UUID
    cleaned.items.forEach((it) => {
      expect(it.id).toBeDefined();
      expect(it.id.length).toBeGreaterThan(10);
    });
    expect(cleaned.subtotal).toBe(65000);
  });

  it('3. Upload Shot 1 & Shot 2 (Multi-Shot flow)', async () => {
    // 3a. Upload Shot 1
    const multipart1 = createMultipartPayload(
      { shotIndex: '1' },
      { name: 'file', filename: 'shot-1.jpg', buffer: sampleImageBuffer, contentType: 'image/jpeg' },
    );

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts/upload-shot',
      headers: multipart1.headers,
      payload: multipart1.payload,
    });

    expect(res1.statusCode).toBe(201);
    const body1 = res1.json();
    expect(body1.status).toBe('success');
    expect(body1.data.transactionId).toBeDefined();
    expect(body1.data.shotIndex).toBe(1);
    expect(body1.data.imageUrl).toContain('/uploads/receipts/');

    const txId = body1.data.transactionId;

    // 3b. Upload Shot 2 (lembar lanjutan untuk transaksi yang sama)
    const multipart2 = createMultipartPayload(
      { transactionId: txId, shotIndex: '2' },
      { name: 'file', filename: 'shot-2.jpg', buffer: sampleImageBuffer, contentType: 'image/jpeg' },
    );

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts/upload-shot',
      headers: multipart2.headers,
      payload: multipart2.payload,
    });

    expect(res2.statusCode).toBe(201);
    const body2 = res2.json();
    expect(body2.data.transactionId).toBe(txId);
    expect(body2.data.shotIndex).toBe(2);

    // Cek di database apakah kedua shot tersimpan
    const shots = await prisma.receiptShot.findMany({
      where: { transactionId: txId },
      orderBy: { shotIndex: 'asc' },
    });
    expect(shots.length).toBe(2);
    expect(shots[0].shotIndex).toBe(1);
    expect(shots[1].shotIndex).toBe(2);
  });

  it('4. Proses OCR AI & Review Struk flow', async () => {
    // 4a. Upload shot untuk transaksi baru
    const multipart = createMultipartPayload(
      { shotIndex: '1' },
      { name: 'file', filename: 'struk.jpg', buffer: sampleImageBuffer, contentType: 'image/jpeg' },
    );

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts/upload-shot',
      headers: multipart.headers,
      payload: multipart.payload,
    });
    const txId = uploadRes.json().data.transactionId;

    // 4b. Panggil process-ocr
    const ocrRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${txId}/process-ocr`,
    });

    expect(ocrRes.statusCode).toBe(200);
    const ocrBody = ocrRes.json();
    expect(ocrBody.status).toBe('success');
    expect(ocrBody.data.merchantName).toBe('Warung Nasi Sambal Bakar');
    expect(ocrBody.data.status).toBe('ACTIVE');

    const items = ocrBody.data.items as { id: string; name: string; totalPrice: number }[];
    expect(items.length).toBe(3);
    expect(items[0].name).toBe('Ayam Sambal Bakar');
    expect(ocrBody.data.adjustment.grandTotal).toBe(85800);

    // 4c. Review & Koreksi Manual Struk
    const reviewRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/receipts/${txId}/review`,
      payload: {
        merchantName: 'Warung Sambal Bakar Juara',
        items: [
          {
            id: items[0].id,
            name: 'Ayam Sambal Bakar Pedas',
            qty: 2,
            unitPrice: 26000,
            totalPrice: 52000,
          },
          {
            id: items[1].id,
            name: 'Nasi Putih Pulen',
            qty: 2,
            unitPrice: 6000,
            totalPrice: 12000,
          },
        ],
        adjustment: {
          tax: 6400,
          serviceCharge: 0,
          discount: 0,
          rounding: 0,
          grandTotal: 70400,
          overheadStrategy: 'EQUAL',
        },
      },
    });

    expect(reviewRes.statusCode).toBe(200);
    const reviewBody = reviewRes.json();
    expect(reviewBody.data.merchantName).toBe('Warung Sambal Bakar Juara');
    expect((reviewBody.data.items as unknown[]).length).toBe(2);
    expect(reviewBody.data.adjustment.grandTotal).toBe(70400);

    // 4d. Get Transaction
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${txId}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.id).toBe(txId);
    expect(getRes.json().data.shots.length).toBe(1);
    expect(getRes.json().data.auditLogs.length).toBeGreaterThan(0);
  });
});
