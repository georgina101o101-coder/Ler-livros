import { supabase } from "@/integrations/supabase/client";

export interface HighlightRect {
  // Normalized 0-1 coordinates relative to the page viewport (scale=1).
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  textSelected: string;
  rectangles: HighlightRect[];
  color: string;
  createdAt: number;
}

export async function listHighlights(bookId: string): Promise<HighlightRecord[]> {
  const { data, error } = await supabase
    .from("highlights")
    .select("id,book_id,page_number,text_selected,rectangles,color,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[highlights] list failed", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    bookId: r.book_id,
    pageNumber: r.page_number,
    textSelected: r.text_selected ?? "",
    rectangles: (r.rectangles as unknown as HighlightRect[]) ?? [],
    color: r.color ?? "yellow",
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function createHighlight(input: {
  bookId: string;
  pageNumber: number;
  textSelected: string;
  rectangles: HighlightRect[];
  color?: string;
}): Promise<HighlightRecord | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("highlights")
    .insert({
      user_id: userId,
      book_id: input.bookId,
      page_number: input.pageNumber,
      text_selected: input.textSelected,
      rectangles: input.rectangles as unknown as never,
      color: input.color ?? "yellow",
    })
    .select("id,book_id,page_number,text_selected,rectangles,color,created_at")
    .maybeSingle();
  if (error || !data) {
    console.warn("[highlights] create failed", error);
    return null;
  }
  return {
    id: data.id,
    bookId: data.book_id,
    pageNumber: data.page_number,
    textSelected: data.text_selected ?? "",
    rectangles: (data.rectangles as unknown as HighlightRect[]) ?? [],
    color: data.color ?? "yellow",
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await supabase.from("highlights").delete().eq("id", id);
  if (error) console.warn("[highlights] delete failed", error);
}
