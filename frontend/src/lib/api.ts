const API_BASE = "";

function getAuthHeader(): Record<string, string> {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("splitbill_access_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }
  return {};
}

// ================= AUTHENTICATION APIS (USER & ADMIN) =================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "GUEST" | "MEMBER" | "ADMIN" | "SUPERADMIN";
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  ocrQuotaRemaining?: number;
  avatarUrl?: string | null;
}

export async function loginUser(credentials: {
  email: string;
  password: string;
}): Promise<{
  status: string;
  data: {
    user: AuthUser;
    tokens: AuthTokens;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal masuk. Periksa email dan password.");
  }

  // Simpan token akses di localStorage
  if (typeof window !== "undefined" && json.data?.tokens?.accessToken) {
    localStorage.setItem("splitbill_access_token", json.data.tokens.accessToken);
    localStorage.setItem("splitbill_user_profile", JSON.stringify(json.data.user));
  }

  return json;
}

export async function registerUser(payload: {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  channel?: "EMAIL" | "WHATSAPP";
}): Promise<{
  status: string;
  data: {
    userId: string;
    status: string;
    verificationChannel: string;
    message: string;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Pendaftaran gagal. Periksa data Anda.");
  }
  return json;
}

export async function verifyUserOtp(payload: {
  email: string;
  code: string;
}): Promise<{
  status: string;
  data: {
    user: AuthUser;
    tokens: AuthTokens;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Kode OTP salah atau telah kadaluarsa.");
  }

  if (typeof window !== "undefined" && json.data?.tokens?.accessToken) {
    localStorage.setItem("splitbill_access_token", json.data.tokens.accessToken);
    localStorage.setItem("splitbill_user_profile", JSON.stringify(json.data.user));
  }

  return json;
}

export async function resendUserOtp(email: string): Promise<{
  status: string;
  data: { message: string };
}> {
  const res = await fetch(`${API_BASE}/api/v1/auth/resend-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal mengirim ulang kode OTP.");
  }
  return json;
}

export async function getAuthMe(): Promise<{
  status: string;
  data: {
    user: AuthUser;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { ...getAuthHeader() },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Sesi tidak valid.");
  }
  return json;
}

export async function logoutUserApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: { ...getAuthHeader() },
    });
  } catch (err) {
    // Abaikan galat jaringan saat logout
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem("splitbill_access_token");
      localStorage.removeItem("splitbill_user_profile");
      localStorage.removeItem("splitbill_admin_token");
    }
  }
}

export async function uploadReceiptShot(params: {
  transactionId?: string;
  shotOrder: number;
  file: Blob | File;
}): Promise<{
  success: boolean;
  data: {
    transactionId: string;
    shotId: string;
    shotOrder: number;
    filePath: string;
    thumbnailUrl: string;
    fileSizeBytes: number;
  };
}> {
  const formData = new FormData();
  if (params.transactionId) {
    formData.append("transactionId", params.transactionId);
  }
  formData.append("shotOrder", params.shotOrder.toString());
  formData.append("image", params.file, `shot_${params.shotOrder}.jpg`);

  const res = await fetch(`${API_BASE}/api/v1/receipts/upload-shot`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal mengunggah foto struk");
  }
  return json;
}

export async function processReceiptOcr(transactionId: string): Promise<{
  success: boolean;
  data: {
    transactionId: string;
    merchantName: string;
    transactionDate: string;
    rawSubtotal: number;
    calculatedSubtotal: number;
    taxAmount: number;
    serviceCharge: number;
    discountAmount: number;
    roundingAmount: number;
    finalTotal: number;
    hasDiscrepancy: boolean;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      itemPrice: number;
      totalPrice: number;
      confidenceScore: number;
    }>;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/receipts/process-ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ transactionId }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal memproses OCR struk");
  }
  return json;
}

export async function reviewReceipt(
  transactionId: string,
  payload: {
    merchantName: string;
    taxAmount: number;
    serviceCharge: number;
    discountAmount: number;
    roundingAmount: number;
    finalTotal: number;
    items: Array<{
      itemName: string;
      quantity: number;
      itemPrice: number;
      totalPrice: number;
    }>;
  }
): Promise<{
  success: boolean;
  data: {
    transactionId: string;
    status: string;
    itemsCount: number;
    calculatedSubtotal: number;
    finalTotal: number;
    hasDiscrepancy: boolean;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/receipts/${transactionId}/review`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal menyimpan review struk");
  }
  return json;
}

export async function getReceiptDetails(transactionId: string): Promise<{
  success: boolean;
  data: any;
}> {
  const res = await fetch(`${API_BASE}/api/v1/receipts/${transactionId}`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal mengambil data struk");
  }
  return json;
}

// ================= LIVE TABLE SESSION APIS (STEP 6) =================

export async function createLiveSession(
  transactionId: string,
  hostName?: string
): Promise<{
  status: string;
  data: {
    tableCode: string;
    qrCodeDataUrl: string;
    joinUrl: string;
    state: any;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/receipts/${transactionId}/live-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ hostName }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal membuka sesi meja");
  }
  return json;
}

export async function getLiveSession(tableCode: string): Promise<{
  status: string;
  data: any;
}> {
  const res = await fetch(`${API_BASE}/api/v1/table-session/${tableCode}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Sesi meja tidak ditemukan");
  }
  return json;
}

export async function joinTableSession(
  tableCode: string,
  fullName: string
): Promise<{
  status: string;
  data: {
    participant: { id: string; fullName: string; isHost?: boolean };
    state: any;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/table-session/${tableCode}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fullName }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal bergabung ke sesi meja");
  }
  return json;
}

export async function toggleTableItem(
  tableCode: string,
  participantId: string,
  itemId: string
): Promise<{
  status: string;
  data: any;
}> {
  const res = await fetch(`${API_BASE}/api/v1/table-session/${tableCode}/toggle-item`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ participantId, itemId }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal memperbarui pilihan menu");
  }
  return json;
}

export function getTableWebSocketUrl(tableCode: string): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${protocol}//${host}:4000/ws/table/${tableCode}`;
}

// ================= STEP 7: ADVANCED SETTLEMENT, QRIS & TRIP APIS =================

export async function generateQris(params: {
  transactionId?: string;
  participantId?: string;
  amount: number;
  merchantName?: string;
}): Promise<{
  status: string;
  data: {
    payload: string;
    qrCodeDataUrl: string;
    amount: number;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/settlements/qris/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(params),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal membuat kode QRIS");
  }
  return json;
}

export async function uploadSettlementProof(
  settlementId: string,
  file: File | Blob
): Promise<{
  status: string;
  data: any;
}> {
  const formData = new FormData();
  formData.append("proof", file, "transfer_proof.jpg");

  const res = await fetch(`${API_BASE}/api/v1/settlements/${settlementId}/upload-proof`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal mengunggah bukti transfer");
  }
  return json;
}

export async function verifySettlementProof(
  settlementId: string,
  status: "VERIFIED" | "UNPAID",
  actorName?: string
): Promise<{
  status: string;
  data: any;
}> {
  const res = await fetch(`${API_BASE}/api/v1/settlements/${settlementId}/verify`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ status, actorName }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal memverifikasi status pembayaran");
  }
  return json;
}

export async function simplifyTripDebts(expenses: any[]): Promise<{
  status: string;
  data: {
    totalGroupSpending: number;
    netBalances: Array<{ participant: { id: string; name: string }; balance: number }>;
    transfers: Array<{
      from: { id: string; name: string };
      to: { id: string; name: string };
      amount: number;
    }>;
    originalTransactionCount: number;
    optimizedTransactionCount: number;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/trips/simplify-debt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ expenses }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Gagal menyederhanakan utang liburan");
  }
  return json;
}

export function getReimbursementPdfUrl(
  transactionId: string,
  applicantName?: string,
  department?: string
): string {
  const params = new URLSearchParams();
  if (applicantName) params.append("applicantName", applicantName);
  if (department) params.append("department", department);
  const qs = params.toString();
  return `${API_BASE}/api/v1/receipts/${transactionId}/reimbursement-pdf${qs ? `?${qs}` : ""}`;
}

// ================= STEP 8: ADMIN BACKOFFICE APIS =================

export async function getAdminExecutiveMetrics(): Promise<{
  status: string;
  data: {
    gtv: number;
    totalTransactions: number;
    activeMembers: number;
    pendingMembers: number;
    totalUsers: number;
    averageSettlementVelocityMinutes: number;
    topMerchants: Array<{ name: string; transactionCount: number; totalGtv: number }>;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/metrics/executive`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal memuat metrik eksekutif");
  return json;
}

export async function getAdminAiMetrics(): Promise<{
  status: string;
  data: {
    averageLatencyMs: number;
    targetLatencyMs: number;
    successRate: number;
    totalShotsProcessed: number;
    totalReceiptsProcessed: number;
    totalTokensConsumed: number;
    estimatedCostIdr: number;
    estimatedCostUsd: number;
    recentErrors: Array<{ timestamp: string; errorType: string; message: string }>;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/metrics/ai-performance`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal memuat metrik AI OCR");
  return json;
}

export async function getAdminIntegrations(): Promise<{
  status: string;
  data: Record<string, any>;
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/integrations`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal memuat integrasi");
  return json;
}

export async function saveAdminIntegration(key: string, configData: any): Promise<{
  status: string;
  data: any;
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/integrations/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ configData }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal menyimpan konfigurasi");
  return json;
}

export async function testAdminDelivery(
  channel: "EMAIL" | "WHATSAPP",
  destination: string
): Promise<{
  status: string;
  data: { success: boolean; channel: string; destination: string; message: string };
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/integrations/test-delivery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ channel, destination }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal melakukan uji pengiriman");
  return json;
}

export async function getAdminUsers(
  page: number = 1,
  limit: number = 20
): Promise<{
  status: string;
  data: {
    users: Array<any>;
    total: number;
    page: number;
    totalPages: number;
  };
}> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users?page=${page}&limit=${limit}`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal memuat data pengguna");
  return json;
}

export async function updateAdminUserQuota(userId: string, ocrQuota: number): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${userId}/quota`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ ocrQuota }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal memperbarui kuota");
  return json;
}

export async function runAdminCleanup(retentionDays: number = 30): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/maintenance/cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ retentionDays }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Gagal menjalankan pembersihan");
  return json;
}
