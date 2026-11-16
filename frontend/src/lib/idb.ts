const DB_NAME = "splitbill_db";
const DB_VERSION = 1;
const STORE_DRAFTS = "receipt_drafts";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported"));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface OfflineDraft {
  id: string;
  updatedAt: string;
  merchantName: string;
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    itemPrice: number;
    totalPrice: number;
    assignedParticipantIds: string[];
  }>;
  participants: Array<{
    id: string;
    fullName: string;
    email?: string;
    isSelf: boolean;
  }>;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  roundingAmount: number;
  overheadAllocationMethod: "EQUAL" | "PROPORTIONAL";
  shots?: string[];
}

export async function saveDraftToIDB(draft: OfflineDraft): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.put(draft);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to save draft to IndexedDB:", err);
  }
}

export async function getDraftFromIDB(id: string): Promise<OfflineDraft | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readonly");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to get draft from IndexedDB:", err);
    return null;
  }
}

export async function listDraftsFromIDB(): Promise<OfflineDraft[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readonly");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to list drafts from IndexedDB:", err);
    return [];
  }
}

export async function deleteDraftFromIDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to delete draft from IndexedDB:", err);
  }
}
