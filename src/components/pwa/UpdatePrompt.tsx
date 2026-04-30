import { useSwUpdate } from "@/hooks/use-sw-update";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function UpdatePrompt() {
  const { updateAvailable, update } = useSwUpdate();
  if (!updateAvailable) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-background p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">
            Atualize agora para usar a versão mais recente do leitor.
          </p>
        </div>
        <Button size="sm" onClick={update}>Atualizar</Button>
      </div>
    </div>
  );
}
