import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHighlight,
  deleteHighlight,
  listHighlights,
  type HighlightRecord,
  type HighlightRect,
} from "@/lib/highlights";

interface Props {
  bookId: string;
  pageNumber: number;
  width: number;
  height: number;
}

interface PendingSelection {
  text: string;
  rects: HighlightRect[];
  // Tooltip position in CSS pixels relative to the layer.
  anchor: { x: number; y: number };
}

export function HighlightLayer({ bookId, pageNumber, width, height }: Props) {
  const [highlights, setHighlights] = useState<HighlightRecord[]>([]);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Load all highlights for this book once per book.
  useEffect(() => {
    let cancel = false;
    listHighlights(bookId).then((rows) => {
      if (!cancel) setHighlights(rows);
    });
    return () => {
      cancel = true;
    };
  }, [bookId]);

  const pageHighlights = highlights.filter((h) => h.pageNumber === pageNumber);

  // Detect selection inside this page.
  const handleMouseUp = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // Only react if selection starts inside the page container.
    const pageEl = layer.parentElement;
    if (!pageEl || !pageEl.contains(range.startContainer)) {
      setPending(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setPending(null);
      return;
    }
    const pageRect = pageEl.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1,
    );
    if (clientRects.length === 0) {
      setPending(null);
      return;
    }
    const norm: HighlightRect[] = clientRects.map((r) => ({
      x: (r.left - pageRect.left) / pageRect.width,
      y: (r.top - pageRect.top) / pageRect.height,
      width: r.width / pageRect.width,
      height: r.height / pageRect.height,
    }));
    const last = clientRects[clientRects.length - 1];
    setPending({
      text,
      rects: norm,
      anchor: {
        x: last.left - pageRect.left + last.width / 2,
        y: last.top - pageRect.top + last.height + 6,
      },
    });
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [handleMouseUp]);

  // Reset pending selection on page change.
  useEffect(() => {
    setPending(null);
  }, [pageNumber]);

  const onSave = async () => {
    if (!pending) return;
    const created = await createHighlight({
      bookId,
      pageNumber,
      textSelected: pending.text,
      rectangles: pending.rects,
      color: "yellow",
    });
    if (created) setHighlights((prev) => [...prev, created]);
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  const onRemove = async (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    await deleteHighlight(id);
  };

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    >
      {pageHighlights.map((h) =>
        h.rectangles.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            title={h.textSelected}
            className="absolute rounded-[2px] bg-yellow-300/50 mix-blend-multiply"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          />
        )),
      )}

      {pending && (
        <div
          className="pointer-events-auto absolute z-20 -translate-x-1/2"
          style={{ left: pending.anchor.x, top: pending.anchor.y }}
        >
          <button
            type="button"
            onClick={onSave}
            className="rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-medium text-black shadow-lg ring-1 ring-yellow-600/40 hover:bg-yellow-300"
          >
            ✏️ Marcar
          </button>
        </div>
      )}
    </div>
  );
}
