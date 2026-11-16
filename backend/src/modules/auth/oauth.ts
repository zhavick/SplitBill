import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export interface OAuthIdentity {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  avatarUrl?: string;
}

export interface OAuthVerifiers {
  google(idToken: string): Promise<OAuthIdentity>;
  apple(identityToken: string): Promise<OAuthIdentity>;
}

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const defaultOAuthVerifiers: OAuthVerifiers = {
  async google(idToken) {
    if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, 'OAUTH_NOT_CONFIGURED', 'Login Google belum dikonfigurasi.');
    try {
      const ticket = await new OAuth2Client(env.GOOGLE_CLIENT_ID).verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('payload tidak lengkap');
      return {
        providerAccountId: p.sub,
        email: p.email.toLowerCase(),
        emailVerified: p.email_verified === true,
        fullName: p.name,
        avatarUrl: p.picture,
      };
    } catch {
      throw new AppError(401, 'OAUTH_INVALID_TOKEN', 'Token Google tidak valid.');
    }
  },

  async apple(identityToken) {
    if (!env.APPLE_SERVICES_ID) throw new AppError(503, 'OAUTH_NOT_CONFIGURED', 'Login Apple belum dikonfigurasi.');
    try {
      const { payload } = await jwtVerify(identityToken, appleJwks, {
        issuer: 'https://appleid.apple.com',
        audience: env.APPLE_SERVICES_ID,
      });
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('payload tidak lengkap');
      return {
        providerAccountId: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      };
    } catch {
      throw new AppError(401, 'OAUTH_INVALID_TOKEN', 'Token Apple tidak valid.');
    }
  },
};
