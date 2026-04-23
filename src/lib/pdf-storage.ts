const DB_NAME = "pdf-reader";
const DB_VERSION = 1;
const FILES_STORE = "files";
const PROGRESS_STORE = "progress";

export interface PdfFileRecord {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  totalPages: number;
  addedAt: number;
}

export interface ProgressRecord {
  fileId: string;
  page: number;
  zoom: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: "fileId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveFile(record: PdfFileRecord): Promise<void> {
  try {
    await tx(FILES_STORE, "readwrite", (s) => s.put(record));
  } catch (e) {
    console.warn("[pdf-storage] saveFile failed", e);
  }
}

export async function getFile(id: string): Promise<PdfFileRecord | undefined> {
  try {
    return (await tx<PdfFileRecord | undefined>(FILES_STORE, "readonly", (s) => s.get(id))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function listFiles(): Promise<PdfFileRecord[]> {
  try {
    return (await tx<PdfFileRecord[]>(FILES_STORE, "readonly", (s) => s.getAll())) ?? [];
  } catch {
    return [];
  }
}

export async function deleteFile(id: string): Promise<void> {
  try {
    await tx(FILES_STORE, "readwrite", (s) => s.delete(id));
    await tx(PROGRESS_STORE, "readwrite", (s) => s.delete(id));
  } catch {
    /* noop */
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(progressKey(id));
    localStorage.removeItem(zoomKey(id));
  }
}

const progressKey = (fileId: string) => `pdf-reader:progress:${fileId}`;
const zoomKey = (fileId: string) => `pdf-reader:zoom:${fileId}`;

/**
 * Persist last-read page. Writes to IndexedDB with a localStorage mirror as fallback.
 */
export async function saveReadingProgress(fileId: string, page: number, zoom?: number): Promise<void> {
  if (!fileId || !Number.isFinite(page) || page < 1) return;
  // Mirror to localStorage immediately (sync, survives crashes)
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(progressKey(fileId), String(page));
      if (typeof zoom === "number") localStorage.setItem(zoomKey(fileId), String(zoom));
    } catch {
      /* quota / disabled */
    }
  }
  try {
    const existing = await tx<ProgressRecord | undefined>(PROGRESS_STORE, "readonly", (s) => s.get(fileId));
    const record: ProgressRecord = {
      fileId,
      page,
      zoom: typeof zoom === "number" ? zoom : existing?.zoom ?? 1,
      updatedAt: Date.now(),
    };
    await tx(PROGRESS_STORE, "readwrite", (s) => s.put(record));
  } catch (e) {
    console.warn("[pdf-storage] saveReadingProgress IDB failed (localStorage mirror used)", e);
  }
}

export async function getReadingProgress(fileId: string): Promise<ProgressRecord> {
  let page = 1;
  let zoom = 1;
  if (typeof localStorage !== "undefined") {
    const lp = Number(localStorage.getItem(progressKey(fileId)));
    const lz = Number(localStorage.getItem(zoomKey(fileId)));
    if (Number.isFinite(lp) && lp > 0) page = lp;
    if (Number.isFinite(lz) && lz > 0) zoom = lz;
  }
  try {
    const rec = await tx<ProgressRecord | undefined>(PROGRESS_STORE, "readonly", (s) => s.get(fileId));
    if (rec) {
      page = rec.page || page;
      zoom = rec.zoom || zoom;
    }
  } catch {
    /* fall through */
  }
  return { fileId, page, zoom, updatedAt: Date.now() };
}

export async function saveZoom(fileId: string, zoom: number): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(zoomKey(fileId), String(zoom));
    } catch {
      /* noop */
    }
  }
  try {
    const existing = await tx<ProgressRecord | undefined>(PROGRESS_STORE, "readonly", (s) => s.get(fileId));
    const record: ProgressRecord = {
      fileId,
      page: existing?.page ?? 1,
      zoom,
      updatedAt: Date.now(),
    };
    await tx(PROGRESS_STORE, "readwrite", (s) => s.put(record));
  } catch {
    /* noop */
  }
}