import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { AppError } from '../../lib/errors.js';
import { redis } from '../../lib/redis.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import type { AuthService } from './service.js';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(150),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  phoneNumber: z.string().optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP']).optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Kode OTP harus 6 digit'),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const oauthGoogleSchema = z.object({
  idToken: z.string().min(10),
});

const oauthAppleSchema = z.object({
  identityToken: z.string().min(10),
});

export const authRoutesPlugin = (authService: AuthService): FastifyPluginAsync => {
  return async (app) => {
    // 1. Register
    app.post('/register', async (req, reply) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.register(parsed.data);
      return reply.status(201).send({
        status: 'success',
        data: {
          userId: result.userId,
          status: result.status,
          verificationChannel: result.channel,
          message: `Kode verifikasi telah dikirimkan melalui ${result.channel}.`,
        },
      });
    });

    // 2. Verify OTP
    app.post('/verify-otp', async (req, reply) => {
      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.verifyOtp({
        ...parsed.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 3. Resend OTP
    app.post('/resend-otp', async (req, reply) => {
      const parsed = resendOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.resendOtp(parsed.data.email);
      return reply.send({
        status: 'success',
        data: {
          message: `Kode verifikasi baru telah dikirimkan melalui ${result.channel}.`,
        },
      });
    });

    // 4. Login
    app.post('/login', async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.login({
        ...parsed.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 5. Refresh Token
    app.post('/refresh', async (req, reply) => {
      const parsed = refreshSchema.safeParse(req.body || {});
      const token = parsed.data?.refreshToken || (req.cookies as Record<string, string>)?.refreshToken;

      if (!token) {
        throw new AppError(400, 'REFRESH_TOKEN_REQUIRED', 'Refresh token diperlukan.');
      }

      const result = await authService.refresh(token, req.ip, req.headers['user-agent']);

      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 6. Logout
    app.post('/logout', async (req, reply) => {
      const parsed = refreshSchema.safeParse(req.body || {});
      const token = parsed.data?.refreshToken || (req.cookies as Record<string, string>)?.refreshToken;

      if (token) {
        await authService.logout(token);
      }

      // Blacklist access token jika disertakan di header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const claims = await verifyAccessToken(authHeader.slice(7).trim());
          if (claims.jti) {
            const ttl = Math.max(1, claims.exp ? claims.exp - Math.floor(Date.now() / 1000) : 900);
            await redis.set(`bl:${claims.jti}`, '1', 'EX', ttl);
          }
          if (claims.sid) {
            await redis.set(`bl:sid:${claims.sid}`, '1', 'EX', 604800);
          }
        } catch {
          // ignore expired or invalid token
        }
      }

      reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
      return reply.send({
        status: 'success',
        data: { message: 'Berhasil logout.' },
      });
    });

    // 7. OAuth Google
    app.post('/oauth/google', async (req, reply) => {
      const parsed = oauthGoogleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.oauthGoogle(parsed.data.idToken, req.ip, req.headers['user-agent']);

      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 8. OAuth Apple
    app.post('/oauth/apple', async (req, reply) => {
      const parsed = oauthAppleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Input tidak valid', parsed.error.errors);
      }
      const result = await authService.oauthApple(parsed.data.identityToken, req.ip, req.headers['user-agent']);

      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        status: 'success',
        data: result,
      });
    });

    // 9. Get Profile (Protected)
    app.get('/me', { preHandler: [authenticate] }, async (req, reply) => {
      return reply.send({
        status: 'success',
        data: {
          user: req.user,
        },
      });
    });
  };
};
