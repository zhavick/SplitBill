"use client";

import React, { useState } from "react";
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  MessageSquare,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import {
  loginUser,
  registerUser,
  verifyUserOtp,
  resendUserOtp,
  AuthUser,
} from "@/lib/api";
import { useSplitBillStore } from "@/lib/store";

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "LOGIN" | "REGISTER";
}

type AuthMode = "LOGIN" | "REGISTER" | "VERIFY_OTP";

export function UserAuthModal({
  isOpen,
  onClose,
  initialMode = "LOGIN",
}: UserAuthModalProps) {
  const { setCurrentUser } = useSplitBillStore();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form States: Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Form States: Register
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regChannel, setRegChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");

  // Form States: OTP
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendingOtp, setResendingOtp] = useState(false);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await loginUser({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      setCurrentUser(res.data.user);
      setSuccessMsg(`Selamat datang kembali, ${res.data.user.fullName}!`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      if (err.message && err.message.includes("ACCOUNT_NOT_VERIFIED")) {
        setOtpEmail(loginEmail.trim());
        setMode("VERIFY_OTP");
        setErrorMsg("Akun belum diverifikasi. Silakan masukkan kode OTP yang telah dikirim.");
      } else {
        setErrorMsg(err.message || "Gagal masuk. Periksa email dan password Anda.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await registerUser({
        fullName: regFullName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        channel: regChannel,
        phoneNumber: regPhone.trim() || undefined,
      });

      setOtpEmail(regEmail.trim());
      setSuccessMsg(res.data.message || "Kode OTP berhasil dikirimkan!");
      setMode("VERIFY_OTP");
    } catch (err: any) {
      setErrorMsg(err.message || "Pendaftaran gagal. Pastikan format email dan password benar.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      setErrorMsg("Kode OTP harus terdiri dari 6 digit angka.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await verifyUserOtp({
        email: otpEmail.trim(),
        code: otpCode.trim(),
      });

      setCurrentUser(res.data.user);
      setSuccessMsg(`Akun berhasil diverifikasi! Selamat datang, ${res.data.user.fullName}.`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Kode OTP salah atau telah kadaluarsa.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpEmail) return;
    setResendingOtp(true);
    setErrorMsg(null);
    try {
      const res = await resendUserOtp(otpEmail);
      setSuccessMsg(res.data.message || "Kode OTP baru telah dikirimkan ke email/WhatsApp Anda.");
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim ulang OTP.");
    } finally {
      setResendingOtp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition z-10"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white text-center relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-lg">
            <ShieldCheck size={26} className="text-blue-200" />
          </div>
          <h3 className="text-xl font-black tracking-tight">
            {mode === "LOGIN" && "Masuk ke Akun Anda"}
            {mode === "REGISTER" && "Daftar Akun SplitBill"}
            {mode === "VERIFY_OTP" && "Verifikasi Kode OTP"}
          </h3>
          <p className="text-xs text-blue-100/90 mt-1 max-w-xs mx-auto">
            {mode === "LOGIN" && "Simpan riwayat struk, kuota ekstra AI OCR, dan kelola pelunasan QRIS."}
            {mode === "REGISTER" && "Dapatkan kuota scan struk gratis dan fitur pembagian tagihan lengkap."}
            {mode === "VERIFY_OTP" && `Masukkan 6-digit kode verifikasi yang dikirim ke ${otpEmail}`}
          </p>

          {/* Tab Switcher (Hanya tampil di mode LOGIN & REGISTER) */}
          {mode !== "VERIFY_OTP" && (
            <div className="grid grid-cols-2 bg-black/20 p-1 rounded-xl mt-4 max-w-xs mx-auto border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setMode("LOGIN");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-1.5 rounded-lg transition ${
                  mode === "LOGIN"
                    ? "bg-white text-blue-700 shadow"
                    : "text-blue-100 hover:text-white"
                }`}
              >
                Masuk (Login)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("REGISTER");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-1.5 rounded-lg transition ${
                  mode === "REGISTER"
                    ? "bg-white text-blue-700 shadow"
                    : "text-blue-100 hover:text-white"
                }`}
              >
                Daftar Baru
              </button>
            </div>
          )}
        </div>

        {/* Modal Body / Forms */}
        <div className="p-6 space-y-4">
          {/* Notification Messages */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-700 animate-in fade-in">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ================= FORM 1: LOGIN ================= */}
          {mode === "LOGIN" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1.5">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Memproses Masuk...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Akun</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="text-center text-slate-500 text-[11px] pt-1">
                Belum punya akun?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("REGISTER");
                    setErrorMsg(null);
                  }}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Daftar sekarang gratis
                </button>
              </div>
            </form>
          )}

          {/* ================= FORM 2: REGISTER ================= */}
          {mode === "REGISTER" && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="budi@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1">
                  Metode Pengiriman OTP
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegChannel("EMAIL")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      regChannel === "EMAIL"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <Mail size={14} />
                    <span>Email OTP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegChannel("WHATSAPP")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      regChannel === "WHATSAPP"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <MessageSquare size={14} />
                    <span>WhatsApp OTP</span>
                  </button>
                </div>
              </div>

              {regChannel === "WHATSAPP" && (
                <div>
                  <label className="block font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-1">
                    Nomor WhatsApp (Format: 628...)
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="6281234567890"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm mt-2"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Mendaftarkan Akun...</span>
                  </>
                ) : (
                  <>
                    <span>Daftar & Terima Kode OTP</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="text-center text-slate-500 text-[11px] pt-1">
                Sudah punya akun?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("LOGIN");
                    setErrorMsg(null);
                  }}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Masuk di sini
                </button>
              </div>
            </form>
          )}

          {/* ================= FORM 3: VERIFY OTP ================= */}
          {mode === "VERIFY_OTP" && (
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4 text-xs">
              <div className="text-center space-y-1">
                <span className="text-[11px] text-slate-500">
                  Kode 6-digit dikirimkan ke:
                </span>
                <div className="font-bold text-slate-900 bg-slate-100 py-1 px-3 rounded-lg inline-block">
                  {otpEmail}
                </div>
              </div>

              <div>
                <label className="block text-center font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-2">
                  Masukkan 6-Digit Kode OTP
                </label>
                <div className="relative max-w-xs mx-auto">
                  <input
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="• • • • • •"
                    className="w-full text-center tracking-[0.5em] text-2xl font-black py-3 bg-slate-50 border-2 border-blue-500/60 rounded-2xl text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Memverifikasi Kode...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Verifikasi & Aktifkan Akun</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMode("REGISTER");
                    setErrorMsg(null);
                  }}
                  className="text-slate-500 hover:underline"
                >
                  Ganti Email
                </button>

                <button
                  type="button"
                  disabled={resendingOtp}
                  onClick={handleResendOtp}
                  className="text-blue-600 font-bold hover:underline disabled:opacity-50"
                >
                  {resendingOtp ? "Mengirim ulang..." : "Kirim Ulang OTP"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
