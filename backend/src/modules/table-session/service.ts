import QRCode from 'qrcode';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import {
  saveSessionState,
  getSessionState,
  publishTableEvent,
  TableSessionState,
  TableItem,
  TableParticipant,
} from './redis-pubsub.js';

export class TableSessionService {
  /**
   * Menghasilkan kode acak 4 karakter alfanumerik kapital untuk kode meja
   */
  private static generateTableCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TBL-${code}`;
  }

  /**
   * Membuka sesi meja kolaboratif baru atau mengambil sesi yang sudah ada
   */
  static async createLiveSession(params: {
    transactionId: string;
    hostName?: string;
    userId?: string;
  }): Promise<{
    tableCode: string;
    qrCodeDataUrl: string;
    joinUrl: string;
    state: TableSessionState;
  }> {
    const tx = await prisma.splitTransaction.findUnique({
      where: { id: params.transactionId },
    });

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaksi struk tidak ditemukan');
    }

    let code = tx.liveSessionCode;
    if (!code) {
      code = this.generateTableCode();
      await prisma.splitTransaction.update({
        where: { id: tx.id },
        data: {
          isLiveSession: true,
          liveSessionCode: code,
          ownerId: params.userId || tx.ownerId,
        },
      });
    }

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3385';
    const joinUrl = `${frontendBase}/join/${code}`;

    // Generate Dynamic QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#1e3a8a',
        light: '#ffffff',
      },
    });

    // Cek apakah state sudah ada di Redis
    let state = await getSessionState(code);
    if (!state) {
      const dbItems = (tx.items as any[]) || [];
      const dbAdj = (tx.adjustment as any) || {};

      const items: TableItem[] = dbItems.map((it: any, idx: number) => ({
        id: it.id || `item_${idx}`,
        itemName: it.itemName,
        quantity: it.quantity,
        itemPrice: it.itemPrice,
        totalPrice: it.totalPrice,
        assignedParticipantIds: it.assignedParticipantIds || [],
      }));

      const hostParticipant: TableParticipant = {
        id: 'participant_host',
        fullName: params.hostName || 'Pemilik Tagihan',
        isHost: true,
      };

      state = {
        transactionId: tx.id,
        tableCode: code,
        merchantName: tx.merchantName,
        receiptDate: tx.receiptDate?.toISOString(),
        taxAmount: dbAdj.taxAmount || 0,
        serviceCharge: dbAdj.serviceCharge || 0,
        discountAmount: dbAdj.discountAmount || 0,
        roundingAmount: dbAdj.roundingAmount || 0,
        finalTotal: dbAdj.finalTotal || 0,
        items,
        participants: [hostParticipant],
        updatedAt: new Date().toISOString(),
      };

      await saveSessionState(code, state);
    }

    return {
      tableCode: code,
      qrCodeDataUrl,
      joinUrl,
      state,
    };
  }

  /**
   * Mengambil detail status sesi meja (dapat diakses publik oleh tamu tanpa login)
   */
  static async getLiveSession(tableCode: string): Promise<TableSessionState> {
    const formattedCode = tableCode.trim().toUpperCase();
    let state = await getSessionState(formattedCode);

    if (!state) {
      // Fallback ke PostgreSQL
      const tx = await prisma.splitTransaction.findUnique({
        where: { liveSessionCode: formattedCode },
      });

      if (!tx) {
        throw new AppError(404, 'LIVE_SESSION_NOT_FOUND', 'Sesi meja kolaboratif tidak ditemukan atau telah ditutup');
      }

      const dbItems = (tx.items as any[]) || [];
      const dbAdj = (tx.adjustment as any) || {};

      state = {
        transactionId: tx.id,
        tableCode: formattedCode,
        merchantName: tx.merchantName,
        receiptDate: tx.receiptDate?.toISOString(),
        taxAmount: dbAdj.taxAmount || 0,
        serviceCharge: dbAdj.serviceCharge || 0,
        discountAmount: dbAdj.discountAmount || 0,
        roundingAmount: dbAdj.roundingAmount || 0,
        finalTotal: dbAdj.finalTotal || 0,
        items: dbItems.map((it: any, idx: number) => ({
          id: it.id || `item_${idx}`,
          itemName: it.itemName,
          quantity: it.quantity,
          itemPrice: it.itemPrice,
          totalPrice: it.totalPrice,
          assignedParticipantIds: it.assignedParticipantIds || [],
        })),
        participants: [
          {
            id: 'participant_host',
            fullName: 'Pemilik Tagihan',
            isHost: true,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      await saveSessionState(formattedCode, state);
    }

    return state;
  }

  /**
   * Tamu bergabung ke sesi meja dengan nama panggilan
   */
  static async joinParticipant(
    tableCode: string,
    fullName: string
  ): Promise<{
    participant: TableParticipant;
    state: TableSessionState;
  }> {
    const state = await this.getLiveSession(tableCode);
    const cleanName = fullName.trim();

    if (!cleanName) {
      throw new AppError(400, 'INVALID_NAME', 'Nama panggilan wajib diisi');
    }

    let existing = state.participants.find(
      (p) => p.fullName.toLowerCase() === cleanName.toLowerCase()
    );

    if (!existing) {
      existing = {
        id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fullName: cleanName,
        isHost: false,
      };
      state.participants.push(existing);
      await saveSessionState(tableCode, state);

      // Broadcast update ke seluruh klien
      await publishTableEvent(tableCode, {
        type: 'table:state-update',
        tableCode,
        data: state,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      participant: existing,
      state,
    };
  }

  /**
   * Menandai atau mencabut penandaan kepemilikan item secara real-time
   */
  static async toggleItemAssignment(
    tableCode: string,
    participantId: string,
    itemId: string
  ): Promise<TableSessionState> {
    const state = await this.getLiveSession(tableCode);

    const item = state.items.find((it) => it.id === itemId);
    if (!item) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Item struk tidak ditemukan');
    }

    const participantExists = state.participants.some((p) => p.id === participantId);
    if (!participantExists) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Peserta belum bergabung ke sesi meja ini');
    }

    const hasAssigned = item.assignedParticipantIds.includes(participantId);
    if (hasAssigned) {
      item.assignedParticipantIds = item.assignedParticipantIds.filter((id) => id !== participantId);
    } else {
      item.assignedParticipantIds.push(participantId);
    }

    // Simpan ke Redis
    await saveSessionState(tableCode, state);

    // Simpan persisten ke PostgreSQL secara asynchronous
    prisma.splitTransaction
      .update({
        where: { id: state.transactionId },
        data: {
          items: state.items as any,
        },
      })
      .catch((err) => console.error('Failed to persist items to PostgreSQL:', err));

    // Broadcast ke Redis Pub/Sub
    await publishTableEvent(tableCode, {
      type: 'table:state-update',
      tableCode,
      data: state,
      timestamp: new Date().toISOString(),
    });

    return state;
  }
}
