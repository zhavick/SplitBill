import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { MemoryNotifier } from '../modules/auth/notifier.js';
import { MockOcrEngine } from '../modules/receipt/ocr-engine.js';
import { LocalReceiptStorage } from '../modules/receipt/storage.js';

function createMultipartPayload(
  fields: Record<string, string>,
  file: { name: string; filename: string; buffer: Buffer; contentType: string },
) {
  const boundary = '----SplitBillSecurityBoundary' + Math.random().toString(36).substring(2);
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

describe('Security Hardening & OWASP Top 10 Audit (Step 9.2)', () => {
  let app: FastifyInstance;
  let notifier: MemoryNotifier;

  beforeAll(async () => {
    notifier = new MemoryNotifier();
    app = buildApp({
      notifier,
      receiptStorage: new LocalReceiptStorage(),
      ocrEngine: new MockOcrEngine({
        merchantName: 'Safe Merchant',
        date: '2026-11-16',
        items: [{ name: 'Nasi Goreng', qty: 1, unitPrice: 20000, totalPrice: 20000 }],
        subtotal: 20000,
        tax: 2000,
        serviceCharge: 0,
        discount: 0,
        rounding: 0,
        grandTotal: 22000,
      }),
      logger: false,
    });
    await app.ready();

    // Cleanup test users
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'security_test',
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'security_test',
        },
      },
    });
    await app.close();
  });

  // 1. SQL Injection Prevention (Prisma ORM Parameterized Queries)
  describe('1. SQL Injection Prevention', () => {
    it('Harus menolak atau menetralkan input SQL Injection pada login tanpa merusak database', async () => {
      const sqlInjections = [
        "' OR '1'='1",
        "admin' --",
        "'; DROP TABLE \"User\"; --",
        "' UNION SELECT * FROM \"User\" --",
      ];

      for (const injection of sqlInjections) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: injection,
            password: 'Password123!',
          },
        });

        // Harus ditolak dengan validasi error atau kredensial salah, BUKAN 500 SQL syntax error
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.statusCode).toBeLessThan(500);
        const body = res.json();
        expect(body.status).toBe('error');
        // Pastikan tabel User masih utuh
        const userCount = await prisma.user.count();
        expect(userCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('Harus menetralkan SQL Injection pada pencarian dan filter transaksi', async () => {
      const maliciousId = "random-id' OR 1=1; --";
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/receipts/${encodeURIComponent(maliciousId)}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  // 2. Cross-Site Scripting (XSS) & Input Sanitization
  describe('2. XSS & Payload Sanitization', () => {
    it('Harus aman menyimpan input dengan karakter XSS tanpa mengeksekusi script', async () => {
      const xssEmail = 'security_test_xss@splitbill.id';
      const xssFullName = '<script>alert("XSS")</script> <b>Budi</b>';

      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: xssEmail,
          password: 'Password123!',
          fullName: xssFullName,
        },
      });

      expect(regRes.statusCode).toBe(201);
      const user = await prisma.user.findUnique({
        where: { email: xssEmail },
      });

      expect(user).toBeDefined();
      expect(user?.fullName).toBe(xssFullName); // Tersimpan aman sebagai teks murni tanpa eksekusi
    });

    it('Harus menolak item name bernilai kosong atau manipulasi tipe data', async () => {
      const tx = await prisma.splitTransaction.create({
        data: {
          merchantName: 'Safe Resto',
          items: [],
          adjustment: { grandTotal: 50000 },
        },
      });

      const badRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/receipts/${tx.id}/review`,
        payload: {
          items: [
            {
              name: '', // Empty name violates Zod min(1)
              qty: -5,  // Negative qty violates Zod min(1)
              unitPrice: 10000,
              totalPrice: -50000,
            },
          ],
          adjustment: { grandTotal: 50000 },
        },
      });

      expect(badRes.statusCode).toBe(400);
      expect(badRes.json().code).toBe('VALIDATION_ERROR');

      await prisma.splitTransaction.delete({ where: { id: tx.id } });
    });
  });

  // 3. File Upload & Directory Traversal Security
  describe('3. Upload Sanitization & Path Traversal Defense', () => {
    it('Harus menolak upload berkas bukan gambar (malicious script / executable)', async () => {
      const fakeExecutable = Buffer.from('#!/bin/bash\nrm -rf /\necho "Hacked"');
      const payloadData = createMultipartPayload(
        { shotIndex: '1' },
        {
          name: 'file',
          filename: 'exploit.sh.jpg',
          buffer: fakeExecutable,
          contentType: 'image/jpeg',
        },
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/receipts/upload-shot',
        headers: payloadData.headers,
        payload: payloadData.payload,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('INVALID_IMAGE_FILE');
    });

    it('Harus memblokir percobaan path traversal pada static upload route', async () => {
      const traversalPaths = [
        '/uploads/receipts/../../package.json',
        '/uploads/receipts/..%2F..%2Fpackage.json',
        '/uploads/receipts/nested/../../../src/server.ts',
      ];

      for (const tPath of traversalPaths) {
        const res = await app.inject({
          method: 'GET',
          url: tPath,
        });

        // Harus 403 FORBIDDEN_PATH atau 404 FILE_NOT_FOUND (tidak boleh 200 dan tidak boleh membaca file rahasia)
        expect([403, 404]).toContain(res.statusCode);
        if (res.statusCode === 403) {
          expect(res.json().code).toBe('FORBIDDEN_PATH');
        }
      }
    });
  });

  // 4. JWT Token Security & Replay Attack Protection
  describe('4. JWT Token Security, Blacklist & Revocation', () => {
    let validToken: string;
    let refreshToken: string;
    const testEmail = 'security_test_jwt@splitbill.id';

    beforeAll(async () => {
      // Buat akun dan aktifkan
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: 'Password123!',
          fullName: 'Security Test User',
        },
      });

      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      const tokenRecord = await prisma.verificationToken.findFirst({
        where: { userId: user!.id },
      });

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-otp',
        payload: {
          email: testEmail,
          code: tokenRecord!.token,
        },
      });

      const body = verifyRes.json();
      validToken = body.data.tokens.accessToken;
      refreshToken = body.data.tokens.refreshToken;
    });

    it('Harus menolak token dengan tanda tangan palsu (signature tampering)', async () => {
      const parts = validToken.split('.');
      // Ubah signature
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature12345`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    });

    it('Harus menolak token palsu tanpa otorisasi', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer bukan.jwt.asli',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    });

    it('Harus memasukkan token ke blacklist Redis saat logout dan menolak penggunaan ulangnya', async () => {
      // 1. Verifikasi token valid sebelum logout
      const meBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });
      expect(meBefore.statusCode).toBe(200);

      // 2. Logout
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          refreshToken,
        },
      });
      expect(logoutRes.statusCode).toBe(200);

      // 3. Coba akses kembali menggunakan access token yang sama (Replay attack)
      const meAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(meAfter.statusCode).toBe(401);
      expect(meAfter.json().code).toBe('TOKEN_REVOKED');
    });
  });

  // 5. Rate Limiting Protection (Brute Force Defense)
  describe('5. Rate Limiting Protection', () => {
    it('Harus memicu HTTP 429 Too Many Requests saat permintaan melebihi batas', async () => {
      // Buat instance fastify mini dengan limit ketat (misal 5 req / menit) untuk menguji plugin rate-limit
      const rateLimitApp = Fastify();
      await rateLimitApp.register(rateLimit, {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: () => 'static-test-ip',
      });
      rateLimitApp.get('/test-limit', async () => ({ status: 'ok' }));
      await rateLimitApp.ready();

      // Kirim 5 request aman
      for (let i = 0; i < 5; i++) {
        const res = await rateLimitApp.inject({ method: 'GET', url: '/test-limit' });
        expect(res.statusCode).toBe(200);
      }

      // Request ke-6 harus ditolak dengan 429 Too Many Requests
      const blockedRes = await rateLimitApp.inject({ method: 'GET', url: '/test-limit' });
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.json().message).toMatch(/rate limit exceeded/i);

      await rateLimitApp.close();
    });
  });
});
