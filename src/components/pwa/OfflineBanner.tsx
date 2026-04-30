import { useOnline } from "@/hooks/use-online";
import { useEffect } from "react";
import { syncProgressUp } from "@/lib/pdf-storage";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const online = useOnline();
  useEffect(() => {
    if (online) void syncProgressUp();
  }, [online]);
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-amber-950">
      <WifiOff className="h-3.5 w-3.5" />
      Modo offline — você está vendo conteúdo salvo no dispositivo
    </div>
  );
}
