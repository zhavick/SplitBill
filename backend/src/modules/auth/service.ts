import bcrypt from 'bcryptjs';
import type { PrismaClient, User, VerificationChannel } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AppError } from '../../lib/errors.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TTL_SECONDS,
  signAccessToken,
} from '../../lib/tokens.js';
import type { OAuthVerifiers } from './oauth.js';
import { defaultOAuthVerifiers } from './oauth.js';
import type { OtpService } from './otp.js';
import { normalizePhone } from './otp.js';

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  channel?: VerificationChannel;
}

export interface VerifyOtpInput {
  email: string;
  code: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    avatarUrl: string | null;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  };
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly otpService: OtpService,
    private readonly oauthVerifiers: OAuthVerifiers = defaultOAuthVerifiers,
  ) {}

  async register(input: RegisterInput): Promise<{ userId: string; status: string; channel: VerificationChannel }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(input.phoneNumber ? [{ phoneNumber: normalizePhone(input.phoneNumber) }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.status === 'PENDING_VERIFICATION') {
        // Jika akun belum diverifikasi, perbarui password dan kirim ulang OTP
        const passwordHash = await bcrypt.hash(input.password, 12);
        const channel = input.channel ?? existing.verificationChannel;
        const normalizedPhone = input.phoneNumber ? normalizePhone(input.phoneNumber) : existing.phoneNumber;

        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            fullName: input.fullName,
            passwordHash,
            phoneNumber: normalizedPhone,
            verificationChannel: channel,
          },
        });

        await this.otpService.issueAndSend(
          { id: existing.id, email: existing.email, phoneNumber: normalizedPhone },
          channel,
        );

        return { userId: existing.id, status: existing.status, channel };
      }
      throw new AppError(409, 'USER_EXISTS', 'Email atau nomor telepon sudah terdaftar.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const channel = input.channel ?? 'EMAIL';
    const normalizedPhone = input.phoneNumber ? normalizePhone(input.phoneNumber) : null;

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: input.fullName,
        passwordHash,
        phoneNumber: normalizedPhone,
        verificationChannel: channel,
        status: 'PENDING_VERIFICATION',
        role: 'MEMBER',
      },
    });

    await this.otpService.issueAndSend(
      { id: user.id, email: user.email, phoneNumber: normalizedPhone },
      channel,
    );

    return { userId: user.id, status: user.status, channel };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }

    await this.otpService.verify(user.id, input.code.trim());

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        verifiedAt: user.verifiedAt ?? new Date(),
      },
    });

    return await this.createSessionAndIssueTokens(updatedUser, input.ipAddress, input.userAgent);
  }

  async resendOtp(email: string): Promise<{ channel: VerificationChannel }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }
    if (user.status === 'ACTIVE') {
      throw new AppError(400, 'ALREADY_ACTIVE', 'Akun sudah aktif, silakan login.');
    }

    await this.otpService.issueAndSend(
      { id: user.id, email: user.email, phoneNumber: user.phoneNumber },
      user.verificationChannel,
    );

    return { channel: user.verificationChannel };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      // Coba kirim ulang OTP jika cooldown sudah selesai
      try {
        await this.otpService.issueAndSend(
          { id: user.id, email: user.email, phoneNumber: user.phoneNumber },
          user.verificationChannel,
        );
      } catch (err) {
        if (err instanceof AppError && err.code === 'OTP_COOLDOWN') {
          // Cooldown masih aktif, kode sebelumnya masih berlaku
        } else {
          throw err;
        }
      }
      throw new AppError(403, 'ACCOUNT_NOT_VERIFIED', 'Akun belum aktif. Silakan masukkan kode verifikasi Anda.', [
        { channel: user.verificationChannel, email: user.email },
      ]);
    }

    if (user.status === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Akun Anda telah dinonaktifkan. Hubungi admin.');
    }

    return await this.createSessionAndIssueTokens(user, input.ipAddress, input.userAgent);
  }

  async refresh(rawRefreshToken: string, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const isBlacklisted = await this.redis.get(`bl:${tokenHash}`);
    if (isBlacklisted) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Sesi telah kedaluwarsa atau dicabut.');
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshToken: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new AppError(401, 'INVALID_SESSION', 'Sesi tidak valid.');
    }

    if (session.isRevoked || session.expiresAt < new Date()) {
      // Reuse detection: jika token revoked digunakan lagi, cabut seluruh sesi user
      await this.prisma.session.updateMany({
        where: { userId: session.userId },
        data: { isRevoked: true },
      });
      throw new AppError(401, 'SESSION_REUSED', 'Terdeteksi pelanggaran sesi. Silakan login kembali.');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Status akun tidak aktif.');
    }

    // Revoke token lama dan masukkan ke Redis blacklist
    await this.prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });
    await this.redis.set(`bl:${tokenHash}`, '1', 'EX', REFRESH_TTL_SECONDS);

    // Terbitkan sesi dan pasangan token baru
    return await this.createSessionAndIssueTokens(session.user, ipAddress, userAgent);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { refreshToken: tokenHash },
      data: { isRevoked: true },
    });
    await this.redis.set(`bl:${tokenHash}`, '1', 'EX', REFRESH_TTL_SECONDS);
  }

  async oauthGoogle(idToken: string, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    const identity = await this.oauthVerifiers.google(idToken);
    return await this.handleOAuthIdentity('google', identity, ipAddress, userAgent);
  }

  async oauthApple(identityToken: string, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    const identity = await this.oauthVerifiers.apple(identityToken);
    return await this.handleOAuthIdentity('apple', identity, ipAddress, userAgent);
  }

  private async handleOAuthIdentity(
    provider: 'google' | 'apple',
    identity: { providerAccountId: string; email: string; emailVerified: boolean; fullName?: string; avatarUrl?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({ where: { email: identity.email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: identity.email,
          fullName: identity.fullName || identity.email.split('@')[0],
          avatarUrl: identity.avatarUrl,
          status: 'ACTIVE',
          role: 'MEMBER',
          verifiedAt: identity.emailVerified ? new Date() : null,
        },
      });
    }

    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        provider,
        providerAccountId: identity.providerAccountId,
      },
    });

    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Akun tidak aktif.');
    }

    return await this.createSessionAndIssueTokens(user, ipAddress, userAgent);
  }

  private async createSessionAndIssueTokens(user: User, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    const accessToken = await signAccessToken(
      { id: user.id, email: user.email, role: user.role, status: user.status },
      session.id,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatarUrl,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 900, // 15 menit dalam detik
      },
    };
  }
}
