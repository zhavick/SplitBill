import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { redis } from '../lib/redis.js';
import type { AccessClaims } from '../lib/tokens.js';
import { verifyAccessToken } from '../lib/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Header Authorization: Bearer <token> diperlukan.');
  }

  const token = header.slice(7).trim();
  try {
    const claims = await verifyAccessToken(token);

    // Cek apakah token atau sesi telah dimasukkan ke blacklist Redis
    const isRevoked =
      (claims.jti ? await redis.get(`bl:${claims.jti}`) : null) ||
      (claims.sid ? await redis.get(`bl:sid:${claims.sid}`) : null);

    if (isRevoked) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Sesi telah dibatalkan atau pengguna telah logout.');
    }

    req.user = claims;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'INVALID_TOKEN', 'Token akses tidak valid atau telah kedaluwarsa.');
  }
}

export function requireRole(...allowedRoles: string[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Otentikasi diperlukan.');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Anda tidak memiliki hak akses untuk aksi ini.');
    }
  };
}
