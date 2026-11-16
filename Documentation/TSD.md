# Technical Specification Document (TSD)
## Aplikasi SplitBill: Smart Receipt OCR, Collaborative Split, PostgreSQL, JWT Security & Admin Backoffice

- **Nama Dokumen:** Technical Specification Document (TSD)
- **Proyek:** SplitBill Application
- **Versi:** 1.0.0
- **Status:** Approved / Ready for Implementation
- **Tanggal Efektif:** 2026-11-16
- **Dokumen Terkait:** [Documentation/MasterPlan.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/MasterPlan.md) & [Documentation/FSD.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/FSD.md)

---

## 1. Arsitektur Sistem & Topologi Infrastruktur

Sistem dirancang menggunakan arsitektur *Clean Architecture* berbasis micro-services modular dengan pemisahan yang jelas antara lapisan presentasi (*Client Apps* & *Admin Portal*), lapisan gerbang (*API Gateway*), lapisan domain komputasi (*Fair Split & AI Vision OCR*), dan lapisan persistensi data (*PostgreSQL & Redis*).

```
                                  [ INTERNET / CDN ]
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
                   ▼                                             ▼
       [ PWA Web & Admin Portal ]                    [ Mobile Client Native ]
       (Next.js 15 + Serwist PWA)                   (React Native Expo SDK 52)
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │ HTTPS (JWT Bearer Token) / WSS (WebSocket)
                                          ▼
                             [ API GATEWAY: FASTIFY ]
                             (Node.js 22 LTS, TypeScript)
                             ├── JWT Authentication & RBAC Guard
                             ├── Rate Limiting & Input Sanitization
                             └── Sharp Image Preprocessing Service
                                          │
         ┌────────────────────────────────┼────────────────────────────────┐
         │                                │                                │
         ▼                                ▼                                ▼
[ OCR AI MICROSERVICE ]       [ FAIR-SPLIT ENGINE ]         [ LIVE SYNC WEBSOCKET ]
(Google Gemini 2.5 Flash)     (Equal / Proportional Calc)   (Redis Pub/Sub State Sync)
         │                                │                                │
         └────────────────────────────────┼────────────────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
                   ▼                                             ▼
       [ PRIMARY RELATIONAL DB ]                       [ IN-MEMORY STORE ]
         (PostgreSQL 16+ via Prisma)                     (Redis 7+ Cluster)
         - Transactions, Users, Audits                   - JWT Token Blacklist
         - JSONB Items & Adjustments                     - Live Session Temp State
         - B-Tree & GIN Indexes                          - Quota & Rate Limit Keys
                   │
                   ▼
       [ OBJECT STORAGE: CLOUDFLARE R2 / AWS S3 ]
         - Multi-Shot Receipt Images (Presigned URLs)
         - Lifecycle Policy: Auto-Delete 30 Days (UU PDP Compliance)
```

---

## 2. Spesifikasi Database & Skema Relasional (PostgreSQL 16+)

Aplikasi menggunakan **PostgreSQL 16+** dengan **Prisma ORM**. Seluruh primary key menggunakan `UUIDv4` untuk mencegah *enumeration attack*. Struktur dinamis seperti rincian barang struk dan penyesuaian biaya disimpan dalam format `JSONB` yang dilengkapi pengindeksan GIN untuk performa kueri tinggi.

### 2.1 Skema Prisma (`schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  GUEST
  MEMBER
  ADMIN
  SUPERADMIN
}

enum AccountStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
}

enum VerificationChannel {
  EMAIL
  WHATSAPP
}

enum OverheadSplitStrategy {
  EQUAL
  PROPORTIONAL
}

enum TransactionStatus {
  DRAFT
  ACTIVE
  SETTLED
}

enum PaymentStatus {
  UNPAID
  PENDING_VERIFICATION
  VERIFIED
}

model User {
  id                    String              @id @default(uuid()) @db.Uuid
  email                 String              @unique @db.VarChar(255)
  phoneNumber           String?             @unique @db.VarChar(30)
  passwordHash          String?             @db.VarChar(255) // Nullable jika login via OAuth
  fullName              String              @db.VarChar(150)
  role                  UserRole            @default(MEMBER)
  status                AccountStatus       @default(PENDING_VERIFICATION)
  verificationChannel   VerificationChannel @default(EMAIL)
  avatarUrl             String?             @db.VarChar(500)
  defaultPaymentQrisUrl String?             @db.VarChar(500)
  ocrQuotaRemaining     Int                 @default(10)
  createdAt             DateTime            @default(now()) @db.Timestamptz
  updatedAt             DateTime            @updatedAt @db.Timestamptz
  verifiedAt            DateTime?           @db.Timestamptz

  // Relasi
  accounts              Account[]
  sessions              Session[]
  ownedTransactions     SplitTransaction[]  @relation("OwnerTransactions")
  participants          Participant[]
  verificationTokens    VerificationToken[]

  @@index([email])
  @@index([phoneNumber])
  @@map("users")
}

model Account {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  provider          String   @db.VarChar(50) // "google" | "apple"
  providerAccountId String   @db.VarChar(255)
  refreshToken      String?  @db.Text
  accessToken       String?  @db.Text
  createdAt         DateTime @default(now()) @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  refreshToken String   @unique @db.VarChar(500)
  userAgent    String?  @db.VarChar(255)
  ipAddress    String?  @db.VarChar(45)
  isRevoked    Boolean  @default(false)
  expiresAt    DateTime @db.Timestamptz
  createdAt    DateTime @default(now()) @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  id         String              @id @default(uuid()) @db.Uuid
  userId     String              @db.Uuid
  channel    VerificationChannel
  token      String              @db.VarChar(6) // OTP 6-Digit
  expiresAt  DateTime            @db.Timestamptz
  createdAt  DateTime            @default(now()) @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, token])
  @@map("verification_tokens")
}

model SplitTransaction {
  id               String                 @id @default(uuid()) @db.Uuid
  ownerId          String?                @db.Uuid // Nullable jika sesi guest
  isLiveSession    Boolean                @default(false)
  liveSessionCode  String?                @unique @db.VarChar(20)
  merchantName     String                 @db.VarChar(150)
  merchantAddress  String?                @db.VarChar(255)
  receiptDate      DateTime?              @db.Timestamptz
  locationLat      Decimal?               @db.Decimal(10, 8)
  locationLng      Decimal?               @db.Decimal(11, 8)
  status           TransactionStatus      @default(DRAFT)
  overheadStrategy OverheadSplitStrategy  @default(EQUAL)
  
  // Rincian Keuangan & Struktur Dokumen (JSONB)
  items            Json                   @db.JsonB // Array of ReceiptItem
  adjustment       Json                   @db.JsonB // ReceiptAdjustment (tax, service, discount, rounding)
  
  createdAt        DateTime               @default(now()) @db.Timestamptz
  updatedAt        DateTime               @updatedAt @db.Timestamptz

  owner            User?                  @relation("OwnerTransactions", fields: [ownerId], references: [id], onDelete: SetNull)
  shots            ReceiptShot[]
  participants     Participant[]
  settlements      PaymentSettlement[]
  auditLogs        TransactionAuditLog[]

  @@index([ownerId])
  @@index([status])
  @@index([createdAt])
  @@map("split_transactions")
}

model ReceiptShot {
  id            String   @id @default(uuid()) @db.Uuid
  transactionId String   @db.Uuid
  shotIndex     Int      @db.SmallInt
  imageStorageKey String @db.VarChar(255)
  imageUrl      String   @db.VarChar(500)
  capturedAt    DateTime @default(now()) @db.Timestamptz

  transaction SplitTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@unique([transactionId, shotIndex])
  @@map("receipt_shots")
}

model Participant {
  id            String   @id @default(uuid()) @db.Uuid
  transactionId String   @db.Uuid
  userId        String?  @db.Uuid // Nullable jika teman ad-hoc
  fullName      String   @db.VarChar(150)
  email         String?  @db.VarChar(255)
  phoneNumber   String?  @db.VarChar(30)
  avatarColor   String   @db.VarChar(20)
  isSelf        Boolean  @default(false)
  createdAt     DateTime @default(now()) @db.Timestamptz

  transaction   SplitTransaction    @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  user          User?               @relation(fields: [userId], references: [id], onDelete: SetNull)
  settlements   PaymentSettlement[]

  @@index([transactionId])
  @@map("participants")
}

model PaymentSettlement {
  id                    String        @id @default(uuid()) @db.Uuid
  transactionId         String        @db.Uuid
  participantId         String        @db.Uuid
  amountPayable         Decimal       @db.Decimal(12, 2)
  amountPaid            Decimal?      @db.Decimal(12, 2)
  status                PaymentStatus @default(UNPAID)
  proofImageUrl         String?       @db.VarChar(500)
  verifiedAt            DateTime?     @db.Timestamptz
  createdAt             DateTime      @default(now()) @db.Timestamptz
  updatedAt             DateTime      @updatedAt @db.Timestamptz

  transaction SplitTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  participant Participant      @relation(fields: [participantId], references: [id], onDelete: Cascade)

  @@index([transactionId])
  @@index([participantId])
  @@map("payment_settlements")
}

model TransactionAuditLog {
  id            String   @id @default(uuid()) @db.Uuid
  transactionId String   @db.Uuid
  action        String   @db.VarChar(50) // "CREATED" | "ITEM_EDITED" | "TAG_UPDATED" | "SETTLED"
  actorName     String   @db.VarChar(150)
  actorIp       String?  @db.VarChar(45)
  details       Json     @db.JsonB
  timestamp     DateTime @default(now()) @db.Timestamptz

  transaction SplitTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@index([transactionId])
  @@map("transaction_audit_logs")
}

model ThirdPartyIntegrationConfig {
  id         String   @id @default(uuid()) @db.Uuid
  configKey  String   @unique @db.VarChar(100) // e.g., "OAUTH_GOOGLE", "WA_GATEWAY"
  configData Json     @db.JsonB
  updatedAt  DateTime @updatedAt @db.Timestamptz

  @@map("third_party_integration_configs")
}
```

---

## 3. Arsitektur API Gateway & Spesifikasi Endpoint RESTful (Fastify Node.js)

### 3.1 Standar Format Respons API (Standardized JSend Envelope)
Semua endpoint menghasilkan format JSON terstruktur seragam:
```json
{
  "status": "success",
  "data": { ... },
  "meta": {
    "requestId": "req-987654",
    "timestamp": "2026-11-16T10:20:00Z"
  }
}
```
Respons galat (*Error Response*):
```json
{
  "status": "error",
  "code": "VALIDATION_FAILED",
  "message": "Kode OTP verifikasi tidak valid atau telah kedaluwarsa.",
  "details": []
}
```

---

### 3.2 Katalog Endpoint API

#### A. Layanan Autentikasi (`/api/v1/auth`)
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/register` | Public | Pendaftaran mandiri (Nama, Email, No. WA, Password). Mengirimkan OTP verifikasi. |
| `POST` | `/verify-otp` | Public | Verifikasi kode OTP 6-digit aktivasi akun. Mengembalikan token JWT jika sukses. |
| `POST` | `/login` | Public | Login via Email & Password. Mengembalikan Access Token & Refresh Token. |
| `POST` | `/oauth/google` | Public | Otentikasi Single Sign-On (SSO) via ID Token Google Identity Services. |
| `POST` | `/oauth/apple` | Public | Otentikasi Sign in with Apple via Identity Token. |
| `POST` | `/refresh` | Public | Memperbarui Access Token menggunakan Refresh Token yang valid. |
| `POST` | `/logout` | Bearer | Menghapus refresh token dan memasukkannya ke blacklist Redis. |

#### B. Layanan Ekstraksi OCR & Struk (`/api/v1/receipts`)
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/upload-shot` | Optional | Mengunggah frame foto struk (multi-part form). Mengembalikan `shotId` & `imageUrl`. |
| `POST` | `/process-ocr` | Optional | Mengirimkan daftar `shotId` ke Gemini 2.5 Flash untuk agregasi & de-duplikasi. |
| `PUT` | `/:id/review` | Optional | Memperbarui/mengoreksi daftar item dan penyesuaian pajak hasil OCR. |

#### C. Layanan Transaksi & Tagging (`/api/v1/transactions`)
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/` | Optional | Membuat draf sesi transaksi split bill baru. |
| `POST` | `/:id/participants` | Optional | Menambahkan teman ad-hoc baru via modal popup. |
| `PUT` | `/:id/tag-items` | Optional | Menetapkan kepemilikan item ("Milik Saya" atau Tag ID Teman). |
| `POST` | `/:id/calculate` | Optional | Menghitung kalkulasi final (Bagi Rata vs Proporsional) + Rounding Balancing. |
| `POST` | `/:id/live-session` | Bearer | Membuka sesi meja kolaboratif dan menghasilkan kode/QR meja. |

#### D. Layanan Pelunasan Pembayaran (`/api/v1/settlements`)
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/:id/qris` | Optional | Menghasilkan gambar QRIS Dinamis dengan nominal terkunci. |
| `POST` | `/:id/proof` | Optional | Mengunggah screenshot bukti transfer perbankan. |
| `PATCH`| `/:id/verify` | Bearer | Payer memverifikasi bukti transfer dan menandai status `VERIFIED`. |

#### E. Layanan Backoffice Admin (`/api/v1/admin`)
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/analytics/overview` | Admin | Ringkasan metrik eksekutif (GTV, Volume Transaksi, Average Spend). |
| `GET` | `/analytics/ocr-health`| Admin | Metrik performa AI (Latency, Success Rate, Error Logs, Token Usage). |
| `GET` | `/analytics/merchants` | Admin | Statistik restoran & tren kuliner terpopuler (anonymized). |
| `GET` | `/integrations` | Admin | Mengambil status konfigurasi OAuth Google/Apple dan Gateway WA/Email. |
| `PUT` | `/integrations/:key` | SuperAdmin | Menyimpan dan memperbarui kredensial integrasi pihak ketiga. |
| `POST`| `/integrations/test-delivery`| Admin | Menguji pengiriman pesan uji coba (Test OTP Email/WA). |

---

## 4. Keamanan Autentikasi JWT & Otorisasi RBAC

### 4.1 Spesifikasi Payload JWT
- **Algoritma Signing:** `RS256` (Asymmetric Keypair) atau `HS256` dengan Secret Key 256-bit kuat.
- **Payload Access Token:**
```json
{
  "sub": "b2f67e1a-1234-4567-89ab-cdef01234567",
  "email": "user@splitbill.id",
  "role": "MEMBER",
  "status": "ACTIVE",
  "iss": "splitbill-auth-service",
  "aud": "splitbill-client",
  "iat": 1794700800,
  "exp": 1794701700
}
```

### 4.2 Alur Refresh Token Rotation & Redis Blacklist
1. Setiap kali endpoint `/api/v1/auth/refresh` dipanggil:
   - Klien mengirimkan Refresh Token lama.
   - Sistem memverifikasi validitas token pada database PostgreSQL dan memeriksa apakah token ada di Redis Blacklist.
   - Jika valid: Refresh token lama segera dimasukkan ke Redis Blacklist (`SETEX blacklist:<old_token> <ttl> 1`) dan diterbitkan **sepasang token baru** (Access Token baru + Refresh Token baru).
   - Jika terdeteksi token lama digunakan kembali (*reuse detection*): Sistem secara otomatis mencabut (*revoke*) seluruh sesi aktif pengguna tersebut karena indikasi serangan pencurian token.

---

## 5. Implementasi Vision AI OCR Pipeline (Google Gemini 2.5 Flash & Sharp)

### 5.1 Pipeline Preprocessing Gambar (`Sharp`)
Sebelum foto struk dikirim ke Google Gemini API, server melakukan optimasi citra:
```typescript
import sharp from 'sharp';

export async function preprocessReceiptImage(inputBuffer: Buffer): Promise<Buffer> {
  return await sharp(inputBuffer)
    .rotate() // Auto-orient berdasarkan metadata EXIF orientasi ponsel
    .resize({ width: 1600, withoutEnlargement: true }) // Skalakan resolusi optimal
    .normalize() // Rentangkan kontras untuk memperjelas teks pudar
    .sharpen({ sigma: 1.2 }) // Tajamkan tepi karakter teks thermal
    .jpeg({ quality: 85 }) // Kompresi berkas tanpa kehilangan ketajaman teks
    .toBuffer();
}
```

### 5.2 Structured JSON Extraction via Gemini SDK
Sistem memanggil Gemini 2.5 Flash dengan skema luaran kaku (*Structured Output Schema*):
```typescript
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const receiptResponseSchema = {
  type: Type.OBJECT,
  properties: {
    merchantName: { type: Type.STRING },
    date: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          qty: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          totalPrice: { type: Type.NUMBER },
        },
        required: ["name", "qty", "totalPrice"],
      },
    },
    subtotal: { type: Type.NUMBER },
    discount: { type: Type.NUMBER },
    serviceCharge: { type: Type.NUMBER },
    tax: { type: Type.NUMBER },
    rounding: { type: Type.NUMBER },
    grandTotal: { type: Type.NUMBER },
  },
  required: ["items", "grandTotal"],
};

export async function extractReceiptData(imageBuffers: Buffer[]) {
  const parts = imageBuffers.map(buf => ({
    inlineData: {
      data: buf.toString('base64'),
      mimeType: 'image/jpeg',
    },
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      ...parts,
      "Ekstrak data struk restoran ini secara presisi. Jika terdapat beberapa foto dari struk yang sama, gabungkan seluruh menu makanan dan hilangkan baris yang tumpang tindih."
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: receiptResponseSchema,
      temperature: 0.1, // Suhu rendah untuk akurasi data finansial maksimal
    },
  });

  return JSON.parse(response.text);
}
```

---

## 6. Algoritma Fair-Split & Rekonsiliasi Pembulatan Matematika

Implementasi algoritma pembagian tagihan dan rekonsiliasi pembulatan rupiah (*Largest Remainder Method*):

```typescript
export interface CalculationInput {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  grandTotal: number;
  strategy: 'EQUAL' | 'PROPORTIONAL';
  participantSubtotals: { participantId: string; subtotal: number }[];
}

export interface CalculationResult {
  participantId: string;
  itemSubtotal: number;
  discountShare: number;
  serviceShare: number;
  taxShare: number;
  finalPayable: number;
}

export function calculateFairSplit(input: CalculationInput): CalculationResult[] {
  const totalFoodSubtotal = input.subtotal;
  const numParticipants = input.participantSubtotals.length;

  if (numParticipants === 0) return [];

  // 1. Hitung alokasi non-barang sebelum pembulatan
  const rawResults = input.participantSubtotals.map(p => {
    let ratio = 0;
    if (input.strategy === 'PROPORTIONAL' && totalFoodSubtotal > 0) {
      ratio = p.subtotal / totalFoodSubtotal;
    } else {
      ratio = 1 / numParticipants;
    }

    const discountShare = ratio * input.discount;
    const serviceShare = ratio * input.serviceCharge;
    const taxShare = ratio * input.tax;
    const roundingShare = ratio * input.rounding;

    const rawTotal = p.subtotal - discountShare + serviceShare + taxShare + roundingShare;

    return {
      participantId: p.participantId,
      itemSubtotal: p.subtotal,
      discountShare,
      serviceShare,
      taxShare,
      rawTotal,
      roundedTotal: Math.floor(rawTotal),
      remainder: rawTotal - Math.floor(rawTotal),
    };
  });

  // 2. Rekonsiliasi Pembulatan Rupiah (Largest Remainder Method)
  const sumRounded = rawResults.reduce((acc, curr) => acc + curr.roundedTotal, 0);
  let difference = Math.round(input.grandTotal - sumRounded);

  // Urutkan berdasarkan sisa desimal terbesar
  rawResults.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < rawResults.length && difference > 0; i++) {
    rawResults[i].roundedTotal += 1;
    difference -= 1;
  }

  // 3. Format hasil akhir (selisih dijamin 0 terhadap grand total)
  return rawResults.map(r => ({
    participantId: r.participantId,
    itemSubtotal: r.itemSubtotal,
    discountShare: Math.round(r.discountShare),
    serviceShare: Math.round(r.serviceShare),
    taxShare: Math.round(r.taxShare),
    finalPayable: r.roundedTotal,
  }));
}
```

---

## 7. Implementasi PWA & Strategi Offline Caching

Konfigurasi Service Worker menggunakan **Serwist** pada Next.js 15:
```typescript
// sw.ts (Service Worker)
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

---

## 8. Konfigurasi Kontainerisasi & Deployment (Docker)

### 8.1 Docker Compose Development Stack (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: splitbill-postgres
    restart: always
    environment:
      POSTGRES_USER: splitbill_admin
      POSTGRES_PASSWORD: SecretSplitBillPassword2026!
      POSTGRES_DB: splitbill_db
    ports:
      - "5578:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U splitbill_admin -d splitbill_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: splitbill-redis
    restart: always
    command: redis-server --appendonly yes --requirepass RedisSecretPass2026!
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: splitbill-api
    restart: always
    environment:
      DATABASE_URL: "postgresql://splitbill_admin:SecretSplitBillPassword2026!@postgres:5432/splitbill_db?schema=public"
      REDIS_URL: "redis://:RedisSecretPass2026!@redis:6379"
      JWT_SECRET: "your-256-bit-jwt-secret-key-goes-here"
      GEMINI_API_KEY: "AIzaSy..."
      PORT: 4000
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
```

### 8.2 Matriks Variabel Lingkungan (`.env.example`)
```ini
# Application Environment
NODE_ENV=production
PORT=4000

# Database & Cache
DATABASE_URL="postgresql://user:pass@localhost:5578/splitbill_db?schema=public"
REDIS_URL="redis://:pass@localhost:6379"

# Security & JWT
JWT_ACCESS_SECRET="super-secret-access-token-key-256bit"
JWT_REFRESH_SECRET="super-secret-refresh-token-key-256bit"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# Vision AI & Preprocessing
GEMINI_API_KEY="AIzaSy..."

# Cloud Object Storage (Cloudflare R2 / AWS S3)
STORAGE_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY="your-r2-access-key"
STORAGE_SECRET_KEY="your-r2-secret-key"
STORAGE_BUCKET_NAME="splitbill-receipts"

# Third-Party Communication Gateways
RESEND_API_KEY="re_..."
EMAIL_SENDER_ADDRESS="no-reply@splitbill.id"
WA_PHONE_NUMBER_ID="10987654321"
WA_API_TOKEN="EAAG..."

# Third-Party OAuth 2.0
GOOGLE_CLIENT_ID="123456789.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
APPLE_SERVICES_ID="id.splitbill.auth"
APPLE_TEAM_ID="ABCDE12345"
APPLE_KEY_ID="KEY1234567"
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

---

## 9. Kesimpulan

Dokumen Spesifikasi Teknis (TSD) ini menetapkan landasan rekayasa perangkat lunak yang **kuat, modular, tipe-aman (*type-safe*), dan siap produksi**. Dengan fondasi **PostgreSQL 16+**, **Fastify**, **Google Gemini 2.5 Flash**, **JWT Bearer Token Security**, dan **Next.js 15 PWA**, aplikasi SplitBill siap diimplementasikan secara terstruktur oleh tim pengembang.
