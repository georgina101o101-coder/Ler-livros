import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PdfReader } from "@/components/reader/PdfReader";
import { getFile, type PdfFileRecord } from "@/lib/pdf-storage";

export const Route = createFileRoute("/_authenticated/read/$fileId")({
  component: ReadPage,
  head: () => ({
    meta: [
      { title: "Reading — PDF Reader" },
      { name: "description", content: "Read your PDF with fit-to-width and saved progress." },
    ],
  }),
});

function ReadPage() {
  const { fileId } = useParams({ from: "/_authenticated/read/$fileId" });
  const [file, setFile] = useState<PdfFileRecord | null | undefined>(undefined);

  useEffect(() => {
    let cancel = false;
    getFile(fileId).then((f) => {
      if (!cancel) setFile(f ?? null);
    });
    return () => {
      cancel = true;
    };
  }, [fileId]);

  if (file === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (file === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4 text-center">
        <h1 className="text-2xl font-semibold">PDF not found</h1>
        <p className="text-sm text-muted-foreground">This file is no longer in your library.</p>
        <Button asChild>
          <Link to="/">Back to library</Link>
        </Button>
      </div>
    );
  }

  return <PdfReader file={file} />;
}
