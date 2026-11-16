import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { parseDurationSeconds } from './duration.js';

const ISSUER = 'splitbill-auth-service';
const AUDIENCE = 'splitbill-client';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const ACCESS_TTL_SECONDS = parseDurationSeconds(env.JWT_ACCESS_EXPIRATION);
export const REFRESH_TTL_SECONDS = parseDurationSeconds(env.JWT_REFRESH_EXPIRATION);

export interface AccessClaims {
  sub: string;
  email: string;
  role: string;
  status: string;
  sid: string;
  jti: string;
  exp: number;
}

export async function signAccessToken(user: {
  id: string;
  email: string;
  role: string;
  status: string;
}, sessionId: string): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, status: user.status, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  return payload as unknown as AccessClaims;
}

/** Refresh token opaque; yang disimpan di database hanya HMAC-nya. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}
