"use client";

import React, { useState, useRef, useEffect } from "react";
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
  Plus,
  Trash2,
  Building2,
  User,
  FileSpreadsheet,
  Check,
  Clock,
  Send,
  Sparkles,
  Filter,
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

interface TripExpenseItem {
  id: string;
  description: string;
  totalAmount: number;
  paidById: string;
  participantIds: string[];
}

export function SettlementSummary() {
  const {
    currentUser,
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

  // Filter status pelunasan (Semua | Belum Bayar | Lunas)
  const [settlementFilter, setSettlementFilter] = useState<"ALL" | "UNPAID" | "VERIFIED">("ALL");

  // State pelunasan per partisipan: { [participantId]: "UNPAID" | "VERIFIED" }
  const [settlementStatusMap, setSettlementStatusMap] = useState<Record<string, "UNPAID" | "VERIFIED">>({});

  // Inisialisasi status pelunasan default
  useEffect(() => {
    const initialMap: Record<string, "UNPAID" | "VERIFIED"> = {};
    participants.forEach((p) => {
      // Pemilik/Host otomatis ditandai Lunas jika ada
      initialMap[p.id] = p.isSelf ? "VERIFIED" : "UNPAID";
    });
    setSettlementStatusMap((prev) => ({ ...initialMap, ...prev }));
  }, [participants]);

  const toggleSettlementStatus = (participantId: string) => {
    setSettlementStatusMap((prev) => ({
      ...prev,
      [participantId]: prev[participantId] === "VERIFIED" ? "UNPAID" : "VERIFIED",
    }));
  };

  // Modal QRIS Dinamis & Bukti Transfer
  const qrisDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeQrisPerson, setActiveQrisPerson] = useState<ParticipantBreakdown | null>(null);
  const [qrisDataUrl, setQrisDataUrl] = useState<string | null>(null);
  const [qrisPayload, setQrisPayload] = useState<string | null>(null);
  const [isGeneratingQris, setIsGeneratingQris] = useState<boolean>(false);
  const [copyQrisSuccess, setCopyQrisSuccess] = useState<boolean>(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [uploadProofSuccess, setUploadProofSuccess] = useState<boolean>(false);

  // Modal Reimbursement Klaim Kantor
  const reimbursementDialogRef = useRef<HTMLDialogElement | null>(null);
  const [applicantName, setApplicantName] = useState<string>(currentUser?.fullName || "Saya");
  const [department, setDepartment] = useState<string>("Operasional & Bisnis");
  const [businessPurpose, setBusinessPurpose] = useState<string>(`Makan Bersama Klien/Tim di ${merchantName}`);

  // Modal Trip Mode (Debt Simplification Multi-Expense)
  const tripDialogRef = useRef<HTMLDialogElement | null>(null);
  const [tripExpenses, setTripExpenses] = useState<TripExpenseItem[]>([]);
  const [tripResult, setTripResult] = useState<any>(null);
  const [isComputingTrip, setIsComputingTrip] = useState<boolean>(false);
  const [copyTripSuccess, setCopyTripSuccess] = useState<boolean>(false);

  // Form tambah pengeluaran trip baru
  const [newTripDesc, setNewTripDesc] = useState<string>("");
  const [newTripAmount, setNewTripAmount] = useState<string>("");
  const [newTripPayerId, setNewTripPayerId] = useState<string>(participants[0]?.id || "");
  const [newTripParticipants, setNewTripParticipants] = useState<string[]>(participants.map((p) => p.id));

  const splitResult = computeSplitResult();

  // Buka Modal Dynamic QRIS untuk peserta tertentu
  const handleOpenQrisModal = async (breakdown: ParticipantBreakdown) => {
    setActiveQrisPerson(breakdown);
    setQrisDataUrl(null);
    setQrisPayload(null);
    setProofFile(null);
    setProofPreviewUrl(null);
    setUploadProofSuccess(false);
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

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const url = URL.createObjectURL(file);
      setProofPreviewUrl(url);
    }
  };

  const handleConfirmProofUpload = async () => {
    if (!activeQrisPerson) return;
    setIsUploadingProof(true);
    try {
      if (proofFile && transactionId) {
        try {
          await uploadSettlementProof(activeQrisPerson.participantId, proofFile);
        } catch (err) {
          console.warn("Upload proof API skipped, updating local state:", err);
        }
      }
      // Tandai partisipan sebagai Lunas
      setSettlementStatusMap((prev) => ({
        ...prev,
        [activeQrisPerson.participantId]: "VERIFIED",
      }));
      setUploadProofSuccess(true);
      setTimeout(() => {
        setUploadProofSuccess(false);
        qrisDialogRef.current?.close();
      }, 1500);
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Unduh Laporan PDF Reimbursement Kantor
  const handleDownloadReimbursementPdf = () => {
    if (!transactionId) {
      alert("Catatan: Anda sedang dalam mode Guest/Lokal. Untuk mengunduh PDF resmi backend, pastikan struk tersimpan. Anda juga dapat menggunakan tombol 'Ekspor Format CSV / Excel' di bawah.");
      return;
    }
    const pdfUrl = getReimbursementPdfUrl(
      transactionId,
      applicantName || currentUser?.fullName || "Saya",
      department || "Operasional"
    );
    window.open(pdfUrl, "_blank");
  };

  // Ekspor Rekapitulasi Tagihan ke format CSV / Excel
  const handleExportCsv = () => {
    const rows: string[][] = [
      ["LAPORAN REKAPITULASI PEMBAGIAN TAGIHAN (SPLITBILL)"],
      ["Nama Merchant / Restoran", merchantName],
      ["Tanggal Transaksi", new Date().toLocaleDateString("id-ID")],
      ["Metode Pajak & Service", overheadAllocationMethod === "PROPORTIONAL" ? "Proporsional" : "Bagi Rata"],
      ["Total Keseluruhan (Rp)", splitResult.grandTotal.toString()],
      [],
      ["DAFTAR RINCIAN PARTISIPAN"],
      ["Nama Partisipan", "Subtotal Menu (Rp)", "Porsi Pajak & Service (Rp)", "Total Tagihan (Rp)", "Status Pelunasan"],
    ];

    splitResult.breakdowns.forEach((b) => {
      const isPaid = settlementStatusMap[b.participantId] === "VERIFIED";
      rows.push([
        b.fullName + (b.isSelf ? " (Host/Saya)" : ""),
        b.baseAmount.toString(),
        b.netOverhead.toString(),
        b.finalAmount.toString(),
        isPaid ? "LUNAS" : "BELUM LUNAS",
      ]);
    });

    rows.push([]);
    rows.push(["RINCIAN MENU & PENETAPAN ITEM"]);
    rows.push(["Nama Menu", "Qty", "Harga Satuan (Rp)", "Total Harga (Rp)", "Penetapan Partisipan"]);
    items.forEach((it) => {
      const tagged = it.assignedParticipantIds
        .map((id) => participants.find((p) => p.id === id)?.fullName || id)
        .join(", ");
      rows.push([
        it.itemName,
        it.quantity.toString(),
        it.itemPrice.toString(),
        it.totalPrice.toString(),
        tagged || "Bagi Rata Semua",
      ]);
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      rows.map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `SplitBill_Reimbursement_${merchantName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Buka Modal Mode Liburan (Trip Mode)
  const handleOpenTripMode = async () => {
    tripDialogRef.current?.showModal();

    // Inisialisasi pengeluaran struk saat ini jika list masih kosong
    let initialExpenses = tripExpenses;
    if (initialExpenses.length === 0) {
      const payer = participants[0] || { id: "p_1", fullName: "Saya" };
      initialExpenses = [
        {
          id: `exp_${Date.now()}`,
          description: `Makan di ${merchantName}`,
          totalAmount: splitResult.grandTotal,
          paidById: payer.id,
          participantIds: participants.map((p) => p.id),
        },
      ];
      setTripExpenses(initialExpenses);
    }
    recalculateTripSimplification(initialExpenses);
  };

  const recalculateTripSimplification = async (expensesList: TripExpenseItem[]) => {
    setIsComputingTrip(true);
    try {
      const formattedExpenses = expensesList.map((exp) => {
        const payerPerson = participants.find((p) => p.id === exp.paidById) || {
          id: exp.paidById,
          fullName: "Pembayar",
        };
        const sharePerPerson = Math.round(exp.totalAmount / (exp.participantIds.length || 1));
        return {
          id: exp.id,
          description: exp.description,
          totalAmount: exp.totalAmount,
          paidBy: { id: payerPerson.id, name: payerPerson.fullName },
          splitAmong: exp.participantIds.map((pId) => {
            const person = participants.find((p) => p.id === pId) || { id: pId, fullName: "Teman" };
            return {
              participant: { id: person.id, name: person.fullName },
              shareAmount: sharePerPerson,
            };
          }),
        };
      });

      const res = await simplifyTripDebts(formattedExpenses);
      setTripResult(res.data);
    } catch (err: any) {
      console.warn("Trip simplification error:", err);
    } finally {
      setIsComputingTrip(false);
    }
  };

  const handleAddTripExpense = () => {
    const amount = parseInt(newTripAmount.replace(/\D/g, ""), 10);
    if (!newTripDesc.trim() || isNaN(amount) || amount <= 0) {
      alert("Harap isi deskripsi pengeluaran dan nominal dengan benar.");
      return;
    }
    if (newTripParticipants.length === 0) {
      alert("Pilih minimal 1 partisipan yang ikut menanggung pengeluaran ini.");
      return;
    }

    const newExp: TripExpenseItem = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      description: newTripDesc.trim(),
      totalAmount: amount,
      paidById: newTripPayerId,
      participantIds: newTripParticipants,
    };

    const updated = [...tripExpenses, newExp];
    setTripExpenses(updated);
    setNewTripDesc("");
    setNewTripAmount("");
    recalculateTripSimplification(updated);
  };

  const handleRemoveTripExpense = (expId: string) => {
    const updated = tripExpenses.filter((e) => e.id !== expId);
    setTripExpenses(updated);
    recalculateTripSimplification(updated);
  };

  const generateTripWhatsAppMessage = () => {
    if (!tripResult) return "";
    let msg = `*✈️ REKAP LIBURAN & PENYELESAIAN UTANG (TRIP MODE)*\n`;
    msg += `Total Pengeluaran Bersama: *${formatRupiah(tripResult.totalGroupSpending)}*\n`;
    msg += `Total Item Pengeluaran: ${tripExpenses.length} transaksi\n\n`;

    msg += `*RINGKASAN TRANSFER EFISIEN (${tripResult.transfers.length} Transaksi Saja):*\n`;
    tripResult.transfers.forEach((t: any, idx: number) => {
      msg += `${idx + 1}. *${t.from.name}* transfer ke *${t.to.name}*: *${formatRupiah(t.amount)}*\n`;
    });

    msg += `\n*RINCIAN SALDO BERSIH PER ANGGOTA:*\n`;
    tripResult.netBalances.forEach((nb: any) => {
      const status = nb.balance > 0 ? `menerima +${formatRupiah(nb.balance)}` : nb.balance < 0 ? `membayar ${formatRupiah(nb.balance)}` : "Lunas (Rp 0)";
      msg += `• ${nb.participant.name}: ${status}\n`;
    });

    msg += `\nDihitung otomatis via SplitBill Min-Cost Flow. Yuk segera dilunasi ya teman-teman! 🙌`;
    return msg;
  };

  const handleCopyTripSummary = async () => {
    const text = generateTripWhatsAppMessage();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyTripSuccess(true);
      setTimeout(() => setCopyTripSuccess(false), 2000);
    } catch (err) {
      console.warn("Copy trip text failed:", err);
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
      const isPaid = settlementStatusMap[b.participantId] === "VERIFIED";
      const statusIcon = isPaid ? " [LUNAS ✅]" : " [BELUM BAYAR ⏳]";
      msg += `${idx + 1}. *${b.fullName}*${crown}${statusIcon}: *${formatRupiah(b.finalAmount)}*\n`;
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

  // Hitung jumlah yang sudah lunas dan belum
  const paidCount = splitResult.breakdowns.filter(
    (b) => settlementStatusMap[b.participantId] === "VERIFIED"
  ).length;
  const unpaidCount = splitResult.breakdowns.length - paidCount;

  // Filter tampilan partisipan
  const filteredBreakdowns = splitResult.breakdowns.filter((b) => {
    if (settlementFilter === "ALL") return true;
    const isPaid = settlementStatusMap[b.participantId] === "VERIFIED";
    if (settlementFilter === "VERIFIED") return isPaid;
    if (settlementFilter === "UNPAID") return !isPaid;
    return true;
  });

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

        {/* Action Bar: Trip Mode & Reimbursement Kantor */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleOpenTripMode}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Plane size={15} className="text-blue-600" />
            <span>Mode Liburan (Trip)</span>
          </button>

          <button
            onClick={() => reimbursementDialogRef.current?.showModal()}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <FileText size={15} className="text-emerald-600" />
            <span>Klaim Reimbursement</span>
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

        {/* Settlement Tracker: Filter & Status Pelunasan */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pelunasan Tagihan ({splitResult.breakdowns.length})
            </span>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-emerald-700 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">
                {paidCount} Lunas
              </span>
              {unpaidCount > 0 && (
                <span className="text-amber-700 bg-amber-100 font-bold px-2 py-0.5 rounded-full">
                  {unpaidCount} Belum
                </span>
              )}
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSettlementFilter("ALL")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center transition ${
                settlementFilter === "ALL"
                  ? "bg-white text-slate-900 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua ({splitResult.breakdowns.length})
            </button>
            <button
              onClick={() => setSettlementFilter("UNPAID")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center transition ${
                settlementFilter === "UNPAID"
                  ? "bg-white text-amber-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Belum Lunas ({unpaidCount})
            </button>
            <button
              onClick={() => setSettlementFilter("VERIFIED")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center transition ${
                settlementFilter === "VERIFIED"
                  ? "bg-white text-emerald-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Lunas ({paidCount})
            </button>
          </div>

          {/* Breakdowns Per Participant */}
          {filteredBreakdowns.map((b) => {
            const isExpanded = expandedId === b.participantId;
            const isPaid = settlementStatusMap[b.participantId] === "VERIFIED";

            return (
              <div
                key={b.participantId}
                className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${
                  isPaid ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="p-4 flex items-center justify-between">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : b.participantId)}
                    className="flex items-center gap-3 cursor-pointer flex-1"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        isPaid
                          ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400"
                          : b.isTopSpender
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
                            Host
                          </span>
                        )}
                        {b.isTopSpender && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                            <Crown size={11} className="text-amber-600" />
                            Top
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span>{b.assignedItemCount} menu</span>
                        <span>•</span>
                        <span>{b.percentageOfFood}% porsi</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Status Toggle, QRIS, & Price */}
                  <div className="flex items-center gap-2">
                    {/* Toggle Status Lunas */}
                    <button
                      onClick={() => toggleSettlementStatus(b.participantId)}
                      className={`py-1 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                        isPaid
                          ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                          : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                      title={isPaid ? "Klik untuk tandai belum lunas" : "Klik untuk tandai lunas"}
                    >
                      {isPaid ? <Check size={13} className="text-emerald-700" /> : <Clock size={13} className="text-amber-600" />}
                      <span>{isPaid ? "Lunas" : "Belum"}</span>
                    </button>

                    <button
                      onClick={() => handleOpenQrisModal(b)}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition flex items-center gap-1 text-[11px] font-bold"
                      title="Lihat Dynamic QRIS & Bukti Transfer"
                    >
                      <QrCode size={15} />
                      <span className="hidden xs:inline">QRIS</span>
                    </button>

                    <div
                      onClick={() => setExpandedId(isExpanded ? null : b.participantId)}
                      className="cursor-pointer text-right min-w-[70px]"
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

      {/* Modal Dialog: Dynamic QRIS & Unggah Bukti Pelunasan */}
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
                Dynamic QRIS & Bukti Bayar
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

          {/* Unggah Bukti Transfer */}
          <div className="pt-2 border-t border-slate-100 text-left space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              Unggah Bukti Transfer / Screenshot:
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleProofFileChange}
              className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 w-full"
            />
            {proofPreviewUrl && (
              <div className="mt-2 text-center">
                <img
                  src={proofPreviewUrl}
                  alt="Bukti Transfer Preview"
                  className="max-h-28 mx-auto rounded-lg border border-slate-200 shadow-sm"
                />
              </div>
            )}
            <button
              onClick={handleConfirmProofUpload}
              disabled={isUploadingProof}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm mt-2"
            >
              {uploadProofSuccess ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>Bukti Disimpan & Lunas!</span>
                </>
              ) : isUploadingProof ? (
                <span>Menyimpan Bukti...</span>
              ) : (
                <>
                  <UploadCloud size={15} />
                  <span>Konfirmasi Pembayaran Lunas</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-1">
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

      {/* Modal Dialog: Mode Liburan (Trip Mode Multi-Expense) */}
      <dialog
        ref={tripDialogRef}
        aria-labelledby="trip-dialog-title"
        className="w-[95%] max-w-lg rounded-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Plane size={20} />
            </div>
            <div>
              <h2 id="trip-dialog-title" className="text-base font-bold text-slate-900">
                Mode Liburan: Penyederhanaan Utang
              </h2>
              <p className="text-[11px] text-slate-500">Min-Cost Flow Graph Reduction (Banyak Pengeluaran)</p>
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
          <div className="bg-blue-50/90 p-3.5 rounded-2xl border border-blue-100 text-xs text-blue-900 leading-relaxed">
            Gabungkan berbagai pengeluaran liburan (struk makan, bensin, villa, tiket masuk). Algoritma
            secara cerdas meminimalkan jumlah transfer antar teman sehingga tidak ada transfer bolak-balik.
          </div>

          {/* Daftar Pengeluaran Trip yang Sudah Ditambahkan */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
              Pengeluaran Liburan Terdaftar ({tripExpenses.length}):
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {tripExpenses.map((exp) => {
                const payer = participants.find((p) => p.id === exp.paidById);
                return (
                  <div
                    key={exp.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{exp.description}</div>
                      <div className="text-[10px] text-slate-500">
                        Dibayar: <span className="font-semibold text-slate-700">{payer?.fullName || "Saya"}</span> • Dibagi ke {exp.participantIds.length} orang
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-blue-600">{formatRupiah(exp.totalAmount)}</span>
                      {tripExpenses.length > 1 && (
                        <button
                          onClick={() => handleRemoveTripExpense(exp.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Hapus Pengeluaran"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Tambah Pengeluaran Liburan Baru */}
          <div className="p-3 bg-slate-100/70 rounded-2xl border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Plus size={14} className="text-blue-600" />
              Tambah Pengeluaran Liburan Lain:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Misal: Bensin & Tol"
                value={newTripDesc}
                onChange={(e) => setNewTripDesc(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <input
                type="number"
                placeholder="Nominal (Rp)"
                value={newTripAmount}
                onChange={(e) => setNewTripAmount(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 text-[11px] whitespace-nowrap">Dibayar oleh:</span>
              <select
                value={newTripPayerId}
                onChange={(e) => setNewTripPayerId(e.target.value)}
                className="text-xs p-1.5 rounded-lg border border-slate-300 bg-white flex-1 focus:outline-none"
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} {p.isSelf ? "(Saya)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddTripExpense}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1"
            >
              <Plus size={14} />
              Tambahkan ke Liburan
            </button>
          </div>

          {/* Hasil Min-Cost Flow Transaksi Efisien */}
          {tripResult ? (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Instruksi Transfer Optimal ({tripResult.transfers.length} Transaksi):
                </span>
                <span className="text-[11px] font-bold text-blue-600">
                  Total: {formatRupiah(tripResult.totalGroupSpending)}
                </span>
              </div>

              {tripResult.transfers.length === 0 ? (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs text-emerald-800 font-semibold">
                  Semua pengeluaran sudah seimbang! Tidak ada transfer tambahan yang diperlukan.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {tripResult.transfers.map((t: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900">{t.from.name}</div>
                        <div className="text-[10px] text-slate-500">
                          Transfer ke: <span className="font-bold text-slate-700">{t.to.name}</span>
                        </div>
                      </div>
                      <span className="font-extrabold text-blue-600 text-sm">
                        {formatRupiah(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handleCopyTripSummary}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  {copyTripSuccess ? <CheckCircle size={15} /> : <Share2 size={15} />}
                  <span>{copyTripSuccess ? "Tersalin!" : "Salin ke WhatsApp"}</span>
                </button>

                <button
                  onClick={() => tripDialogRef.current?.close()}
                  className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition"
                >
                  Selesai
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-400 text-xs">Menghitung optimasi transfer...</div>
          )}
        </div>
      </dialog>

      {/* Modal Dialog: Klaim Reimbursement Kantor (PDF & CSV Excel) */}
      <dialog
        ref={reimbursementDialogRef}
        aria-labelledby="reimbursement-dialog-title"
        className="w-[92%] max-w-md rounded-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h2 id="reimbursement-dialog-title" className="text-base font-bold text-slate-900">
                Ekspor Klaim Reimbursement
              </h2>
              <p className="text-[11px] text-slate-500">Laporan Resmi Pengeluaran & Audit Finansial</p>
            </div>
          </div>
          <button
            onClick={() => reimbursementDialogRef.current?.close()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Nama Pemohon / Karyawan:</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                placeholder="Nama Lengkap Karyawan"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Departemen / Divisi:</label>
            <div className="relative">
              <Building2 size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Misal: Finance, Engineering, Marketing"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Tujuan / Keperluan Bisnis:</label>
            <input
              type="text"
              value={businessPurpose}
              onChange={(e) => setBusinessPurpose(e.target.value)}
              placeholder="Misal: Jamuan Makan Siang Klien PT ABC"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
            <span className="font-bold text-emerald-900 block">Ringkasan Nilai Reimbursement:</span>
            <div className="flex justify-between text-emerald-800">
              <span>Merchant:</span>
              <span className="font-semibold">{merchantName}</span>
            </div>
            <div className="flex justify-between text-emerald-900 font-extrabold text-sm">
              <span>Total Diajukan:</span>
              <span>{formatRupiah(splitResult.grandTotal)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={handleDownloadReimbursementPdf}
              className="py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              <FileText size={16} />
              <span>Unduh PDF Resmi</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="py-3 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 border border-slate-200"
            >
              <FileSpreadsheet size={16} className="text-emerald-700" />
              <span>Ekspor CSV / Excel</span>
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
