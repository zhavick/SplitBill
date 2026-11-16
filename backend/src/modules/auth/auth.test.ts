import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { MemoryNotifier } from './notifier.js';
import type { OAuthVerifiers } from './oauth.js';

describe('Auth Module Integration (Step 3)', () => {
  let app: FastifyInstance;
  let memoryNotifier: MemoryNotifier;

  const mockOAuthVerifiers: OAuthVerifiers = {
    async google(idToken: string) {
      if (idToken === 'valid-google-token') {
        return {
          providerAccountId: 'google-user-12345',
          email: 'google.user@example.com',
          emailVerified: true,
          fullName: 'Google User',
          avatarUrl: 'https://example.com/avatar.jpg',
        };
      }
      throw new Error('Invalid token');
    },
    async apple(identityToken: string) {
      if (identityToken === 'valid-apple-token') {
        return {
          providerAccountId: 'apple-user-67890',
          email: 'apple.user@example.com',
          emailVerified: true,
        };
      }
      throw new Error('Invalid token');
    },
  };

  beforeAll(async () => {
    memoryNotifier = new MemoryNotifier();
    app = buildApp({
      notifier: memoryNotifier,
      oauthVerifiers: mockOAuthVerifiers,
      logger: false,
    });
    await app.ready();

    // Cleanup test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['alice@example.com', 'bob@example.com', 'google.user@example.com', 'apple.user@example.com'],
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Register user baru: status PENDING_VERIFICATION & OTP terkirim ke email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        fullName: 'Alice Walker',
        email: 'alice@example.com',
        password: 'Password123!',
        channel: 'EMAIL',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.status).toBe('PENDING_VERIFICATION');
    expect(body.data.verificationChannel).toBe('EMAIL');

    // Cek memori notifikasi
    expect(memoryNotifier.emails.length).toBeGreaterThan(0);
    const lastEmail = memoryNotifier.emails.find((e) => e.to === 'alice@example.com');
    expect(lastEmail).toBeDefined();
    expect(lastEmail?.text).toMatch(/\d{6}/);
  });

  it('2. Login akun belum aktif: ditolak dengan 403 ACCOUNT_NOT_VERIFIED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('ACCOUNT_NOT_VERIFIED');
  });

  it('3. Verifikasi OTP salah: ditolak dengan 400 OTP_INVALID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp',
      payload: {
        email: 'alice@example.com',
        code: '999999',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('OTP_INVALID');
  });

  it('4. Verifikasi OTP benar: akun ACTIVE, terbitkan Access & Refresh Token', async () => {
    // Ambil kode OTP aktual dari database
    const user = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
    const tokenRecord = await prisma.verificationToken.findFirst({
      where: { userId: user!.id },
    });
    expect(tokenRecord).toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp',
      payload: {
        email: 'alice@example.com',
        code: tokenRecord!.token,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.data.user.status).toBe('ACTIVE');
    expect(body.data.tokens.accessToken).toBeDefined();
    expect(body.data.tokens.refreshToken).toBeDefined();

    // Verifikasi cookie refreshToken
    const cookies = res.cookies;
    expect(cookies.some((c) => c.name === 'refreshToken')).toBe(true);

    // 5. Akses Protected Route dengan Access Token
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${body.data.tokens.accessToken}`,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.data.user.email).toBe('alice@example.com');
    expect(meBody.data.user.role).toBe('MEMBER');
  });

  it('5. Login akun ACTIVE: mengembalikan JWT Bearer Token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  it('6. Refresh Token Rotation & Session Invalidation', async () => {
    // Login untuk mendapatkan refresh token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });
    const oldRefreshToken = loginRes.json().data.tokens.refreshToken;

    // Refresh sesi
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: oldRefreshToken,
      },
    });

    expect(refreshRes.statusCode).toBe(200);
    const newTokens = refreshRes.json().data.tokens;
    expect(newTokens.refreshToken).not.toBe(oldRefreshToken);

    // Coba gunakan token lama lagi (Reuse Detection -> harus ditolak!)
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: oldRefreshToken,
      },
    });
    expect(reuseRes.statusCode).toBe(401);
  });

  it('7. Logout: membatalkan token dan sesi', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
      },
    });
    const refreshToken = loginRes.json().data.tokens.refreshToken;

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Coba refresh setelah logout -> ditolak
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('8. Single Sign-On (SSO): Google OAuth login sukses', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/google',
      payload: {
        idToken: 'valid-google-token',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.email).toBe('google.user@example.com');
    expect(body.data.user.fullName).toBe('Google User');
    expect(body.data.user.status).toBe('ACTIVE');
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  it('9. Single Sign-On (SSO): Apple OAuth login sukses', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/apple',
      payload: {
        identityToken: 'valid-apple-token',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.email).toBe('apple.user@example.com');
    expect(body.data.user.status).toBe('ACTIVE');
    expect(body.data.tokens.accessToken).toBeDefined();
  });
});
