"use client";

import React, { useState, useRef } from "react";
import {
  Crown,
  Share2,
  CheckCircle,
  Copy,
  Download,
  RotateCcw,
  Scale,
  Percent,
  QrCode,
  FileText,
  Plane,
  X,
  ChevronDown,
  ChevronUp,
  CreditCard,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { useSplitBillStore, ParticipantBreakdown } from "@/lib/store";
import { formatRupiah } from "@/lib/utils";
import { saveDraftToIDB } from "@/lib/idb";
import {
  generateQris,
  getReimbursementPdfUrl,
  simplifyTripDebts,
  uploadSettlementProof,
} from "@/lib/api";

export function SettlementSummary() {
  const {
    transactionId,
    merchantName,
    overheadAllocationMethod,
    setOverheadAllocationMethod,
    computeSplitResult,
    setStep,
    resetAll,
    items,
    participants,
    taxAmount,
    serviceCharge,
    discountAmount,
    roundingAmount,
  } = useSplitBillStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [savedOffline, setSavedOffline] = useState<boolean>(false);

  // Modal QRIS Dinamis
  const qrisDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeQrisPerson, setActiveQrisPerson] = useState<ParticipantBreakdown | null>(null);
  const [qrisDataUrl, setQrisDataUrl] = useState<string | null>(null);
  const [qrisPayload, setQrisPayload] = useState<string | null>(null);
  const [isGeneratingQris, setIsGeneratingQris] = useState<boolean>(false);
  const [copyQrisSuccess, setCopyQrisSuccess] = useState<boolean>(false);

  // Modal Trip Mode (Debt Simplification)
  const tripDialogRef = useRef<HTMLDialogElement | null>(null);
  const [tripResult, setTripResult] = useState<any>(null);
  const [isComputingTrip, setIsComputingTrip] = useState<boolean>(false);

  const splitResult = computeSplitResult();

  // Buka Modal Dynamic QRIS untuk peserta tertentu
  const handleOpenQrisModal = async (breakdown: ParticipantBreakdown) => {
    setActiveQrisPerson(breakdown);
    setQrisDataUrl(null);
    setQrisPayload(null);
    setIsGeneratingQris(true);
    qrisDialogRef.current?.showModal();

    try {
      const res = await generateQris({
        transactionId: transactionId || undefined,
        participantId: breakdown.participantId,
        amount: breakdown.finalAmount,
        merchantName,
      });
      setQrisDataUrl(res.data.qrCodeDataUrl);
      setQrisPayload(res.data.payload);
    } catch (err: any) {
      alert(err.message || "Gagal membuat QRIS dinamis");
    } finally {
      setIsGeneratingQris(false);
    }
  };

  // Unduh Laporan PDF Reimbursement Kantor
  const handleDownloadReimbursementPdf = () => {
    if (!transactionId) {
      alert("Harap selesaikan review struk terlebih dahulu untuk mengunduh laporan PDF.");
      return;
    }
    const pdfUrl = getReimbursementPdfUrl(transactionId, "Saya (Karyawan)", "Operasional");
    window.open(pdfUrl, "_blank");
  };

  // Jalankan Trip Mode Debt Simplification
  const handleOpenTripMode = async () => {
    setIsComputingTrip(true);
    tripDialogRef.current?.showModal();

    try {
      // Simulasikan pengeluaran grup bersama peserta saat ini
      const payer = participants[0] || { id: "p_1", fullName: "Saya" };
      const dummyExpenses = [
        {
          id: "exp_1",
          description: `Makan di ${merchantName}`,
          totalAmount: splitResult.grandTotal,
          paidBy: { id: payer.id, name: payer.fullName },
          splitAmong: splitResult.breakdowns.map((b) => ({
            participant: { id: b.participantId, name: b.fullName },
            shareAmount: b.finalAmount,
          })),
        },
      ];

      const res = await simplifyTripDebts(dummyExpenses);
      setTripResult(res.data);
    } catch (err: any) {
      console.warn("Trip simplification error:", err);
    } finally {
      setIsComputingTrip(false);
    }
  };

  // Generator Pesan WhatsApp Rapi
  const generateWhatsAppMessage = () => {
    let msg = `*🧾 SPLITBILL: ${merchantName.toUpperCase()}*\n`;
    msg += `Total Tagihan: *${formatRupiah(splitResult.grandTotal)}*\n`;
    msg += `Skema Pajak: ${
      overheadAllocationMethod === "PROPORTIONAL"
        ? "Proporsional (Adil Berdasarkan Porsi)"
        : "Bagi Rata"
    }\n\n`;

    msg += `*RINCIAN PEMBAYARAN:*\n`;
    splitResult.breakdowns.forEach((b, idx) => {
      const crown = b.isTopSpender ? " 👑 (Top Spender)" : "";
      msg += `${idx + 1}. *${b.fullName}*${crown}: *${formatRupiah(b.finalAmount)}*\n`;
      msg += `   (Menu: ${formatRupiah(b.baseAmount)} + Pajak/Srv: ${formatRupiah(b.netOverhead)})\n`;
    });

    msg += `\nMohon ditransfer ke rekening patungan / scan QRIS ya, terima kasih! 🙏`;
    return msg;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppMessage());
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateWhatsAppMessage());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch (err) {
      console.warn("Copy to clipboard failed:", err);
    }
  };

  const handleSaveToIndexedDB = async () => {
    await saveDraftToIDB({
      id: `draft_${Date.now()}`,
      updatedAt: new Date().toISOString(),
      merchantName,
      items,
      participants,
      taxAmount,
      serviceCharge,
      discountAmount,
      roundingAmount,
      overheadAllocationMethod,
    });
    setSavedOffline(true);
    setTimeout(() => setSavedOffline(false), 2500);
  };

  return (
    <div className="flex flex-col flex-1 bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setStep(3)}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-100"
        >
          ← Edit Tag
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-slate-900">Hasil Pembagian Tagihan</h1>
          <p className="text-[11px] text-slate-500">Langkah 4 dari 4: Rincian & Pelunasan QRIS</p>
        </div>
        <button
          onClick={resetAll}
          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
          title="Mulai Baru"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Merchant & Grand Total Banner */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-xs font-medium text-blue-200 uppercase tracking-wider block">
              Ringkasan Patungan • {merchantName}
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-black tracking-tight">
                {formatRupiah(splitResult.grandTotal)}
              </span>
              <span className="text-xs text-blue-100 bg-white/20 px-2.5 py-1 rounded-full font-medium">
                {participants.length} Orang
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-blue-400/30 grid grid-cols-2 gap-2 text-xs text-blue-100">
              <div>
                <span>Subtotal Menu:</span>
                <span className="font-bold text-white block">
                  {formatRupiah(splitResult.totalBase)}
                </span>
              </div>
              <div className="text-right">
                <span>Pajak + Service:</span>
                <span className="font-bold text-white block">
                  {formatRupiah(
                    splitResult.totalTax +
                      splitResult.totalService -
                      splitResult.totalDiscount +
                      splitResult.totalRounding
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar: Trip Mode & Cetak PDF */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenTripMode}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <Plane size={15} className="text-blue-600" />
            <span>Mode Liburan (Trip)</span>
          </button>

          <button
            onClick={handleDownloadReimbursementPdf}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <FileText size={15} className="text-emerald-600" />
            <span>Cetak PDF Klaim</span>
          </button>
        </div>

        {/* Overhead Strategy Segmented Control */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Metode Pembagian Pajak & Biaya:
          </span>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setOverheadAllocationMethod("PROPORTIONAL")}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                overheadAllocationMethod === "PROPORTIONAL"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Percent size={14} />
              Pajak Proporsional
            </button>
            <button
              onClick={() => setOverheadAllocationMethod("EQUAL")}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                overheadAllocationMethod === "EQUAL"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Scale size={14} />
              Bagi Rata Pajak
            </button>
          </div>
        </div>

        {/* Breakdowns Per Participant with QRIS button */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Rincian Tagihan Per Orang ({splitResult.breakdowns.length})
            </span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
              ✓ Selisih Rp 0 (Presisi)
            </span>
          </div>

          {splitResult.breakdowns.map((b) => {
            const isExpanded = expandedId === b.participantId;
            return (
              <div
                key={b.participantId}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                <div className="p-4 flex items-center justify-between">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : b.participantId)}
                    className="flex items-center gap-3 cursor-pointer flex-1"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        b.isTopSpender
                          ? "bg-amber-100 text-amber-800 ring-2 ring-amber-400"
                          : b.isSelf
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {b.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-900">{b.fullName}</span>
                        {b.isSelf && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                            Saya
                          </span>
                        )}
                        {b.isTopSpender && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                            <Crown size={11} className="text-amber-600" />
                            Top Spender
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {b.assignedItemCount} menu • {b.percentageOfFood}% porsi
                      </span>
                    </div>
                  </div>

                  {/* Actions & Price */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenQrisModal(b)}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition flex items-center gap-1 text-[11px] font-bold"
                      title="Lihat Dynamic QRIS"
                    >
                      <QrCode size={15} />
                      <span className="hidden xs:inline">QRIS</span>
                    </button>

                    <div
                      onClick={() => setExpandedId(isExpanded ? null : b.participantId)}
                      className="cursor-pointer text-right"
                    >
                      <span className="text-base font-extrabold text-blue-600 block">
                        {formatRupiah(b.finalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Itemized Breakdown */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Porsi Makanan & Minuman:</span>
                      <span className="font-semibold text-slate-800">
                        {formatRupiah(b.baseAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Porsi Pajak Resto:</span>
                      <span>+{formatRupiah(b.allocatedTax)}</span>
                    </div>
                    {b.allocatedService > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Porsi Service Charge:</span>
                        <span>+{formatRupiah(b.allocatedService)}</span>
                      </div>
                    )}
                    {b.allocatedDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Porsi Diskon Promo:</span>
                        <span>-{formatRupiah(b.allocatedDiscount)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                      <span>Total Bersih:</span>
                      <span className="text-blue-600">{formatRupiah(b.finalAmount)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Actions: WhatsApp & Save */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg space-y-2">
        <button
          onClick={handleShareWhatsApp}
          className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-[0.98] transition"
        >
          <Share2 size={18} />
          Bagikan Rincian via WhatsApp
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCopyText}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
          >
            {copySuccess ? <CheckCircle size={15} className="text-emerald-600" /> : <Copy size={15} />}
            {copySuccess ? "Tersalin!" : "Salin Format Teks"}
          </button>

          <button
            onClick={handleSaveToIndexedDB}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
          >
            {savedOffline ? (
              <CheckCircle size={15} className="text-blue-600" />
            ) : (
              <Download size={15} />
            )}
            {savedOffline ? "Tersimpan Offline!" : "Simpan Draft PWA"}
          </button>
        </div>
      </div>

      {/* Modal Dialog: Dynamic QRIS Pelunasan */}
      <dialog
        ref={qrisDialogRef}
        aria-labelledby="qris-dialog-title"
        className="w-[92%] max-w-sm rounded-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <QrCode size={18} />
            </div>
            <div>
              <h2 id="qris-dialog-title" className="text-base font-bold text-slate-900">
                Dynamic QRIS
              </h2>
              <p className="text-[11px] text-slate-500">Nominal terkunci otomatis ke m-banking</p>
            </div>
          </div>
          <button
            onClick={() => qrisDialogRef.current?.close()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-center space-y-3">
          <div>
            <span className="text-xs text-slate-500">Tagihan untuk:</span>
            <strong className="block text-sm text-slate-900">
              {activeQrisPerson?.fullName}
            </strong>
            <span className="text-2xl font-black text-blue-600 block mt-0.5">
              {formatRupiah(activeQrisPerson?.finalAmount)}
            </span>
          </div>

          {qrisDataUrl ? (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <img
                src={qrisDataUrl}
                alt="Dynamic QRIS"
                className="w-52 h-52 mx-auto rounded-xl"
              />
            </div>
          ) : (
            <div className="w-52 h-52 bg-slate-100 animate-pulse rounded-2xl mx-auto flex items-center justify-center text-slate-400 text-xs">
              Membuat QRIS Dinamis...
            </div>
          )}

          <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100">
            Dapat dipindai dari BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay & LinkAja.
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                if (!qrisPayload) return;
                navigator.clipboard.writeText(qrisPayload);
                setCopyQrisSuccess(true);
                setTimeout(() => setCopyQrisSuccess(false), 2000);
              }}
              className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              {copyQrisSuccess ? (
                <CheckCircle2 size={15} className="text-emerald-600" />
              ) : (
                <Copy size={15} />
              )}
              {copyQrisSuccess ? "String QRIS Tersalin!" : "Salin String QRIS"}
            </button>
          </div>
        </div>
      </dialog>

      {/* Modal Dialog: Trip Mode (Debt Simplification) */}
      <dialog
        ref={tripDialogRef}
        aria-labelledby="trip-dialog-title"
        className="w-[92%] max-w-sm rounded-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Plane size={18} />
            </div>
            <div>
              <h2 id="trip-dialog-title" className="text-base font-bold text-slate-900">
                Penyederhanaan Utang Liburan
              </h2>
              <p className="text-[11px] text-slate-500">Min-Cost Flow Graph Reduction</p>
            </div>
          </div>
          <button
            onClick={() => tripDialogRef.current?.close()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50/80 p-3 rounded-2xl border border-blue-100 text-xs text-blue-900">
            Sistem meminimalkan transfer berputar sehingga setiap orang hanya perlu melakukan 1 kali
            transfer lunas.
          </div>

          {tripResult ? (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Instruksi Transfer Efisien ({tripResult.transfers.length} Transaksi):
              </div>

              <div className="space-y-2">
                {tripResult.transfers.map((t: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900">{t.from.name}</div>
                      <div className="text-[10px] text-slate-500">transfer ke: {t.to.name}</div>
                    </div>
                    <span className="font-extrabold text-blue-600 text-sm">
                      {formatRupiah(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs">
              Menghitung transfer optimal...
            </div>
          )}

          <button
            onClick={() => tripDialogRef.current?.close()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition"
          >
            Tutup
          </button>
        </div>
      </dialog>
    </div>
  );
}
