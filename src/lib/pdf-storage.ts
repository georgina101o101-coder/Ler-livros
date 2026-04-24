import { supabase } from "@/integrations/supabase/client";

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
}

export interface ProgressRecord {
  fileId: string;
  page: number;
  zoom: number;
  updatedAt: number;
}

const BUCKET = "pdfs";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

/** Upload PDF to storage + insert book row. Returns the new id. */
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
    // best effort cleanup
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbErr;
  }
  return fileId;
}

export async function listFiles(): Promise<BookListItem[]> {
  const { data, error } = await supabase
    .from("books")
    .select("id,name,size,total_pages,storage_path,added_at")
    .order("added_at", { ascending: false });
  if (error) {
    console.warn("[pdf-storage] listFiles", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    size: Number(r.size),
    totalPages: r.total_pages,
    storagePath: r.storage_path,
    addedAt: new Date(r.added_at).getTime(),
  }));
}

export async function getFile(id: string): Promise<PdfFileRecord | undefined> {
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

  return {
    id: data.id,
    name: data.name,
    size: Number(data.size),
    totalPages: data.total_pages,
    storagePath: data.storage_path,
    addedAt: new Date(data.added_at).getTime(),
    blob: blobData,
  };
}

export async function deleteFile(id: string): Promise<void> {
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

export async function saveReadingProgress(
  fileId: string,
  page: number,
  zoom?: number,
): Promise<void> {
  if (!fileId || !Number.isFinite(page) || page < 1) return;
  try {
    const userId = await requireUserId();
    const payload: Record<string, unknown> = {
      book_id: fileId,
      user_id: userId,
      page,
      updated_at: new Date().toISOString(),
    };
    if (typeof zoom === "number") payload.zoom = zoom;
    const { error } = await supabase
      .from("reading_progress")
      .upsert(payload, { onConflict: "book_id" });
    if (error) console.warn("[pdf-storage] saveReadingProgress", error);
  } catch (e) {
    console.warn("[pdf-storage] saveReadingProgress failed", e);
  }
}

export async function saveZoom(fileId: string, zoom: number): Promise<void> {
  try {
    const userId = await requireUserId();
    // Need page; fetch existing or default 1
    const { data: existing } = await supabase
      .from("reading_progress")
      .select("page")
      .eq("book_id", fileId)
      .maybeSingle();
    await supabase.from("reading_progress").upsert(
      {
        book_id: fileId,
        user_id: userId,
        page: existing?.page ?? 1,
        zoom,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "book_id" },
    );
  } catch (e) {
    console.warn("[pdf-storage] saveZoom failed", e);
  }
}

export async function getReadingProgress(fileId: string): Promise<ProgressRecord> {
  try {
    const { data } = await supabase
      .from("reading_progress")
      .select("page,zoom,updated_at")
      .eq("book_id", fileId)
      .maybeSingle();
    if (data) {
      return {
        fileId,
        page: data.page || 1,
        zoom: Number(data.zoom) || 1,
        updatedAt: new Date(data.updated_at).getTime(),
      };
    }
  } catch (e) {
    console.warn("[pdf-storage] getReadingProgress", e);
  }
  return { fileId, page: 1, zoom: 1, updatedAt: Date.now() };
}

export async function getProgressMap(
  ids: string[],
): Promise<Record<string, { page: number; zoom: number }>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("reading_progress")
    .select("book_id,page,zoom")
    .in("book_id", ids);
  const map: Record<string, { page: number; zoom: number }> = {};
  for (const r of data ?? []) {
    map[r.book_id] = { page: r.page, zoom: Number(r.zoom) };
  }
  return map;
}
