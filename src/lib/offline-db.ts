// Offline storage for PDFs and reading progress (IndexedDB).

const DB_NAME = "lerlivros-offline";
const DB_VERSION = 1;
const STORE_PDF = "pdfs"; // { id, name, size, totalPages, storagePath, addedAt, downloadedAt, blob }
const STORE_META = "meta"; // book metadata cache: { id, name, size, totalPages, storagePath, addedAt }
const STORE_PROGRESS = "progress"; // { bookId, page, zoom, updatedAt }

export interface OfflinePdf {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  storagePath: string;
  addedAt: number;
  downloadedAt: number;
  blob: Blob;
}

export interface OfflineMeta {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  storagePath: string;
  addedAt: number;
}

export interface OfflineProgress {
  bookId: string;
  page: number;
  zoom: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PDF)) db.createObjectStore(STORE_PDF, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS, { keyPath: "bookId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

// ---------- PDFs ----------
export async function savePdfBlob(pdf: OfflinePdf): Promise<void> {
  await tx(STORE_PDF, "readwrite", (s) => s.put(pdf));
}

export async function getPdfBlob(id: string): Promise<OfflinePdf | undefined> {
  try {
    return (await tx<OfflinePdf>(STORE_PDF, "readonly", (s) => s.get(id) as IDBRequest<OfflinePdf>)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function deletePdfBlob(id: string): Promise<void> {
  try {
    await tx(STORE_PDF, "readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

export async function listOfflineIds(): Promise<string[]> {
  try {
    return (await tx<IDBValidKey[]>(STORE_PDF, "readonly", (s) => s.getAllKeys())) as string[];
  } catch {
    return [];
  }
}

export async function getOfflineUsageBytes(): Promise<number> {
  try {
    const all = await tx<OfflinePdf[]>(STORE_PDF, "readonly", (s) => s.getAll() as IDBRequest<OfflinePdf[]>);
    return all.reduce((sum, p) => sum + (p.size || p.blob?.size || 0), 0);
  } catch {
    return 0;
  }
}

export async function clearAllPdfs(): Promise<void> {
  try {
    await tx(STORE_PDF, "readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}

// ---------- Meta cache ----------
export async function cacheMeta(meta: OfflineMeta[]): Promise<void> {
  try {
    const db = await openDb();
    const t = db.transaction(STORE_META, "readwrite");
    const s = t.objectStore(STORE_META);
    s.clear();
    for (const m of meta) s.put(m);
    await new Promise<void>((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch {
    /* ignore */
  }
}

export async function listCachedMeta(): Promise<OfflineMeta[]> {
  try {
    return (await tx<OfflineMeta[]>(STORE_META, "readonly", (s) => s.getAll() as IDBRequest<OfflineMeta[]>)) ?? [];
  } catch {
    return [];
  }
}

// ---------- Progress ----------
export async function saveProgressLocal(p: OfflineProgress): Promise<void> {
  try {
    await tx(STORE_PROGRESS, "readwrite", (s) => s.put(p));
  } catch {
    /* ignore */
  }
}

export async function getProgressLocal(bookId: string): Promise<OfflineProgress | undefined> {
  try {
    return (await tx<OfflineProgress>(STORE_PROGRESS, "readonly", (s) => s.get(bookId) as IDBRequest<OfflineProgress>)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getAllProgressLocal(): Promise<OfflineProgress[]> {
  try {
    return (await tx<OfflineProgress[]>(STORE_PROGRESS, "readonly", (s) => s.getAll() as IDBRequest<OfflineProgress[]>)) ?? [];
  } catch {
    return [];
  }
}
