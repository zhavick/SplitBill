-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'MEMBER', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OverheadSplitStrategy" AS ENUM ('EQUAL', 'PROPORTIONAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'VERIFIED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(30),
    "passwordHash" VARCHAR(255),
    "fullName" VARCHAR(150) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationChannel" "VerificationChannel" NOT NULL DEFAULT 'EMAIL',
    "avatarUrl" VARCHAR(500),
    "defaultPaymentQrisUrl" VARCHAR(500),
    "ocrQuotaRemaining" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "verifiedAt" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshToken" VARCHAR(500) NOT NULL,
    "userAgent" VARCHAR(255),
    "ipAddress" VARCHAR(45),
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "token" VARCHAR(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_transactions" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "isLiveSession" BOOLEAN NOT NULL DEFAULT false,
    "liveSessionCode" VARCHAR(20),
    "merchantName" VARCHAR(150) NOT NULL,
    "merchantAddress" VARCHAR(255),
    "receiptDate" TIMESTAMPTZ,
    "locationLat" DECIMAL(10,8),
    "locationLng" DECIMAL(11,8),
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "overheadStrategy" "OverheadSplitStrategy" NOT NULL DEFAULT 'EQUAL',
    "items" JSONB NOT NULL,
    "adjustment" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "split_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_shots" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "shotIndex" SMALLINT NOT NULL,
    "imageStorageKey" VARCHAR(255) NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "userId" UUID,
    "fullName" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255),
    "phoneNumber" VARCHAR(30),
    "avatarColor" VARCHAR(20) NOT NULL,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settlements" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "amountPayable" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2),
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "proofImageUrl" VARCHAR(500),
    "verifiedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_audit_logs" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actorName" VARCHAR(150) NOT NULL,
    "actorIp" VARCHAR(45),
    "details" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "third_party_integration_configs" (
    "id" UUID NOT NULL,
    "configKey" VARCHAR(100) NOT NULL,
    "configData" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "third_party_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_token_idx" ON "verification_tokens"("userId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "split_transactions_liveSessionCode_key" ON "split_transactions"("liveSessionCode");

-- CreateIndex
CREATE INDEX "split_transactions_ownerId_idx" ON "split_transactions"("ownerId");

-- CreateIndex
CREATE INDEX "split_transactions_status_idx" ON "split_transactions"("status");

-- CreateIndex
CREATE INDEX "split_transactions_createdAt_idx" ON "split_transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_shots_transactionId_shotIndex_key" ON "receipt_shots"("transactionId", "shotIndex");

-- CreateIndex
CREATE INDEX "participants_transactionId_idx" ON "participants"("transactionId");

-- CreateIndex
CREATE INDEX "participants_userId_idx" ON "participants"("userId");

-- CreateIndex
CREATE INDEX "payment_settlements_transactionId_idx" ON "payment_settlements"("transactionId");

-- CreateIndex
CREATE INDEX "payment_settlements_participantId_idx" ON "payment_settlements"("participantId");

-- CreateIndex
CREATE INDEX "transaction_audit_logs_transactionId_idx" ON "transaction_audit_logs"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_integration_configs_configKey_key" ON "third_party_integration_configs"("configKey");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_transactions" ADD CONSTRAINT "split_transactions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_shots" ADD CONSTRAINT "receipt_shots_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "split_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "split_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "split_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audit_logs" ADD CONSTRAINT "transaction_audit_logs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "split_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
