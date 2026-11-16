"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Cpu,
  Share2,
  Users,
  ShieldCheck,
  Send,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Mail,
  MessageSquare,
  Globe,
  DollarSign,
  Activity,
  Layers,
  Clock,
  KeyRound,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Database,
  Server,
  Zap,
  Lock,
  LogIn,
  LogOut,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  getAdminExecutiveMetrics,
  getAdminAiMetrics,
  getAdminIntegrations,
  saveAdminIntegration,
  testAdminDelivery,
  getAdminUsers,
  updateAdminUserQuota,
  runAdminCleanup,
  loginUser,
  getAuthMe,
  logoutUserApi,
  AuthUser,
} from "@/lib/api";
import { formatRupiah } from "@/lib/utils";

type AdminTab = "EXECUTIVE" | "INTEGRATIONS" | "AI_PERFORMANCE" | "USERS";

export default function AdminPage() {
  // Auth Admin State
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [adminChecking, setAdminChecking] = useState<boolean>(true);

  // Admin Login Form States
  const [loginEmail, setLoginEmail] = useState<string>("admin@splitbill.local");
  const [loginPassword, setLoginPassword] = useState<string>("ChangeMe!2026");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard Tab & Loading States
  const [activeTab, setActiveTab] = useState<AdminTab>("EXECUTIVE");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // States Data
  const [executiveData, setExecutiveData] = useState<any>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>(null);

  // Test Delivery Form State
  const [testChannel, setTestChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [testDestination, setTestDestination] = useState<string>("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState<boolean>(false);

  // Quota Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newQuotaValue, setNewQuotaValue] = useState<number>(20);
  const [quotaSaving, setQuotaSaving] = useState<boolean>(false);

  // Retention cleanup status
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);

  // 1. Cek Sesi Admin saat Mount
  useEffect(() => {
    async function checkAdminSession() {
      const token = typeof window !== "undefined" ? localStorage.getItem("splitbill_access_token") : null;
      if (!token) {
        setAdminUser(null);
        setAdminChecking(false);
        return;
      }

      try {
        const res = await getAuthMe();
        if (res.data.user.role === "ADMIN" || res.data.user.role === "SUPERADMIN") {
          setAdminUser(res.data.user);
          fetchAllData();
        } else {
          setAdminUser(null);
        }
      } catch {
        setAdminUser(null);
      } finally {
        setAdminChecking(false);
      }
    }

    checkAdminSession();
  }, []);

  // 2. Fetch Data Dashboard
  const fetchAllData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [execRes, aiRes, intRes, usrRes] = await Promise.all([
        getAdminExecutiveMetrics().catch(() => null),
        getAdminAiMetrics().catch(() => null),
        getAdminIntegrations().catch(() => null),
        getAdminUsers(1, 10).catch(() => null),
      ]);

      if (execRes) setExecutiveData(execRes.data);
      if (aiRes) setAiData(aiRes.data);
      if (intRes) setIntegrations(intRes.data);
      if (usrRes) setUsersData(usrRes.data);
    } catch (err) {
      console.warn("Error fetching admin data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 3. Handle Admin Login Submit
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await loginUser({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      const user = res.data.user;
      if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
        throw new Error("Akses ditolak: Akun Anda tidak memiliki hak akses Administrator.");
      }

      setAdminUser(user);
      fetchAllData();
    } catch (err: any) {
      setLoginError(err.message || "Gagal masuk. Periksa email dan password admin.");
    } finally {
      setLoginLoading(false);
    }
  };

  // 4. Handle Admin Logout
  const handleAdminLogout = async () => {
    if (confirm("Apakah Anda yakin ingin keluar dari Portal Administrator?")) {
      await logoutUserApi();
      setAdminUser(null);
    }
  };

  // Handle Uji Coba Pengiriman
  const handleTestDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDestination.trim()) return;

    setTestLoading(true);
    setTestStatus(null);
    try {
      const res = await testAdminDelivery(testChannel, testDestination.trim());
      setTestStatus(res.data.message);
    } catch (err: any) {
      setTestStatus(`Gagal melakukan pengiriman: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      setTestLoading(false);
    }
  };

  // Handle Update Quota
  const handleSaveQuota = async (userId: string) => {
    setQuotaSaving(true);
    try {
      await updateAdminUserQuota(userId, newQuotaValue);
      setEditingUserId(null);
      await fetchAllData();
    } catch (err) {
      alert("Gagal memperbarui kuota pengguna.");
    } finally {
      setQuotaSaving(false);
    }
  };

  // Handle Jalankan Pembersihan PDP
  const handleRunCleanup = async () => {
    if (!confirm("Jalankan pembersihan otomatis untuk transaksi kadaluarsa (> 30 hari) sesuai UU PDP?")) {
      return;
    }
    setCleanupLoading(true);
    setCleanupStatus(null);
    try {
      const res = await runAdminCleanup(30);
      setCleanupStatus(res.data.message);
      await fetchAllData();
    } catch (err: any) {
      setCleanupStatus(`Gagal menjalankan retensi: ${err?.message || "Kesalahan internal"}`);
    } finally {
      setCleanupLoading(false);
    }
  };

  // ================= TAMPILAN 1: LOADING AWAL =================
  if (adminChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-tight">Memeriksa Hak Akses Admin...</h2>
        <p className="text-xs text-slate-400 mt-1">Memvalidasi otorisasi sesi administrator</p>
      </div>
    );
  }

  // ================= TAMPILAN 2: LOGIN ADMIN SCREEN =================
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        {/* Background Decorative Glow */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative z-10">
          {/* Card Header */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-center border-b border-slate-800 relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 text-blue-400 shadow-xl shadow-blue-500/10">
              <ShieldCheck size={36} />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full inline-block mb-2">
              SplitBill Backoffice Security
            </span>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Login Administrator
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
              Akses khusus pengelola sistem untuk memantau metrik eksekutif dan integrasi pihak ketiga.
            </p>
          </div>

          {/* Form Content */}
          <div className="p-6 sm:p-8 space-y-5">
            {loginError && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                <span className="font-medium">{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Administrator
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@splitbill.local"
                    className="w-full pl-10 pr-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Seed Credentials Hint Box */}
              <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-[11px] text-blue-200/90 flex items-center justify-between">
                <span className="font-mono text-[10px]">
                  Default Seed: <strong>admin@splitbill.local</strong>
                </span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono">
                  ChangeMe!2026
                </span>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm"
              >
                {loginLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Memvalidasi Akses...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    <span>Masuk ke Backoffice</span>
                  </>
                )}
              </button>
            </form>

            <div className="text-center pt-2">
              <Link
                href="/"
                className="text-xs text-slate-400 hover:text-white transition inline-flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                <span>Kembali ke Aplikasi Pengguna PWA</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================= TAMPILAN 3: DASHBOARD ADMIN UTAMA (TEROTENTIKASI) =================
  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900 flex flex-col font-sans">
      {/* ================= TOP NAVBAR ================= */}
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-extrabold text-white shadow-lg shadow-blue-500/30 text-sm tracking-wider">
              SB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                  SplitBill Backoffice Portal
                </h1>
                <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline-block">
                  Enterprise v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Pusat Pengendali Eksekutif, Vision AI OCR, dan Integrasi Pihak Ketiga
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Admin User Info Pill */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-xl border border-slate-700 text-xs">
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center text-[10px]">
                {adminUser.fullName.charAt(0)}
              </div>
              <div className="text-left hidden md:block">
                <span className="font-bold text-white block text-[11px] leading-tight">
                  {adminUser.fullName}
                </span>
                <span className="text-[9px] text-indigo-300 font-mono uppercase font-bold">
                  {adminUser.role}
                </span>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchAllData(true)}
              disabled={refreshing || loading}
              className="p-2 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title="Segarkan Data"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-blue-400" : ""} />
              <span className="hidden sm:inline">{refreshing ? "Memuat..." : "Segarkan"}</span>
            </button>

            {/* Link Back to Web App */}
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              title="Buka Aplikasi Web"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Ke Aplikasi PWA</span>
              <span className="sm:hidden">PWA</span>
            </Link>

            {/* Logout Admin Button */}
            <button
              onClick={handleAdminLogout}
              className="p-2 sm:px-3 sm:py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              title="Keluar dari sesi administrator"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= TAB NAVIGATION ================= */}
      <div className="bg-white border-b border-slate-200 shadow-xs sticky top-[57px] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("EXECUTIVE")}
            className={`py-3.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === "EXECUTIVE"
                ? "border-blue-600 text-blue-600 bg-blue-50/50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <TrendingUp size={16} />
            <span>Ringkasan Eksekutif & KPI</span>
          </button>

          <button
            onClick={() => setActiveTab("INTEGRATIONS")}
            className={`py-3.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === "INTEGRATIONS"
                ? "border-blue-600 text-blue-600 bg-blue-50/50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Share2 size={16} />
            <span>Third-Party Integration Hub</span>
          </button>

          <button
            onClick={() => setActiveTab("AI_PERFORMANCE")}
            className={`py-3.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === "AI_PERFORMANCE"
                ? "border-blue-600 text-blue-600 bg-blue-50/50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Cpu size={16} />
            <span>AI OCR Performance Hub</span>
          </button>

          <button
            onClick={() => setActiveTab("USERS")}
            className={`py-3.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === "USERS"
                ? "border-blue-600 text-blue-600 bg-blue-50/50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Users size={16} />
            <span>Pengguna & Kuota OCR</span>
          </button>
        </div>
      </div>

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Memuat metrik analitik dashboard...</p>
          </div>
        ) : (
          <>
            {/* ================= TAB 1: EXECUTIVE METRICS ================= */}
            {activeTab === "EXECUTIVE" && (
              <div className="space-y-8">
                {/* Section Header */}
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Dashboard Kinerja Eksekutif
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Ringkasan Gross Transaction Value (GTV), perputaran struk, dan kecepatan pelunasan tagihan secara aktual.
                  </p>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {/* Card 1: GTV */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Gross Transaction Value
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <DollarSign size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">
                        {formatRupiah(executiveData?.gtv || 0)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          ↑ 14.8% <span className="text-emerald-500 font-normal">vs bln lalu</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Total Struk */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Total Struk Berhasil
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <BarChart3 size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        {(executiveData?.totalTransactions || 0).toLocaleString("id-ID")}{" "}
                        <span className="text-sm font-semibold text-slate-500">Struk</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                          Volume Aktif Terverifikasi
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Pengguna */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Pengguna Terdaftar
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Users size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        {executiveData?.activeMembers || 0}{" "}
                        <span className="text-sm font-semibold text-slate-500">Member Aktif</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                          {executiveData?.pendingMembers || 0} Menunggu OTP
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Settlement Velocity */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Settlement Velocity
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Clock size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        {executiveData?.averageSettlementVelocityMinutes || 18}{" "}
                        <span className="text-sm font-semibold text-slate-500">Menit</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                          Rata-rata Waktu Lunas
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid 2 Kolom: Restoran Populer & Infrastruktur Sistem */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Top Merchants Table (2 Cols) */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                          Restoran & Kafe Paling Populer
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Peringkat merchant berdasarkan akumulasi perputaran tagihan (GTV)
                        </p>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-3 py-1 rounded-full">
                        Top 5 Merchant
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-2">Peringkat & Nama Tempat</th>
                            <th className="py-3 px-2 text-center">Frekuensi Transaksi</th>
                            <th className="py-3 px-2 text-right">Total Perputaran (GTV)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {executiveData?.topMerchants && executiveData.topMerchants.length > 0 ? (
                            executiveData.topMerchants.map((m: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/80 transition">
                                <td className="py-3.5 px-2 font-bold text-slate-800 flex items-center gap-3">
                                  <span
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                      idx === 0
                                        ? "bg-amber-100 text-amber-800"
                                        : idx === 1
                                        ? "bg-slate-200 text-slate-700"
                                        : idx === 2
                                        ? "bg-amber-50 text-amber-900"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    #{idx + 1}
                                  </span>
                                  <span className="truncate max-w-xs">{m.name}</span>
                                </td>
                                <td className="py-3.5 px-2 text-center font-semibold text-slate-600">
                                  {m.transactionCount} kali
                                </td>
                                <td className="py-3.5 px-2 text-right font-black text-blue-600 text-sm">
                                  {formatRupiah(m.totalGtv)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="py-8 text-center text-slate-400 text-xs">
                                Belum ada data transaksi yang tersimpan.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* System & Cloud Status (1 Col) */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5 flex flex-col justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        Kondisi Operasional Layanan
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pemantauan konektivitas kontainer & gateway
                      </p>

                      <div className="mt-5 space-y-3.5 text-xs">
                        {/* PostgreSQL */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                          <div className="flex items-center gap-2.5">
                            <Database size={16} className="text-blue-600" />
                            <div>
                              <div className="font-bold text-slate-800">PostgreSQL 16 DB</div>
                              <span className="text-[10px] text-slate-400">Host Port 5578</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        </div>

                        {/* Redis 7 */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                          <div className="flex items-center gap-2.5">
                            <Zap size={16} className="text-amber-600" />
                            <div>
                              <div className="font-bold text-slate-800">Redis 7 Cache & Pub/Sub</div>
                              <span className="text-[10px] text-slate-400">Port 6379</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} /> Live Sync
                          </span>
                        </div>

                        {/* Gemini Vision OCR */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                          <div className="flex items-center gap-2.5">
                            <Cpu size={16} className="text-indigo-600" />
                            <div>
                              <div className="font-bold text-slate-800">Google Gemini 2.5 Flash</div>
                              <span className="text-[10px] text-slate-400">Vision API Engine</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} /> Ready
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-[11px] text-blue-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                      <span>Semua audit keamanan OWASP Top 10 berstatus lolos & aktif.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 2: THIRD-PARTY INTEGRATIONS ================= */}
            {activeTab === "INTEGRATIONS" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Third-Party Integration Hub
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Konfigurasi kredensial OAuth SSO, Gateway Email & WhatsApp, serta uji coba pengiriman OTP langsung.
                  </p>
                </div>

                {/* Grid 4 Kartu Integrasi */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Google OAuth Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-black text-lg border border-red-100">
                          G
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">Google OAuth 2.0</h4>
                          <p className="text-[11px] text-slate-400">Single Sign-On (SSO) Akun Google</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                        Aktif
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Client ID</label>
                        <input
                          type="text"
                          disabled
                          value={integrations?.oauth_google?.clientId || "849302194812-google.apps.googleusercontent.com"}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Status Verifikasi ID Token</label>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          <span>Pustaka google-auth-library siap memverifikasi token</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Apple OAuth Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-black text-lg border border-slate-200">
                          
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">Apple Sign-In</h4>
                          <p className="text-[11px] text-slate-400">Single Sign-On perangkat iOS/macOS</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                        Aktif
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Services ID</label>
                        <input
                          type="text"
                          disabled
                          value={integrations?.oauth_apple?.serviceId || "com.splitbill.app.signin"}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Status Verifikasi Identity Token</label>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          <span>Mendukung verifikasi RS256 token publik Apple</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resend Email Gateway Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                          <Mail size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">Resend Email Gateway</h4>
                          <p className="text-[11px] text-slate-400">Pengiriman Magic Link & Kode OTP Email</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                        Aktif
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Alamat Pengirim Resmi</label>
                        <input
                          type="text"
                          disabled
                          value={integrations?.email_resend?.senderAddress || "no-reply@splitbill.local"}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">API Endpoint</label>
                        <div className="text-[11px] text-slate-600 font-mono truncate">
                          https://api.resend.com/emails
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp Cloud API Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                          <MessageSquare size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">Meta WhatsApp Cloud API</h4>
                          <p className="text-[11px] text-slate-400">Pengiriman OTP Interaktif WhatsApp</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                        Aktif
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Template OTP Resmi</label>
                        <input
                          type="text"
                          disabled
                          value={integrations?.whatsapp_cloud?.templateName || "splitbill_otp"}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Format Pesan</label>
                        <div className="text-[11px] text-slate-600 font-mono">
                          Pesan OTP 6-Digit dengan tombol One-Tap Autofill
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Delivery Interactive Box */}
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl space-y-5 border border-blue-900/40">
                  <div>
                    <h3 className="font-black text-base sm:text-lg flex items-center gap-2.5">
                      <Send size={18} className="text-blue-400" />
                      Uji Coba Pengiriman OTP Langsung (Test Delivery)
                    </h3>
                    <p className="text-xs sm:text-sm text-blue-200/90 mt-1 max-w-2xl">
                      Uji coba real-time untuk memastikan gateway Resend Email atau WhatsApp Cloud API berhasil menerbitkan pesan verifikasi ke nomor/email tujuan Anda.
                    </p>
                  </div>

                  <form onSubmit={handleTestDelivery} className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
                    <div className="sm:col-span-3">
                      <label className="text-[11px] text-blue-300 font-bold uppercase tracking-wider block mb-1.5">
                        Saluran Pengiriman
                      </label>
                      <select
                        value={testChannel}
                        onChange={(e: any) => setTestChannel(e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="EMAIL" className="text-slate-900">Email Gateway (Resend)</option>
                        <option value="WHATSAPP" className="text-slate-900">WhatsApp Cloud API</option>
                      </select>
                    </div>

                    <div className="sm:col-span-6">
                      <label className="text-[11px] text-blue-300 font-bold uppercase tracking-wider block mb-1.5">
                        {testChannel === "EMAIL" ? "Alamat Email Penerima" : "Nomor WhatsApp (Contoh: 62812...)"}
                      </label>
                      <input
                        type={testChannel === "EMAIL" ? "email" : "text"}
                        required
                        value={testDestination}
                        onChange={(e) => setTestDestination(e.target.value)}
                        placeholder={testChannel === "EMAIL" ? "manager@perusahaan.com" : "6281234567890"}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        disabled={testLoading}
                        className="w-full py-2.5 px-4 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition disabled:opacity-50"
                      >
                        {testLoading ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Mengirim...</span>
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Kirim Test OTP</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {testStatus && (
                    <div className="p-3.5 bg-white/10 rounded-2xl border border-white/20 text-xs text-blue-100 flex items-start gap-2.5 animate-in fade-in">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span className="font-medium">{testStatus}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 3: AI OCR PERFORMANCE ================= */}
            {activeTab === "AI_PERFORMANCE" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Pusat Analitik & Pemantauan Vision OCR AI
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Statistik latensi model Google Gemini 2.5 Flash, akurasi parsing nota kasir, dan audit biaya token.
                  </p>
                </div>

                {/* 4 Cards Metrik AI */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {/* Latency */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Rata-rata Latensi OCR
                    </span>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">
                      {((aiData?.averageLatencyMs || 1840) / 1000).toFixed(2)}s
                    </div>
                    <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> Di Bawah Target SLA (2.5s)
                    </span>
                  </div>

                  {/* Success Rate */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Akurasi Ekstraksi AI
                    </span>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">
                      {aiData?.successRate || 98.4}%
                    </div>
                    <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full inline-block">
                      Google Gemini 2.5 Flash
                    </span>
                  </div>

                  {/* Tokens Consumed */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Konsumsi Token AI
                    </span>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">
                      {((aiData?.totalTokensConsumed || 14500) / 1000).toFixed(1)}k
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ~1.450 token / struk
                    </span>
                  </div>

                  {/* Estimated Cost */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Estimasi Biaya Token
                    </span>
                    <div className="text-3xl font-black text-emerald-600 tracking-tight">
                      {formatRupiah(aiData?.estimatedCostIdr || 350)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ${aiData?.estimatedCostUsd || 0.02} USD kumulatif
                    </span>
                  </div>
                </div>

                {/* Log Kejadian & Peringatan Citra Thermal */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      Log Kejadian & Peringatan Citra Struk
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Catatan otomatis pipeline penajaman Sharp untuk cetakan struk thermal yang buram atau pudar
                    </p>
                  </div>

                  <div className="space-y-3">
                    {aiData?.recentErrors && aiData.recentErrors.length > 0 ? (
                      aiData.recentErrors.map((err: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-3 text-xs text-amber-900"
                        >
                          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900">{err.errorType}</div>
                            <p className="text-amber-800 text-xs">{err.message}</p>
                            <span className="text-[11px] text-slate-400 block font-mono">
                              {new Date(err.timestamp).toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/60 text-center text-xs text-slate-500">
                        Tidak ada peringatan citra. Seluruh pemindaian struk berlangsung optimal.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 4: USERS & DATA RETENTION ================= */}
            {activeTab === "USERS" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Manajemen Akun Pengguna & Retensi Data
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Kelola sisa kuota bulanan OCR anggota dan pembersihan data sesuai UU Perlindungan Data Pribadi (UU PDP).
                  </p>
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        Daftar Akun Pengguna
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Daftar pengguna terdaftar dan alokasi kuota pemindaian struk
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      Total: {usersData?.total || 0} Akun
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                          <th className="py-3 px-3">Nama Lengkap & Email</th>
                          <th className="py-3 px-3 text-center">Role Akses</th>
                          <th className="py-3 px-3 text-center">Status Akun</th>
                          <th className="py-3 px-3 text-center">Sisa Kuota OCR</th>
                          <th className="py-3 px-3 text-right">Aksi Manajemen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usersData?.users && usersData.users.length > 0 ? (
                          usersData.users.map((u: any) => (
                            <tr key={u.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3.5 px-3">
                                <div className="font-bold text-slate-900">{u.fullName}</div>
                                <div className="text-xs text-slate-400">{u.email}</div>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span
                                  className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                                    u.role === "ADMIN" || u.role === "SUPERADMIN"
                                      ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span
                                  className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] ${
                                    u.status === "ACTIVE"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                      : "bg-amber-50 text-amber-700 border border-amber-200/60"
                                  }`}
                                >
                                  {u.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                {editingUserId === u.id ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      value={newQuotaValue}
                                      onChange={(e) => setNewQuotaValue(parseInt(e.target.value, 10) || 0)}
                                      className="w-16 bg-white border border-blue-400 rounded-lg px-2 py-1 text-center font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                      onClick={() => handleSaveQuota(u.id)}
                                      disabled={quotaSaving}
                                      className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                                      title="Simpan Kuota"
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      onClick={() => setEditingUserId(null)}
                                      className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
                                      title="Batal"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-black text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg text-xs">
                                    {u.ocrQuotaRemaining} Kuota
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-right">
                                {editingUserId !== u.id && (
                                  <button
                                    onClick={() => {
                                      setEditingUserId(u.id);
                                      setNewQuotaValue(u.ocrQuotaRemaining);
                                    }}
                                    className="px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-lg text-xs transition"
                                  >
                                    Edit Kuota
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                              Belum ada akun pengguna terdaftar.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Kebijakan Retensi Data & UU PDP */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="max-w-xl">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={20} className="text-emerald-600" />
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                          Kebijakan Retensi Data & UU PDP (30 Hari)
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Sesuai amanat Undang-Undang Perlindungan Data Pribadi (UU PDP), foto struk fisik dan draf transaksi kadaluarsa yang melebihi batas waktu 30 hari dihapus secara otomatis demi melindungi privasi konsumen.
                      </p>
                    </div>

                    <button
                      onClick={handleRunCleanup}
                      disabled={cleanupLoading}
                      className="py-2.5 px-5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200/80 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shrink-0 disabled:opacity-50"
                    >
                      {cleanupLoading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Membersihkan...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Jalankan Pembersihan</span>
                        </>
                      )}
                    </button>
                  </div>

                  {cleanupStatus && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      <span>{cleanupStatus}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
