import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { calculateFairSplit } from '../domain/fair-split.js';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { MemoryNotifier } from '../modules/auth/notifier.js';
import { MockOcrEngine } from '../modules/receipt/ocr-engine.js';
import { LocalReceiptStorage } from '../modules/receipt/storage.js';

function createMultipartPayload(
  fields: Record<string, string>,
  file: { name: string; filename: string; buffer: Buffer; contentType: string },
) {
  const boundary = '----SplitBillE2EBoundary' + Math.random().toString(36).substring(2);
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

describe('End-to-End (E2E) Full Workflow Simulation (Step 9.1)', () => {
  let app: FastifyInstance;
  let notifier: MemoryNotifier;
  let sampleImageBuffer: Buffer;

  // State yang dibawa antar-langkah pengujian alur E2E
  let userToken: string;
  let userId: string;
  let transactionId: string;
  let participantBudiId: string;
  let participantSitiId: string;
  let liveSessionCode: string;

  const testUserEmail = 'e2e_user@splitbill.id';

  beforeAll(async () => {
    notifier = new MemoryNotifier();

    // Gambar buatan untuk simulasi foto struk
    sampleImageBuffer = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .jpeg()
      .toBuffer();

    app = buildApp({
      notifier,
      receiptStorage: new LocalReceiptStorage(),
      ocrEngine: new MockOcrEngine({
        merchantName: 'Restoran Seafood Bahari',
        date: '2026-11-16',
        items: [
          { name: 'Ikan Gurame Bakar', qty: 1, unitPrice: 85000, totalPrice: 85000 },
          { name: 'Udang Saus Padang', qty: 1, unitPrice: 65000, totalPrice: 65000 },
          { name: 'Cah Kangkung Terasi', qty: 2, unitPrice: 18000, totalPrice: 36000 },
          { name: 'Es Teh Manis', qty: 3, unitPrice: 8000, totalPrice: 24000 },
        ],
        subtotal: 210000,
        tax: 21000,
        serviceCharge: 10500,
        discount: 15000,
        rounding: 0,
        grandTotal: 226500,
      }),
      logger: false,
    });
    await app.ready();

    // Bersihkan data tes sebelumnya
    await prisma.user.deleteMany({
      where: {
        email: { in: [testUserEmail] },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [testUserEmail] },
      },
    });
    await app.close();
  });

  // FASE 1: Registrasi & Autentikasi Pengguna
  describe('FASE 1: Registrasi Pengguna, Verifikasi OTP & JWT Bearer', () => {
    it('1.1 Pengguna mendaftar mandiri via email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          fullName: 'Bambang Sudirman',
          email: testUserEmail,
          password: 'PasswordBambang123!',
          channel: 'EMAIL',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('success');
      expect(body.data.status).toBe('PENDING_VERIFICATION');
    });

    it('1.2 Pengguna memverifikasi kode OTP dan mendapatkan JWT Access Token', async () => {
      const user = await prisma.user.findUnique({ where: { email: testUserEmail } });
      expect(user).toBeDefined();
      userId = user!.id;

      const tokenRecord = await prisma.verificationToken.findFirst({
        where: { userId },
      });
      expect(tokenRecord).toBeDefined();

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-otp',
        payload: {
          email: testUserEmail,
          code: tokenRecord!.token,
        },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = verifyRes.json();
      expect(body.data.tokens.accessToken).toBeDefined();
      userToken = body.data.tokens.accessToken;
    });

    it('1.3 Profil pengguna dapat diakses melalui endpoint terproteksi /me', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.user.email).toBe(testUserEmail);
      expect(body.data.user.role).toBe('MEMBER');
      expect(body.data.user.status).toBe('ACTIVE');
    });
  });

  // FASE 2: Unggah Struk Multi-Shot & Ekstraksi AI Vision OCR
  describe('FASE 2: Multi-Shot Camera & Ekstraksi Struk OCR AI', () => {
    it('2.1 Mengunggah Shot 1 foto bagian atas struk', async () => {
      const payloadData = createMultipartPayload(
        { shotIndex: '1' },
        {
          name: 'file',
          filename: 'struk_shot_1.jpg',
          buffer: sampleImageBuffer,
          contentType: 'image/jpeg',
        },
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/receipts/upload-shot',
        headers: {
          ...payloadData.headers,
          authorization: `Bearer ${userToken}`,
        },
        payload: payloadData.payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.transactionId).toBeDefined();
      expect(body.data.shotIndex).toBe(1);
      transactionId = body.data.transactionId;
    });

    it('2.2 Mengunggah Shot 2 foto bagian bawah struk (Multi-Shot)', async () => {
      const payloadData = createMultipartPayload(
        { shotIndex: '2', transactionId },
        {
          name: 'file',
          filename: 'struk_shot_2.jpg',
          buffer: sampleImageBuffer,
          contentType: 'image/jpeg',
        },
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/receipts/upload-shot',
        headers: {
          ...payloadData.headers,
          authorization: `Bearer ${userToken}`,
        },
        payload: payloadData.payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.shotIndex).toBe(2);
      expect(body.data.transactionId).toBe(transactionId);
    });

    it('2.3 Menjalankan pipeline AI OCR Vision untuk mengekstrak data terstruktur', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${transactionId}/process-ocr`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.merchantName).toBe('Restoran Seafood Bahari');
      expect(body.data.items.length).toBe(4);
      expect(body.data.adjustment.grandTotal).toBe(226500);
    });
  });

  // FASE 3: Review Struk, Tagging Partisipan & Kalkulasi Fair Split
  describe('FASE 3: Review Struk & Fair-Split Tagging Matematika Presisi', () => {
    it('3.1 Pemilik tagihan melakukan review & penyesuaian nominal struk', async () => {
      const reviewPayload = {
        merchantName: 'Restoran Seafood Bahari (Grand Cabang)',
        receiptDate: '2026-11-16',
        items: [
          { name: 'Ikan Gurame Bakar', qty: 1, unitPrice: 85000, totalPrice: 85000 },
          { name: 'Udang Saus Padang', qty: 1, unitPrice: 65000, totalPrice: 65000 },
          { name: 'Cah Kangkung Terasi', qty: 2, unitPrice: 18000, totalPrice: 36000 },
          { name: 'Es Teh Manis', qty: 3, unitPrice: 8000, totalPrice: 24000 },
        ],
        adjustment: {
          tax: 21000,
          serviceCharge: 10500,
          discount: 15000,
          rounding: 0,
          grandTotal: 226500,
          overheadStrategy: 'PROPORTIONAL',
        },
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/receipts/${transactionId}/review`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: reviewPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.merchantName).toBe('Restoran Seafood Bahari (Grand Cabang)');
    });

    it('3.2 Domain Fair-Split Engine menghitung pembagian persis rupiah tanpa selisih 1 perak', () => {
      const input = {
        participantIds: ['bambang', 'budi', 'siti'],
        items: [
          {
            id: 'item-1',
            totalPrice: 85000,
            assignedTags: [
              { participantId: 'bambang', shareRatio: 0.5 },
              { participantId: 'budi', shareRatio: 0.5 },
            ],
          },
          {
            id: 'item-2',
            totalPrice: 65000,
            assignedTags: [{ participantId: 'siti', shareRatio: 1.0 }],
          },
          {
            id: 'item-3',
            totalPrice: 36000,
            assignedTags: [
              { participantId: 'bambang', shareRatio: 0.333333 },
              { participantId: 'budi', shareRatio: 0.333333 },
              { participantId: 'siti', shareRatio: 0.333334 },
            ],
          },
          {
            id: 'item-4',
            totalPrice: 24000,
            assignedTags: [
              { participantId: 'bambang', shareRatio: 0.333333 },
              { participantId: 'budi', shareRatio: 0.333333 },
              { participantId: 'siti', shareRatio: 0.333334 },
            ],
          },
        ],
        adjustment: {
          tax: 21000,
          serviceCharge: 10500,
          discount: 15000,
          rounding: 0,
          grandTotal: 226500,
        },
        strategy: 'PROPORTIONAL' as const,
      };

      const result = calculateFairSplit(input);
      expect(result.computedTotal).toBe(226500);
      expect(result.discrepancy).toBe(0);

      // Verifikasi matematis: total akumulasi seluruh orang harus presisi sama dengan grand total
      const totalAllocated = result.bills.reduce((sum, p) => sum + p.finalPayable, 0);
      expect(totalAllocated).toBe(226500);

      // Setiap orang harus teralokasi angka rupiah bulat positif
      for (const person of result.bills) {
        expect(person.finalPayable).toBeGreaterThan(0);
        expect(Number.isInteger(person.finalPayable)).toBe(true);
      }
    });
  });

  // FASE 4: Live Table Session & Real-Time Sync
  describe('FASE 4: Live Table Session & QR Code Meja Kolaboratif', () => {
    it('4.1 Membuat sesi meja live dan menghasilkan QR Code meja', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${transactionId}/live-session`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          hostName: 'Bambang Sudirman',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.tableCode).toBeDefined();
      expect(body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      liveSessionCode = body.data.tableCode;
    });

    it('4.2 Tamu di meja dapat bergabung secara instan tanpa login via kode meja', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/table-session/${liveSessionCode}/join`,
        payload: {
          fullName: 'Doni Tamu',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.participant.id).toBeDefined();
      expect(body.data.state.items.length).toBe(4);
    });
  });

  // FASE 5: Pelunasan QRIS, Bukti Transfer & PDF Reimbursement
  describe('FASE 5: Dynamic QRIS, Pelunasan & Export Laporan PDF', () => {
    let settlementBudiId: string;

    beforeAll(async () => {
      // Daftarkan partisipan Budi & Siti di database transaksi
      const pBudi = await prisma.participant.create({
        data: {
          transactionId,
          fullName: 'Budi Santoso',
          isSelf: false,
          avatarColor: '#2563EB',
        },
      });
      participantBudiId = pBudi.id;

      const sBudi = await prisma.paymentSettlement.create({
        data: {
          transactionId,
          participantId: participantBudiId,
          amountPayable: 67411,
          status: 'UNPAID',
        },
      });
      settlementBudiId = sBudi.id;

      const pSiti = await prisma.participant.create({
        data: {
          transactionId,
          fullName: 'Siti Rahma',
          isSelf: false,
          avatarColor: '#10B981',
        },
      });
      participantSitiId = pSiti.id;

      await prisma.paymentSettlement.create({
        data: {
          transactionId,
          participantId: participantSitiId,
          amountPayable: 91679,
          status: 'UNPAID',
        },
      });
    });

    it('5.1 Mengenerate Dynamic EMVCo QRIS terkunci sesuai tagihan Budi (Rp 67.411)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/settlements/qris/generate',
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          transactionId,
          participantId: participantBudiId,
          amount: 67411,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.amount).toBe(67411);
      expect(body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(body.data.payload).toContain('67411'); // Payload EMVCo memuat nominal persis
    });

    it('5.2 Budi mengunggah screenshot bukti transfer m-banking', async () => {
      const fakeProof = await sharp({
        create: {
          width: 400,
          height: 600,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      const payloadData = createMultipartPayload(
        {},
        {
          name: 'proofImage',
          filename: 'transfer_budi.jpg',
          buffer: fakeProof,
          contentType: 'image/jpeg',
        },
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/settlements/${settlementBudiId}/upload-proof`,
        headers: payloadData.headers,
        payload: payloadData.payload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe('PENDING_VERIFICATION');
    });

    it('5.3 Pemilik tagihan memverifikasi bukti dan menandai status lunas (VERIFIED)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/settlements/${settlementBudiId}/verify`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
        payload: {
          status: 'VERIFIED',
          actorName: 'Bambang Sudirman',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe('VERIFIED');
    });

    it('5.4 Mengunduh Berkas Laporan Resmi PDF Reimbursement Kantor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/receipts/${transactionId}/reimbursement-pdf?applicantName=Bambang%20Sudirman&department=Engineering`,
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      // Verifikasi header Magic Bytes berkas PDF (%PDF-)
      const buffer = res.rawPayload;
      const magicBytes = buffer.subarray(0, 4).toString('ascii');
      expect(magicBytes).toBe('%PDF');
    });
  });

  // FASE 6: Admin Portal & Retensi Data PDP
  describe('FASE 6: Admin Backoffice & Data Retention Cleanup', () => {
    it('6.1 Admin mengakses ringkasan metrik platform & performa AI', async () => {
      const resExec = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/metrics/executive',
      });

      expect(resExec.statusCode).toBe(200);
      const execBody = resExec.json();
      expect(execBody.data.totalTransactions).toBeGreaterThan(0);

      const resAi = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/metrics/ai-performance',
      });

      expect(resAi.statusCode).toBe(200);
      const aiBody = resAi.json();
      expect(aiBody.data.successRate).toBeDefined();
    });

    it('6.2 Admin memicu pembersihan retensi data struk 30 hari (UU PDP)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/maintenance/cleanup',
        payload: {
          retentionDays: 30,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('success');
      expect(body.data.cleanedDraftCount).toBeDefined();
      expect(body.data.message).toMatch(/pembersihan berhasil/i);
    });
  });
});
