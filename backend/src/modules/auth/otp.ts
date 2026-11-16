import { randomInt } from 'node:crypto';
import type { PrismaClient, VerificationChannel } from '@prisma/client';
import type { Redis } from 'ioredis';
import { OTP_LENGTH, OTP_TTL_MINUTES } from '@splitbill/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { Notifier } from './notifier.js';

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Normalisasi nomor telepon Indonesia ke digit internasional (mis. 081234 -> 6281234). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export class OtpService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly notifier: Notifier,
  ) {}

  async issueAndSend(user: { id: string; email: string; phoneNumber: string | null }, channel: VerificationChannel) {
    const cooldownKey = `otp:cooldown:${user.id}`;
    const ok = await this.redis.set(cooldownKey, '1', 'EX', OTP_RESEND_COOLDOWN_SECONDS, 'NX');
    if (ok !== 'OK') {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new AppError(429, 'OTP_COOLDOWN', `Tunggu ${Math.max(ttl, 1)} detik sebelum meminta kode baru.`);
    }

    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    await this.prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        channel,
        token: code,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    });
    await this.redis.del(`otp:attempts:${user.id}`);

    try {
      if (channel === 'WHATSAPP') {
        if (!user.phoneNumber) throw new AppError(400, 'PHONE_REQUIRED', 'Nomor WhatsApp diperlukan.');
        await this.notifier.sendWhatsAppOtp(user.phoneNumber, code);
      } else {
        const link = `${env.WEB_ORIGIN}/verify?email=${encodeURIComponent(user.email)}&code=${code}`;
        await this.notifier.sendEmail(
          user.email,
          'Kode aktivasi akun SplitBill',
          `Kode verifikasi Anda: ${code}\nBerlaku ${OTP_TTL_MINUTES} menit.\n\nAtau klik tautan aktivasi: ${link}`,
        );
      }
    } catch (err) {
      await this.redis.del(cooldownKey); // pengiriman gagal: izinkan coba lagi segera
      if (err instanceof AppError) throw err;
      console.error('Gagal mengirim OTP:', err);
      throw new AppError(502, 'OTP_DELIVERY_FAILED', 'Gagal mengirim kode verifikasi. Coba lagi.');
    }
  }

  /** Memvalidasi OTP; sukses menghapus token. Dibatasi OTP_MAX_ATTEMPTS percobaan per kode. */
  async verify(userId: string, code: string): Promise<void> {
    const attemptsKey = `otp:attempts:${userId}`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.expire(attemptsKey, OTP_TTL_MINUTES * 60);
    if (attempts > OTP_MAX_ATTEMPTS) {
      throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan. Minta kode baru.');
    }

    const token = await this.prisma.verificationToken.findFirst({
      where: { userId, token: code, expiresAt: { gt: new Date() } },
    });
    if (!token) throw new AppError(400, 'OTP_INVALID', 'Kode verifikasi tidak valid atau telah kedaluwarsa.');

    await this.prisma.verificationToken.deleteMany({ where: { userId } });
    await this.redis.del(attemptsKey);
  }
}
