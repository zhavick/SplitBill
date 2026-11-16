import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { subscribeToTableEvents } from './redis-pubsub.js';

describe('Live Table Session & Real-Time Sync (Step 6)', () => {
  const app = buildApp();
  let testTxId: string;
  let testTableCode: string;
  let testParticipantId: string;
  let testItemId: string;

  beforeAll(async () => {
    await app.ready();

    // Buat transaksi struk contoh di PostgreSQL
    const tx = await prisma.splitTransaction.create({
      data: {
        merchantName: 'Warung Nasi Bebek Madura',
        status: 'DRAFT',
        items: [
          {
            id: 'item_101',
            itemName: 'Nasi Bebek Goreng Krispi',
            quantity: 2,
            itemPrice: 35000,
            totalPrice: 70000,
            assignedParticipantIds: [],
          },
          {
            id: 'item_102',
            itemName: 'Es Teh Manis',
            quantity: 2,
            itemPrice: 5000,
            totalPrice: 10000,
            assignedParticipantIds: [],
          },
        ],
        adjustment: {
          taxAmount: 8000,
          serviceCharge: 2000,
          discountAmount: 0,
          roundingAmount: 0,
          finalTotal: 90000,
        },
      },
    });

    testTxId = tx.id;
    testItemId = 'item_101';
  });

  afterAll(async () => {
    // Cleanup
    if (testTxId) {
      await prisma.splitTransaction.delete({ where: { id: testTxId } }).catch(() => {});
    }
    if (testTableCode) {
      await redis.del(`table:session:${testTableCode}:state`).catch(() => {});
    }
    await app.close();
  });

  it('1. Buka Sesi Meja: menghasilkan kode TBL-XXXX dan Dynamic QR Code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${testTxId}/live-session`,
      payload: {
        hostName: 'Dimas (Host)',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.tableCode).toMatch(/^TBL-[A-Z0-9]{4}$/);
    expect(body.data.qrCodeDataUrl).toContain('data:image/png;base64,');
    expect(body.data.joinUrl).toContain(`/join/${body.data.tableCode}`);
    expect(body.data.state.merchantName).toBe('Warung Nasi Bebek Madura');
    expect(body.data.state.participants).toHaveLength(1);
    expect(body.data.state.participants[0].fullName).toBe('Dimas (Host)');

    testTableCode = body.data.tableCode;
  });

  it('2. Tamu mengakses detail sesi publik meja tanpa perlu login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/table-session/${testTableCode}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.tableCode).toBe(testTableCode);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].itemName).toBe('Nasi Bebek Goreng Krispi');
  });

  it('3. Tamu bergabung memasukkan nama panggilan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/table-session/${testTableCode}/join`,
      payload: {
        fullName: 'Budi Santoso',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.participant.fullName).toBe('Budi Santoso');
    expect(body.data.state.participants.length).toBeGreaterThanOrEqual(2);

    testParticipantId = body.data.participant.id;
  });

  it('4. Real-time Item Toggle: menandai & mencabut centang menu', async () => {
    // Tangkap event broadcast Redis Pub/Sub
    let receivedEvent: any = null;
    const unsub = await subscribeToTableEvents(testTableCode, (evt) => {
      receivedEvent = evt;
    });

    // 4a. Centang item Nasi Bebek untuk Budi
    const toggleRes1 = await app.inject({
      method: 'POST',
      url: `/api/v1/table-session/${testTableCode}/toggle-item`,
      payload: {
        participantId: testParticipantId,
        itemId: testItemId,
      },
    });

    expect(toggleRes1.statusCode).toBe(200);
    const body1 = toggleRes1.json();
    const itemAfterCheck = body1.data.items.find((it: any) => it.id === testItemId);
    expect(itemAfterCheck.assignedParticipantIds).toContain(testParticipantId);

    // Tunggu propagasi pub/sub
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent.type).toBe('table:state-update');

    // 4b. Klik sekali lagi untuk uncheck item
    const toggleRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/table-session/${testTableCode}/toggle-item`,
      payload: {
        participantId: testParticipantId,
        itemId: testItemId,
      },
    });

    expect(toggleRes2.statusCode).toBe(200);
    const body2 = toggleRes2.json();
    const itemAfterUncheck = body2.data.items.find((it: any) => it.id === testItemId);
    expect(itemAfterUncheck.assignedParticipantIds).not.toContain(testParticipantId);

    unsub();
  });
});
