import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  getPagesReadToday,
  type NotifSettings,
} from "@/lib/reading-notifications";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Configurações — Leitor de PDF" },
      { name: "description", content: "Personalize sua meta de leitura e lembretes diários." },
    ],
  }),
});

function SettingsPage() {
  const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [pagesToday, setPagesToday] = useState(0);

  useEffect(() => {
    setSettings(loadSettings());
    setPagesToday(getPagesReadToday());
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  const update = (patch: Partial<NotifSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const requestPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Seu navegador não suporta notificações.");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    update({ permissionAsked: true });
    if (result === "granted") toast.success("Notificações ativadas!");
    else if (result === "denied") toast.error("Permissão negada. Ative nas configurações do navegador.");
  };

  const time = `${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar">
            <Link to="/"><ArrowLeft /></Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">Configurações</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Hoje</h2>
          <p className="mt-2 text-2xl font-semibold">
            {pagesToday} <span className="text-base font-normal text-muted-foreground">/ {settings.dailyGoal} páginas lidas</span>
          </p>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-background p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Lembretes de leitura</h2>
              <p className="text-sm text-muted-foreground">
                Receba uma notificação se ainda não bateu sua meta diária.
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
            />
          </div>

          {permission !== "granted" && (
            <Button onClick={requestPermission} variant="secondary" className="w-full">
              {permission === "denied" ? <BellOff /> : <Bell />}
              {permission === "denied" ? "Permissão negada" : "Ativar notificações"}
            </Button>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="time">Horário do lembrete</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (!Number.isNaN(h) && !Number.isNaN(m)) update({ hour: h, minute: m });
                }}
                disabled={!settings.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">Meta diária (páginas)</Label>
              <Input
                id="goal"
                type="number"
                min={1}
                max={500}
                value={settings.dailyGoal}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n > 0) update({ dailyGoal: n });
                }}
                disabled={!settings.enabled}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
