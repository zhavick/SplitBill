import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export interface RawExtractedItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface RawReceiptData {
  merchantName: string;
  date?: string;
  items: RawExtractedItem[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  grandTotal: number;
}

export interface OcrEngine {
  extractFromImages(imageBuffers: Buffer[]): Promise<RawReceiptData>;
}

export const receiptResponseSchema = {
  type: Type.OBJECT,
  properties: {
    merchantName: {
      type: Type.STRING,
      description: 'Nama restoran, kafe, atau merchant yang tercetak di bagian atas struk.',
    },
    date: {
      type: Type.STRING,
      description: 'Tanggal transaksi yang tercetak di struk (format YYYY-MM-DD jika memungkinkan).',
    },
    items: {
      type: Type.ARRAY,
      description: 'Daftar semua item menu makanan dan minuman yang dipesan.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nama menu / barang.' },
          qty: { type: Type.NUMBER, description: 'Kuantitas atau jumlah porsi yang dipesan.' },
          unitPrice: { type: Type.NUMBER, description: 'Harga satuan menu sebelum diskon.' },
          totalPrice: { type: Type.NUMBER, description: 'Total harga baris menu tersebut (qty * unitPrice).' },
        },
        required: ['name', 'qty', 'totalPrice'],
      },
    },
    subtotal: {
      type: Type.NUMBER,
      description: 'Total harga seluruh makanan sebelum pajak, servis, dan diskon.',
    },
    discount: {
      type: Type.NUMBER,
      description: 'Total potongan diskon / voucher promo (tulis sebagai angka positif). 0 jika tidak ada.',
    },
    serviceCharge: {
      type: Type.NUMBER,
      description: 'Biaya servis / service charge (SC). 0 jika tidak ada.',
    },
    tax: {
      type: Type.NUMBER,
      description: 'Pajak restoran / PB1 / PPN (biasanya 10% atau 11%). 0 jika tidak ada.',
    },
    rounding: {
      type: Type.NUMBER,
      description: 'Pembulatan kasir (bisa bernilai negatif atau positif). 0 jika tidak ada.',
    },
    grandTotal: {
      type: Type.NUMBER,
      description: 'Total akhir pembayaran yang wajib dibayarkan ke kasir.',
    },
  },
  required: ['merchantName', 'items', 'grandTotal'],
};

export class GeminiOcrEngine implements OcrEngine {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || env.GEMINI_API_KEY;
    if (!key) {
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY belum dikonfigurasi.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async extractFromImages(imageBuffers: Buffer[]): Promise<RawReceiptData> {
    if (imageBuffers.length === 0) {
      throw new AppError(400, 'NO_IMAGES', 'Minimal 1 gambar struk diperlukan untuk pemindaian.');
    }

    const parts = imageBuffers.map((buf) => ({
      inlineData: {
        data: buf.toString('base64'),
        mimeType: 'image/jpeg',
      },
    }));

    const prompt = `Anda adalah asisten AI ekstraksi struk restoran dan kafe di Indonesia (SplitBill OCR Engine).
Tugas Anda:
1. Ekstrak nama restoran / merchant, tanggal, daftar makanan/minuman, kuantitas, harga, subtotal, diskon promo, service charge, pajak restoran (PB1/PPN 10-11%), pembulatan, dan grand total.
2. Seluruh nominal angka keuangan HARUS dalam bentuk bilangan bulat Rupiah (contoh: 25000, 105000, bukan desimal).
3. Jika terdapat beberapa foto (multi-shot) dari lembar struk yang sama:
   - Gabungkan seluruh baris menu secara kronologis dari atas ke bawah.
   - Jika terdapat baris menu yang tumpang tindih (overlap antara akhir foto 1 dan awal foto 2), eliminasi duplikasinya sehingga setiap menu hanya tercatat satu kali.
   - Ambil header toko dari foto pertama dan total pembayaran / kasir dari foto terakhir.
4. Pastikan subtotal, pajak, diskon, dan grand total sesuai angka nyata yang tercetak di kertas struk.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [...parts, prompt],
        config: {
          responseMimeType: 'application/json',
          responseSchema: receiptResponseSchema,
          temperature: 0.1,
        },
      });

      if (!response.text) {
        throw new AppError(502, 'OCR_EMPTY_RESPONSE', 'AI tidak menghasilkan teks ekstraksi.');
      }

      const data = JSON.parse(response.text) as RawReceiptData;

      // Sanitasi angka (pastikan integer)
      return {
        merchantName: data.merchantName || 'Restoran / Kafe',
        date: data.date,
        items: (data.items || []).map((it) => ({
          name: it.name.trim(),
          qty: Math.max(1, Math.round(Number(it.qty) || 1)),
          unitPrice: Math.round(Number(it.unitPrice) || Number(it.totalPrice) / Math.max(1, Number(it.qty))),
          totalPrice: Math.round(Number(it.totalPrice)),
        })),
        subtotal: Math.round(Number(data.subtotal) || 0),
        discount: Math.round(Number(data.discount) || 0),
        serviceCharge: Math.round(Number(data.serviceCharge) || 0),
        tax: Math.round(Number(data.tax) || 0),
        rounding: Math.round(Number(data.rounding) || 0),
        grandTotal: Math.round(Number(data.grandTotal) || 0),
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('Error saat memanggil Gemini OCR:', err);
      throw new AppError(502, 'OCR_EXTRACTION_FAILED', 'Gagal memproses struk dengan Vision AI. Pastikan foto terbaca jelas.');
    }
  }
}

export class MockOcrEngine implements OcrEngine {
  constructor(private customData?: Partial<RawReceiptData>) {}

  async extractFromImages(imageBuffers: Buffer[]): Promise<RawReceiptData> {
    if (imageBuffers.length === 0) {
      throw new AppError(400, 'NO_IMAGES', 'Minimal 1 gambar struk diperlukan untuk pemindaian.');
    }

    if (this.customData) {
      return {
        merchantName: this.customData.merchantName ?? 'Kopi & Resto Nusantara',
        date: this.customData.date ?? '2026-11-16',
        items: this.customData.items ?? [
          { name: 'Nasi Goreng Spesial', qty: 2, unitPrice: 20000, totalPrice: 40000 },
          { name: 'Es Teh Manis', qty: 2, unitPrice: 5000, totalPrice: 10000 },
        ],
        subtotal: this.customData.subtotal ?? 50000,
        discount: this.customData.discount ?? 0,
        serviceCharge: this.customData.serviceCharge ?? 0,
        tax: this.customData.tax ?? 5000,
        rounding: this.customData.rounding ?? 0,
        grandTotal: this.customData.grandTotal ?? 55000,
      };
    }

    // Default mock data (5 barang @ 20.000 + 5.000 pajak = 105.000)
    return {
      merchantName: 'Solaria Mall Grand',
      date: '2026-11-16',
      items: [
        { name: 'Nasi Goreng Tom Yum', qty: 1, unitPrice: 20000, totalPrice: 20000 },
        { name: 'Mie Ayam Pangsit', qty: 1, unitPrice: 20000, totalPrice: 20000 },
        { name: 'Kwetiau Sapi Siram', qty: 1, unitPrice: 20000, totalPrice: 20000 },
        { name: 'Chicken Cordon Bleu', qty: 1, unitPrice: 20000, totalPrice: 20000 },
        { name: 'Jus Alpukat', qty: 1, unitPrice: 20000, totalPrice: 20000 },
      ],
      subtotal: 100000,
      discount: 0,
      serviceCharge: 0,
      tax: 5000,
      rounding: 0,
      grandTotal: 105000,
    };
  }
}
