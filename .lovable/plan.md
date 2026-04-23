
# PDF Reader with Fit-to-Width, Persistent Progress & Comfort Polish

A clean PDF reader built on TanStack Start using `pdfjs-dist`. Upload a PDF (or load a sample), read page-by-page with proper fit-to-width rendering, persistent progress, and a polished reading experience.

## Routes
- `/` — Library: upload PDFs, see saved books with last-read page, resume or open from page 1
- `/read/$fileId` — Reader view for a specific PDF

## Reader features

**Rendering — real fit-to-width**
- Measure container width via `ResizeObserver`
- Get pdf.js viewport at scale 1, compute `scale = containerWidth / viewport.width`
- Multiply by user `zoomFactor` (default 1.0 = fit-to-width)
- Re-render on: page change, container resize, window resize, orientation change, zoom change
- HiDPI sharpness: canvas backing store sized by `window.devicePixelRatio`, CSS size kept at logical pixels

**Zoom controls (toolbar)**
- Zoom In (+10%), Zoom Out (−10%), Reset to Fit-to-width (100%)
- Current zoom % displayed
- `zoomFactor` persisted per `fileId` in localStorage

**Progress saving — bulletproof**
- `saveReadingProgress(fileId, page)` writes to IndexedDB (with localStorage fallback)
- Triggered via `useEffect` on every `currentPage` change
- Also saved on `visibilitychange` (tab hidden), `pagehide`, and `beforeunload`
- Page changes captured from: prev/next buttons, slider, keyboard arrows (←/→, PgUp/PgDn, Home/End), and touch swipe (left/right)

**Progress bar**
- Thin 2px bar directly under the header
- Width: `(currentPage / totalPages) * 100%`, smooth width transition

**Reading comfort**
- Page canvas centered horizontally; max-width container with side padding that grows on `lg`/`xl` screens
- Soft background, subtle page shadow, rounded corners
- Smooth fade transition between pages (opacity fade on page-change)
- Loading skeleton while a page renders

## Storage model
- IndexedDB store `pdf-reader`:
  - `files`: `{ id, name, size, blob, totalPages, addedAt }`
  - `progress`: `{ fileId, page, zoom, updatedAt }`
- localStorage mirror for last-read page + zoom (fallback + faster initial paint)

## Files to create/update
- `src/routes/index.tsx` — replace placeholder with Library page (upload + book list)
- `src/routes/read.$fileId.tsx` — Reader route
- `src/components/reader/PdfReader.tsx` — main reader component (render loop, zoom, swipe, keyboard)
- `src/components/reader/ReaderToolbar.tsx` — header with title, zoom controls, page indicator, slider
- `src/components/reader/ProgressBar.tsx` — thin progress bar
- `src/lib/pdf-storage.ts` — IndexedDB helpers + `saveReadingProgress(fileId, page)` + zoom persistence
- `src/hooks/use-container-width.ts` — ResizeObserver hook
- Add dependency: `pdfjs-dist`

No changes to routing shell, root layout, or unrelated UI.
