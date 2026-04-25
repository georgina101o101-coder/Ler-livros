import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt, isStandalone } from "@/hooks/use-install-prompt";

const DISMISS_KEY = "pwa-install-dismissed-until";
const IOS_DISMISS_KEY = "pwa-ios-dismissed";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS pretends to be Mac
  const isIPadOS =
    ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document;
  return isIOSDevice || isIPadOS;
}

function dismissedRecently(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    if (!v) return false;
    const until = parseInt(v, 10);
    if (!Number.isFinite(until)) return v === "1";
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const { isInstallable, promptInstall, installed } = useInstallPrompt();
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [iosHidden, setIosHidden] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIos(isIos());
    setStandalone(isStandalone());
    setHidden(dismissedRecently(DISMISS_KEY));
    setIosHidden(dismissedRecently(IOS_DISMISS_KEY));
  }, []);

  if (!mounted || installed || standalone) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + SEVEN_DAYS_MS));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const handleIosDismiss = () => {
    try {
      localStorage.setItem(IOS_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setIosHidden(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "dismissed") handleDismiss();
  };

  // iOS-specific banner with manual instructions
  if (ios && !iosHidden) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
        <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Share className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Instale o LerLivros no seu iPhone
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Toque em <Share className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
              <span className="font-medium">Compartilhar</span> e depois em{" "}
              <span className="font-medium">"Adicionar à Tela de Início"</span>.
            </p>
          </div>
          <button
            onClick={handleIosDismiss}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (ios) return null;
  if (!isInstallable || hidden) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <img
          src="/icon-192.png"
          alt="LerLivros"
          width={48}
          height={48}
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Instale o app para uma experiência melhor
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Acesso rápido, funciona offline e sem precisar do navegador
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Agora não
          </Button>
          <Button size="sm" onClick={handleInstall}>
            <Download className="mr-1 h-4 w-4" />
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}