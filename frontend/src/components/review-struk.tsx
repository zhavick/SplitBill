"use client";

import React, { useState } from "react";
import {
  Store,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Receipt,
  Percent,
  Coins,
  RefreshCw,
} from "lucide-react";
import { useSplitBillStore } from "@/lib/store";
import { formatRupiah, parseRupiahInput } from "@/lib/utils";
import { reviewReceipt } from "@/lib/api";

export function ReviewStruk() {
  const {
    transactionId,
    merchantName,
    items,
    taxAmount,
    serviceCharge,
    discountAmount,
    roundingAmount,
    finalTotal,
    hasDiscrepancy,
    updateItem,
    addItem,
    removeItem,
    updateOverhead,
    setStep,
    isProcessing,
    setIsProcessing,
  } = useSplitBillStore();

  const [saving, setSaving] = useState(false);

  // Kalkulasi subtotal dari semua item saat ini
  const calculatedSubtotal = items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
  const calculatedTotal =
    calculatedSubtotal + taxAmount + serviceCharge - discountAmount + roundingAmount;
  const isDiffWithGrandTotal = finalTotal > 0 && calculatedTotal !== finalTotal;

  const handleSaveAndContinue = async () => {
    if (items.length === 0) {
      alert("Minimal tambahkan 1 item struk.");
      return;
    }

    setSaving(true);
    try {
      if (transactionId) {
        await reviewReceipt(transactionId, {
          merchantName,
          taxAmount,
          serviceCharge,
          discountAmount,
          roundingAmount,
          finalTotal: finalTotal || calculatedTotal,
          items: items.map((it) => ({
            itemName: it.itemName,
            quantity: it.quantity,
            itemPrice: it.itemPrice,
            totalPrice: it.totalPrice,
          })),
        });
      }
      // Pindah ke Step 3 (Tagging Peserta)
      setStep(3);
    } catch (err: any) {
      console.warn("Save review failed:", err);
      // Tetap izinkan lanjut ke Step 3 jika offline draft
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-slate-50 overflow-y-auto">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setStep(0)}
          className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
          title="Kembali ke Beranda"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-slate-900">Periksa & Edit Struk</h1>
          <p className="text-[11px] text-slate-500">Langkah 2 dari 4: Verifikasi Hasil OCR</p>
        </div>
        <div className="w-8" />
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Merchant Info Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
            <Store size={15} className="text-blue-600" />
            <span>Detail Toko / Resto</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Nama Tempat / Merchant
            </label>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => updateOverhead({ merchantName: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
              placeholder="Contoh: Kopi Kenangan, Solaria"
            />
          </div>
        </div>

        {/* Item List Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
              <Receipt size={15} className="text-blue-600" />
              <span>Daftar Menu / Item ({items.length})</span>
            </div>
            <button
              onClick={addItem}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition"
            >
              <Plus size={14} />
              Tambah
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <div key={item.id} className="py-3 space-y-2 first:pt-1 last:pb-1">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={item.itemName}
                    onChange={(e) => updateItem(idx, { itemName: e.target.value })}
                    className="flex-1 font-medium text-sm text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                    placeholder="Nama Item / Makanan"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                    title="Hapus Item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2 items-center text-xs">
                  {/* Qty */}
                  <div className="col-span-3 flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 py-1">
                    <span className="text-slate-400 mr-1 text-[10px]">Qty:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        updateItem(idx, { quantity: Math.max(1, val) });
                      }}
                      className="w-full bg-transparent font-semibold text-slate-800 text-center focus:outline-none"
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="col-span-4 flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 py-1">
                    <span className="text-slate-400 mr-1 text-[10px]">@</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.itemPrice.toLocaleString("id-ID")}
                      onChange={(e) => {
                        const val = parseRupiahInput(e.target.value);
                        updateItem(idx, { itemPrice: val });
                      }}
                      className="w-full bg-transparent font-medium text-slate-800 focus:outline-none text-right"
                    />
                  </div>

                  {/* Total Price */}
                  <div className="col-span-5 text-right font-bold text-sm text-slate-900 pr-1">
                    {formatRupiah(item.totalPrice)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Subtotal Makanan & Minuman</span>
            <span className="font-bold text-slate-900 text-sm">
              {formatRupiah(calculatedSubtotal)}
            </span>
          </div>
        </div>

        {/* Taxes & Overheads Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
            <Coins size={15} className="text-blue-600" />
            <span>Pajak & Biaya Layanan Tambahan</span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Pajak PB1/PPN */}
            <div className="flex items-center justify-between gap-3">
              <label className="text-slate-600 flex items-center gap-1">
                <Percent size={13} className="text-slate-400" />
                Pajak Resto (PB1 / PPN)
              </label>
              <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 py-1 w-32">
                <span className="text-slate-400 mr-1 text-[10px]">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={taxAmount.toLocaleString("id-ID")}
                  onChange={(e) =>
                    updateOverhead({ taxAmount: parseRupiahInput(e.target.value) })
                  }
                  className="w-full bg-transparent font-semibold text-slate-800 text-right focus:outline-none"
                />
              </div>
            </div>

            {/* Service Charge */}
            <div className="flex items-center justify-between gap-3">
              <label className="text-slate-600">Service Charge</label>
              <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 py-1 w-32">
                <span className="text-slate-400 mr-1 text-[10px]">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={serviceCharge.toLocaleString("id-ID")}
                  onChange={(e) =>
                    updateOverhead({ serviceCharge: parseRupiahInput(e.target.value) })
                  }
                  className="w-full bg-transparent font-semibold text-slate-800 text-right focus:outline-none"
                />
              </div>
            </div>

            {/* Diskon */}
            <div className="flex items-center justify-between gap-3">
              <label className="text-emerald-700 font-medium">Potongan / Diskon Promo (-)</label>
              <div className="flex items-center bg-emerald-50 rounded-lg border border-emerald-200 px-2 py-1 w-32">
                <span className="text-emerald-600 mr-1 text-[10px]">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discountAmount.toLocaleString("id-ID")}
                  onChange={(e) =>
                    updateOverhead({ discountAmount: parseRupiahInput(e.target.value) })
                  }
                  className="w-full bg-transparent font-semibold text-emerald-800 text-right focus:outline-none"
                />
              </div>
            </div>

            {/* Pembulatan Rupiah */}
            <div className="flex items-center justify-between gap-3">
              <label className="text-slate-600">Pembulatan Kasir (+/-)</label>
              <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-2 py-1 w-32">
                <span className="text-slate-400 mr-1 text-[10px]">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={roundingAmount.toLocaleString("id-ID")}
                  onChange={(e) =>
                    updateOverhead({ roundingAmount: parseRupiahInput(e.target.value) })
                  }
                  className="w-full bg-transparent font-semibold text-slate-800 text-right focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Grand Total Comparison */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="block text-xs font-semibold text-slate-700">Total Akhir Struk</span>
              <span className="text-[10px] text-slate-400">Total kalkulasi sistem</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-extrabold text-blue-600">
                {formatRupiah(calculatedTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Warning Alert if Discrepancy detected */}
        {(hasDiscrepancy || isDiffWithGrandTotal) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Peringatan Selisih Kalkulasi</span>
              <p className="mt-0.5 text-amber-800">
                Ada perbedaan antara total tertulis di struk ({formatRupiah(finalTotal)}) dengan
                jumlah perhitungan ({formatRupiah(calculatedTotal)}). Sistem akan mendistribusikan
                biaya berdasarkan total rincian item di atas.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Next Step Action */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg flex items-center gap-3">
        <button
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-[0.98] transition"
        >
          {saving ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Menyimpan Struk...
            </>
          ) : (
            <>
              Lanjut ke Bagi Tagihan Teman
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
