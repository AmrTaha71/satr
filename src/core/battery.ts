// ستر — توفير البطارية الذكي (فكرتا 9 و98)
// ============================================================
// مراقبة بالنبض: سكون → عيّنات نادرة؛ أول اهتزاز → مراقبة كاملة فورًا.
// الأرقام (1–2% في الليلة) تقديرات غير مقيسة — تُقاس على جهاز حقيقي
// وتُعرض بالأرقام الفعلية فقط بعد القياس. لا رقم موعود في الواجهة.

export type BatteryMode = 'deep-sleep' | 'alert' | 'alarm';

export interface BatteryState {
  mode: BatteryMode;
  /** معدل أخذ العينات الحالي (عينة كل كم ms). */
  sampleIntervalMs: number;
  /** نسبة البطارية عند بدء الحراسة. */
  batteryAtArmPercent: number | null;
  /** نسبة البطارية الآن (إن عرفها النظام). */
  batteryNowPercent: number | null;
  /** استهلاك الجلسة حتى الآن (نقاط مئوية)، null إن لم يُقَس. */
  consumedPercent: number | null;
}

/** عينة كل 5 ثوانٍ + مستشعر حركة منخفض الطاقة فقط — وضع النوم العميق. */
export const DEEP_SLEEP_INTERVAL_MS = 5000;
/** عند أول إشارة: عينة كل 100ms لمدة 10 ثوانٍ لتأكيد الرفع أو نفيه. */
export const ALERT_INTERVAL_MS = 100;
export const ALERT_WINDOW_MS = 10_000;
/** أوقف المراقبة تلقائيًا إذا انخفضت البطارية عن هذا الحد (فكرة 9). */
export const LOW_BATTERY_STOP_PERCENT = 15;

export function createBatteryState(): BatteryState {
  return {
    mode: 'deep-sleep',
    sampleIntervalMs: DEEP_SLEEP_INTERVAL_MS,
    batteryAtArmPercent: null,
    batteryNowPercent: null,
    consumedPercent: null,
  };
}

/**
 * الانتقال بين حالات الطاقة — دالة خالصة.
 * - سكون → deep-sleep (عينة كل 5 ثوانٍ).
 * - أول اهتزاز مشبوه → alert (100ms لـ 10 ثوانٍ).
 * - تأكيد رفع → alarm (مراقبة كاملة + صرخة).
 * - بطارية < 15% → عودة للنوم العميق (لا إيقاف صامت للمراقبة —
 *   المراقبة تستمر بعينات نادرة؛ الإيقاف الكامل قرار مالك لا تلقائي).
 */
export function nextBatteryMode(
  current: BatteryState,
  event: 'still' | 'suspect' | 'lift-confirmed' | 'back-to-still' | 'low-battery',
  batteryPercent: number | null,
): BatteryState {
  const next: BatteryState = { ...current, batteryNowPercent: batteryPercent };
  if (batteryPercent !== null && batteryPercent < LOW_BATTERY_STOP_PERCENT) {
    return { ...next, mode: 'deep-sleep', sampleIntervalMs: DEEP_SLEEP_INTERVAL_MS };
  }
  switch (event) {
    case 'suspect':
      return { ...next, mode: 'alert', sampleIntervalMs: ALERT_INTERVAL_MS };
    case 'lift-confirmed':
      return { ...next, mode: 'alarm', sampleIntervalMs: ALERT_INTERVAL_MS };
    case 'back-to-still':
      return { ...next, mode: 'deep-sleep', sampleIntervalMs: DEEP_SLEEP_INTERVAL_MS };
    case 'still':
    case 'low-battery':
    default:
      return next;
  }
}

/** احسب الاستهلاك المقيس للجلسة (null = لم يُقَس بعد — لا تخمين). */
export function measuredConsumption(state: BatteryState): number | null {
  if (state.batteryAtArmPercent === null || state.batteryNowPercent === null) return null;
  return Math.max(0, state.batteryAtArmPercent - state.batteryNowPercent);
}

/** نص الاستهلاك للواجهة: يعرض الرقم المقيس فقط، وإلا «لم يُقَس بعد». */
export function consumptionLabelAr(state: BatteryState): string {
  const c = measuredConsumption(state);
  if (c === null) return 'استهلاك البطارية: لم يُقَس بعد على هذا الجهاز';
  return `استهلك التطبيق ${c}% منذ بدء الحراسة`;
}
