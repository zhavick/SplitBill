import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(value: number | bigint | string | null | undefined): string {
  if (value === null || value === undefined) return "Rp 0";
  const num = typeof value === "bigint" ? Number(value) : typeof value === "string" ? parseFloat(value) || 0 : value;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function parseRupiahInput(value: string): number {
  const clean = value.replace(/[^0-9]/g, "");
  return parseInt(clean, 10) || 0;
}
