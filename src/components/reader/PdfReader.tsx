import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Skeleton } from "@/components/ui/skeleton";
import { useContainerWidth } from "@/hooks/use-container-width";
import {
  getReadingProgress,
  saveReadingProgress,
  saveZoom,
  type PdfFileRecord,
} from "@/lib/pdf-storage";
import { ReaderToolbar } from "./ReaderToolbar";
import { ProgressBar } from "./ProgressBar";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker as string;

interface PdfReaderProps {
  file: PdfFileRecord;
}

export function PdfReader({ file }: PdfReaderProps) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(file.totalPages || 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [fadeIn, setFadeIn] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy["render"]> | null>(null);
  const { ref: containerRef, width: containerWidth } = useContainerWidth<HTMLDivElement>();

  // Load PDF + saved progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buf = await file.blob.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      if (cancelled) return;
      setPdf(doc);
      setTotalPages(doc.numPages);

      const prog = await getReadingProgress(file.id);
      if (cancelled) return;
      setCurrentPage(Math.min(Math.max(1, prog.page), doc.numPages));
      setZoomFactor(prog.zoom > 0 ? prog.zoom : 1);
      setHydrated(true);
    })().catch((e) => console.error("[PdfReader] load failed", e));
    return () => {
      cancelled = true;
    };
  }, [file.id, file.blob]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || containerWidth <= 0) return;
    const canvas = canvasRef.current;
    setRendering(true);
    try {
      // Cancel previous in-flight render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* noop */
        }
      }

      const page = await pdf.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = containerWidth / baseViewport.width;
      const scale = fitScale * zoomFactor;
      const viewport = page.getViewport({ scale });

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform: number[] | undefined = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      const task = page.render({ canvasContext: ctx, viewport, transform });
      renderTaskRef.current = task;
      await task.promise;
      setRendering(false);
      // Trigger fade-in
      setFadeIn(false);
      requestAnimationFrame(() => setFadeIn(true));
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name !== "RenderingCancelledException") {
        console.error("[PdfReader] render failed", e);
        setRendering(false);
      }
    }
  }, [pdf, currentPage, containerWidth, zoomFactor]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  // Persist progress on every page change
  useEffect(() => {
    if (!hydrated) return;
    void saveReadingProgress(file.id, currentPage, zoomFactor);
  }, [file.id, currentPage, zoomFactor, hydrated]);

  // Persist zoom changes
  useEffect(() => {
    if (!hydrated) return;
    void saveZoom(file.id, zoomFactor);
  }, [file.id, zoomFactor, hydrated]);

  // Save on visibility change / unload
  useEffect(() => {
    const save = () => {
      void saveReadingProgress(file.id, currentPage, zoomFactor);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
    };
  }, [file.id, currentPage, zoomFactor]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);
  const goNext = useCallback(() => {
    setCurrentPage((p) => (totalPages ? Math.min(totalPages, p + 1) : p));
  }, [totalPages]);
  const seek = useCallback(
    (page: number) => {
      if (!totalPages) return;
      setCurrentPage(Math.min(Math.max(1, Math.round(page)), totalPages));
    },
    [totalPages],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      switch (e.key) {
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          goNext();
          break;
        case "Home":
          e.preventDefault();
          setCurrentPage(1);
          break;
        case "End":
          e.preventDefault();
          if (totalPages) setCurrentPage(totalPages);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, totalPages]);

  // Touch swipe navigation
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStart.current = null;
  };

  const onZoomIn = () => setZoomFactor((z) => Math.min(4, +(z + 0.1).toFixed(2)));
  const onZoomOut = () => setZoomFactor((z) => Math.max(0.3, +(z - 0.1).toFixed(2)));
  const onZoomReset = () => setZoomFactor(1);

  const skeletonHeight = useMemo(() => Math.round(containerWidth * 1.3), [containerWidth]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <ReaderToolbar
        title={file.name}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoomFactor}
        onPrev={goPrev}
        onNext={goNext}
        onSeek={seek}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
      />
      <ProgressBar current={currentPage} total={totalPages} />

      <main
        className="flex-1 overflow-x-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-8 lg:px-16 xl:px-24">
          <div ref={containerRef} className="relative mx-auto w-full">
            <div
              className={`mx-auto overflow-hidden rounded-lg bg-background shadow-[0_10px_40px_-15px_rgba(0,0,0,0.25)] ring-1 ring-border/60 transition-opacity duration-200 ${
                fadeIn && !rendering ? "opacity-100" : "opacity-60"
              }`}
            >
              <canvas ref={canvasRef} className="block max-w-full" />
            </div>
            {rendering && containerWidth > 0 && (
              <Skeleton
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto rounded-lg"
                style={{ height: skeletonHeight, width: "100%" }}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}