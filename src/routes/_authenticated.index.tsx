import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BookOpen, FileUp, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  deleteFile,
  getProgressMap,
  listFiles,
  saveFile,
  type BookListItem,
} from "@/lib/pdf-storage";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker as string;

export const Route = createFileRoute("/_authenticated/")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "Leitor de PDF — Sua biblioteca" },
      {
        name: "description",
        content: "Envie PDFs, leia com ajuste de largura e continue exatamente de onde parou.",
      },
    ],
  }),
});

interface BookEntry {
  file: BookListItem;
  page: number;
}

function LibraryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const files = await listFiles();
    const progress = await getProgressMap(files.map((f) => f.id));
    setBooks(files.map((file) => ({ file, page: progress[file.id]?.page ?? 1 })));
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
        await saveFile({ name: f.name, size: f.size, totalPages, data: buf });
      }
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    await deleteFile(id);
    await refresh();
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Leitor de PDF</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button onClick={onPick} disabled={importing}>
              <FileUp /> {importing ? "Enviando…" : "Enviar PDF"}
            </Button>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sair">
              <LogOut />
            </Button>
          </div>
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
          <p className="text-sm text-muted-foreground">Carregando biblioteca…</p>
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
              <h2 className="text-xl font-semibold">Sua biblioteca está vazia</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Arraste um PDF aqui ou clique em enviar para começar a ler.
              </p>
            </div>
            <Button onClick={onPick}>
              <FileUp /> Enviar PDF
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
                        Página {page} de {file.totalPages} · {pct}%
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
                      {page > 1 ? "Continuar" : "Abrir"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void remove(file.id)}
                      aria-label="Remover da biblioteca"
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
