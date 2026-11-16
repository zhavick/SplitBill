import 'dotenv/config';
import { z } from 'zod';

const optionalStr = z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3385),
  WEB_ORIGIN: z.string().url().default('http://localhost:3385'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  GEMINI_API_KEY: optionalStr,

  // Gateway komunikasi (kosong => mode pengembangan: pesan dicetak ke log)
  RESEND_API_KEY: optionalStr,
  EMAIL_SENDER_ADDRESS: z.string().default('no-reply@splitbill.local'),
  WA_PHONE_NUMBER_ID: optionalStr,
  WA_API_TOKEN: optionalStr,
  WA_OTP_TEMPLATE: z.string().default('splitbill_otp'),
  WA_TEMPLATE_LANG: z.string().default('id'),

  // OAuth
  GOOGLE_CLIENT_ID: optionalStr,
  APPLE_SERVICES_ID: optionalStr,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Konfigurasi environment tidak valid:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
