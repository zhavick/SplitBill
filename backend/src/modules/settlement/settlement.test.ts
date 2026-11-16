import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { generateDynamicQrisPayload, calculateCrc16 } from './qris.js';
import { simplifyTripDebts } from '../../domain/debt-simplification.js';

describe('Advanced Member Features (Step 7: QRIS, Debt Simplification, Proof Verification & PDF Reimbursement)', () => {
  const app = buildApp();
  let testTxId: string;
  let testParticipantId: string;
  let testSettlementId: string;

  beforeAll(async () => {
    await app.ready();

    // Buat transaksi struk contoh
    const tx = await prisma.splitTransaction.create({
      data: {
        merchantName: 'Restoran Seafood Teluk Jakarta',
        status: 'ACTIVE',
        items: [
          {
            id: 'item_1',
            itemName: 'Ikan Bakar Gurame 1kg',
            quantity: 1,
            itemPrice: 110000,
            totalPrice: 110000,
            assignedParticipantIds: [],
          },
          {
            id: 'item_2',
            itemName: 'Udang Saus Padang',
            quantity: 1,
            itemPrice: 85000,
            totalPrice: 85000,
            assignedParticipantIds: [],
          },
        ],
        adjustment: {
          taxAmount: 19500,
          serviceCharge: 10000,
          discountAmount: 0,
          roundingAmount: 0,
          finalTotal: 224500,
        },
      },
    });

    const participant = await prisma.participant.create({
      data: {
        transactionId: tx.id,
        fullName: 'Ahmad Yani',
        isSelf: false,
        avatarColor: '#2563EB',
      },
    });

    const settlement = await prisma.paymentSettlement.create({
      data: {
        transactionId: tx.id,
        participantId: participant.id,
        amountPayable: 112250,
        status: 'UNPAID',
      },
    });

    testTxId = tx.id;
    testParticipantId = participant.id;
    testSettlementId = settlement.id;
  });

  afterAll(async () => {
    if (testTxId) {
      await prisma.splitTransaction.delete({ where: { id: testTxId } }).catch(() => {});
    }
    await app.close();
  });

  it('1. Dynamic QRIS: menghasilkan payload EMVCo dengan nominal terkunci & CRC16 valid', async () => {
    const payload = generateDynamicQrisPayload({
      merchantName: 'Seafood Teluk',
      amount: 112250,
      billNumber: 'BILL-1001',
    });

    // 1a. Periksa Tag 01 = 12 (Dynamic QRIS)
    expect(payload).toContain('010212');

    // 1b. Periksa Tag 53 = 360 (IDR)
    expect(payload).toContain('5303360');

    // 1c. Periksa Tag 54 = 112250 (Transaction Amount terkunci)
    expect(payload).toContain('5406112250');

    // 1d. Periksa Tag 59 (Merchant Name)
    expect(payload).toContain('5913SEAFOOD TELUK');

    // 1e. Periksa validitas CRC16 pada 4 digit terakhir
    const bodyWithoutCrc = payload.slice(0, -4);
    const expectedCrc = calculateCrc16(bodyWithoutCrc);
    const actualCrc = payload.slice(-4);
    expect(actualCrc).toBe(expectedCrc);

    // 1f. Panggil API endpoint QRIS
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/qris/generate',
      payload: {
        transactionId: testTxId,
        amount: 112250,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.qrCodeDataUrl).toContain('data:image/png;base64,');
    expect(body.data.amount).toBe(112250);
  });

  it('2. Trip Mode Debt Simplification: mereduksi rantai utang silang menjadi transfer minimum', async () => {
    const p1 = { id: 'user_a', name: 'Budi' };
    const p2 = { id: 'user_b', name: 'Sarah' };
    const p3 = { id: 'user_c', name: 'Dimas' };
    const p4 = { id: 'user_d', name: 'Eko' };

    // Skenario 3 pengeluaran bersama:
    // 1. Budi bayar makan malam 120rb (dibagi rata berempat: @30rb)
    // 2. Sarah bayar sewa mobil 100rb (dibagi rata berempat: @25rb)
    // 3. Dimas bayar tiket 60rb (dibagi rata berempat: @15rb)
    // Eko tidak menalangi apa-apa.
    // Total grup spending: 280rb. Konsumsi per orang: 70rb.
    // Net balance:
    // - Budi: +120 - 70 = +50rb (kreditur)
    // - Sarah: +100 - 70 = +30rb (kreditur)
    // - Dimas: +60 - 70 = -10rb (debitur)
    // - Eko: 0 - 70 = -70rb (debitur)
    const expenses = [
      {
        id: 'exp_1',
        description: 'Makan Malam Seafood',
        totalAmount: 120000,
        paidBy: p1,
        splitAmong: [
          { participant: p1, shareAmount: 30000 },
          { participant: p2, shareAmount: 30000 },
          { participant: p3, shareAmount: 30000 },
          { participant: p4, shareAmount: 30000 },
        ],
      },
      {
        id: 'exp_2',
        description: 'Sewa Mobil Liburan',
        totalAmount: 100000,
        paidBy: p2,
        splitAmong: [
          { participant: p1, shareAmount: 25000 },
          { participant: p2, shareAmount: 25000 },
          { participant: p3, shareAmount: 25000 },
          { participant: p4, shareAmount: 25000 },
        ],
      },
      {
        id: 'exp_3',
        description: 'Tiket Wisata',
        totalAmount: 60000,
        paidBy: p3,
        splitAmong: [
          { participant: p1, shareAmount: 15000 },
          { participant: p2, shareAmount: 15000 },
          { participant: p3, shareAmount: 15000 },
          { participant: p4, shareAmount: 15000 },
        ],
      },
    ];

    const result = simplifyTripDebts(expenses);

    expect(result.totalGroupSpending).toBe(280000);
    // Transaksi berkurang signifikan (maksimal 3 transfer dari total 12 hutang)
    expect(result.transfers.length).toBeLessThanOrEqual(3);

    // Hitung total transfer yang masuk ke kreditur persis 80.000
    const totalTransferred = result.transfers.reduce((acc, t) => acc + t.amount, 0);
    expect(totalTransferred).toBe(80000);

    // Pastikan Eko membayar total 70.000 dan Dimas membayar total 10.000
    const ekoPaid = result.transfers
      .filter((t) => t.from.id === 'user_d')
      .reduce((acc, t) => acc + t.amount, 0);
    expect(ekoPaid).toBe(70000);

    const dimasPaid = result.transfers
      .filter((t) => t.from.id === 'user_c')
      .reduce((acc, t) => acc + t.amount, 0);
    expect(dimasPaid).toBe(10000);
  });

  it('3. Upload Bukti Transfer & Verifikasi Status Pembayaran', async () => {
    // 3a. Buat multipart dummy bukti transfer
    const boundary = '----WebKitFormBoundaryProof123';
    const fakeImage = Buffer.from('FAKE_TRANSFER_RECEIPT_IMAGE_DATA');
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="proof"; filename="bukti_transfer.jpg"\r\n'),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
      fakeImage,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${testSettlementId}/upload-proof`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: bodyBuffer,
    });

    expect(uploadRes.statusCode).toBe(200);
    const uploadBody = uploadRes.json();
    expect(uploadBody.data.status).toBe('PENDING_VERIFICATION');
    expect(uploadBody.data.proofImageUrl).toContain('/uploads/receipts/proofs/');

    // 3b. Verifikasi oleh Pemilik Tagihan
    const verifyRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/settlements/${testSettlementId}/verify`,
      payload: {
        status: 'VERIFIED',
        actorName: 'Dimas (Host)',
      },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = verifyRes.json();
    expect(verifyBody.data.status).toBe('VERIFIED');
    expect(verifyBody.data.verifiedAt).not.toBeNull();
    expect(Number(verifyBody.data.amountPaid)).toBe(112250);
  });

  it('4. Download Laporan PDF Reimbursement Formal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${testTxId}/reimbursement-pdf?applicantName=Budi&department=Engineering`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment; filename="reimbursement_');

    // Validasi magic number berkas PDF (%PDF-)
    const pdfBuffer = res.rawPayload;
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });
});
