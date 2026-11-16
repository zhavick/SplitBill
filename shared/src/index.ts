// Tipe data & konstanta bersama (backend, frontend, admin) - sesuai TSD

export type UserRole = 'GUEST' | 'MEMBER' | 'ADMIN' | 'SUPERADMIN';
export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
export type VerificationChannel = 'EMAIL' | 'WHATSAPP';
export type OverheadSplitStrategy = 'EQUAL' | 'PROPORTIONAL';
export type TransactionStatus = 'DRAFT' | 'ACTIVE' | 'SETTLED';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED';

export interface ItemTagAssignment {
  participantId: string;
  /** 1.0 = milik tunggal, 0.5 = dibagi 2 orang, dst. */
  shareRatio: number;
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  assignedTags: ItemTagAssignment[];
}

export interface ReceiptAdjustment {
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  rounding: number;
  grandTotal: number;
  overheadStrategy: OverheadSplitStrategy;
}

export interface ApiSuccess<T> {
  status: 'success';
  data: T;
  meta?: { requestId?: string; timestamp?: string };
}

export interface ApiError {
  status: 'error';
  code: string;
  message: string;
  details?: unknown[];
}

export const MAX_SHOTS_PER_RECEIPT = 5;
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
