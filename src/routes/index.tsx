import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BookOpen, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteFile,
  getReadingProgress,
  listFiles,
  saveFile,
  type PdfFileRecord,
} from "@/lib/pdf-storage";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker as string;

export const Route = createFileRoute("/")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "PDF Reader — Your Library" },
      {
        name: "description",
        content: "Upload PDFs, read with fit-to-width, and pick up exactly where you left off.",
      },
      { property: "og:title", content: "PDF Reader — Your Library" },
      {
        property: "og:description",
        content: "Upload PDFs, read with fit-to-width, and pick up exactly where you left off.",
      },
    ],
  }),
});

interface BookEntry {
  file: PdfFileRecord;
  page: number;
}

function LibraryPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const files = await listFiles();
    const entries = await Promise.all(
      files
        .sort((a, b) => b.addedAt - a.addedAt)
        .map(async (f) => ({ file: f, page: (await getReadingProgress(f.id)).page })),
    );
    setBooks(entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    setImporting(true);
    try {
      for (const f of Array.from(filesList)) {
        if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) continue;
        const buf = await f.arrayBuffer();
        let totalPages = 0;
        try {
          const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
          totalPages = doc.numPages;
        } catch (e) {
          console.error("Failed to parse PDF", e);
          continue;
        }
        const id =
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const record: PdfFileRecord = {
          id,
          name: f.name,
          size: f.size,
          blob: new Blob([buf], { type: "application/pdf" }),
          totalPages,
          addedAt: Date.now(),
        };
        await saveFile(record);
      }
      await refresh();
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    await deleteFile(id);
    await refresh();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">PDF Reader</h1>
          </div>
          <Button onClick={onPick} disabled={importing}>
            <FileUp /> {importing ? "Importing…" : "Upload PDF"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading library…</p>
        ) : books.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-background/60 p-16 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Your library is empty</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop a PDF here or click upload to start reading.
              </p>
            </div>
            <Button onClick={onPick}>
              <FileUp /> Upload PDF
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {books.map(({ file, page }) => {
              const pct = file.totalPages > 0 ? Math.round((page / file.totalPages) * 100) : 0;
              return (
                <li
                  key={file.id}
                  className="group relative flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:shadow-md"
                >
                  <Link
                    to="/read/$fileId"
                    params={{ fileId: file.id }}
                    className="flex flex-1 flex-col gap-3"
                  >
                    <div className="flex h-32 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                      <BookOpen className="h-10 w-10 text-primary/70" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page {page} of {file.totalPages} · {pct}%
                      </p>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigate({ to: "/read/$fileId", params: { fileId: file.id } })
                      }
                    >
                      {page > 1 ? "Resume" : "Open"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void remove(file.id)}
                      aria-label="Remove from library"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
