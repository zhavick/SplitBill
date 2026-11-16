import { create } from "zustand";

export interface ReceiptShotItem {
  shotOrder: number;
  dataUrl: string;
  blob?: Blob;
  uploadedUrl?: string;
}

export interface SplitItem {
  id: string;
  itemName: string;
  quantity: number;
  itemPrice: number;
  totalPrice: number;
  assignedParticipantIds: string[];
}

export interface Participant {
  id: string;
  fullName: string;
  email?: string;
  isSelf: boolean;
}

export interface ParticipantBreakdown {
  participantId: string;
  fullName: string;
  isSelf: boolean;
  baseAmount: number;
  assignedItemCount: number;
  allocatedTax: number;
  allocatedService: number;
  allocatedDiscount: number;
  allocatedRounding: number;
  netOverhead: number;
  finalAmount: number;
  percentageOfFood: number;
  isTopSpender: boolean;
}

export interface SplitResult {
  breakdowns: ParticipantBreakdown[];
  totalBase: number;
  totalTax: number;
  totalService: number;
  totalDiscount: number;
  totalRounding: number;
  grandTotal: number;
  topSpenderId: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  ocrQuotaRemaining?: number;
}

interface SplitBillState {
  currentStep: number; // 0: Home, 1: Camera, 2: Review, 3: Tagging, 4: Settlement
  currentUser: UserProfile | null;
  transactionId: string | null;
  merchantName: string;
  transactionDate: string;
  shots: ReceiptShotItem[];
  items: SplitItem[];
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  roundingAmount: number;
  finalTotal: number;
  hasDiscrepancy: boolean;
  
  participants: Participant[];
  overheadAllocationMethod: "EQUAL" | "PROPORTIONAL";
  
  isProcessing: boolean;
  errorMessage: string | null;

  // Actions
  setCurrentUser: (user: UserProfile | null) => void;
  logoutUser: () => void;
  setStep: (step: number) => void;
  setTransactionId: (id: string | null) => void;
  addShot: (dataUrl: string, blob?: Blob) => void;
  removeShot: (order: number) => void;
  clearShots: () => void;
  
  setReceiptData: (data: {
    transactionId?: string;
    merchantName?: string;
    transactionDate?: string;
    items?: Array<{ id?: string; itemName: string; quantity: number; itemPrice: number; totalPrice: number }>;
    taxAmount?: number;
    serviceCharge?: number;
    discountAmount?: number;
    roundingAmount?: number;
    finalTotal?: number;
    hasDiscrepancy?: boolean;
  }) => void;

  updateItem: (index: number, updates: Partial<SplitItem>) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
  updateOverhead: (fields: Partial<{
    merchantName: string;
    taxAmount: number;
    serviceCharge: number;
    discountAmount: number;
    roundingAmount: number;
    finalTotal: number;
  }>) => void;

  addParticipant: (fullName: string, email?: string) => string;
  removeParticipant: (id: string) => void;
  toggleItemAssignment: (itemId: string, participantId: string) => void;
  assignSelfToItem: (itemId: string) => void;
  setOverheadAllocationMethod: (method: "EQUAL" | "PROPORTIONAL") => void;

  setIsProcessing: (isProcessing: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  resetAll: () => void;

  // Compute split
  computeSplitResult: () => SplitResult;
}

const DEFAULT_SELF_ID = "participant_self";

export const useSplitBillStore = create<SplitBillState>((set, get) => ({
  currentStep: 0,
  currentUser: null,
  transactionId: null,
  merchantName: "Restoran / Kafe",
  transactionDate: new Date().toISOString(),
  shots: [],
  items: [],
  taxAmount: 0,
  serviceCharge: 0,
  discountAmount: 0,
  roundingAmount: 0,
  finalTotal: 0,
  hasDiscrepancy: false,

  participants: [
    {
      id: DEFAULT_SELF_ID,
      fullName: "Saya (Akun Ini)",
      isSelf: true,
    },
  ],
  overheadAllocationMethod: "PROPORTIONAL",

  isProcessing: false,
  errorMessage: null,

  setCurrentUser: (user) => {
    set({ currentUser: user });
    if (user?.fullName) {
      const state = get();
      const updated = state.participants.map((p) =>
        p.isSelf ? { ...p, fullName: user.fullName } : p
      );
      set({ participants: updated });
    }
  },

  logoutUser: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("splitbill_access_token");
      localStorage.removeItem("splitbill_user_profile");
    }
    const state = get();
    const updated = state.participants.map((p) =>
      p.isSelf ? { ...p, fullName: "Saya (Akun Ini)" } : p
    );
    set({ currentUser: null, participants: updated });
  },

  setStep: (step) => set({ currentStep: step }),
  setTransactionId: (id) => set({ transactionId: id }),

  addShot: (dataUrl, blob) => {
    const state = get();
    const newOrder = state.shots.length + 1;
    set({
      shots: [...state.shots, { shotOrder: newOrder, dataUrl, blob }],
    });
  },

  removeShot: (order) => {
    const state = get();
    const filtered = state.shots
      .filter((s) => s.shotOrder !== order)
      .map((s, idx) => ({ ...s, shotOrder: idx + 1 }));
    set({ shots: filtered });
  },

  clearShots: () => set({ shots: [] }),

  setReceiptData: (data) => {
    set((state) => {
      const items = data.items
        ? data.items.map((it, idx) => ({
            id: it.id || `item_${Date.now()}_${idx}`,
            itemName: it.itemName,
            quantity: it.quantity,
            itemPrice: it.itemPrice,
            totalPrice: it.totalPrice,
            assignedParticipantIds: [],
          }))
        : state.items;

      return {
        transactionId: data.transactionId ?? state.transactionId,
        merchantName: data.merchantName ?? state.merchantName,
        transactionDate: data.transactionDate ?? state.transactionDate,
        items,
        taxAmount: data.taxAmount ?? state.taxAmount,
        serviceCharge: data.serviceCharge ?? state.serviceCharge,
        discountAmount: data.discountAmount ?? state.discountAmount,
        roundingAmount: data.roundingAmount ?? state.roundingAmount,
        finalTotal: data.finalTotal ?? state.finalTotal,
        hasDiscrepancy: data.hasDiscrepancy ?? state.hasDiscrepancy,
      };
    });
  },

  updateItem: (index, updates) => {
    set((state) => {
      const newItems = [...state.items];
      if (newItems[index]) {
        const updated = { ...newItems[index], ...updates };
        if (updates.quantity !== undefined || updates.itemPrice !== undefined) {
          updated.totalPrice = Math.round(updated.quantity * updated.itemPrice);
        }
        newItems[index] = updated;
      }
      return { items: newItems };
    });
  },

  addItem: () => {
    set((state) => ({
      items: [
        ...state.items,
        {
          id: `item_${Date.now()}_${state.items.length}`,
          itemName: "Item Baru",
          quantity: 1,
          itemPrice: 0,
          totalPrice: 0,
          assignedParticipantIds: [],
        },
      ],
    }));
  },

  removeItem: (index) => {
    set((state) => ({
      items: state.items.filter((_, i) => i !== index),
    }));
  },

  updateOverhead: (fields) => {
    set((state) => ({ ...state, ...fields }));
  },

  addParticipant: (fullName, email) => {
    const newId = `participant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    set((state) => ({
      participants: [
        ...state.participants,
        {
          id: newId,
          fullName: fullName.trim(),
          email: email?.trim() || undefined,
          isSelf: false,
        },
      ],
    }));
    return newId;
  },

  removeParticipant: (id) => {
    if (id === DEFAULT_SELF_ID) return;
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== id),
      items: state.items.map((it) => ({
        ...it,
        assignedParticipantIds: it.assignedParticipantIds.filter((pId) => pId !== id),
      })),
    }));
  },

  toggleItemAssignment: (itemId, participantId) => {
    set((state) => ({
      items: state.items.map((it) => {
        if (it.id !== itemId) return it;
        const exists = it.assignedParticipantIds.includes(participantId);
        return {
          ...it,
          assignedParticipantIds: exists
            ? it.assignedParticipantIds.filter((id) => id !== participantId)
            : [...it.assignedParticipantIds, participantId],
        };
      }),
    }));
  },

  assignSelfToItem: (itemId) => {
    get().toggleItemAssignment(itemId, DEFAULT_SELF_ID);
  },

  setOverheadAllocationMethod: (method) => {
    set({ overheadAllocationMethod: method });
  },

  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),

  resetAll: () => {
    set({
      currentStep: 0,
      transactionId: null,
      merchantName: "Restoran / Kafe",
      transactionDate: new Date().toISOString(),
      shots: [],
      items: [],
      taxAmount: 0,
      serviceCharge: 0,
      discountAmount: 0,
      roundingAmount: 0,
      finalTotal: 0,
      hasDiscrepancy: false,
      participants: [
        {
          id: DEFAULT_SELF_ID,
          fullName: "Saya (Akun Ini)",
          isSelf: true,
        },
      ],
      overheadAllocationMethod: "PROPORTIONAL",
      isProcessing: false,
      errorMessage: null,
    });
  },

  computeSplitResult: () => {
    const { items, participants, taxAmount, serviceCharge, discountAmount, roundingAmount, overheadAllocationMethod } = get();

    // 1. Hitung base amount per participant
    const participantBaseMap: Record<string, { base: number; count: number }> = {};
    for (const p of participants) {
      participantBaseMap[p.id] = { base: 0, count: 0 };
    }

    for (const it of items) {
      const assigned = it.assignedParticipantIds;
      if (assigned.length > 0) {
        // Pembagian item rata di antara yang ditag
        const share = it.totalPrice / assigned.length;
        for (const pId of assigned) {
          if (participantBaseMap[pId]) {
            participantBaseMap[pId].base += share;
            participantBaseMap[pId].count += 1;
          }
        }
      }
    }

    const totalBase = Object.values(participantBaseMap).reduce((acc, curr) => acc + curr.base, 0);

    // 2. Alokasi overhead menggunakan Largest Remainder Method (Zero-Rupiah Rounding)
    function allocateOverhead(targetAmount: number): Record<string, number> {
      if (targetAmount === 0 || participants.length === 0) {
        const zeroRes: Record<string, number> = {};
        for (const p of participants) zeroRes[p.id] = 0;
        return zeroRes;
      }

      const isProportional = overheadAllocationMethod === "PROPORTIONAL" && totalBase > 0;
      const result: Record<string, number> = {};
      const remainders: Array<{ id: string; remainder: number; originalOrder: number }> = [];

      let allocatedSum = 0;

      participants.forEach((p, index) => {
        const weight = isProportional
          ? participantBaseMap[p.id].base / totalBase
          : 1 / participants.length;

        const exactShare = targetAmount * weight;
        const floorShare = Math.floor(exactShare);
        const rem = exactShare - floorShare;

        result[p.id] = floorShare;
        allocatedSum += floorShare;
        remainders.push({ id: p.id, remainder: rem, originalOrder: index });
      });

      let diff = targetAmount - allocatedSum;
      if (diff > 0) {
        remainders.sort((a, b) => {
          if (b.remainder !== a.remainder) return b.remainder - a.remainder;
          return a.originalOrder - b.originalOrder;
        });

        for (let i = 0; i < diff && i < remainders.length; i++) {
          result[remainders[i].id] += 1;
        }
      }

      return result;
    }

    const allocatedTaxes = allocateOverhead(taxAmount);
    const allocatedServices = allocateOverhead(serviceCharge);
    const allocatedDiscounts = allocateOverhead(discountAmount);
    const allocatedRoundings = allocateOverhead(roundingAmount);

    let maxBase = -1;
    let topSpenderId: string | null = null;

    const breakdowns: ParticipantBreakdown[] = participants.map((p) => {
      const base = Math.round(participantBaseMap[p.id].base);
      const tax = allocatedTaxes[p.id] || 0;
      const srv = allocatedServices[p.id] || 0;
      const disc = allocatedDiscounts[p.id] || 0;
      const rnd = allocatedRoundings[p.id] || 0;
      const netOverhead = tax + srv - disc + rnd;
      const finalAmount = Math.max(0, base + netOverhead);
      const percentage = totalBase > 0 ? (base / totalBase) * 100 : 0;

      if (base > maxBase && base > 0) {
        maxBase = base;
        topSpenderId = p.id;
      }

      return {
        participantId: p.id,
        fullName: p.fullName,
        isSelf: p.isSelf,
        baseAmount: base,
        assignedItemCount: participantBaseMap[p.id].count,
        allocatedTax: tax,
        allocatedService: srv,
        allocatedDiscount: disc,
        allocatedRounding: rnd,
        netOverhead,
        finalAmount,
        percentageOfFood: Math.round(percentage * 10) / 10,
        isTopSpender: false,
      };
    });

    if (topSpenderId) {
      const top = breakdowns.find((b) => b.participantId === topSpenderId);
      if (top) top.isTopSpender = true;
    }

    const grandTotal = breakdowns.reduce((acc, b) => acc + b.finalAmount, 0);

    return {
      breakdowns,
      totalBase: Math.round(totalBase),
      totalTax: taxAmount,
      totalService: serviceCharge,
      totalDiscount: discountAmount,
      totalRounding: roundingAmount,
      grandTotal,
      topSpenderId,
    };
  },
}));
