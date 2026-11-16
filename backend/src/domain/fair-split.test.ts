import { describe, expect, it } from 'vitest';
import {
  allocateLargestRemainder,
  calculateFairSplit,
  FairSplitError,
  type FairSplitInput,
} from './fair-split.js';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const item = (id: string, price: number, ...owners: string[]) => ({
  id,
  totalPrice: price,
  assignedTags: owners.map((o) => ({ participantId: o, shareRatio: 1 / owners.length })),
});

const byId = (r: ReturnType<typeof calculateFairSplit>, id: string) =>
  r.bills.find((b) => b.participantId === id)!;

describe('allocateLargestRemainder', () => {
  it('membagi 10000 ke 3 bagian sama: 3334, 3333, 3333', () => {
    expect(allocateLargestRemainder(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it('jumlah hasil selalu sama dengan total', () => {
    for (const total of [0, 1, 7, 5000, 99999, 1_000_003]) {
      for (const w of [[1, 1, 1], [40000, 40000, 20000], [1, 2, 3, 4, 5], [3, 0, 7]]) {
        expect(sum(allocateLargestRemainder(total, w))).toBe(total);
      }
    }
  });

  it('mendukung total negatif (pembulatan kasir)', () => {
    const r = allocateLargestRemainder(-100, [1, 1, 1]);
    expect(sum(r)).toBe(-100);
    expect(r).toEqual([-34, -33, -33]);
  });

  it('bobot nol tidak menerima sisa; semua nol jatuh ke pembagian rata', () => {
    expect(allocateLargestRemainder(10, [1, 0, 1])).toEqual([5, 0, 5]);
    expect(allocateLargestRemainder(10, [0, 0])).toEqual([5, 5]);
  });

  it('aman untuk nominal besar (BigInt)', () => {
    const r = allocateLargestRemainder(9_000_000_000_000, [3_000_000_000, 3_000_000_001, 5]);
    expect(sum(r)).toBe(9_000_000_000_000);
  });

  it('menolak bilangan non-bulat', () => {
    expect(() => allocateLargestRemainder(10.5, [1])).toThrow(FairSplitError);
  });
});

describe('calculateFairSplit - skenario Master Plan (5 barang @20.000, pajak 5.000)', () => {
  const base: FairSplitInput = {
    participantIds: ['A', 'B', 'C'],
    items: [
      item('1', 20000, 'A'),
      item('2', 20000, 'A'),
      item('3', 20000, 'B'),
      item('4', 20000, 'B'),
      item('5', 20000, 'C'),
    ],
    adjustment: { tax: 5000, serviceCharge: 0, discount: 0, rounding: 0, grandTotal: 105000 },
    strategy: 'EQUAL',
  };

  it('Mode EQUAL: A 41.667, B 41.667, C 21.666, total 105.000', () => {
    const r = calculateFairSplit(base);
    expect(byId(r, 'A').finalPayable).toBe(41667);
    expect(byId(r, 'B').finalPayable).toBe(41667);
    expect(byId(r, 'C').finalPayable).toBe(21666);
    expect(r.computedTotal).toBe(105000);
    expect(r.discrepancy).toBe(0);
    expect(r.foodSubtotal).toBe(100000);
  });

  it('Mode PROPORTIONAL: A 42.000, B 42.000, C 21.000, total 105.000', () => {
    const r = calculateFairSplit({ ...base, strategy: 'PROPORTIONAL' });
    expect(r.bills.map((b) => b.finalPayable)).toEqual([42000, 42000, 21000]);
    expect(r.computedTotal).toBe(105000);
  });

  it('Top Spender: A dan B (seri), C bukan; persentase 40/40/20', () => {
    const r = calculateFairSplit(base);
    expect(r.bills.map((b) => b.isTopSpender)).toEqual([true, true, false]);
    expect(r.bills.map((b) => b.foodSharePercent)).toEqual([40, 40, 20]);
  });
});

describe('calculateFairSplit - skenario FSD (3 barang, 2 orang, pajak 7.800)', () => {
  it('Saya 36.900 + Dimas 48.900 = 85.800', () => {
    const r = calculateFairSplit({
      participantIds: ['me', 'dimas'],
      items: [item('nasgor', 25000, 'me'), item('esteh', 8000, 'me'), item('steak', 45000, 'dimas')],
      adjustment: { tax: 7800, serviceCharge: 0, discount: 0, rounding: 0, grandTotal: 85800 },
      strategy: 'EQUAL',
    });
    expect(byId(r, 'me').finalPayable).toBe(36900);
    expect(byId(r, 'dimas').finalPayable).toBe(48900);
    expect(byId(r, 'dimas').isTopSpender).toBe(true);
    expect(r.discrepancy).toBe(0);
  });
});

describe('calculateFairSplit - item bersama & kasus ganjil', () => {
  it('item shared 3 orang Rp 10.000 -> 3.334 / 3.333 / 3.333, tanpa kehilangan rupiah', () => {
    const r = calculateFairSplit({
      participantIds: ['A', 'B', 'C'],
      items: [item('pizza', 10000, 'A', 'B', 'C')],
      adjustment: { tax: 0, serviceCharge: 0, discount: 0, rounding: 0 },
      strategy: 'EQUAL',
    });
    expect(r.bills.map((b) => b.itemSubtotal)).toEqual([3334, 3333, 3333]);
    expect(r.computedTotal).toBe(10000);
  });

  it('rasio kustom 5:3 untuk pizza Rp 80.000', () => {
    const r = calculateFairSplit({
      participantIds: ['A', 'B'],
      items: [
        {
          id: 'pizza',
          totalPrice: 80000,
          assignedTags: [
            { participantId: 'A', shareRatio: 5 },
            { participantId: 'B', shareRatio: 3 },
          ],
        },
      ],
      adjustment: { tax: 0, serviceCharge: 0, discount: 0, rounding: 0 },
      strategy: 'EQUAL',
    });
    expect(r.bills.map((b) => b.itemSubtotal)).toEqual([50000, 30000]);
  });

  it('peserta tanpa item tetap menanggung porsi pajak pada mode EQUAL, tidak pada PROPORTIONAL', () => {
    const input: FairSplitInput = {
      participantIds: ['A', 'B'],
      items: [item('x', 10000, 'A')],
      adjustment: { tax: 1000, serviceCharge: 0, discount: 0, rounding: 0 },
      strategy: 'EQUAL',
    };
    expect(byId(calculateFairSplit(input), 'B').finalPayable).toBe(500);
    expect(byId(calculateFairSplit({ ...input, strategy: 'PROPORTIONAL' }), 'B').finalPayable).toBe(0);
  });
});

describe('calculateFairSplit - diskon, servis, pembulatan kasir', () => {
  const input: FairSplitInput = {
    participantIds: ['A', 'B', 'C'],
    items: [item('1', 30000, 'A'), item('2', 50000, 'B'), item('3', 20000, 'C')],
    adjustment: { tax: 10000, serviceCharge: 5000, discount: 10000, rounding: -50 },
    strategy: 'PROPORTIONAL',
  };

  it('jumlah tagihan = subtotal - diskon + servis + pajak + pembulatan, untuk kedua mode', () => {
    for (const strategy of ['EQUAL', 'PROPORTIONAL'] as const) {
      const r = calculateFairSplit({ ...input, strategy });
      expect(r.computedTotal).toBe(100000 - 10000 + 5000 + 10000 - 50);
    }
  });

  it('mendeteksi selisih terhadap grand total struk tanpa memaksakan angka', () => {
    const r = calculateFairSplit({ ...input, adjustment: { ...input.adjustment, grandTotal: 105000 } });
    expect(r.computedTotal).toBe(104950);
    expect(r.discrepancy).toBe(50);
  });

  it('PROPORTIONAL: diskon 10.000 -> 3.000 / 5.000 / 2.000', () => {
    const r = calculateFairSplit(input);
    expect(r.bills.map((b) => b.discountShare)).toEqual([3000, 5000, 2000]);
  });
});

describe('calculateFairSplit - validasi', () => {
  it('menolak tanpa partisipan', () => {
    expect(() =>
      calculateFairSplit({
        participantIds: [],
        items: [],
        adjustment: { tax: 0, serviceCharge: 0, discount: 0, rounding: 0 },
        strategy: 'EQUAL',
      }),
    ).toThrowError(expect.objectContaining({ code: 'NO_PARTICIPANTS' }));
  });

  it('menolak item tanpa pemilik', () => {
    expect(() =>
      calculateFairSplit({
        participantIds: ['A'],
        items: [{ id: 'x', totalPrice: 1000, assignedTags: [] }],
        adjustment: { tax: 0, serviceCharge: 0, discount: 0, rounding: 0 },
        strategy: 'EQUAL',
      }),
    ).toThrowError(expect.objectContaining({ code: 'UNASSIGNED_ITEM' }));
  });

  it('menolak pemilik yang tidak dikenal', () => {
    expect(() =>
      calculateFairSplit({
        participantIds: ['A'],
        items: [item('x', 1000, 'Z')],
        adjustment: { tax: 0, serviceCharge: 0, discount: 0, rounding: 0 },
        strategy: 'EQUAL',
      }),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_PARTICIPANT' }));
  });

  it('menolak nominal pecahan', () => {
    expect(() =>
      calculateFairSplit({
        participantIds: ['A'],
        items: [item('x', 1000, 'A')],
        adjustment: { tax: 10.5, serviceCharge: 0, discount: 0, rounding: 0 },
        strategy: 'EQUAL',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });
});

describe('calculateFairSplit - properti: selisih selalu Rp 0 (acak)', () => {
  it('500 skenario acak', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 500; n++) {
      const people = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => `P${i}`);
      const items = Array.from({ length: 1 + Math.floor(rnd() * 10) }, (_, i) => {
        const owners = people.filter(() => rnd() < 0.4);
        if (owners.length === 0) owners.push(people[Math.floor(rnd() * people.length)]);
        return item(`i${i}`, Math.floor(rnd() * 200000), ...owners);
      });
      const adjustment = {
        tax: Math.floor(rnd() * 30000),
        serviceCharge: Math.floor(rnd() * 20000),
        discount: Math.floor(rnd() * 15000),
        rounding: Math.floor(rnd() * 200) - 100,
      };
      const foodTotal = sum(items.map((i) => i.totalPrice));
      const expected = foodTotal - adjustment.discount + adjustment.serviceCharge + adjustment.tax + adjustment.rounding;
      for (const strategy of ['EQUAL', 'PROPORTIONAL'] as const) {
        const r = calculateFairSplit({ participantIds: people, items, adjustment: { ...adjustment, grandTotal: expected }, strategy });
        expect(r.computedTotal).toBe(expected);
        expect(r.discrepancy).toBe(0);
        expect(r.foodSubtotal).toBe(foodTotal);
      }
    }
  });
});
