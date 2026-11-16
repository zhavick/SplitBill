import { FastifyPluginAsync } from 'fastify';
import { SettlementService } from './service.js';
import { AppError } from '../../lib/errors.js';

export function settlementRoutesPlugin(service: SettlementService): FastifyPluginAsync {
  return async (app) => {
    // 1. Generate QRIS Dinamis
    app.post<{
      Body: {
        transactionId?: string;
        participantId?: string;
        amount: number;
        merchantName?: string;
      };
    }>('/api/v1/settlements/qris/generate', async (request, reply) => {
      const { transactionId, participantId, amount, merchantName } = request.body;
      if (!amount || amount <= 0) {
        throw new AppError(400, 'INVALID_AMOUNT', 'Nominal QRIS harus lebih besar dari 0');
      }

      const qris = await service.generateQris({
        transactionId,
        participantId,
        amount,
        merchantName,
      });

      return reply.code(200).send({
        status: 'success',
        data: qris,
      });
    });

    // 2. Ambil Status Pelunasan Transaksi
    app.get<{ Params: { id: string } }>('/api/v1/receipts/:id/settlements', async (request, reply) => {
      const data = await service.getTransactionSettlements(request.params.id);
      return reply.send({ status: 'success', data });
    });

    // 3. Upload Bukti Transfer (Multipart)
    app.post<{ Params: { id: string } }>('/api/v1/settlements/:id/upload-proof', async (request, reply) => {
      const part = await request.file();
      if (!part) {
        throw new AppError(400, 'NO_FILE', 'Bukti transfer gambar wajib diunggah');
      }

      const buffer = await part.toBuffer();
      const result = await service.uploadPaymentProof(request.params.id, buffer, part.mimetype);
      return reply.send({ status: 'success', data: result });
    });

    // 4. Verifikasi Pembayaran oleh Pemilik Tagihan
    app.patch<{
      Params: { id: string };
      Body: { status: 'VERIFIED' | 'UNPAID'; actorName?: string };
    }>('/api/v1/settlements/:id/verify', async (request, reply) => {
      const { status, actorName } = request.body;
      if (!status || !['VERIFIED', 'UNPAID'].includes(status)) {
        throw new AppError(400, 'INVALID_STATUS', 'Status harus VERIFIED atau UNPAID');
      }

      const result = await service.verifyPaymentProof({
        settlementId: request.params.id,
        status,
        actorName,
      });

      return reply.send({ status: 'success', data: result });
    });

    // 5. Trip Mode Debt Simplification
    app.post<{ Body: { expenses: any[] } }>('/api/v1/trips/simplify-debt', async (request, reply) => {
      const expenses = request.body.expenses;
      if (!Array.isArray(expenses) || expenses.length === 0) {
        throw new AppError(400, 'INVALID_EXPENSES', 'Daftar pengeluaran trip wajib diisi');
      }

      const result = service.simplifyDebts(expenses);
      return reply.send({ status: 'success', data: result });
    });

    // 6. Download / Tampilkan PDF Reimbursement Formal
    app.get<{
      Params: { id: string };
      Querystring: { applicantName?: string; department?: string; email?: string };
    }>('/api/v1/receipts/:id/reimbursement-pdf', async (request, reply) => {
      const pdfBuffer = await service.generateReimbursementReport({
        transactionId: request.params.id,
        applicantName: request.query.applicantName,
        applicantEmail: request.query.email,
        department: request.query.department,
      });

      reply.header('Content-Type', 'application/pdf');
      reply.header(
        'Content-Disposition',
        `attachment; filename="reimbursement_${request.params.id.slice(0, 8)}.pdf"`
      );
      return reply.send(pdfBuffer);
    });
  };
}
