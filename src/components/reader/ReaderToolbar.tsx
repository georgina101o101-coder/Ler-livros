import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface ReaderToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function ReaderToolbar({
  title,
  currentPage,
  totalPages,
  zoom,
  onPrev,
  onNext,
  onSeek,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ReaderToolbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:px-6">
        <Button asChild variant="ghost" size="icon" aria-label="Back to library">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages || "—"}
          </p>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <Button variant="ghost" size="icon" onClick={onZoomOut} aria-label="Zoom out">
            <Minus />
          </Button>
          <button
            onClick={onZoomReset}
            className="min-w-14 rounded-md px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Reset zoom to fit width"
            title="Reset to fit width"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon" onClick={onZoomIn} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon" onClick={onZoomReset} aria-label="Fit to width">
            <Maximize2 />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPrev} disabled={currentPage <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            disabled={!totalPages || currentPage >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-6">
          <Slider
            value={[currentPage]}
            min={1}
            max={totalPages}
            step={1}
            onValueChange={(v) => onSeek(v[0] ?? 1)}
            aria-label="Page slider"
          />
        </div>
      )}
    </header>
  );
}