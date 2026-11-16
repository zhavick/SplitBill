import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { generateDynamicQrisImage, DynamicQrisParams } from './qris.js';
import { generateReimbursementPdf, ReimbursementReportData } from './reimbursement-pdf.js';
import { simplifyTripDebts, TripExpense, DebtSimplificationResult } from '../../domain/debt-simplification.js';
import type { ReceiptStorage } from '../receipt/storage.js';

export class SettlementService {
  constructor(private storage: ReceiptStorage) {}

  /**
   * 1. Generate QRIS Dinamis Terkunci Nominal
   */
  async generateQris(params: {
    transactionId?: string;
    participantId?: string;
    amount: number;
    merchantName?: string;
  }) {
    let merchantName = params.merchantName;
    let billNumber = params.transactionId ? `BILL-${params.transactionId.slice(0, 8)}` : undefined;

    if (params.transactionId && !merchantName) {
      const tx = await prisma.splitTransaction.findUnique({
        where: { id: params.transactionId },
      });
      if (tx) {
        merchantName = tx.merchantName;
      }
    }

    return generateDynamicQrisImage({
      merchantName: merchantName || 'SPLITBILL RESTO',
      amount: params.amount,
      billNumber,
    });
  }

  /**
   * 2. Ambil Status Pelunasan untuk Transaksi
   */
  async getTransactionSettlements(transactionId: string) {
    const tx = await prisma.splitTransaction.findUnique({
      where: { id: transactionId },
      include: {
        participants: {
          include: {
            settlements: true,
          },
        },
      },
    });

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaksi tidak ditemukan');
    }

    return {
      transactionId: tx.id,
      merchantName: tx.merchantName,
      status: tx.status,
      participants: tx.participants.map((p) => {
        const settlement = p.settlements[0];
        return {
          participantId: p.id,
          fullName: p.fullName,
          isSelf: p.isSelf,
          settlementId: settlement?.id,
          amountPayable: settlement?.amountPayable ? Number(settlement.amountPayable) : 0,
          status: settlement?.status || 'UNPAID',
          proofImageUrl: settlement?.proofImageUrl,
          verifiedAt: settlement?.verifiedAt,
        };
      }),
    };
  }

  /**
   * 3. Upload Bukti Transfer oleh Partisipan
   */
  async uploadPaymentProof(settlementId: string, fileBuffer: Buffer, mimeType: string = 'image/jpeg') {
    const settlement = await prisma.paymentSettlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Data pelunasan tidak ditemukan');
    }

    const key = `proofs/${settlement.transactionId}/${settlement.id}_${Date.now()}.jpg`;
    const proofUrl = await this.storage.upload(key, fileBuffer, mimeType);

    const updated = await prisma.paymentSettlement.update({
      where: { id: settlementId },
      data: {
        proofImageUrl: proofUrl,
        status: 'PENDING_VERIFICATION',
      },
    });

    // Catat log
    await prisma.transactionAuditLog.create({
      data: {
        transactionId: settlement.transactionId,
        action: 'PAYMENT_PROOF_UPLOADED',
        actorName: 'Partisipan',
        details: { settlementId, proofUrl },
      },
    });

    return updated;
  }

  /**
   * 4. Verifikasi Bukti Transfer oleh Pemilik Tagihan
   */
  async verifyPaymentProof(params: {
    settlementId: string;
    status: 'VERIFIED' | 'UNPAID';
    actorName?: string;
  }) {
    const settlement = await prisma.paymentSettlement.findUnique({
      where: { id: params.settlementId },
    });

    if (!settlement) {
      throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Data pelunasan tidak ditemukan');
    }

    const updated = await prisma.paymentSettlement.update({
      where: { id: params.settlementId },
      data: {
        status: params.status,
        verifiedAt: params.status === 'VERIFIED' ? new Date() : null,
        amountPaid: params.status === 'VERIFIED' ? settlement.amountPayable : null,
      },
    });

    await prisma.transactionAuditLog.create({
      data: {
        transactionId: settlement.transactionId,
        action: params.status === 'VERIFIED' ? 'PAYMENT_VERIFIED_PAID' : 'PAYMENT_REJECTED',
        actorName: params.actorName || 'Pemilik Tagihan',
        details: { settlementId: params.settlementId, status: params.status },
      },
    });

    return updated;
  }

  /**
   * 5. Trip Mode Debt Simplification
   */
  simplifyDebts(expenses: TripExpense[]): DebtSimplificationResult {
    return simplifyTripDebts(expenses);
  }

  /**
   * 6. Generate Dokumen PDF Reimbursement
   */
  async generateReimbursementReport(params: {
    transactionId: string;
    applicantName?: string;
    applicantEmail?: string;
    department?: string;
  }): Promise<Buffer> {
    const tx = await prisma.splitTransaction.findUnique({
      where: { id: params.transactionId },
      include: { owner: true },
    });

    if (!tx) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transaksi struk tidak ditemukan');
    }

    const items = (tx.items as any[]) || [];
    const adj = (tx.adjustment as any) || {};

    const reportData: ReimbursementReportData = {
      documentNumber: `REIMB-${tx.id.slice(0, 8).toUpperCase()}`,
      applicantName: params.applicantName || tx.owner?.fullName || 'Karyawan',
      applicantEmail: params.applicantEmail || tx.owner?.email || undefined,
      department: params.department || 'Operasional',
      merchantName: tx.merchantName,
      merchantAddress: tx.merchantAddress || undefined,
      transactionDate: tx.receiptDate ? tx.receiptDate.toISOString() : tx.createdAt.toISOString(),
      items: items.map((it: any) => ({
        itemName: it.itemName || it.name || 'Menu',
        quantity: it.quantity || it.qty || 1,
        itemPrice: it.itemPrice || it.unitPrice || 0,
        totalPrice: it.totalPrice || (it.qty && it.unitPrice ? it.qty * it.unitPrice : 0),
      })),
      taxAmount: adj.taxAmount || adj.tax || 0,
      serviceCharge: adj.serviceCharge || 0,
      discountAmount: adj.discountAmount || adj.discount || 0,
      roundingAmount: adj.roundingAmount || adj.rounding || 0,
      finalTotal: adj.finalTotal || adj.grandTotal || 0,
    };

    return generateReimbursementPdf(reportData);
  }
}
