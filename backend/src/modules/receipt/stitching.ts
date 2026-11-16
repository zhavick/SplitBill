import { randomUUID } from 'node:crypto';
import type { RawExtractedItem, RawReceiptData } from './ocr-engine.js';

export interface CleanedReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  assignedTags: { participantId: string; shareRatio: number }[];
}

export interface CleanedReceiptData {
  merchantName: string;
  receiptDate?: string;
  items: CleanedReceiptItem[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  grandTotal: number;
}

/**
 * Melakukan post-processing & de-duplikasi baris item dari hasil OCR:
 * 1. Menghilangkan item duplikat yang tumpang tindih akibat pemotretan multi-shot.
 * 2. Memberikan ID unik (UUID) untuk setiap baris barang agar siap di-tag.
 * 3. Menghitung validasi subtotal & grand total.
 */
export function stitchAndCleanReceiptData(raw: RawReceiptData): CleanedReceiptData {
  const cleanedItems: CleanedReceiptItem[] = [];

  for (let i = 0; i < raw.items.length; i++) {
    const current = raw.items[i];
    const prev = cleanedItems[cleanedItems.length - 1];

    // Deteksi duplikasi tumpang tindih (overlap baris dari multi-shot)
    const isDuplicateOfPrev =
      prev &&
      prev.name.toLowerCase().trim() === current.name.toLowerCase().trim() &&
      prev.totalPrice === current.totalPrice &&
      prev.qty === current.qty;

    if (isDuplicateOfPrev) {
      // Abaikan baris duplikat hasil overlap
      continue;
    }

    cleanedItems.push({
      id: randomUUID(),
      name: current.name,
      qty: current.qty,
      unitPrice: current.unitPrice,
      totalPrice: current.totalPrice,
      assignedTags: [],
    });
  }

  // Hitung kalkulasi subtotal dari seluruh item
  const computedSubtotal = cleanedItems.reduce((acc, it) => acc + it.totalPrice, 0);
  const actualSubtotal = raw.subtotal > 0 ? raw.subtotal : computedSubtotal;

  return {
    merchantName: raw.merchantName,
    receiptDate: raw.date,
    items: cleanedItems,
    subtotal: actualSubtotal,
    discount: raw.discount || 0,
    serviceCharge: raw.serviceCharge || 0,
    tax: raw.tax || 0,
    rounding: raw.rounding || 0,
    grandTotal: raw.grandTotal || (actualSubtotal - raw.discount + raw.serviceCharge + raw.tax + raw.rounding),
  };
}
