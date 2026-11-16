import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

describe('Admin Backoffice Dashboard & Integrations (Step 8)', () => {
  const app = buildApp();
  let testUserId: string;

  beforeAll(async () => {
    await app.ready();

    // Buat user contoh untuk pengujian admin
    const user = await prisma.user.create({
      data: {
        email: 'test_admin_user@splitbill.local',
        fullName: 'Budi Test User',
        role: 'MEMBER',
        status: 'ACTIVE',
        ocrQuotaRemaining: 15,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    await app.close();
  });

  it('1. GET Executive Metrics: mengembalikan GTV, total transaksi, user, dan top resto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/metrics/executive',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data).toHaveProperty('gtv');
    expect(body.data).toHaveProperty('totalTransactions');
    expect(body.data).toHaveProperty('activeMembers');
    expect(body.data).toHaveProperty('averageSettlementVelocityMinutes');
    expect(Array.isArray(body.data.topMerchants)).toBe(true);
  });

  it('2. GET AI Performance Metrics: latency OCR, success rate, dan kalkulasi biaya token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/metrics/ai-performance',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.averageLatencyMs).toBeLessThanOrEqual(2500);
    expect(body.data.successRate).toBeGreaterThan(95);
    expect(body.data).toHaveProperty('totalTokensConsumed');
    expect(body.data).toHaveProperty('estimatedCostIdr');
  });

  it('3. Third-Party Hub: simpan konfigurasi & uji coba pengiriman OTP (Test Delivery)', async () => {
    // 3a. Simpan konfigurasi gateway email
    const saveRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/integrations/email_resend',
      payload: {
        configData: {
          enabled: true,
          apiKeyMasked: 're_test_sample_123',
          senderAddress: 'finance@splitbill.id',
        },
      },
    });

    expect(saveRes.statusCode).toBe(200);

    // 3b. Test Delivery Email
    const testEmailRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/integrations/test-delivery',
      payload: {
        channel: 'EMAIL',
        destination: 'manager@perusahaan.com',
      },
    });

    expect(testEmailRes.statusCode).toBe(200);
    const emailBody = testEmailRes.json();
    expect(emailBody.data.success).toBe(true);
    expect(emailBody.data.channel).toBe('EMAIL');

    // 3c. Test Delivery WhatsApp
    const testWaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/integrations/test-delivery',
      payload: {
        channel: 'WHATSAPP',
        destination: '6281234567890',
      },
    });

    expect(testWaRes.statusCode).toBe(200);
    const waBody = testWaRes.json();
    expect(waBody.data.success).toBe(true);
    expect(waBody.data.channel).toBe('WHATSAPP');
  });

  it('4. User Management: daftar pengguna dan pembaruan kuota OCR', async () => {
    // 4a. List Users
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?page=1&limit=10',
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.data.users.length).toBeGreaterThanOrEqual(1);

    // 4b. Update Kuota OCR
    const updateQuotaRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${testUserId}/quota`,
      payload: {
        ocrQuota: 50,
      },
    });

    expect(updateQuotaRes.statusCode).toBe(200);
    const updateBody = updateQuotaRes.json();
    expect(updateBody.data.ocrQuotaRemaining).toBe(50);
  });

  it('5. Data Retention & Maintenance Cleanup: eksekusi pembersihan transaksi draft kadaluarsa', async () => {
    const cleanupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/maintenance/cleanup',
      payload: {
        retentionDays: 30,
      },
    });

    expect(cleanupRes.statusCode).toBe(200);
    const cleanupBody = cleanupRes.json();
    expect(cleanupBody.data).toHaveProperty('cleanedDraftCount');
    expect(cleanupBody.data.message).toContain('Pembersihan berhasil');
  });
});
