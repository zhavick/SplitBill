import sharp from 'sharp';
import { AppError } from '../../lib/errors.js';

export interface PreprocessedImage {
  buffer: Buffer;
  width?: number;
  height?: number;
  format: string;
  size: number;
}

/**
 * Memproses citra struk sebelum dikirim ke AI Vision:
 * 1. Auto-orientasi berdasarkan metadata EXIF (posisi potret/lanskap kamera).
 * 2. Skalasi ke lebar maksimum 1600px agar efisien tanpa memudarkan teks.
 * 3. Normalisasi kontras untuk memperjelas teks pudar kertas thermal.
 * 4. Penajaman (unsharp mask) untuk mempertegas karakter teks.
 * 5. Kompresi JPEG kualitas 85% untuk menghemat kuota transfer jaringan.
 */
export async function preprocessReceiptImage(inputBuffer: Buffer): Promise<PreprocessedImage> {
  try {
    const image = sharp(inputBuffer);
    
    const processed = image
      .rotate() // Auto-orient EXIF
      .resize({
        width: 1600,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .normalize() // Rentangkan kontras
      .sharpen({ sigma: 1.2 }) // Penajaman tepi teks
      .jpeg({
        quality: 85,
        mozjpeg: true,
      });

    const buffer = await processed.toBuffer();
    const metadata = await sharp(buffer).metadata();

    return {
      buffer,
      width: metadata.width,
      height: metadata.height,
      format: 'jpeg',
      size: buffer.length,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'INVALID_IMAGE_FILE', 'Berkas gambar tidak valid atau format tidak didukung.');
  }
}
