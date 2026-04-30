import { useEffect, useState } from "react";

export function useSwUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const handleReg = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            if (!cancelled) setWaiting(nw);
          }
        });
      });
      // Periodic update check
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) handleReg(reg);
    });
    navigator.serviceWorker.ready.then(handleReg).catch(() => {});

    let refreshing = false;
    const onCtrlChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrlChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrlChange);
    };
  }, []);

  const update = () => {
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return { updateAvailable: !!waiting, update };
}
