import fs from 'node:fs/promises';
import path from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import type { Notifier } from './modules/auth/notifier.js';
import { ConsoleNotifier, GatewayNotifier } from './modules/auth/notifier.js';
import type { OAuthVerifiers } from './modules/auth/oauth.js';
import { defaultOAuthVerifiers } from './modules/auth/oauth.js';
import { OtpService } from './modules/auth/otp.js';
import { authRoutesPlugin } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import type { OcrEngine } from './modules/receipt/ocr-engine.js';
import { GeminiOcrEngine, MockOcrEngine } from './modules/receipt/ocr-engine.js';
import { receiptRoutesPlugin } from './modules/receipt/routes.js';
import { ReceiptService } from './modules/receipt/service.js';
import type { ReceiptStorage } from './modules/receipt/storage.js';
import { createReceiptStorage } from './modules/receipt/storage.js';
import { tableSessionRoutes } from './modules/table-session/routes.js';
import { SettlementService } from './modules/settlement/service.js';
import { settlementRoutesPlugin } from './modules/settlement/routes.js';
import { AdminService } from './modules/admin/service.js';
import { adminRoutesPlugin } from './modules/admin/routes.js';

export interface AppOptions {
  notifier?: Notifier;
  oauthVerifiers?: OAuthVerifiers;
  receiptStorage?: ReceiptStorage;
  ocrEngine?: OcrEngine;
  logger?: boolean;
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  // 1. CORS
  app.register(cors, {
    origin: [env.WEB_ORIGIN, 'http://localhost:3000', 'http://localhost:3385', '*'],
    credentials: true,
  });

  // 2. Cookie
  app.register(cookie);

  // 3. WebSocket Plugin
  app.register(websocket);

  // 4. Multipart File Upload
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per receipt shot
    },
  });

  // 5. Rate Limit
  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // 6. Global Error Handler (TSD Format)
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        status: 'error',
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2023') {
      return reply.status(404).send({
        status: 'error',
        code: 'RESOURCE_NOT_FOUND',
        message: 'Format ID tidak valid atau data tidak ditemukan.',
      });
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const errWithStatus = error as { statusCode?: number; message?: string };
      if (errWithStatus.statusCode && errWithStatus.statusCode < 500) {
        return reply.status(errWithStatus.statusCode).send({
          status: 'error',
          code: 'BAD_REQUEST',
          message: errWithStatus.message || 'Request tidak valid.',
        });
      }
    }

    app.log.error(error);
    return reply.status(500).send({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal server.',
    });
  });

  // 7. Health Check
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'success', data: { service: 'splitbill-api', db: 'up' } };
  });

  // 8. Route untuk melayani file gambar struk lokal (dengan proteksi path traversal)
  app.get('/uploads/receipts/*', async (req, reply) => {
    const rawPath = (req.params as Record<string, string>)['*'];
    const baseDir = path.resolve(process.cwd(), 'uploads', 'receipts');
    const fullPath = path.resolve(baseDir, rawPath);

    if (!fullPath.startsWith(baseDir)) {
      throw new AppError(403, 'FORBIDDEN_PATH', 'Akses direktori di luar batas diizinkan ditolak.');
    }

    try {
      const content = await fs.readFile(fullPath);
      reply.header('Content-Type', 'image/jpeg');
      return reply.send(content);
    } catch {
      throw new AppError(404, 'FILE_NOT_FOUND', 'Gambar struk tidak ditemukan.');
    }
  });

  // 9. Modul Autentikasi
  const notifier = opts.notifier ?? (env.RESEND_API_KEY ? new GatewayNotifier() : new ConsoleNotifier());
  const otpService = new OtpService(prisma, redis, notifier);
  const authService = new AuthService(prisma, redis, otpService, opts.oauthVerifiers ?? defaultOAuthVerifiers);
  app.register(authRoutesPlugin(authService), { prefix: '/api/v1/auth' });

  // 10. Modul Ekstraksi Struk & OCR AI
  const receiptStorage = opts.receiptStorage ?? createReceiptStorage();
  const ocrEngine =
    opts.ocrEngine ?? (env.GEMINI_API_KEY ? new GeminiOcrEngine() : new MockOcrEngine());
  const receiptService = new ReceiptService(prisma, receiptStorage, ocrEngine);
  app.register(receiptRoutesPlugin(receiptService), { prefix: '/api/v1/receipts' });

  // 11. Modul Kolaborasi Meja Real-Time (Live Table Session & WebSocket)
  app.register(tableSessionRoutes);

  // 12. Modul Pelunasan, QRIS, Trip Mode & PDF Reimbursement (Step 7)
  const settlementService = new SettlementService(receiptStorage);
  app.register(settlementRoutesPlugin(settlementService));

  // 13. Modul Portal Pengelola & Analitik Admin (Step 8)
  const adminService = new AdminService(notifier);
  app.register(adminRoutesPlugin(adminService));

  // 14. Graceful shutdown hook
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  });

  return app;
}
