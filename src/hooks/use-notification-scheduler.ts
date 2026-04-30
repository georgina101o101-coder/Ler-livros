import { useEffect } from "react";
import {
  loadSettings,
  recordNotificationSent,
  shouldNotifyNow,
} from "@/lib/reading-notifications";

/**
 * Polls every minute and fires a local notification when the daily goal
 * was not reached by the user-configured time.
 */
export function useNotificationScheduler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const fire = async () => {
      const settings = loadSettings();
      if (!shouldNotifyNow(settings)) return;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const opts: NotificationOptions = {
          body: "Você ainda não completou sua meta de leitura hoje.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "lerlivros-daily",
        };
        if (reg && "showNotification" in reg) {
          await reg.showNotification("Hora de ler 📚", opts);
        } else {
          new Notification("Hora de ler 📚", opts);
        }
        recordNotificationSent();
      } catch (e) {
        console.warn("[notif] failed", e);
      }
    };

    void fire();
    const id = setInterval(() => void fire(), 60_000);
    return () => clearInterval(id);
  }, []);
}
