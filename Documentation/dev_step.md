# Panduan Fase & Tahapan Pengembangan (Development Steps)
## Aplikasi SplitBill: Smart Receipt OCR, Collaborative Split, PostgreSQL, JWT & Admin Backoffice

- **Nama Dokumen:** Development Steps & Execution Roadmap (`dev_step.md`)
- **Proyek:** SplitBill Application
- **Versi:** 1.0.0
- **Status:** Approved / Actionable Roadmap
- **Tanggal Efektif:** 2026-11-16
- **Dokumen Acuan:** 
  - [Documentation/MasterPlan.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/MasterPlan.md)
  - [Documentation/FSD.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/FSD.md)
  - [Documentation/TSD.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/TSD.md)

---

## 1. Ikhtisar Strategi Pengembangan

Pengembangan aplikasi **SplitBill** dibagi menjadi **10 Langkah Terstruktur (Sequential Steps)** menggunakan pendekatan *Milestone-Driven Development*. Setiap langkah memiliki sasaran fungsional yang jelas, dependensi yang terdefinisi, serta tolok ukur pengujian (*Definition of Done*) sebelum melangkah ke tahap berikutnya.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             TAHAPAN PENGEMBANGAN                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
  [Step 1] Inisialisasi Proyek, Environment & Setup Database PostgreSQL 16
     │
  [Step 2] Core Domain Engine: Kalkulator Fair-Split & Rekonsiliasi Pembulatan
     │
  [Step 3] Layanan Keamanan, Autentikasi JWT Bearer & Verifikasi Email/WhatsApp
     │
  [Step 4] Preprocessing Gambar & Pipeline Vision OCR AI (Gemini 2.5 Flash)
     │
  [Step 5] Frontend PWA Responsif: Kamera Multi-Shot & Workspace Tagging
     │
  [Step 6] Fitur Kolaborasi Meja Real-Time (Live Table Session via Web QR)
     │
  [Step 7] Fitur Lanjutan Member: Trip Mode, Pelunasan QRIS & PDF Reimbursement
     │
  [Step 8] Portal Pengelola & Analitik (Admin Backoffice Dashboard)
     │
  [Step 9] Pengujian Menyeluruh (E2E), Audit Keamanan & Optimasi Performa PWA
     │
  [Step 10] Kontainerisasi Docker, CI/CD Pipeline & Peluncuran Produksi
```

---

## 2. Rincian Langkah Pengembangan (Step-by-Step Execution)

---

### STEP 1: Inisialisasi Proyek, Environment & Setup Database PostgreSQL
**Tujuan:** Menyiapkan fondasi monorepo/struktur proyek, lingkungan kontainer lokal, skema database PostgreSQL, dan dependensi dasar.

- [x] **1.1 Struktur Direktori Proyek:**
  - Setup struktur monorepo/multi-package:
    - `/backend`: Fastify API Gateway (Node.js 22 LTS, TypeScript).
    - `/frontend`: Next.js 15 PWA & Admin Backoffice (Tailwind CSS, Shadcn UI).
    - `/shared`: Tipe data TypeScript, interface entitas, dan konstanta bersama.
- [x] **1.2 Setup Docker Compose Lokal:**
  - Konfigurasi `docker-compose.yml` untuk menjalankan kontainer **PostgreSQL 16-alpine** dan **Redis 7-alpine**.
  - Setup health check database dan volume data persisten.
- [x] **1.3 Konfigurasi Prisma ORM:**
  - Tulis skema deklaratif di `backend/prisma/schema.prisma` sesuai spesifikasi TSD (Tabel: `users`, `accounts`, `sessions`, `verification_tokens`, `split_transactions`, `receipt_shots`, `participants`, `payment_settlements`, `transaction_audit_logs`, `third_party_integration_configs`).
  - Jalankan migrasi perdana: `npx prisma migrate dev --name init_db`.
  - Buat data seeder (`prisma/seed.ts`) untuk akun default Administrator (`superadmin`).
- [x] **1.4 Manajemen Konfigurasi (.env):**
  - Setup pustaka validasi environment variables menggunakan Zod/dotenv (`.env.example` dan `.env`).

**Tolok Ukur Selesai (Definition of Done):**
- Kontainer PostgreSQL dan Redis berjalan sehat di Docker.
- Prisma Studio dapat dibuka dan seluruh tabel relasional terbuat secara presisi.

---

### STEP 2: Core Domain Engine: Kalkulator Fair-Split & Rekonsiliasi Pembulatan
**Tujuan:** Membangun modul logika matematika murni yang menghitung pembagian beban pesanan dan biaya non-barang dengan jaminan selisih Rp 0 terhadap grand total struk.

- [x] **2.1 Implementasi Fungsi `calculateFairSplit()`:**
  - Menghitung subtotal konsumsi per individu berdasarkan item yang di-tag (termasuk item *shared* fraksional).
  - Menghitung alokasi biaya non-barang (Pajak PB1, Service Charge, Diskon, Pembulatan Kasir) berdasarkan dua strategi:
    - **Mode EQUAL:** Biaya non-barang dibagi rata ke seluruh partisipan.
    - **Mode PROPORTIONAL:** Biaya non-barang dibagi berdasarkan rasio belanja konsumsi masing-masing orang terhadap total subtotal makanan.
- [x] **2.2 Implementasi Rekonsiliasi Pembulatan Rupiah (Largest Remainder Method):**
  - Mengeliminasi pecahan desimal/sen rupiah.
  - Mengalokasikan selisih pembulatan $\pm 1$ rupiah kepada individu dengan sisa desimal terbesar agar $\sum \text{Total Individu} == \text{Grand Total Struk}$.
- [x] **2.3 Unit Testing Komprehensif (Vitest / Jest):**
  - Uji kasus struk 5 barang (skenario Master Plan): Subtotal Rp 100.000, Pajak Rp 5.000, Total Rp 105.000 dibagi ke A, B, dan C.
  - Uji kasus pembagian ganjil (3 orang membagi beban Rp 10.000 -> 3.334, 3.333, 3.333).
  - Uji kasus diskon bertingkat dan pembulatan kasir minus.

**Tolok Ukur Selesai (Definition of Done):**
- Seluruh unit test matematika lulus 100% dengan cakupan kode (*code coverage*) > 95%.
- Tidak ada potensi kesalahan selisih 1 rupiah pada skenario pembagian apapun.

---

### STEP 3: Layanan Keamanan, Autentikasi JWT Bearer & Verifikasi Email/WhatsApp
**Tujuan:** Membangun gateway autentikasi aman dengan arsitektur token ganda, alur aktivasi akun baru, dan Single Sign-On (SSO).

- [x] **3.1 Sistem Registrasi & Aktivasi Akun Multi-Channel:**
  - Endpoint `POST /api/v1/auth/register`: Menerima input data pengguna, membuat akun berstatus `PENDING_VERIFICATION`, dan menghasilkan kode OTP 6-digit dengan masa berlaku 10 menit.
  - Integrasi Gateway Pengiriman OTP:
    - Saluran Email: Menggunakan **Resend API** / AWS SES untuk mengirim Magic Link & kode OTP.
    - Saluran WhatsApp: Menggunakan **Meta WhatsApp Cloud API** / Gateway resmi untuk mengirim pesan OTP interaktif.
  - Endpoint `POST /api/v1/auth/verify-otp`: Memvalidasi OTP, mengubah status menjadi `ACTIVE`, dan menerbitkan pasangan JWT Bearer Token.
- [x] **3.2 Dual-Token JWT Architecture:**
  - **Access Token:** Masa berlaku 15 menit, algoritma `RS256` / `HS256`, memuat claims `sub`, `email`, `role`, dan `tier`.
  - **Refresh Token:** Masa berlaku 7 hari, tersimpan di database dan dikirim via `HttpOnly, Secure Cookie`.
  - Endpoint `POST /api/v1/auth/refresh`: Menerapkan *Refresh Token Rotation* (token lama di-revoke dan dimasukkan ke Redis Blacklist).
  - Endpoint `POST /api/v1/auth/logout`: Mencabut sesi aktif pengguna dari Redis.
- [x] **3.3 Integrasi Single Sign-On (SSO):**
  - Endpoint `POST /api/v1/auth/oauth/google`: Verifikasi Google ID Token menggunakan pustaka resmi `google-auth-library`.
  - Endpoint `POST /api/v1/auth/oauth/apple`: Verifikasi Apple Identity Token.
- [x] **3.4 Middleware Otorisasi (RBAC):**
  - Plugin Fastify untuk memeriksa header `Authorization: Bearer <token>`.
  - Guard role: `GUEST`, `MEMBER`, `ADMIN`, `SUPERADMIN`.
  - Rate limiting berbasis Redis (misal: maksimal 5 percobaan login per menit per IP).

**Tolok Ukur Selesai (Definition of Done):**
- Pengguna baru berhasil mendaftar, menerima OTP via WhatsApp/Email, melakukan aktivasi, dan menerima JWT Token yang valid.
- Endpoint terproteksi menolak akses jika token tidak ada, kedaluwarsa, atau di-blacklist.

---

### STEP 4: Preprocessing Gambar & Pipeline Vision OCR AI (Gemini 2.5 Flash)
**Tujuan:** Membangun layanan pemrosesan citra dan ekstraksi data struk otomatis berbasis kecerdasan buatan.

- [x] **4.1 Service Preprocessing Gambar (Sharp):**
  - Fungsi membaca metadata EXIF dan memutar foto secara otomatis sesuai orientasi tegak (*auto-rotate*).
  - Normalisasi rentang kontras dan penajaman (*unsharp mask*) untuk memperjelas cetakan struk thermal yang pudar.
  - Kompresi cerdas ke format JPEG kualitas 85% untuk efisiensi transfer jaringan.
- [x] **4.2 Integrasi Google Gemini 2.5 Flash SDK:**
  - Definisi schema JSON terstruktur (*Zod / Gemini Type Schema*) untuk mengunci format keluaran: nama merchant, tanggal, item (nama, qty, unit price, total price), subtotal, diskon, servis, pajak, pembulatan, grand total.
  - Prompt engineering khusus untuk struk Indonesia (mengenali istilah PPN/PB1, Service, Diskon Member, Kasir).
- [x] **4.3 Logika Penggabungan Struk Multi-Shot (Stitching & De-duplication):**
  - Menerima kumpulan 2–5 gambar dari satu nota yang sama.
  - Mengagregasi daftar item dari seluruh shot dan mengeliminasi baris teks yang tumpang tindih (*fuzzy string matching* pada baris overlap).
- [x] **4.4 Endpoint Pemrosesan Struk:**
  - `POST /api/v1/receipts/upload-shot`: Unggah gambar ke Cloudflare R2 / AWS S3.
  - `POST /api/v1/receipts/process-ocr`: Menjalankan pipeline Sharp + Gemini AI dan mengembalikan draf transaksi.
  - `PUT /api/v1/receipts/:id/review`: Menyimpan koreksi manual dari pengguna.

**Tolok Ukur Selesai (Definition of Done):**
- Foto struk berkerut/panjang berhasil diekstrak dalam waktu < 2,5 detik dengan format JSON yang 100% valid.

---

### STEP 5: Frontend PWA Responsif: Kamera Multi-Shot & Workspace Tagging
**Tujuan:** Membangun antarmuka pengguna utama berbasis PWA yang mobile-first, responsif, ergonomis, dan mendukung operasional offline.

- [x] **5.1 Inisialisasi Next.js 15 PWA & Styling Tailwind:**
  - Setup konfigurasi PWA menggunakan **Serwist** (`manifest.json`, Service Worker, ikon maskable).
  - Styling responsif dengan Tailwind CSS dan komponen modern mobile-first.
  - Konfigurasi variabel Safe Area Insets (`env(safe-area-inset-top)` & `bottom`).
- [x] **5.2 Komponen Kamera Viewfinder & Multi-Shot Flow:**
  - Antarmuka kamera berbasis Web MediaDevices API (`facingMode: 'environment'`).
  - Dialog modal konfirmasi lembar lanjutan struk: **[+ Ambil Shot Lanjutan]** vs **[Selesai & Proses]**.
  - Floating badge penghitung shot (`Shot 1/5`).
- [x] **5.3 Layar Review & Koreksi Struk:**
  - Tabel baris item dengan kemampuan inline-editing (nama, jumlah, harga).
  - Peringatan selisih kalkulasi jika jumlah item tidak cocok dengan grand total struk.
- [x] **5.4 Workspace Penandaan Tagging (Item Tagging Workspace):**
  - Avatar bar dengan target sentuh minimal 48px.
  - Tombol 1-sentuhan **"Milik Saya"** untuk assign cepat ke diri sendiri.
  - **Slide-up Bottom Sheet Modal** untuk menambahkan teman baru (Nama & Email) secara instan.
  - Komponen kartu ranking analitik **Top Spender**.
- [x] **5.5 Kartu Ringkasan & Integrasi Berbagi:**
  - Sakelar toggle: **[Bagi Rata Pajak]** vs **[Pajak Proporsional]**.
  - Generator format teks rapi untuk dikirim ke WhatsApp.
  - Penyimpanan draf transaksi secara offline menggunakan IndexedDB.

**Tolok Ukur Selesai (Definition of Done):**
- Aplikasi dapat diinstal ke layar utama ponsel (*Add to Home Screen*).
- Alur lengkap dari ambil foto multi-shot $\rightarrow$ koreksi $\rightarrow$ tagging $\rightarrow$ split WhatsApp dapat diselesaikan dalam waktu kurang dari 60 detik.

---

### STEP 6: Fitur Kolaborasi Meja Real-Time (Live Table Session via Web QR)
**Tujuan:** Mengaktifkan fitur di mana teman di meja makan dapat mencentang makanannya sendiri secara langsung dari ponsel masing-masing tanpa instal aplikasi.

- [x] **6.1 WebSocket Gateway & Redis Pub/Sub:**
  - Setup gateway WebSocket pada Fastify (`@fastify/websocket`) terhubung ke Redis Pub/Sub untuk sinkronisasi state antar-klien.
- [x] **6.2 Sesi Meja & Generator QR Meja:**
  - Endpoint untuk membuat sesi live: menghasilkan `liveSessionCode` unik dan Dynamic QR Code.
- [x] **6.3 Halaman Web Tamu Meja (Instant Participant View):**
  - Rute halaman publik: `splitbill.id/join/[tableCode]`.
  - Desain web ringan (tanpa login): Tamu memasukkan nama panggilan, lalu melihat daftar menu struk.
  - Aksi mencentang/menghapus centang pesanan mengirim event WebSocket (`table:item-toggle`).
- [x] **6.4 Sinkronisasi Dua Arah (*Two-Way Live Sync*):**
  - Layar pemilik tagihan menerima pembaruan centang teman secara seketika (*real-time update*).

**Tolok Ukur Selesai (Definition of Done):**
- Dua perangkat berbeda (pemilik tagihan & teman di meja) tersinkronisasi secara instan (< 100 ms) saat item dicentang.

---

### STEP 7: Fitur Lanjutan Member: Trip Mode, Pelunasan QRIS & PDF Reimbursement
**Tujuan:** Mengimplementasikan fitur-fitur bernilai tinggi khusus pengguna terdaftar.

- [x] **7.1 Integrasi Dynamic QRIS:**
  - Integrasi API Midtrans / Xendit untuk menghasilkan QRIS dengan nilai nominal pembayaran yang terkunci sesuai tagihan masing-masing orang.
- [x] **7.2 Pelacak Pelunasan & Verifikasi Bukti Transfer:**
  - Antarmuka bagi partisipan untuk mengunggah screenshot bukti transfer m-banking.
  - Panel kontrol bagi pemilik tagihan untuk memeriksa bukti dan mengubah status menjadi *Paid*.
- [x] **7.3 Mode Liburan (Trip Mode) & Debt Simplification:**
  - Penggabungan beberapa struk transaksi dalam satu grup acara/liburan.
  - Implementasi algoritma penyederhanaan utang silang (*Min-Cost Flow Graph Reduction*) untuk meminimalkan transaksi transfer antar-teman.
- [x] **7.4 Generator Laporan Reimbursement Kantor:**
  - Modul backend/frontend (`pdfmake` / `@react-pdf/renderer`) untuk menghasilkan berkas PDF formal laporan pengeluaran kantor lengkap dengan kop surat, tabel rincian biaya, dan lampiran foto struk terkompresi.

**Tolok Ukur Selesai (Definition of Done):**
- QRIS dinamis berhasil di-generate sesuai tagihan, bukti transfer dapat diunggah dan diverifikasi, serta laporan PDF reimbursement terunduh dengan format rapi.

---

### STEP 8: Portal Pengelola & Analitik (Admin Backoffice Dashboard)
**Tujuan:** Membangun antarmuka terpisah bagi administrator untuk mengonfigurasi integrasi pihak ketiga, memantau metrik bisnis, dan menjaga kesehatan sistem.

- [x] **8.1 Setup Dashboard Admin (Next.js 15 + Shadcn UI + Recharts):**
  - Rute khusus `/admin` yang diproteksi dengan guard otentikasi role `ADMIN` / `SUPERADMIN` dan MFA.
- [x] **8.2 Hub Konfigurasi Integrasi Pihak Ketiga (Third-Party Hub):**
  - Formulir antarmuka untuk memasukkan kredensial OAuth (Google Client ID/Secret, Apple Services ID/Key).
  - Formulir konfigurasi API Key Email Gateway (Resend/SES) dan WhatsApp Cloud API.
  - Tombol **[Test Delivery]** untuk menguji pengiriman pesan OTP secara langsung dari antarmuka admin.
- [x] **8.3 Dashboard Eksekutif & Metrik Platform:**
  - Kartu KPI: Gross Transaction Value (GTV), Total Struk Berhasil, Pengguna Aktif (Guest vs Member), dan Rata-rata Waktu Pelunasan (*Settlement Velocity*).
  - Grafik tren volume transaksi harian, mingguan, dan bulanan.
- [x] **8.4 Pusat Analitik Performa OCR AI (AI Performance Hub):**
  - Grafik latency pemrosesan OCR (< 2,5 detik).
  - Tingkat keberhasilan ekstraksi (*OCR Success Rate*) dan log kesalahan struk buram/gagal.
  - Pelacak konsumsi token API Gemini per struk untuk manajemen biaya.
- [x] **8.5 Intelijen Restoran & Manajemen Pengguna:**
  - Tabel peringkat restoran/merchant paling populer (anonymized data).
  - Manajemen akun pengguna: filter status verifikasi, pemberian status akun, dan kontrol kuota OCR.
  - Pengaturan kebijakan retensi data (penghapusan otomatis foto struk setelah 30 hari pelunasan sesuai UU PDP).

**Tolok Ukur Selesai (Definition of Done):**
- Seluruh metrik analitik tampil dengan data aktual dari database PostgreSQL, dan konfigurasi integrasi pihak ketiga dapat diperbarui langsung dari portal admin.

---

### STEP 9: Pengujian Menyeluruh (E2E), Audit Keamanan & Optimasi Performa PWA
**Tujuan:** Menjamin keandalan fungsional, keamanan aplikasi terhadap serangan siber, dan kecepatan performa antarmuka.

- [x] **9.1 End-to-End (E2E) Testing (Playwright / Integration Workflows):**
  - Pengujian skenario otomatis dari pemindaian struk $\rightarrow$ tagging $\rightarrow$ split calculation $\rightarrow$ pelunasan.
  - Pengujian alur registrasi mandiri $\rightarrow$ verifikasi OTP $\rightarrow$ login JWT.
- [x] **9.2 Audit Keamanan Aplikasi (Security Hardening):**
  - Pengujian OWASP Top 10 (SQL Injection prevention via Prisma, XSS, CSRF, Rate Limiting).
  - Uji ketahanan token JWT terhadap replay attack dan pencabutan sesi paksa.
  - Sanitasi berkas unggahan gambar (mencegah *malicious payload upload*).
- [x] **9.3 Audit Kinerja & PWA (Google Lighthouse & Serwist PWA Checklist):**
  - Memastikan skor audit Lighthouse untuk PWA: Performance $\ge 90$, Accessibility $\ge 95$, Best Practices $\ge 95$, PWA Checklist = 100%.

**Tolok Ukur Selesai (Definition of Done):**
- Seluruh rangkaian pengujian otomatis E2E lulus tanpa galat.
- Skor audit Lighthouse PWA memenuhi target standar industri.

---

### STEP 10: Kontainerisasi Docker, CI/CD Pipeline & Peluncuran Produksi
**Tujuan:** Menyiapkan otomatisasi deployment ke lingkungan produksi cloud yang stabil dan terukur.

- [ ] **10.1 Konfigurasi Dockerfile Produksi:**
  - Multi-stage build `Dockerfile` untuk Backend Fastify (menghasilkan image minimalis berbasis Node.js Alpine).
  - Multi-stage build `Dockerfile` untuk Frontend Next.js PWA.
- [ ] **10.2 CI/CD Automation (GitHub Actions):**
  - Workflow pengujian otomatis (*linting, type-checking, unit tests*) pada setiap Pull Request.
  - Workflow build dan deployment otomatis ke server staging dan produksi.
- [ ] **10.3 Deployment Infrastruktur Cloud:**
  - Database: Managed PostgreSQL 16 pada cloud (AWS RDS / Railway / Neon).
  - Cache: Managed Redis 7 (Upstash / Redis Cloud).
  - Backend API: Container deployment pada AWS ECS / Railway.
  - Frontend PWA & Admin Portal: Deployment pada Vercel / Cloudflare.
  - Object Storage: Cloudflare R2 bucket dengan konfigurasi CORS dan retention rules.
- [ ] **10.4 Monitoring & Observabilitas Produksi:**
  - Integrasi pelacak error aplikasi (*error monitoring*) menggunakan **Sentry**.
  - Monitoring uptime dan performa server menggunakan Uptime Kuma / Datadog.

**Tolok Ukur Selesai (Definition of Done):**
- Aplikasi SplitBill dapat diakses secara publik dengan sertifikat SSL/HTTPS aktif, PWA dapat diinstal di ponsel pengguna, dan sistem siap melayani pengguna nyata.

---

## 3. Matriks Estimasi Jadwal & Alokasi Waktu

| Tahapan (Step) | Fokus Pekerjaan Utama | Estimasi Waktu | Deliverable Kunci |
|---|---|:---:|---|
| **Step 1** | Inisialisasi Proyek, Docker & Skema PostgreSQL | Minggu 1 (Hari 1–3) | Repositori bersih, Docker stack, Migrasi Prisma DB |
| **Step 2** | Core Domain Engine & Algoritma Fair Split | Minggu 1 (Hari 4–5) | Modul kalkulasi matematika & 100% unit tests |
| **Step 3** | Keamanan JWT & Verifikasi Email/WhatsApp | Minggu 2 (Hari 1–5) | Endpoint registrasi, OTP WA/Email, JWT Bearer guard |
| **Step 4** | Preprocessing Sharp & Gemini 2.5 Flash OCR | Minggu 3 (Hari 1–5) | Pipeline AI OCR ekstraksi struk multi-shot |
| **Step 5** | Frontend PWA Responsif & Workspace Tagging | Minggu 4 (Hari 1–5) | Antarmuka PWA kamera, review, tagging, split WA |
| **Step 6** | Kolaborasi Meja Real-Time (Web QR Meja) | Minggu 5 (Hari 1–5) | WebSocket live sync & web instan tamu meja |
| **Step 7** | Fitur Member: Trip Mode, QRIS & PDF Export | Minggu 6 (Hari 1–5) | Dynamic QRIS, debt reduction, PDF generator |
| **Step 8** | Portal Admin Backoffice & Analitik | Minggu 7 (Hari 1–5) | Dashboard admin, AI metrics, Third-party hub |
| **Step 9** | E2E Testing, Security Hardening & PWA Audit | Minggu 8 (Hari 1–3) | Pengujian Playwright & audit Lighthouse 95+ |
| **Step 10** | CI/CD Pipeline & Peluncuran Produksi Cloud | Minggu 8 (Hari 4–5) | Sistem live di produksi dengan domain resmi |

---

Dokumen ini menjadi peta jalan operasional (*execution roadmap*) bagi seluruh tim pengembang untuk merealisasikan aplikasi **SplitBill** secara terarah dan terukur.
