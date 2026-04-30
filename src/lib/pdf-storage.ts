import { supabase } from "@/integrations/supabase/client";
import {
  cacheMeta,
  deletePdfBlob,
  getAllProgressLocal,
  getOfflineUsageBytes,
  getPdfBlob,
  getProgressLocal,
  listCachedMeta,
  listOfflineIds,
  saveProgressLocal,
  savePdfBlob,
  clearAllPdfs as clearAllPdfsLocal,
} from "@/lib/offline-db";

export interface PdfFileRecord {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  totalPages: number;
  addedAt: number;
  storagePath: string;
}

export interface BookListItem {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  addedAt: number;
  storagePath: string;
  offline?: boolean;
}

export interface ProgressRecord {
  fileId: string;
  page: number;
  zoom: number;
  updatedAt: number;
}

const BUCKET = "pdfs";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

/** Upload PDF to storage + insert book row + cache locally. */
export async function saveFile(input: {
  name: string;
  size: number;
  totalPages: number;
  data: ArrayBuffer;
}): Promise<string> {
  const userId = await requireUserId();
  const fileId = crypto.randomUUID();
  const path = `${userId}/${fileId}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([input.data], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase.from("books").insert({
    id: fileId,
    user_id: userId,
    name: input.name,
    size: input.size,
    total_pages: input.totalPages,
    storage_path: path,
  });
  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbErr;
  }

  // Cache locally for offline use immediately.
  try {
    await savePdfBlob({
      id: fileId,
      name: input.name,
      size: input.size,
      totalPages: input.totalPages,
      storagePath: path,
      addedAt: Date.now(),
      downloadedAt: Date.now(),
      blob: new Blob([input.data], { type: "application/pdf" }),
    });
  } catch (e) {
    console.warn("[pdf-storage] cache after upload failed", e);
  }
  return fileId;
}

/** List books — merges remote (when online) with offline cache. */
export async function listFiles(): Promise<BookListItem[]> {
  const offlineIds = new Set(await listOfflineIds());

  if (isOnline()) {
    const { data, error } = await supabase
      .from("books")
      .select("id,name,size,total_pages,storage_path,added_at")
      .order("added_at", { ascending: false });
    if (!error && data) {
      const items: BookListItem[] = data.map((r) => ({
        id: r.id,
        name: r.name,
        size: Number(r.size),
        totalPages: r.total_pages,
        storagePath: r.storage_path,
        addedAt: new Date(r.added_at).getTime(),
        offline: offlineIds.has(r.id),
      }));
      // Cache metadata for offline use
      await cacheMeta(items.map(({ offline: _o, ...rest }) => rest));
      return items;
    }
    console.warn("[pdf-storage] listFiles online failed, falling back", error);
  }

  // Offline fallback: cached metadata.
  const cached = await listCachedMeta();
  return cached
    .map((m) => ({ ...m, offline: offlineIds.has(m.id) }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

/** Get a PDF for reading. Prefers local cache; downloads + caches when online. */
export async function getFile(id: string): Promise<PdfFileRecord | undefined> {
  // 1. Try local cache first (fastest + works offline).
  const local = await getPdfBlob(id);
  if (local) {
    return {
      id: local.id,
      name: local.name,
      size: local.size,
      totalPages: local.totalPages,
      storagePath: local.storagePath,
      addedAt: local.addedAt,
      blob: local.blob,
    };
  }

  if (!isOnline()) return undefined;

  // 2. Fetch metadata + download blob, then cache.
  const { data, error } = await supabase
    .from("books")
    .select("id,name,size,total_pages,storage_path,added_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return undefined;

  const { data: blobData, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(data.storage_path);
  if (dlErr || !blobData) return undefined;

  const record: PdfFileRecord = {
    id: data.id,
    name: data.name,
    size: Number(data.size),
    totalPages: data.total_pages,
    storagePath: data.storage_path,
    addedAt: new Date(data.added_at).getTime(),
    blob: blobData,
  };

  // Auto-cache for next time.
  try {
    await savePdfBlob({
      id: record.id,
      name: record.name,
      size: record.size,
      totalPages: record.totalPages,
      storagePath: record.storagePath,
      addedAt: record.addedAt,
      downloadedAt: Date.now(),
      blob: blobData,
    });
  } catch (e) {
    console.warn("[pdf-storage] auto-cache failed", e);
  }
  return record;
}

/** Force-download a PDF for offline use without opening it. */
export async function downloadForOffline(id: string): Promise<boolean> {
  if (await getPdfBlob(id)) return true;
  if (!isOnline()) return false;
  const rec = await getFile(id);
  return !!rec;
}

export async function isAvailableOffline(id: string): Promise<boolean> {
  return !!(await getPdfBlob(id));
}

export async function deleteFile(id: string): Promise<void> {
  // Always clear local cache.
  await deletePdfBlob(id);

  if (!isOnline()) return;
  const { data: row } = await supabase
    .from("books")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (row?.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }
  await supabase.from("books").delete().eq("id", id);
}

/** Remove only the offline copy (keep cloud copy). */
export async function removeOfflineCopy(id: string): Promise<void> {
  await deletePdfBlob(id);
}

export async function clearAllOfflineDownloads(): Promise<void> {
  await clearAllPdfsLocal();
}

export async function getOfflineUsage(): Promise<number> {
  return getOfflineUsageBytes();
}

// ---------- Progress (offline-first, LWW) ----------

export async function saveReadingProgress(
  fileId: string,
  page: number,
  zoom?: number,
): Promise<void> {
  if (!fileId || !Number.isFinite(page) || page < 1) return;
  const updatedAt = Date.now();
  const existing = await getProgressLocal(fileId);
  const z = typeof zoom === "number" ? zoom : existing?.zoom ?? 1;

  // Write locally first — works offline.
  await saveProgressLocal({ bookId: fileId, page, zoom: z, updatedAt });

  if (!isOnline()) return;

  try {
    const userId = await requireUserId();
    await supabase.from("reading_progress").upsert(
      {
        book_id: fileId,
        user_id: userId,
        page,
        zoom: z,
        updated_at: new Date(updatedAt).toISOString(),
      },
      { onConflict: "book_id" },
    );
  } catch (e) {
    console.warn("[pdf-storage] saveReadingProgress remote failed", e);
  }
}

export async function saveZoom(fileId: string, zoom: number): Promise<void> {
  const existing = await getProgressLocal(fileId);
  await saveReadingProgress(fileId, existing?.page ?? 1, zoom);
}

export async function getReadingProgress(fileId: string): Promise<ProgressRecord> {
  const local = await getProgressLocal(fileId);

  if (!isOnline()) {
    return local
      ? { fileId, page: local.page, zoom: local.zoom, updatedAt: local.updatedAt }
      : { fileId, page: 1, zoom: 1, updatedAt: Date.now() };
  }

  try {
    const { data } = await supabase
      .from("reading_progress")
      .select("page,zoom,updated_at")
      .eq("book_id", fileId)
      .maybeSingle();

    const remote = data
      ? {
          page: data.page || 1,
          zoom: Number(data.zoom) || 1,
          updatedAt: new Date(data.updated_at).getTime(),
        }
      : null;

    // LWW: most recent wins. Local always wins ties.
    if (local && (!remote || local.updatedAt >= remote.updatedAt)) {
      // Push local back if it's newer (server has older data)
      if (remote && local.updatedAt > remote.updatedAt) {
        try {
          const userId = await requireUserId();
          await supabase.from("reading_progress").upsert(
            {
              book_id: fileId,
              user_id: userId,
              page: local.page,
              zoom: local.zoom,
              updated_at: new Date(local.updatedAt).toISOString(),
            },
            { onConflict: "book_id" },
          );
        } catch {
          /* ignore */
        }
      }
      return { fileId, page: local.page, zoom: local.zoom, updatedAt: local.updatedAt };
    }

    if (remote) {
      // Cache remote progress locally.
      await saveProgressLocal({
        bookId: fileId,
        page: remote.page,
        zoom: remote.zoom,
        updatedAt: remote.updatedAt,
      });
      return { fileId, ...remote };
    }
  } catch (e) {
    console.warn("[pdf-storage] getReadingProgress", e);
  }

  return local
    ? { fileId, page: local.page, zoom: local.zoom, updatedAt: local.updatedAt }
    : { fileId, page: 1, zoom: 1, updatedAt: Date.now() };
}

export async function getProgressMap(
  ids: string[],
): Promise<Record<string, { page: number; zoom: number }>> {
  const map: Record<string, { page: number; zoom: number }> = {};

  // Start with local progress (works offline).
  const localAll = await getAllProgressLocal();
  for (const p of localAll) {
    if (ids.includes(p.bookId)) map[p.bookId] = { page: p.page, zoom: p.zoom };
  }

  if (!isOnline() || ids.length === 0) return map;

  try {
    const { data } = await supabase
      .from("reading_progress")
      .select("book_id,page,zoom,updated_at")
      .in("book_id", ids);
    for (const r of data ?? []) {
      const localRec = localAll.find((p) => p.bookId === r.book_id);
      const remoteUpdated = new Date(r.updated_at).getTime();
      if (!localRec || remoteUpdated > localRec.updatedAt) {
        map[r.book_id] = { page: r.page, zoom: Number(r.zoom) };
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

/** Push every local progress entry that is newer than the server. Run when coming back online. */
export async function syncProgressUp(): Promise<void> {
  if (!isOnline()) return;
  const all = await getAllProgressLocal();
  if (all.length === 0) return;
  try {
    const userId = await requireUserId();
    const { data: remote } = await supabase
      .from("reading_progress")
      .select("book_id,updated_at")
      .in(
        "book_id",
        all.map((p) => p.bookId),
      );
    const remoteMap = new Map<string, number>();
    for (const r of remote ?? []) remoteMap.set(r.book_id, new Date(r.updated_at).getTime());

    const toPush = all.filter((p) => {
      const r = remoteMap.get(p.bookId);
      return r === undefined || p.updatedAt > r;
    });
    if (toPush.length === 0) return;

    await supabase.from("reading_progress").upsert(
      toPush.map((p) => ({
        book_id: p.bookId,
        user_id: userId,
        page: p.page,
        zoom: p.zoom,
        updated_at: new Date(p.updatedAt).toISOString(),
      })),
      { onConflict: "book_id" },
    );
  } catch (e) {
    console.warn("[pdf-storage] syncProgressUp failed", e);
  }
}
