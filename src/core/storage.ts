// ستر — التخزين المحلي + سجل الحوادث (مخطط §7)
// ============================================================
// محلي فقط: MMKV للإعدادات السريعة، SQLite لسجل الحوادث،
// Keychain/Keystore لهاش رمز الإيقاف. لا شيء يغادر الهاتف أبدًا.
// هذه واجهات (interfaces) — التنفيذ الفعلي عبر المكتبات الأصلية
// عند التثبيت على MacBook؛ النواة لا تعتمد على مكتبة بعينها.

export interface SettingsStore {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
  getBoolean(key: string): boolean | null;
  setBoolean(key: string, value: boolean): void;
  remove(key: string): void;
}

export type IncidentKind = 'motion-lift' | 'wrong-stop-code' | 'biometric-failed' | 'alarm-stopped';

export interface Incident {
  id: string;
  atIso: string;
  kind: IncidentKind;
  /** تفاصيل بشرية قصيرة، مثل: «رُفع الهاتف الساعة 3:12 فجرًا». */
  summaryAr: string;
  /** هل صرخ الهاتف في هذه الحادثة؟ */
  screamed: boolean;
  /** عدد المحاولات في هذه الحادثة. */
  attempts: number;
}

/**
 * تجميع الحوادث: محاولات تفصل بينها أقل من 5 دقائق من نفس الجلسة
 * = حادثة واحدة (فكرة 23). تُحفظ في SQLite في النسخة الكاملة؛
 * هنا القاعدة الخالصة + تخزين في الذاكرة للقطعة الأولى.
 */
export const INCIDENT_GROUP_WINDOW_MS = 5 * 60 * 1000;

export function sameIncident(a: Incident, b: Incident): boolean {
  if (a.kind !== b.kind) return false;
  return Math.abs(new Date(a.atIso).getTime() - new Date(b.atIso).getTime()) < INCIDENT_GROUP_WINDOW_MS;
}

export interface IncidentLog {
  add(incident: Omit<Incident, 'id'>): Incident;
  list(): Incident[];
  /** مسح السجل يتطلب رمز الإيقاف + البصمة معًا (المرحلة 3) — لا مسح صامت. */
  clear(): void;
}

export function createInMemoryIncidentLog(): IncidentLog {
  const items: Incident[] = [];
  let counter = 0;
  return {
    add(incident) {
      const full: Incident = { ...incident, id: `inc-${Date.now()}-${counter++}` };
      items.unshift(full);
      return full;
    },
    list() {
      return [...items];
    },
    clear() {
      items.length = 0;
    },
  };
}

export const SETTINGS_KEYS = {
  setupDone: 'setup.done',
  sensitivity: 'guard.sensitivity',
  screamConfig: 'guard.screamConfig',
  biometricEnabled: 'guard.biometricEnabled',
  batterySaver: 'guard.batterySaver',
  stopCodeRecord: 'guard.stopCodeRecord', // في Keychain/Keystore فقط، لا في MMKV
} as const;
