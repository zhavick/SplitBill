"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Camera,
  Image as ImageIcon,
  Receipt,
  Sparkles,
  Users,
  ShieldCheck,
  Scale,
  QrCode,
  ArrowRight,
  Clock,
  Trash2,
  Settings,
  ChevronRight,
  PlusCircle,
  FileText,
  User as UserIcon,
  LogIn,
  LogOut,
  Zap,
} from "lucide-react";
import { useSplitBillStore } from "@/lib/store";
import { listDraftsFromIDB, deleteDraftFromIDB, OfflineDraft } from "@/lib/idb";
import { formatRupiah } from "@/lib/utils";
import { getAuthMe, logoutUserApi } from "@/lib/api";
import { UserAuthModal } from "./user-auth-modal";
import Link from "next/link";

export function HomeLanding() {
  const {
    setStep,
    addShot,
    setReceiptData,
    setOverheadAllocationMethod,
    currentUser,
    setCurrentUser,
    logoutUser,
  } = useSplitBillStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"LOGIN" | "REGISTER">("LOGIN");

  // Inisialisasi user session jika ada token di localStorage
  useEffect(() => {
    async function initUserSession() {
      const token = typeof window !== "undefined" ? localStorage.getItem("splitbill_access_token") : null;
      if (token && !currentUser) {
        try {
          const res = await getAuthMe();
          setCurrentUser(res.data.user);
        } catch {
          // Token expired or invalid
          logoutUser();
        }
      }
    }
    initUserSession();
  }, [currentUser, setCurrentUser, logoutUser]);

  // Ambil riwayat draft dari IndexedDB
  const refreshDrafts = async () => {
    try {
      const items = await listDraftsFromIDB();
      // Urutkan dari yang terbaru
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setDrafts(items);
    } catch (err) {
      console.warn("Failed to load drafts:", err);
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    refreshDrafts();
  }, []);

  const handleOpenAuth = (mode: "LOGIN" | "REGISTER") => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    if (confirm("Apakah Anda yakin ingin keluar dari akun?")) {
      await logoutUserApi();
      logoutUser();
    }
  };

  // Upload file dari galeri langsung
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        addShot(dataUrl, file);
        setStep(1); // Buka layar kamera / review
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Lanjutkan draft tersimpan
  const handleResumeDraft = (draft: OfflineDraft) => {
    setReceiptData({
      transactionId: draft.id,
      merchantName: draft.merchantName,
      items: draft.items,
      taxAmount: draft.taxAmount,
      serviceCharge: draft.serviceCharge,
      discountAmount: draft.discountAmount,
      roundingAmount: draft.roundingAmount,
    });
    setOverheadAllocationMethod(draft.overheadAllocationMethod || "PROPORTIONAL");
    setStep(3); // Langsung ke layar penandaan / ringkasan
  };

  const handleDeleteDraft = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteDraftFromIDB(id);
    refreshDrafts();
  };

  return (
    <div className="flex flex-col flex-1 bg-slate-50 overflow-y-auto">
      {/* Top Navbar Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Receipt size={18} />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-tight text-slate-900 leading-none">
              Split<span className="text-blue-600">Bill</span>
            </h1>
            <span className="text-[9px] font-semibold text-slate-400">Smart Fair Split</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-xl border border-blue-200/60 text-xs">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">
                  {currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-[11px] font-bold text-slate-800 leading-none truncate max-w-[90px]">
                    {currentUser.fullName.split(" ")[0]}
                  </div>
                  <span className="text-[9px] text-blue-600 font-bold block">
                    {currentUser.ocrQuotaRemaining ?? 10} Kuota
                  </span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition"
                title="Keluar dari akun"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleOpenAuth("LOGIN")}
                className="px-2.5 py-1 text-slate-700 hover:text-blue-600 font-bold text-xs rounded-lg transition flex items-center gap-1"
              >
                <LogIn size={13} />
                <span>Masuk</span>
              </button>

              <button
                onClick={() => handleOpenAuth("REGISTER")}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition"
              >
                Daftar
              </button>
            </div>
          )}

          {/* Shortcut to Admin Backoffice */}
          <Link
            href="/admin"
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
            title="Portal Admin"
          >
            <Settings size={14} className="text-slate-600" />
          </Link>
        </div>
      </div>

      <div className="p-5 space-y-6 flex-1 pb-12">
        {/* Hero Card Banner */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white rounded-3xl p-6 shadow-xl shadow-blue-600/15 relative overflow-hidden">
          <div className="relative z-10 space-y-3">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full text-blue-100">
              <Sparkles size={12} className="text-amber-300" />
              Vision AI Multi-Shot OCR
            </span>

            <h2 className="text-2xl font-black tracking-tight leading-tight">
              Bagi Tagihan Makan <br />
              <span className="text-blue-200">Presisi Hingga 0 Rupiah</span>
            </h2>

            <p className="text-xs text-blue-100/90 leading-relaxed max-w-xs">
              Foto struk nota panjang, biarkan AI membaca menu & pajak, lalu bagikan rincian ke teman
              tanpa pusing hitung manual.
            </p>

            {/* Tombol Jepret Utama */}
            <div className="pt-2">
              <button
                onClick={() => setStep(1)}
                className="w-full py-4 px-5 bg-white hover:bg-blue-50 text-blue-700 font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition"
              >
                <Camera size={20} className="text-blue-600" />
                <span>Mulai Scan Struk Belanja</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {/* Background decorative receipt illustration */}
          <div className="absolute -right-8 -bottom-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>

        {/* Alternative Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleGalleryUpload}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col items-center text-center gap-2 shadow-sm transition active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <div>
              <span className="block font-bold text-xs text-slate-800">Upload Galeri</span>
              <span className="text-[10px] text-slate-400">Pilih foto dari berkas</span>
            </div>
          </button>

          <button
            onClick={() => {
              setReceiptData({
                merchantName: "Restoran / Kafe Baru",
                items: [
                  {
                    itemName: "Menu 1",
                    quantity: 1,
                    itemPrice: 25000,
                    totalPrice: 25000,
                  },
                ],
              });
              setStep(2);
            }}
            className="p-4 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col items-center text-center gap-2 shadow-sm transition active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PlusCircle size={20} />
            </div>
            <div>
              <span className="block font-bold text-xs text-slate-800">Input Manual</span>
              <span className="text-[10px] text-slate-400">Tanpa foto struk</span>
            </div>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block px-1">
            Fitur Cerdas Unggulan
          </span>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-1.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Receipt size={16} />
              </div>
              <h3 className="font-bold text-xs text-slate-900">Multi-Shot Camera</h3>
              <p className="text-[10px] text-slate-500 leading-tight">
                Jepret hingga 5 shot struk panjang bersambung tanpa item ganda.
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-1.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Scale size={16} />
              </div>
              <h3 className="font-bold text-xs text-slate-900">Pajak Proporsional</h3>
              <p className="text-[10px] text-slate-500 leading-tight">
                Beban pajak terdistribusi adil sesuai porsi makan masing-masing.
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-1.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <QrCode size={16} />
              </div>
              <h3 className="font-bold text-xs text-slate-900">Live Meja QR</h3>
              <p className="text-[10px] text-slate-500 leading-tight">
                Teman di meja cukup scan QR untuk mencentang makanannya sendiri.
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-1.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <h3 className="font-bold text-xs text-slate-900">Klaim Kantor PDF</h3>
              <p className="text-[10px] text-slate-500 leading-tight">
                Ekspor formulir PDF reimbursement resmi lengkap dengan tanda tangan.
              </p>
            </div>
          </div>
        </div>

        {/* Riwayat Draft Transaksi Offline */}
        {drafts.length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Draft Transaksi ({drafts.length})
              </span>
              <span className="text-[10px] text-blue-600 font-semibold">Tersimpan di Ponsel</span>
            </div>

            <div className="space-y-2">
              {drafts.slice(0, 3).map((draft) => {
                const subtotal = draft.items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
                return (
                  <div
                    key={draft.id}
                    onClick={() => handleResumeDraft(draft)}
                    className="p-3.5 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 flex items-center justify-between shadow-sm cursor-pointer transition group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition">
                          {draft.merchantName}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{draft.items.length} Menu</span>
                        <span>•</span>
                        <span>{formatRupiah(subtotal)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => handleDeleteDraft(e, draft.id)}
                        className="p-1 text-slate-300 hover:text-red-600 rounded-lg transition"
                        title="Hapus draft"
                      >
                        <Trash2 size={15} />
                      </button>
                      <ChevronRight size={18} className="text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* User Auth Modal */}
      <UserAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}
