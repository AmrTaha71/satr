// ستر — مهلة المالك 3 ثوانٍ (فكرة 3)
// ============================================================
// عند اكتشاف حركة لا يصرخ الهاتف فورًا: مهلة صامتة 3 ثوانٍ تظهر
// فيها نافذة البصمة/الوجه الرسمية. نجاح المالك = إلغاء صامت تمامًا
// (بلا صوت وبلا سجل). فشل أو انتهاء المهلة = صفارة فورًا
// (صارم فقط، قرار §9/5 — لا مرحلة تحذير في الكود إطلاقًا).
// على iOS تعمل المهلة بكفاءة والتطبيق مفتوح فقط — يُقال ذلك صراحة.

export const GRACE_MS = 3000;

export type GraceOutcome = 'owner-verified' | 'failed' | 'expired';

export interface GraceState {
  /** بدأت المهلة؟ */
  active: boolean;
  /** متى بدأت (ms). */
  startedAtMs: number | null;
  /** كم بقي (ms) — يُحسب من الساعة، لا من عدّاد متراكم. */
  remainingMs: number;
}

export function startGrace(nowMs: number): GraceState {
  return { active: true, startedAtMs: nowMs, remainingMs: GRACE_MS };
}

export function graceRemaining(state: GraceState, nowMs: number): number {
  if (!state.active || state.startedAtMs === null) return 0;
  return Math.max(0, GRACE_MS - (nowMs - state.startedAtMs));
}

/** هل انتهت المهلة دون تحقق؟ */
export function graceExpired(state: GraceState, nowMs: number): boolean {
  return state.active && graceRemaining(state, nowMs) <= 0;
}

export interface BiometricPrompt {
  /**
   * اعرض نافذة البصمة/الوجه الرسمية للنظام.
   * Android: BiometricPrompt — iOS: LAContext.
   * لا يُبنى كشف وجه/حيوية خاص: Face ID يرفض الصورة أصلًا
   * (مستشعر العمق) — القيمة هي عدّ الفشل والصراخ عليه (فكرة 99).
   */
  authenticate(reasonAr: string): Promise<'success' | 'failed' | 'cancelled'>;
  /** هل البيومترية متاحة ومُفعّلة على هذا الجهاز؟ */
  isAvailable(): Promise<boolean>;
}

/**
 * نتيجة المهلة: يقررها نجاح البيومترية أو انتهاء الوقت.
 * - success → ألغِ كل شيء بصمت (لا صوت، لا سجل، لا إشعار).
 * - failed/cancelled → يُعامل كفشل: صفارة فورًا.
 * - expired → صفارة فورًا.
 * (صارم فقط، قرار §9/5 — لا مرحلة تحذير.)
 */
export function resolveGrace(
  biometric: 'success' | 'failed' | 'cancelled' | null,
  expired: boolean,
): GraceOutcome {
  if (biometric === 'success') return 'owner-verified';
  if (expired) return 'expired';
  return 'failed';
}
