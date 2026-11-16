"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Utensils,
  CheckCircle2,
  Users,
  Store,
  Sparkles,
  Wifi,
  WifiOff,
  ArrowRight,
  User,
  ShieldCheck,
  Tag,
} from "lucide-react";
import {
  getLiveSession,
  joinTableSession,
  toggleTableItem,
  getTableWebSocketUrl,
} from "@/lib/api";
import { formatRupiah } from "@/lib/utils";

interface TableItem {
  id: string;
  itemName: string;
  quantity: number;
  itemPrice: number;
  totalPrice: number;
  assignedParticipantIds: string[];
}

interface TableParticipant {
  id: string;
  fullName: string;
  isHost?: boolean;
}

interface TableState {
  transactionId: string;
  tableCode: string;
  merchantName: string;
  receiptDate?: string;
  items: TableItem[];
  participants: TableParticipant[];
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  roundingAmount: number;
  finalTotal: number;
}

export default function JoinTablePage() {
  const params = useParams();
  const rawCode = params?.tableCode as string;
  const tableCode = rawCode ? decodeURIComponent(rawCode).toUpperCase() : "";

  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Status Tamu
  const [myParticipant, setMyParticipant] = useState<TableParticipant | null>(null);
  const [inputName, setInputName] = useState<string>("");
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);

  // Ambil state awal sesi meja
  useEffect(() => {
    if (!tableCode) return;

    let isMounted = true;
    async function fetchSession() {
      try {
        setLoading(true);
        const res = await getLiveSession(tableCode);
        if (isMounted) {
          setState(res.data);
          setErrorMsg(null);

          // Cek apakah user sudah pernah join di session storage
          const stored = sessionStorage.getItem(`splitbill_participant_${tableCode}`);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setMyParticipant(parsed);
            } catch {}
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || "Gagal memuat sesi meja");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchSession();

    return () => {
      isMounted = false;
    };
  }, [tableCode]);

  // Setup WebSocket saat tamu sudah bergabung
  useEffect(() => {
    if (!tableCode || !myParticipant) return;

    const wsUrl = getTableWebSocketUrl(tableCode);
    if (!wsUrl) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    function connectWs() {
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Beritahu server bahwa kita bergabung
        ws?.send(
          JSON.stringify({
            type: "table:join",
            fullName: myParticipant?.fullName,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "table:state-update" && payload.data) {
            setState(payload.data);
          }
        } catch (err) {
          console.warn("WebSocket parse error:", err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Reconnect otomatis setelah 2 detik
        reconnectTimeout = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    }

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [tableCode, myParticipant]);

  // Aksi Join
  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim() || !tableCode) return;

    setIsJoining(true);
    try {
      const res = await joinTableSession(tableCode, inputName.trim());
      setMyParticipant(res.data.participant);
      setState(res.data.state);
      sessionStorage.setItem(
        `splitbill_participant_${tableCode}`,
        JSON.stringify(res.data.participant)
      );
    } catch (err: any) {
      alert(err.message || "Gagal bergabung ke meja");
    } finally {
      setIsJoining(false);
    }
  };

  // Aksi Toggle Item
  const handleToggleItem = async (itemId: string) => {
    if (!myParticipant || !state) return;

    // Optimistic Update seketika
    const myId = myParticipant.id;
    setState((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((it) => {
        if (it.id !== itemId) return it;
        const exists = it.assignedParticipantIds.includes(myId);
        return {
          ...it,
          assignedParticipantIds: exists
            ? it.assignedParticipantIds.filter((id) => id !== myId)
            : [...it.assignedParticipantIds, myId],
        };
      });
      return { ...prev, items: updatedItems };
    });

    // Kirim via WebSocket jika terhubung, atau fallback ke HTTP
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "table:item-toggle",
          participantId: myId,
          itemId,
        })
      );
    } else {
      try {
        await toggleTableItem(tableCode, myId, itemId);
      } catch (err) {
        console.warn("HTTP fallback toggle failed:", err);
      }
    }
  };

  // Kalkulasi porsi pribadi tamu
  const myAssignedItems =
    state?.items.filter(
      (it) => myParticipant && it.assignedParticipantIds.includes(myParticipant.id)
    ) || [];

  const myBaseTotal = myAssignedItems.reduce((acc, it) => {
    const shareCount = it.assignedParticipantIds.length || 1;
    return acc + Math.round(it.totalPrice / shareCount);
  }, 0);

  if (loading) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800">Menghubungkan ke Meja...</h2>
        <p className="text-xs text-slate-500 mt-1">Mengambil daftar pesanan dari kasir</p>
      </div>
    );
  }

  if (errorMsg || !state) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
          <Utensils size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Sesi Meja Tidak Ditemukan</h2>
        <p className="text-xs text-slate-600 mt-1 mb-6">
          {errorMsg || "Kode meja salah atau sesi kolaborasi telah ditutup oleh pemilik tagihan."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="py-2.5 px-6 bg-blue-600 text-white font-semibold rounded-xl text-sm"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  // Layar 1: Tamu Memasukkan Nama Panggilan
  if (!myParticipant) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col p-5">
        <div className="my-auto max-w-sm mx-auto w-full space-y-6">
          {/* Header Card */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
              <Store size={32} />
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider inline-block">
              Sesi Meja: {state.tableCode}
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {state.merchantName}
            </h1>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Yuk pilih makanan atau minuman yang kamu pesan langsung dari ponselmu tanpa perlu login!
            </p>
          </div>

          {/* Form Input Nama */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Siapa Nama Panggilanmu?
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    placeholder="Contoh: Budi, Sarah, Dimas"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isJoining || !inputName.trim()}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50"
              >
                <span>Mulai Pilih Pesanan</span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>

          <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Tanpa unduh aplikasi • Langsung tersambung ke meja</span>
          </div>
        </div>
      </div>
    );
  }

  // Layar 2: Tamu Memilih / Mencentang Item Pesanan
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col relative">
      <div className="flex-1 bg-slate-50 flex flex-col relative">
        {/* Top Bar Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-900">
                {state.merchantName}
              </span>
              <span className="text-[10px] bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-600">
                {state.tableCode}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Halo, <strong className="text-blue-600">{myParticipant.fullName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {wsConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-emerald-700 font-bold">Live Meja</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-amber-500" />
                <span className="text-[11px] text-amber-700">Tersinkron HTTP</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Participants Bar */}
      <div className="bg-blue-50/80 border-b border-blue-100 px-4 py-2 flex items-center justify-between text-xs text-blue-900">
        <span className="flex items-center gap-1.5 font-medium">
          <Users size={14} className="text-blue-600" />
          Teman di Meja ({state.participants.length}):
        </span>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {state.participants.map((p) => (
            <span
              key={p.id}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                p.id === myParticipant.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-blue-800 border border-blue-200"
              }`}
            >
              {p.fullName} {p.id === myParticipant.id ? "(Saya)" : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="p-4 space-y-3 flex-1 pb-28">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>Sentuh item untuk mencentang pesananmu:</span>
          <span>{state.items.length} Menu</span>
        </div>

        {state.items.map((item) => {
          const isSelectedByMe = item.assignedParticipantIds.includes(myParticipant.id);
          const shareCount = item.assignedParticipantIds.length;
          const sharePerPerson =
            shareCount > 0 ? Math.round(item.totalPrice / shareCount) : item.totalPrice;

          return (
            <div
              key={item.id}
              onClick={() => handleToggleItem(item.id)}
              className={`rounded-2xl p-4 border transition-all cursor-pointer shadow-sm relative overflow-hidden select-none active:scale-[0.99] ${
                isSelectedByMe
                  ? "bg-blue-50/50 border-blue-500 ring-2 ring-blue-500/20"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-slate-900">{item.itemName}</h3>
                  <p className="text-xs text-slate-500">
                    {item.quantity} x {formatRupiah(item.itemPrice)} ={" "}
                    <strong className="text-slate-800">{formatRupiah(item.totalPrice)}</strong>
                  </p>
                </div>

                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    isSelectedByMe
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  <CheckCircle2 size={20} />
                </div>
              </div>

              {/* Tagged Participants Badges */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {shareCount === 0 ? (
                    <span className="text-[10px] text-slate-400">Belum ada yang pesan</span>
                  ) : (
                    item.assignedParticipantIds.map((pId) => {
                      const person = state.participants.find((p) => p.id === pId);
                      if (!person) return null;
                      const isMe = person.id === myParticipant.id;
                      return (
                        <span
                          key={pId}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isMe
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {person.fullName}
                        </span>
                      );
                    })
                  )}
                </div>

                {shareCount > 0 && (
                  <span className="text-[11px] font-bold text-blue-600 ml-auto">
                    {formatRupiah(sharePerPerson)}/org
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Bar: Porsi Saya */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-200 p-4 shadow-2xl safe-bottom z-30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-[11px] text-slate-500 block">Porsi Makananmu:</span>
            <span className="text-xl font-black text-blue-600">
              {formatRupiah(myBaseTotal)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
              {myAssignedItems.length} Menu Dipilih
            </span>
          </div>
        </div>

        <p className="text-[10px] text-center text-slate-400">
          ✨ Pilihanmu tersinkronisasi otomatis ke kasir & teman di meja
        </p>
      </div>
      </div>
    </div>
  );
}
