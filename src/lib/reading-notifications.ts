// Reading streak + notification settings storage (localStorage)

export interface NotifSettings {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
  dailyGoal: number; // pages per day
  permissionAsked: boolean;
}

export const DEFAULT_SETTINGS: NotifSettings = {
  enabled: true,
  hour: 20,
  minute: 0,
  dailyGoal: 5,
  permissionAsked: false,
};

const SETTINGS_KEY = "lerlivros.notif.settings";
const STATE_KEY = "lerlivros.notif.state";

export interface NotifState {
  // YYYY-MM-DD -> pages read that day
  daily: Record<string, number>;
  // Last day notification was sent (YYYY-MM-DD)
  lastNotified: string | null;
  // Last day the user opened the app
  lastActive: string | null;
}

const DEFAULT_STATE: NotifState = {
  daily: {},
  lastNotified: null,
  lastActive: null,
};

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function loadSettings(): NotifSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<NotifSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: NotifSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadState(): NotifState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<NotifState>;
    return { ...DEFAULT_STATE, ...parsed, daily: parsed.daily ?? {} };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(s: NotifState): void {
  try {
    // Keep only last 30 days
    const keys = Object.keys(s.daily).sort();
    if (keys.length > 30) {
      const trimmed: Record<string, number> = {};
      keys.slice(-30).forEach((k) => (trimmed[k] = s.daily[k]));
      s.daily = trimmed;
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getPagesReadToday(): number {
  const s = loadState();
  return s.daily[todayKey()] ?? 0;
}

export function incrementPagesRead(by: number = 1): number {
  const s = loadState();
  const k = todayKey();
  s.daily[k] = (s.daily[k] ?? 0) + by;
  s.lastActive = k;
  saveState(s);
  return s.daily[k];
}

export function markActive(): void {
  const s = loadState();
  s.lastActive = todayKey();
  saveState(s);
}

/** Should we send a notification right now? Implements daily limit + 3-day rule. */
export function shouldNotifyNow(settings: NotifSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  const today = todayKey(now);
  const state = loadState();

  // Already sent today
  if (state.lastNotified === today) return false;

  // Already met goal
  const read = state.daily[today] ?? 0;
  if (read >= settings.dailyGoal) return false;

  // Time check: only at/after configured hour
  const targetMinutes = settings.hour * 60 + settings.minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < targetMinutes) return false;

  // 3-day inactivity rule: send every other day
  if (state.lastActive) {
    const last = new Date(state.lastActive + "T00:00:00");
    const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
    if (diffDays >= 3) {
      // Only send on alternate days based on day-of-year parity
      const dayOfYear = Math.floor(
        (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
      );
      if (dayOfYear % 2 !== 0) return false;
    }
  }

  return true;
}

export function recordNotificationSent(): void {
  const s = loadState();
  s.lastNotified = todayKey();
  saveState(s);
}
