import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@splitbill.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName: 'Super Administrator',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      verificationChannel: 'EMAIL',
      verifiedAt: new Date(),
      ocrQuotaRemaining: 999999,
    },
  });
  console.log(`Superadmin siap: ${admin.email}`);

  const defaults = [
    { configKey: 'OAUTH_GOOGLE', configData: { enabled: false } },
    { configKey: 'OAUTH_APPLE', configData: { enabled: false } },
    { configKey: 'EMAIL_GATEWAY', configData: { provider: 'resend' } },
    { configKey: 'WA_GATEWAY', configData: { provider: 'meta_cloud_api' } },
    { configKey: 'PAYMENT_GATEWAY', configData: { provider: 'midtrans' } },
  ];
  for (const d of defaults) {
    await prisma.thirdPartyIntegrationConfig.upsert({
      where: { configKey: d.configKey },
      update: {},
      create: d,
    });
  }
  console.log('Konfigurasi integrasi default siap.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
