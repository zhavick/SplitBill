# Functional Specification Document (FSD)
## Aplikasi SplitBill: Smart Receipt OCR, Collaborative Split, PWA & Admin Backoffice

- **Nama Dokumen:** Functional Specification Document (FSD)
- **Proyek:** SplitBill Application
- **Versi:** 1.0.0
- **Status:** Approved / Ready for Implementation
- **Tanggal Efektif:** 2026-11-16
- **Referensi:** [Documentation/MasterPlan.md](file:///c:/TEMP/VSCODE/SplitBillApp/Documentation/MasterPlan.md)

---

## 1. Pendahuluan

### 1.1 Tujuan Dokumen
Dokumen Spesifikasi Fungsional (*Functional Specification Document* - FSD) ini mendefinisikan secara mendalam seluruh perilaku sistem, alur pengguna (*user journeys*), antarmuka pengguna (*UI/UX behaviors*), aturan bisnis (*business rules*), serta kriteria penerimaan (*acceptance criteria*) untuk aplikasi **SplitBill**. Dokumen ini menjadi acuan mutlak bagi tim pengembang (*software engineers*), desainer produk (*UI/UX designers*), dan penjamin kualitas (*quality assurance*).

### 1.2 Ruang Lingkup Sistem
Sistem SplitBill mencakup:
1. **Aplikasi Klien Responsif & PWA:** Digunakan oleh pengguna akhir untuk memindai struk fisik (single & multi-shot), melakukan penandaan item (*item tagging*), mengatur pembagian beban non-barang (pajak, servis, diskon), membuka sesi meja kolaboratif via Web QR, memverifikasi bukti pelunasan, hingga ekspor laporan.
2. **Portal Pengelola (Admin Backoffice):** Digunakan oleh staf administrator untuk konfigurasi integrasi pihak ketiga (Google, Apple, Gateway Email/WhatsApp), pengawasan metrik bisnis (GTV, volume tagihan), pemantauan kesehatan OCR AI, manajemen pengguna, dan kepatuhan privasi data.

### 1.3 Glosarium & Terminologi
- **Single Shot:** Pengambilan satu foto struk menggunakan kamera.
- **Multi-Shot:** Pemotretan beruntun untuk struk yang panjang agar teks tetap terbaca tajam tanpa buram.
- **Item Tagging:** Tindakan menetapkan satu atau beberapa item makanan/minuman kepada pemilik yang memesannya.
- **Self-Assignment:** Penetapan cepat pesanan milik pengguna utama dengan 1 klik ("Milik Saya").
- **Ad-hoc Participant:** Teman makan yang ditambahkan secara instan via modal popup tanpa perlu registrasi akun.
- **Overhead Fees:** Biaya non-barang di luar harga makanan murni, mencakup Pajak (PB1/PPN), Service Charge, Biaya Pengemasan, dan Pembulatan Kasir.
- **Equal Overhead Split:** Pembagian biaya non-barang secara sama rata ke seluruh peserta yang ikut makan.
- **Proportional Overhead Split:** Pembagian biaya non-barang yang dihitung proporsional terhadap rasio nilai belanja masing-masing orang.
- **Top Spender:** Predikat bagi peserta dengan total nominal belanja atau jumlah item terbanyak dalam satu sesi makan.
- **Live Table Session:** Fitur kolaboratif di mana teman di meja dapat memindai QR Code untuk mencentang sendiri pesanannya dari peramban ponsel secara *real-time*.
- **PWA (Progressive Web App):** Aplikasi web yang dapat diinstal langsung ke layar utama (*Add to Home Screen*) dan dapat berjalan offline.

---

## 2. Profil & Persona Pengguna

| Persona | Peran & Hak Akses | Kebutuhan Utama |
|---|---|---|
| **Guest User (Tamu)** | Pengguna tanpa akun / belum registrasi. Akses fitur dasar. | Ingin memindai struk dengan cepat, membagi tagihan secara instan, dan menyalin format teks ke WhatsApp tanpa repot membuat akun. |
| **Registered Member** | Pengguna terdaftar dengan autentikasi JWT dan verifikasi Email/WhatsApp aktif. Akses penuh ke fitur lanjutan. | Ingin membuka sesi QR meja untuk teman-temannya, membuat Dynamic QRIS, melacak bukti transfer teman, menggunakan mode liburan (*Trip Mode*), dan ekspor PDF klaim kantor. |
| **Table Participant (Teman di Meja)** | Teman makan yang bergabung melalui pemindaian QR Code meja atau tautan web sesi. | Ingin menandai apa yang mereka makan dari ponsel masing-masing tanpa harus menginstal aplikasi baru dan tanpa perlu mendaftar akun. |
| **System Administrator** | Staf pengelola dengan kredensial portal Admin Backoffice (MFA). | Memantau volume transaksi, memastikan keandalan Vision AI OCR, mengonfigurasi API pihak ketiga (OAuth, Gateway Email/WA), dan mengelola kuota pengguna. |

---

## 3. Alur Kerja Pengguna (User Journeys)

### 3.1 UJ-01: Alur Pemindaian Multi-Shot untuk Struk Panjang
```
[Buka Kamera] ➔ [Ambil Shot 1] ➔ [Dialog: "Lanjutan Struk Sama?"]
     │                                    │
     │                            [Ya, Lanjut] ➔ [Ambil Shot 2 dst]
     │                                    │
     └──────────────────────────── [Selesai] ➔ [AI OCR Agregasi] ➔ [Layar Review]
```
1. Pengguna membuka fitur kamera di aplikasi (Web PWA atau Mobile Native).
2. Pengguna membidik bagian atas struk (Shot 1) dan menekan tombol rana (*shutter*).
3. Muncul dialog modal responsif: *"Apakah foto ini memiliki lembar lanjutan dari struk/nota yang sama?"*.
4. Jika struk panjang, pengguna menekan **[+ Ambil Foto Lanjutan]**, lalu membidik bagian tengah/bawah struk (Shot 2).
5. Pengguna menekan **[Selesai & Proses]**.
6. Sistem mengirimkan seluruh frame gambar ke backend; AI OCR melakukan agregasi data dan menghapus baris teks tumpang tindih (*de-duplication*).
7. Pengguna diarahkan ke Layar Review Item untuk memverifikasi nama barang, jumlah, harga, pajak, dan grand total.

---

### 3.2 UJ-02: Alur Penandaan Tagging Item ("Milik Saya" & Modal Tambah Teman)
```
[Layar Review Item] ➔ [Pilih Item 1 & 2] ➔ [Klik "Milik Saya"] ➔ [Ter-tag ke Diri Sendiri]
                              │
                      [Pilih Item 3] ➔ [Klik "Tambah Teman"] 
                              │
                     [Bottom Sheet Modal] ➔ [Input: Nama Lengkap & Email] ➔ [Simpan & Tag]
                              │
                     [Analitik Pemesan Terbanyak (Top Spender Muncul Otomatis)]
```
1. Pada daftar item hasil OCR, pengguna memilih satu atau beberapa item yang dikonsumsi sendiri.
2. Pengguna menekan tombol cepat **[Milik Saya]** $\rightarrow$ Item langsung diberi tag avatar pengguna utama (*Self-Assignment*).
3. Pengguna memilih item berikutnya yang dipesan oleh rekannya.
4. Karena rekannya belum terdaftar, pengguna menekan tombol **[+ Tag Teman Baru]**.
5. Muncul **Slide-up Bottom Sheet Modal**:
   - Pengguna menginput: **Nama Lengkap** (wajib) dan **Email** (wajib/opsional untuk invoice).
   - Pengguna menekan **[Simpan & Tag]**.
6. Rekan baru langsung masuk ke daftar partisipan sesi tersebut tanpa proses registrasi akun, dan item langsung teratribusi kepadanya.
7. Sistem memperbarui visualisasi analitik secara *real-time*: menampilkan siapa yang memesan paling banyak (*Top Spender Badge*).

---

### 3.3 UJ-03: Alur Kolaborasi Meja Real-Time (Live Table Session via Web QR)
*(Khusus Pengguna Terdaftar / Member)*
```
[Member: Buka Sesi Meja] ➔ [Generate QR Code Meja] ➔ [Teman Scan via Kamera HP]
                                                               │
                                                   [Buka Web PWA Tanpa Login]
                                                               │
                                                   [Teman Centang Makanan Sendiri]
                                                               │
                                         [Layar Member Ter-update Real-Time (WebSocket)]
```
1. Pengguna terdaftar menekan opsi **"Buka Sesi Meja Kolaboratif"**.
2. Aplikasi menampilkan layar berisi **QR Code Dinamis** dan tautan pendek (misal: `splitbill.id/join/TABLE-789`).
3. Teman-teman di meja membuka kamera ponsel masing-masing dan memindai QR Code tersebut.
4. Halaman peramban terbuka secara instan tanpa mewajibkan unduh aplikasi atau pembuatan akun.
5. Teman memasukkan nama panggilan mereka, lalu disuguhkan daftar menu struk yang interaktif.
6. Masing-masing teman mencentang item yang mereka makan.
7. Di layar ponsel pemilik tagihan, status penandaan item ter-update secara *real-time* via WebSocket.

---

### 3.4 UJ-04: Alur Registrasi Akun & Aktivasi Multi-Channel (Email & WhatsApp)
```
[Form Registrasi] ➔ [Input: Nama, Email, No. WA, Password] ➔ [Pilih Jalur Aktivasi]
                                                                 ├── Email ➔ [Kirim Magic Link/OTP]
                                                                 └── WhatsApp ➔ [Kirim OTP 6-Digit]
                                                                            │
                                                               [Input Kode OTP / Klik Link]
                                                                            │
                                                             [Status: Active & Terbitkan JWT]
```
1. Pengguna membuka menu registrasi.
2. Pengguna mengisi formulir: Nama Lengkap, Alamat Email, Nomor WhatsApp, dan Kata Sandi.
3. Pengguna memilih metode pengiriman kode verifikasi: **[Kirim via WhatsApp]** atau **[Kirim via Email]**.
4. Sistem mencatat akun dengan status `pending_verification` dan mengirimkan kode OTP 6 digit.
5. Pengguna memasukkan kode OTP ke antarmuka aplikasi dalam batas waktu 10 menit.
6. Sistem memvalidasi kode:
   - Jika valid: Status akun berubah menjadi `active`, diterbitkan pasangan JWT Bearer Token (Access & Refresh Token), dan pengguna langsung masuk ke dashboard Member.
   - Jika salah/kedaluwarsa: Sistem menampilkan pesan galat yang jelas dan menyediakan tombol kirim ulang OTP (*resend timer* 60 detik).

---

## 4. Spesifikasi Fungsional Terperinci & Kriteria Penerimaan

Setiap kebutuhan fungsional dilengkapi kriteria penerimaan menggunakan format terstruktur **Given-When-Then (Gherkin)**.

### FR-01: Kamera Multi-Shot & Stitching Struk Panjang
- **Deskripsi:** Sistem harus mampu menangkap beberapa foto beruntun untuk satu nota struk panjang dan menyatukannya menjadi satu dokumen data tanpa duplikasi item.
- **Aturan Bisnis:**
  - Maksimal pengambilan foto per sesi adalah 5 shot.
  - Setiap kali foto diambil, dialog konfirmasi *"Lanjutan struk sama?"* wajib muncul sebelum dialihkan ke OCR.
- **Kriteria Penerimaan (Acceptance Criteria):**
  - **Scenario 1:** Pengguna memotret struk panjang 2 frame.
    - *Given:* Pengguna berada pada antarmuka kamera.
    - *When:* Pengguna mengambil Shot 1 dan memilih "Ambil Foto Lanjutan", lalu mengambil Shot 2 dan menekan "Selesai & Proses".
    - *Then:* Sistem mengunggah kedua berkas gambar, melakukan penggabungan data baris teks yang tumpang tindih (*overlap de-duplication*), dan menampilkan daftar item gabungan yang utuh pada layar review.

---

### FR-02: Review & Koreksi Data Struk OCR
- **Deskripsi:** Antarmuka interaktif yang menampilkan hasil ekstraksi teks Vision AI (Nama Restoran, Tanggal, Item, Qty, Harga Satuan, Pajak, Servis, Diskon, Grand Total).
- **Aturan Bisnis:**
  - Pengguna dapat menambah, mengedit nama/harga, atau menghapus item yang salah terbaca oleh OCR.
  - Jika $\sum \text{Item} - \text{Diskon} + \text{Pajak} + \text{Servis} \neq \text{Grand Total}$, sistem harus menampilkan kotak peringatan selisih kuning dengan saran perbaikan otomatis.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Pengguna mengoreksi harga item yang salah terbaca.
    - *Given:* Item "Ayam Bakar" terbaca Rp 28.000 (seharusnya Rp 25.000).
    - *When:* Pengguna mengklik kolom harga dan mengetikkan "25000".
    - *Then:* Subtotal dan kalkulasi otomatis diperbarui seketika tanpa perlu memuat ulang halaman.

---

### FR-03: Penandaan Tag Cepat ("Milik Saya" & Slide-Up Bottom Sheet Modal)
- **Deskripsi:** Mekanisme penandaan kepemilikan item dengan target sentuh ergonomis dan modal popup tambah teman ad-hoc.
- **Aturan Bisnis:**
  - Menandai "Milik Saya" hanya membutuhkan 1 kali sentuhan tombol.
  - Menambah teman baru memunculkan *Slide-up Bottom Sheet* meminta Nama Lengkap (wajib) dan Email (opsional).
  - Profil teman ad-hoc otomatis disimpan ke *Local Frequent Contacts* pada perangkat.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Menambahkan teman baru saat tagging.
    - *Given:* Pengguna memilih item "Steak Sapi" dan menekan tombol "+ Tag Teman".
    - *When:* Pengguna mengisi Nama: "Dimas" dan Email: "dimas@test.com" pada Bottom Sheet lalu menekan "Simpan & Tag".
    - *Then:* Item "Steak Sapi" langsung teratribusi ke Dimas, avatar Dimas memiliki warna penanda unik, dan nama Dimas tersedia di daftar pilihan cepat.

---

### FR-04: Analitik Pemetaan Pemesan Terbanyak (Top Spender Badge)
- **Deskripsi:** Menghitung dan menampilkan peringkat peserta berdasarkan nilai nominal belanja dan kuantitas item makanan.
- **Aturan Bisnis:**
  - Peserta dengan nominal belanja tertinggi otomatis diberi lencana visual 🥇 **Top Spender**.
  - Menampilkan persentase kontribusi konsumsi: $\frac{\text{Subtotal Pribadi}}{\text{Total Subtotal Makanan}} \times 100\%$.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Orang A belanja Rp 40.000 dan Orang C belanja Rp 20.000.
    - *Given:* Total makanan adalah Rp 100.000.
    - *When:* Proses tagging selesai.
    - *Then:* Sistem menampilkan Orang A dengan lencana "Top Spender (40.0%)" dan Orang C dengan persentase "(20.0%)".

---

### FR-05: Alokasi Beban Non-Barang Fleksibel & Rekonsiliasi Pembulatan Rupiah
- **Deskripsi:** Pilihan mode pembagian biaya non-barang (Pajak, Servis, Diskon) dengan jaminan jumlah total bayar persis sama dengan grand total struk (selisih Rp 0).
- **Aturan Bisnis:**
  - Mode 1: Bagi Rata (*Equal Split*) $\rightarrow$ Beban dibagi rata ke $N$ orang.
  - Mode 2: Proporsional (*Proportional Split*) $\rightarrow$ Beban dibagi berdasarkan rasio belanja.
  - Algoritma Rekonsiliasi Pembulatan (*Largest Remainder Rounding*) wajib menyeimbangkan selisih pecahan rupiah agar $\sum \text{Total Individu} == \text{Grand Total Struk}$.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Pajak Rp 5.000 dibagi ke 3 orang (A: 40rb, B: 40rb, C: 20rb) dalam Mode Bagi Rata.
    - *Given:* Pajak Rp 5.000 / 3 = Rp 1.666,67 per orang.
    - *When:* Sistem menerapkan kalkulasi pembulatan rupiah.
    - *Then:* A ditagih Rp 41.667, B ditagih Rp 41.667, dan C ditagih Rp 21.666. Total kumulatif tepat Rp 105.000.

---

### FR-06: Dynamic QRIS & Pelunasan Pembayaran
- **Deskripsi:** Pembuatan kode QRIS dengan nilai nominal terkunci sesuai tagihan masing-masing individu serta fasilitas upload dan verifikasi bukti transfer.
- **Aturan Bisnis:**
  - QRIS dinamis yang dihasilkan memuat nominal persis hingga digit satuan.
  - Teman dapat mengunggah foto struk/screenshot transfer perbankan.
  - Pemilik tagihan dapat memverifikasi bukti tersebut untuk mengubah status menjadi *Paid*.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Teman mengunggah bukti transfer.
    - *Given:* Tagihan Budi sebesar Rp 41.667 berstatus *Unpaid*.
    - *When:* Budi mengunggah gambar bukti transfer.
    - *Then:* Status berubah menjadi *Pending Verification*, dan pemilik tagihan menerima notifikasi dengan tombol "Verifikasi & Tandai Lunas".

---

### FR-07: Trip Mode & Penyederhanaan Utang (Debt Simplification)
- **Deskripsi:** Menggabungkan banyak struk transaksi dalam satu acara atau perjalanan liburan, lalu menghitung alur transfer paling efisien antar-anggota.
- **Aturan Bisnis:**
  - Mengeliminasi utang berputar (misal: jika X berutang ke Y Rp 50rb dan Y berutang ke Z Rp 50rb, sistem menyederhanakan menjadi X transfer langsung Rp 50rb ke Z).
- **Kriteria Penerimaan:**
  - **Scenario 1:** Penyederhanaan utang 3 orang.
    - *Given:* Sesi liburan dengan 3 struk belanja berbeda.
    - *When:* Pengguna menekan tombol "Hitung Penyederhanaan Utang".
    - *Then:* Sistem menampilkan instruksi transfer dengan jumlah transaksi seminimal mungkin.

---

### FR-08: Export Laporan Reimbursement Kantor (PDF / Excel)
- **Deskripsi:** Menghasilkan dokumen laporan resmi klaim kantor berisi ringkasan biaya, tanggal, jam, lokasi GPS, rincian menu, dan lampiran foto struk yang rapi.
- **Aturan Bisnis:**
  - Berkas PDF yang dihasilkan terformat formal dengan kop surat standar pengajuan reimbursement.
  - Ukuran file PDF dioptimalkan di bawah 2 MB agar mudah dikirim via email kerja.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Generate laporan PDF.
    - *Given:* Sesi makan yang telah selesai di-tag.
    - *When:* Pengguna menekan tombol "Export PDF Reimbursement".
    - *Then:* Berkas PDF terunduh dalam waktu < 2 detik lengkap dengan kop laporan, tabel biaya, dan lampiran foto struk.

---

### FR-09: Progressive Web App (PWA) & Operasional Offline
- **Deskripsi:** Aplikasi dapat diinstal ke layar utama ponsel (*Add to Home Screen*), membuka kamera via Web API, dan dapat menyimpan draft secara offline saat berada di area tanpa sinyal.
- **Aturan Bisnis:**
  - Berkas `manifest.json` dan Service Worker wajib aktif di lingkungan produksi.
  - Aset UI statis wajib di-cache (*Cache-First*) sehingga aplikasi terbuka < 0,5 detik.
- **Kriteria Penerimaan:**
  - **Scenario 1:** Membuka aplikasi saat koneksi internet terputus (Offline).
    - *Given:* Pengguna berada di dalam restoran tanpa sinyal seluler.
    - *When:* Pengguna membuka SplitBill PWA dari layar utama ponsel.
    - *Then:* Aplikasi tetap terbuka normal, kamera dapat memotret struk, dan data draft tersimpan di IndexedDB lokal dengan indikator "Tersimpan Offline - Akan disinkronkan saat online".

---

### FR-10: Portal Pengelola (Admin Backoffice & Integrations Hub)
- **Deskripsi:** Portal web mandiri untuk administrator mengonfigurasi integrasi pihak ketiga, memantau metrik finansial platform (GTV), memantau kesehatan Vision AI OCR, dan mengelola kuota pengguna.
- **Aturan Bisnis:**
  - Hanya dapat diakses oleh akun dengan role `admin` atau `superadmin`.
  - Formulir konfigurasi OAuth Google/Apple dan Gateway WA/Email dapat diuji langsung (*Test Ping / Test OTP Delivery*).
- **Kriteria Penerimaan:**
  - **Scenario 1:** Admin menguji pengiriman OTP WhatsApp dari portal.
    - *Given:* Admin mengisi Token WhatsApp Cloud API di Third-Party Hub.
    - *When:* Admin menekan tombol "Test Delivery" ke nomor uji coba.
    - *Then:* Pesan OTP contoh terkirim dalam waktu < 3 detik dan portal menampilkan log respons sukses `HTTP 200 OK`.

---

## 5. Spesifikasi Antarmuka Pengguna & Tata Letak Komponen (UI Layouts)

### S-01: Viewfinder Kamera & Pengambilan Multi-Shot
- **Komponen Atas:** Tombol Flash/Senter, Tombol Tutup/Batal, Indikator Jumlah Frame Terambil (Badge: `1/5 Shot`).
- **Area Tengah:** Jendela bidik persegi panjang dengan garis panduan tepi struk (*receipt framing guide*).
- **Komponen Bawah:**
  - Tombol Galeri (kiri).
  - Tombol Rana Lingkaran Besar (*Shutter Button*) di tengah.
  - Tombol Beralih Kamera Depan/Belakang (kanan).
- **Dialog Modal Lanjutan (Muncul setelah tiap shot):**
  - Teks: *"Ada lembar lanjutan dari struk yang sama?"*
  - Tombol Aksi: **[+ Ambil Shot Lanjutan]** (Secondary) dan **[Selesai & Proses Struk]** (Primary).

### S-02: Layar Review & Koreksi Struk
- **Header:** Nama Restoran (dapat diedit), Tanggal & Jam Transaksi, Tombol Buka Foto Asli (Pratinjau).
- **Tabel Item:** Daftar baris item (Nama, Qty, Harga Satuan, Total Baris, Ikon Hapus).
- **Footer Penyesuaian:**
  - Baris Subtotal, Baris Diskon, Baris Service Charge, Baris Pajak (PB1), Baris Pembulatan Kasir.
  - Kartu Grand Total (teks tebal dengan warna mencolok).
- **Floating Action Bar:** Tombol **[Lanjut ke Pembagian Tagihan]** yang selalu terlihat di bagian bawah layar.

### S-03: Workspace Penandaan Tagging (Item Tagging Workspace)
- **Komponen Atas (Avatar Bar):**
  - Chip avatar "Saya" (warna primer).
  - Daftar chip avatar teman-teman yang telah ditambahkan.
  - Tombol **[+ Tambah Teman]** (membuka Slide-up Bottom Sheet).
- **Area Tengah (Daftar Menu Interaktif):**
  - Setiap kartu item memiliki informasi nama, harga, dan chip tag orang yang menanggungnya.
  - Mengetuk item langsung menempelkan avatar orang yang sedang aktif.
- **Slide-up Bottom Sheet (Tambah Teman):**
  - Input teks Nama Lengkap (autofocus).
  - Input teks Email.
  - Tombol **[Simpan & Tag ke Item]**.

### S-04: Ringkasan Rincian & Penagihan (Settlement Summary)
- **Toggle Alokasi Pajak:** Sakelar interaktif: **[Bagi Rata Pajak]** vs **[Pajak Proporsional]**.
- **Lencana Top Spender:** Menampilkan kartu ranking siapa yang makan paling banyak.
- **Kartu Tagihan per Orang:**
  - Nama orang & daftar menu yang dimakan.
  - Porsi biaya makanan + porsi pajak/servis.
  - Total akhir yang harus dibayar.
  - Status Pembayaran: Tag `Belum Lunas` (Merah) atau `Lunas` (Hijau).
- **Tombol Berbagi Cepat:**
  - Tombol Hijau: **[Kirim Rincian via WhatsApp]**.
  - Tombol Biru: **[Tampilkan Dynamic QRIS]**.
  - Tombol Abu-abu: **[Download PDF Laporan Kantor]**.

---

## 6. Penanganan Kondisi Khusus & Edge Cases

| Skenario Khusus | Risiko | Solusi & Penanganan Sistem |
|---|---|---|
| **Struk Pudar / Robek / Tidak Terbaca** | OCR gagal mengekstrak teks atau menghasilkan angka salah. | Sistem menampilkan pesan ramah: *"Sebagian tulisan struk tampak buram. Silakan periksa dan lengkapi item berikut"* dan secara otomatis membuka mode edit manual. |
| **Selisih Pembulatan Kasir Ganjil (Odd Penny)** | Pembagian desimal menghasilkan selisih $\pm 1$ rupiah terhadap grand total struk. | Algoritma *Largest Remainder Rounding* mengalokasikan selisih Rp 1 ke peserta dengan sisa desimal pembulatan terbesar. Jumlah total dijamin 100% cocok dengan kasir. |
| **Koneksi Internet Terputus Saat Scan** | Request OCR gagal terkirim ke server. | Sistem menyimpan gambar di IndexedDB lokal ponsel dan menampilkan status: *"Koneksi terputus. Struk disimpan sebagai draf offline dan akan diproses begitu online"*. |
| **Struk dengan Diskon Bertingkat (Menu Promo + Voucher Pembayaran)** | Rancu membedakan diskon per menu atau diskon total tagihan. | Model OCR memisahkan ekstraksi menjadi dua entitas: `item.discount` (diskon spesifik barang) dan `adjustment.globalDiscount` (voucher/potongan kasir). |
| **Pengguna Mengambil Foto Struk yang Sama Dua Kali** | Terjadi duplikasi pencatatan pengeluaran. | Sistem mencocokkan nama resto, tanggal, jam, dan grand total. Jika identik dengan transaksi dalam 24 jam terakhir, sistem menampilkan dialog: *"Peringatan: Struk ini tampak serupa dengan transaksi sebelumnya. Tetap lanjutkan?"*. |
