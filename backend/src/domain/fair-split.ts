/**
 * Core Domain Engine - Fair Split (Step 2).
 *
 * Fungsi murni (tanpa I/O). Seluruh nominal dihitung sebagai bilangan bulat Rupiah
 * dengan metode Largest Remainder (aritmetika BigInt), sehingga:
 *   - tiap item terbagi persis ke pemiliknya (tanpa sisa pecahan),
 *   - tiap komponen biaya non-barang terbagi persis (jumlah share == total komponen),
 *   - jumlah tagihan seluruh peserta == total terhitung (selisih Rp 0).
 */

export type OverheadStrategy = 'EQUAL' | 'PROPORTIONAL';

export interface FairSplitItem {
  id: string;
  /** Total harga baris (bilangan bulat Rupiah). */
  totalPrice: number;
  assignedTags: { participantId: string; shareRatio: number }[];
}

export interface FairSplitInput {
  participantIds: string[];
  items: FairSplitItem[];
  /** Semua bilangan bulat Rupiah. discount bernilai positif (mengurangi tagihan). */
  adjustment: {
    tax: number;
    serviceCharge: number;
    discount: number;
    /** Boleh negatif (pembulatan kasir ke bawah). */
    rounding: number;
    /** Total tercetak di struk; dipakai untuk mendeteksi selisih. */
    grandTotal?: number;
  };
  strategy: OverheadStrategy;
}

export interface ParticipantBill {
  participantId: string;
  itemSubtotal: number;
  discountShare: number;
  serviceShare: number;
  taxShare: number;
  roundingShare: number;
  finalPayable: number;
  /** Persentase kontribusi terhadap subtotal makanan (0-100, 1 desimal). */
  foodSharePercent: number;
  isTopSpender: boolean;
}

export interface FairSplitResult {
  bills: ParticipantBill[];
  foodSubtotal: number;
  /** Jumlah seluruh finalPayable. */
  computedTotal: number;
  /** grandTotal struk - computedTotal (0 jika cocok atau grandTotal tidak diberikan). */
  discrepancy: number;
}

export class FairSplitError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_PARTICIPANTS' | 'UNASSIGNED_ITEM' | 'UNKNOWN_PARTICIPANT' | 'INVALID_AMOUNT',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FairSplitError';
  }
}

const RATIO_SCALE = 1_000_000;

function assertInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new FairSplitError(`${label} harus bilangan bulat Rupiah`, 'INVALID_AMOUNT', { label, value });
  }
}

/**
 * Membagi `total` (bilangan bulat, boleh negatif) ke sejumlah bobot (bilangan bulat >= 0)
 * sehingga jumlah hasil == total persis. Sisa dibagikan ke sisa pecahan terbesar;
 * seri diputuskan berdasarkan urutan input (deterministik).
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  assertInt(total, 'total');
  if (weights.length === 0) return [];

  let w = weights.map((x) => BigInt(Math.round(x)));
  let sumW = w.reduce((a, b) => a + b, 0n);
  if (sumW === 0n) {
    w = weights.map(() => 1n);
    sumW = BigInt(weights.length);
  }

  const sign = total < 0 ? -1n : 1n;
  const absTotal = BigInt(Math.abs(total));

  const base: bigint[] = [];
  const rem: bigint[] = [];
  for (const wi of w) {
    const prod = absTotal * wi;
    base.push(prod / sumW);
    rem.push(prod % sumW);
  }

  let leftover = absTotal - base.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((_, i) => i)
    .filter((i) => w[i] > 0n)
    .sort((a, b) => (rem[b] > rem[a] ? 1 : rem[b] < rem[a] ? -1 : a - b));

  for (let k = 0; leftover > 0n; k = (k + 1) % order.length) {
    base[order[k]] += 1n;
    leftover -= 1n;
  }

  return base.map((b) => Number(b * sign));
}

/** Subtotal makanan per peserta; setiap item dibagi persis sesuai shareRatio. */
function computeItemSubtotals(input: FairSplitInput): Map<string, number> {
  const subtotals = new Map<string, number>(input.participantIds.map((id) => [id, 0]));

  for (const item of input.items) {
    assertInt(item.totalPrice, `Harga item ${item.id}`);
    const tags = item.assignedTags.filter((t) => t.shareRatio > 0);
    if (tags.length === 0) {
      throw new FairSplitError(`Item "${item.id}" belum memiliki pemilik`, 'UNASSIGNED_ITEM', { itemId: item.id });
    }
    for (const t of tags) {
      if (!subtotals.has(t.participantId)) {
        throw new FairSplitError(`Partisipan "${t.participantId}" tidak dikenal`, 'UNKNOWN_PARTICIPANT', {
          participantId: t.participantId,
        });
      }
    }
    const shares = allocateLargestRemainder(
      item.totalPrice,
      tags.map((t) => Math.round(t.shareRatio * RATIO_SCALE)),
    );
    tags.forEach((t, i) => subtotals.set(t.participantId, subtotals.get(t.participantId)! + shares[i]));
  }
  return subtotals;
}

export function calculateFairSplit(input: FairSplitInput): FairSplitResult {
  if (input.participantIds.length === 0) {
    throw new FairSplitError('Minimal satu partisipan diperlukan', 'NO_PARTICIPANTS');
  }
  const { tax, serviceCharge, discount, rounding, grandTotal } = input.adjustment;
  assertInt(tax, 'tax');
  assertInt(serviceCharge, 'serviceCharge');
  assertInt(discount, 'discount');
  assertInt(rounding, 'rounding');

  const subtotals = computeItemSubtotals(input);
  const subtotalList = input.participantIds.map((id) => subtotals.get(id)!);
  const foodSubtotal = subtotalList.reduce((a, b) => a + b, 0);

  const weights =
    input.strategy === 'PROPORTIONAL' && foodSubtotal > 0 ? subtotalList : input.participantIds.map(() => 1);

  const discountShares = allocateLargestRemainder(discount, weights);
  const serviceShares = allocateLargestRemainder(serviceCharge, weights);
  const taxShares = allocateLargestRemainder(tax, weights);
  const roundingShares = allocateLargestRemainder(rounding, weights);

  const maxSubtotal = Math.max(...subtotalList);

  const bills: ParticipantBill[] = input.participantIds.map((participantId, i) => {
    const itemSubtotal = subtotalList[i];
    return {
      participantId,
      itemSubtotal,
      discountShare: discountShares[i],
      serviceShare: serviceShares[i],
      taxShare: taxShares[i],
      roundingShare: roundingShares[i],
      finalPayable: itemSubtotal - discountShares[i] + serviceShares[i] + taxShares[i] + roundingShares[i],
      foodSharePercent: foodSubtotal > 0 ? Math.round((itemSubtotal / foodSubtotal) * 1000) / 10 : 0,
      isTopSpender: maxSubtotal > 0 && itemSubtotal === maxSubtotal,
    };
  });

  const computedTotal = bills.reduce((a, b) => a + b.finalPayable, 0);
  return {
    bills,
    foodSubtotal,
    computedTotal,
    discrepancy: grandTotal === undefined ? 0 : grandTotal - computedTotal,
  };
}
