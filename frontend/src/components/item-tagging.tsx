"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Users,
  UserPlus,
  Check,
  ArrowRight,
  ArrowLeft,
  UserCheck,
  Tag,
  Sparkles,
  X,
  QrCode,
  Copy,
  CheckCircle2,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { useSplitBillStore } from "@/lib/store";
import { formatRupiah } from "@/lib/utils";
import { createLiveSession, getTableWebSocketUrl } from "@/lib/api";

export function ItemTagging() {
  const {
    transactionId,
    merchantName,
    items,
    participants,
    addParticipant,
    toggleItemAssignment,
    assignSelfToItem,
    setStep,
    setReceiptData,
  } = useSplitBillStore();

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("participant_self");
  const [newFriendName, setNewFriendName] = useState<string>("");
  const [newFriendEmail, setNewFriendEmail] = useState<string>("");
  const bottomSheetDialogRef = useRef<HTMLDialogElement | null>(null);

  // State Live Table QR
  const liveQrDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isOpeningLive, setIsOpeningLive] = useState<boolean>(false);
  const [liveTableCode, setLiveTableCode] = useState<string | null>(null);
  const [liveQrDataUrl, setLiveQrDataUrl] = useState<string | null>(null);
  const [liveJoinUrl, setLiveJoinUrl] = useState<string | null>(null);
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const [hostWsConnected, setHostWsConnected] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);

  // Buka Sesi Meja Kolaboratif
  const handleOpenLiveTable = async () => {
    if (!transactionId) {
      alert("Harap simpan struk terlebih dahulu untuk membuat sesi meja.");
      return;
    }

    setIsOpeningLive(true);
    try {
      const res = await createLiveSession(transactionId, "Saya (Host)");
      setLiveTableCode(res.data.tableCode);
      setLiveQrDataUrl(res.data.qrCodeDataUrl);
      setLiveJoinUrl(res.data.joinUrl);
      liveQrDialogRef.current?.showModal();
    } catch (err: any) {
      alert(err.message || "Gagal membuka sesi meja kolaboratif");
    } finally {
      setIsOpeningLive(false);
    }
  };

  // Sinkronisasi WebSocket di Host saat live table aktif
  useEffect(() => {
    if (!liveTableCode) return;

    const wsUrl = getTableWebSocketUrl(liveTableCode);
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setHostWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "table:state-update" && payload.data) {
          const remoteState = payload.data;

          // Sinkronisasikan participants baru yang bergabung dari HP mereka
          if (remoteState.participants) {
            remoteState.participants.forEach((rp: any) => {
              if (rp.id !== "participant_host") {
                const existing = participants.find(
                  (p) => p.id === rp.id || p.fullName.toLowerCase() === rp.fullName.toLowerCase()
                );
                if (!existing) {
                  addParticipant(rp.fullName);
                }
              }
            });
          }

          // Sinkronisasikan assigned items
          if (remoteState.items) {
            setReceiptData({
              items: remoteState.items.map((it: any) => ({
                id: it.id,
                itemName: it.itemName,
                quantity: it.quantity,
                itemPrice: it.itemPrice,
                totalPrice: it.totalPrice,
              })),
            });
          }
        }
      } catch (err) {
        console.warn("Host WS parse error:", err);
      }
    };

    ws.onclose = () => {
      setHostWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [liveTableCode]);

  const openAddFriendModal = () => {
    setNewFriendName("");
    setNewFriendEmail("");
    bottomSheetDialogRef.current?.showModal();
  };

  const handleAddFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendName.trim()) return;

    const newId = addParticipant(newFriendName.trim(), newFriendEmail.trim() || undefined);
    setSelectedParticipantId(newId);
    bottomSheetDialogRef.current?.close();
  };

  const handleAssignAllUntagged = () => {
    for (const item of items) {
      if (item.assignedParticipantIds.length === 0) {
        toggleItemAssignment(item.id, selectedParticipantId);
      }
    }
  };

  const handleCopyJoinLink = async () => {
    if (!liveJoinUrl) return;
    try {
      await navigator.clipboard.writeText(liveJoinUrl);
      setCopyLinkSuccess(true);
      setTimeout(() => setCopyLinkSuccess(false), 2500);
    } catch {}
  };

  const totalAssignedItems = items.filter((it) => it.assignedParticipantIds.length > 0).length;

  return (
    <div className="flex flex-col flex-1 bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setStep(2)}
          className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
          title="Kembali ke Review Struk"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-slate-900">Bagi Tagihan ke Teman</h1>
          <p className="text-[11px] text-slate-500">
            Langkah 3 dari 4: {totalAssignedItems}/{items.length} item terbagi
          </p>
        </div>

        {/* Live Session QR Button */}
        <button
          onClick={handleOpenLiveTable}
          disabled={isOpeningLive}
          className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition flex items-center gap-1 text-xs font-bold"
          title="Buka QR Meja Kolaboratif"
        >
          <QrCode size={18} />
          <span className="hidden xs:inline">QR Meja</span>
        </button>
      </div>

      {/* Quick Tagging Bar: Participant Avatar Chips */}
      <div className="sticky top-[57px] z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Users size={13} className="text-blue-600" />
            Pilih Peserta untuk Menandai:
          </span>
          <button
            onClick={openAddFriendModal}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition"
          >
            <UserPlus size={13} />
            + Teman Baru
          </button>
        </div>

        {/* Chips Horizontal Scroll */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {participants.map((p) => {
            const isSelected = selectedParticipantId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedParticipantId(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-sm ${
                  isSelected
                    ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-1"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isSelected ? "bg-white text-blue-600" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {p.fullName.charAt(0).toUpperCase()}
                </div>
                <span>{p.isSelf ? "Saya" : p.fullName}</span>
                {isSelected && <Check size={13} className="ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items List with Tagging Buttons */}
      <div className="p-4 space-y-3 flex-1">
        {/* Quick bulk action info */}
        <div className="flex items-center justify-between bg-blue-50/80 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-900">
          <span className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-blue-600" />
            Menandai untuk:{" "}
            <strong>
              {participants.find((p) => p.id === selectedParticipantId)?.fullName}
            </strong>
          </span>
          <button
            onClick={handleAssignAllUntagged}
            className="text-[11px] font-semibold text-blue-700 underline hover:text-blue-900"
          >
            Tag yang kosong
          </button>
        </div>

        {/* Items Card */}
        {items.map((item) => {
          const isSelectedPersonAssigned = item.assignedParticipantIds.includes(
            selectedParticipantId
          );
          const assignedCount = item.assignedParticipantIds.length;
          const sharePerPerson =
            assignedCount > 0 ? Math.round(item.totalPrice / assignedCount) : item.totalPrice;

          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl p-4 border transition-all shadow-sm space-y-2.5 ${
                assignedCount === 0
                  ? "border-amber-200 bg-amber-50/30"
                  : isSelectedPersonAssigned
                  ? "border-blue-400 ring-1 ring-blue-400/50"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{item.itemName}</h3>
                  <p className="text-xs text-slate-500">
                    {item.quantity} x {formatRupiah(item.itemPrice)} ={" "}
                    <strong className="text-slate-700">{formatRupiah(item.totalPrice)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Quick 1-tap "Milik Saya" Button */}
                  <button
                    onClick={() => assignSelfToItem(item.id)}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border transition ${
                      item.assignedParticipantIds.includes("participant_self")
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                    title="Tandai Milik Saya"
                  >
                    <UserCheck size={14} />
                    Milik Saya
                  </button>

                  {/* Toggle Active Participant Button */}
                  <button
                    onClick={() => toggleItemAssignment(item.id, selectedParticipantId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm ${
                      isSelectedPersonAssigned
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {isSelectedPersonAssigned ? <Check size={14} /> : <Tag size={14} />}
                    {isSelectedPersonAssigned ? "Terpilih" : "+ Tag"}
                  </button>
                </div>
              </div>

              {/* Tagged Participants Breakdown Badges */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {assignedCount === 0 ? (
                    <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                      ⚠️ Belum ada yang patungan
                    </span>
                  ) : (
                    item.assignedParticipantIds.map((pId) => {
                      const person = participants.find((p) => p.id === pId);
                      if (!person) return null;
                      return (
                        <span
                          key={pId}
                          onClick={() => toggleItemAssignment(item.id, pId)}
                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 text-[11px] font-medium px-2 py-0.5 rounded-full cursor-pointer transition"
                          title="Klik untuk menghapus tag peserta ini"
                        >
                          {person.isSelf ? "Saya" : person.fullName}
                          <X size={11} className="text-slate-400 hover:text-red-600" />
                        </span>
                      );
                    })
                  )}
                </div>

                {assignedCount > 0 && (
                  <span className="text-[11px] text-slate-500 font-medium ml-auto">
                    Dibagi {assignedCount} org:{" "}
                    <strong className="text-blue-600">{formatRupiah(sharePerPerson)}</strong>/org
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Sticky Action: Hitung Tagihan */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg flex items-center gap-3">
        <button
          onClick={() => setStep(4)}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-[0.98] transition"
        >
          Hitung & Selesaikan Pembagian Tagihan
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Modal Dialog: Sesi Meja Kolaboratif QR Code (Step 6) */}
      <dialog
        ref={liveQrDialogRef}
        aria-labelledby="qr-dialog-title"
        className="w-[92%] max-w-sm rounded-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <QrCode size={18} />
            </div>
            <div>
              <h2 id="qr-dialog-title" className="text-base font-bold text-slate-900">
                Sesi Meja Kolaboratif
              </h2>
              <p className="text-[11px] text-slate-500">Teman di meja bisa scan & centang sendiri</p>
            </div>
          </div>
          <button
            onClick={() => liveQrDialogRef.current?.close()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-center space-y-4">
          {liveQrDataUrl ? (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <img
                src={liveQrDataUrl}
                alt="QR Code Meja"
                className="w-52 h-52 mx-auto rounded-xl"
              />
            </div>
          ) : (
            <div className="w-52 h-52 bg-slate-100 animate-pulse rounded-2xl mx-auto flex items-center justify-center text-slate-400 text-xs">
              Menyiapkan QR Code...
            </div>
          )}

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Kode Meja
            </span>
            <span className="text-2xl font-black text-blue-600 tracking-wider">
              {liveTableCode || "---"}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-50 py-1.5 px-3 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live WebSocket Aktif • Tersinkronisasi Otomatis</span>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleCopyJoinLink}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
            >
              {copyLinkSuccess ? (
                <CheckCircle2 size={16} className="text-emerald-600" />
              ) : (
                <Copy size={16} />
              )}
              {copyLinkSuccess ? "Tautan Meja Tersalin!" : "Salin Tautan Meja"}
            </button>

            {liveJoinUrl && (
              <a
                href={liveJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition text-center"
              >
                <span>Buka Layar Tamu di Tab Baru</span>
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </dialog>

      {/* Slide-up Bottom Sheet Modal: Tambah Teman Baru */}
      <dialog
        ref={bottomSheetDialogRef}
        aria-labelledby="bottom-sheet-title"
        className="w-full max-w-md rounded-t-3xl bg-white text-slate-900 p-6 shadow-2xl backdrop:bg-slate-900/60 mt-auto mb-0"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <UserPlus size={18} />
            </div>
            <div>
              <h2 id="bottom-sheet-title" className="text-base font-bold text-slate-900">
                Tambah Teman Baru
              </h2>
              <p className="text-[11px] text-slate-500">Cukup masukkan nama tanpa perlu buat akun</p>
            </div>
          </div>
          <button
            onClick={() => bottomSheetDialogRef.current?.close()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleAddFriendSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap / Panggilan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newFriendName}
              onChange={(e) => setNewFriendName(e.target.value)}
              placeholder="Contoh: Budi, Sarah, Dimas"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email (Opsional untuk kirim ringkasan)
            </label>
            <input
              type="email"
              value={newFriendEmail}
              onChange={(e) => setNewFriendEmail(e.target.value)}
              placeholder="budi@example.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => bottomSheetDialogRef.current?.close()}
              className="w-1/3 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="w-2/3 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md shadow-blue-500/20 transition"
            >
              Simpan Teman
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
