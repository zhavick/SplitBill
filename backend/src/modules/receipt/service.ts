import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { MAX_SHOTS_PER_RECEIPT } from '@splitbill/shared';
import { AppError } from '../../lib/errors.js';
import { preprocessReceiptImage } from './image-preprocessor.js';
import type { OcrEngine } from './ocr-engine.js';
import type { CleanedReceiptItem } from './stitching.js';
import { stitchAndCleanReceiptData } from './stitching.js';
import type { ReceiptStorage } from './storage.js';

export interface UploadShotInput {
  transactionId?: string;
  ownerId?: string;
  shotIndex: number;
  buffer: Buffer;
  mimeType: string;
}

export interface ReviewReceiptInput {
  merchantName?: string;
  receiptDate?: string;
  items: {
    id?: string;
    name: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    assignedTags?: { participantId: string; shareRatio: number }[];
  }[];
  adjustment: {
    tax: number;
    serviceCharge: number;
    discount: number;
    rounding: number;
    grandTotal: number;
    overheadStrategy?: 'EQUAL' | 'PROPORTIONAL';
  };
}

export class ReceiptService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ReceiptStorage,
    private readonly ocrEngine: OcrEngine,
  ) {}

  async uploadShot(input: UploadShotInput) {
    if (input.shotIndex < 1 || input.shotIndex > MAX_SHOTS_PER_RECEIPT) {
      throw new AppError(
        400,
        'INVALID_SHOT_INDEX',
        `Nomor shot harus antara 1 sampai ${MAX_SHOTS_PER_RECEIPT}.`,
      );
    }

    // 1. Dapatkan atau buat transaksi baru jika belum ada ID
    let transactionId = input.transactionId;
    if (!transactionId) {
      const newTx = await this.prisma.splitTransaction.create({
        data: {
          ownerId: input.ownerId,
          merchantName: 'Memproses Struk...',
          items: [],
          adjustment: {
            subtotal: 0,
            tax: 0,
            serviceCharge: 0,
            discount: 0,
            rounding: 0,
            grandTotal: 0,
            overheadStrategy: 'EQUAL',
          },
        },
      });
      transactionId = newTx.id;
    } else {
      const existing = await this.prisma.splitTransaction.findUnique({
        where: { id: transactionId },
      });
      if (!existing) {
        throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Sesi transaksi tidak ditemukan.');
      }
    }

    // 2. Preprocess gambar dengan Sharp
    const preprocessed = await preprocessReceiptImage(input.buffer);

    // 3. Simpan ke object storage
    const storageKey = `receipts/${transactionId}/shot-${input.shotIndex}-${Date.now()}.jpg`;
    const imageUrl = await this.storage.upload(storageKey, preprocessed.buffer, 'image/jpeg');

    // 4. Catat shot di database
    const shot = await this.prisma.receiptShot.upsert({
      where: {
        transactionId_shotIndex: {
          transactionId,
          shotIndex: input.shotIndex,
        },
      },
      update: {
        imageStorageKey: storageKey,
        imageUrl,
        capturedAt: new Date(),
      },
      create: {
        transactionId,
        shotIndex: input.shotIndex,
        imageStorageKey: storageKey,
        imageUrl,
      },
    });

    // 5. Catat log audit
    await this.prisma.transactionAuditLog.create({
      data: {
        transactionId,
        action: 'SHOT_UPLOADED',
        actorName: input.ownerId ? `User:${input.ownerId}` : 'Guest',
        details: { shotIndex: input.shotIndex, imageUrl, imageSize: preprocessed.size },
      },
    });

    return {
      transactionId,
      shotId: shot.id,
      shotIndex: shot.shotIndex,
      imageUrl: shot.imageUrl,
    };
  }

  async processOcr(transactionId: string) {
    const tx = await this.prisma.splitTransaction.findUnique({
      where: { id: transactionId },
      include: {
        shots: {
          orderBy: { shotIndex: 'asc' },
        },
      },
    });

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Sesi transaksi tidak ditemukan.');
    }

    if (tx.shots.length === 0) {
      throw new AppError(400, 'NO_SHOTS_FOUND', 'Belum ada foto struk yang diunggah untuk sesi ini.');
    }

    // 1. Ambil buffer seluruh foto struk dari storage
    const buffers: Buffer[] = [];
    for (const shot of tx.shots) {
      const buf = await this.storage.get(shot.imageStorageKey);
      buffers.push(buf);
    }

    // 2. Jalankan Vision AI OCR
    const rawOcr = await this.ocrEngine.extractFromImages(buffers);

    // 3. Jahit & hilangkan duplikasi multi-shot
    const cleaned = stitchAndCleanReceiptData(rawOcr);

    // 4. Simpan hasil ke transaksi PostgreSQL
    const updated = await this.prisma.splitTransaction.update({
      where: { id: transactionId },
      data: {
        merchantName: cleaned.merchantName,
        receiptDate: cleaned.receiptDate ? new Date(cleaned.receiptDate) : new Date(),
        status: 'ACTIVE',
        items: cleaned.items as unknown as Prisma.InputJsonValue,
        adjustment: {
          subtotal: cleaned.subtotal,
          tax: cleaned.tax,
          serviceCharge: cleaned.serviceCharge,
          discount: cleaned.discount,
          rounding: cleaned.rounding,
          grandTotal: cleaned.grandTotal,
          overheadStrategy: (tx.overheadStrategy as string) || 'EQUAL',
        } as unknown as Prisma.InputJsonValue,
      },
      include: {
        shots: true,
      },
    });

    // 5. Catat log audit
    await this.prisma.transactionAuditLog.create({
      data: {
        transactionId,
        action: 'OCR_PROCESSED',
        actorName: tx.ownerId ? `User:${tx.ownerId}` : 'Guest',
        details: {
          itemCount: cleaned.items.length,
          grandTotal: cleaned.grandTotal,
          shotsProcessed: tx.shots.length,
        },
      },
    });

    return updated;
  }

  async reviewReceipt(transactionId: string, input: ReviewReceiptInput) {
    const existing = await this.prisma.splitTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!existing) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Sesi transaksi tidak ditemukan.');
    }

    // Validasi dan siapkan items dengan ID
    const items: CleanedReceiptItem[] = input.items.map((it) => ({
      id: it.id || randomUUID(),
      name: it.name.trim(),
      qty: Math.max(1, Math.round(it.qty)),
      unitPrice: Math.round(it.unitPrice),
      totalPrice: Math.round(it.totalPrice || it.qty * it.unitPrice),
      assignedTags: it.assignedTags || [],
    }));

    const subtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);

    const updated = await this.prisma.splitTransaction.update({
      where: { id: transactionId },
      data: {
        merchantName: input.merchantName?.trim() || existing.merchantName,
        receiptDate: input.receiptDate ? new Date(input.receiptDate) : existing.receiptDate,
        overheadStrategy: input.adjustment.overheadStrategy || existing.overheadStrategy,
        items: items as unknown as Prisma.InputJsonValue,
        adjustment: {
          subtotal,
          tax: Math.round(input.adjustment.tax || 0),
          serviceCharge: Math.round(input.adjustment.serviceCharge || 0),
          discount: Math.round(input.adjustment.discount || 0),
          rounding: Math.round(input.adjustment.rounding || 0),
          grandTotal: Math.round(input.adjustment.grandTotal),
          overheadStrategy: input.adjustment.overheadStrategy || existing.overheadStrategy,
        } as unknown as Prisma.InputJsonValue,
      },
      include: {
        shots: true,
      },
    });

    // Catat log audit
    await this.prisma.transactionAuditLog.create({
      data: {
        transactionId,
        action: 'RECEIPT_REVIEWED',
        actorName: existing.ownerId ? `User:${existing.ownerId}` : 'Guest',
        details: {
          itemCount: items.length,
          grandTotal: input.adjustment.grandTotal,
        },
      },
    });

    return updated;
  }

  async getTransaction(transactionId: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transactionId)) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Sesi transaksi tidak ditemukan.');
    }

    const tx = await this.prisma.splitTransaction.findUnique({
      where: { id: transactionId },
      include: {
        shots: {
          orderBy: { shotIndex: 'asc' },
        },
        participants: true,
        auditLogs: {
          orderBy: { timestamp: 'desc' },
          take: 20,
        },
      },
    });

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Sesi transaksi tidak ditemukan.');
    }

    return tx;
  }
}
