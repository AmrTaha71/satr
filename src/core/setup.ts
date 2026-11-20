// ستر — الإعداد الأول (60 ثانية، بلا حساب) — فكرة 83
// ============================================================
// الهدف المقيس: إكمال الإعداد في 60 ثانية (هدف تصميمي — يُقاس على
// 5 أجهزة حقيقية أولًا؛ إن كان الوسيط ~90 ثانية يُغيَّر الوعد).
// لا حساب، لا بريد، لا رقم هاتف. لا يمكن تخطّي اختيار رمز الإيقاف.

export type SetupStep =
  | 'welcome'
  | 'stop-code'
  | 'stop-code-confirm'
  | 'biometric'
  | 'try-scream'
  | 'explainer'
  | 'done';

export const SETUP_STEPS: SetupStep[] = [
  'welcome',
  'stop-code',
  'stop-code-confirm',
  'biometric',
  'try-scream',
  'explainer',
  'done',
];

export const SETUP_TARGET_SECONDS = 60;

export const SETUP_STEP_AR: Record<SetupStep, string> = {
  welcome: 'أهلًا بك',
  'stop-code': 'اختر رمز الإيقاف',
  'stop-code-confirm': 'أكّد رمز الإيقاف',
  biometric: 'البصمة / الوجه',
  'try-scream': 'جرّب الصرخة بنفسك',
  explainer: 'ماذا يعمل على هاتفك؟',
  done: 'تم الإعداد',
};

export interface SetupState {
  step: SetupStep;
  startedAtMs: number;
  /** رمز الإيقاف مؤقتًا في الذاكرة فقط حتى التأكيد — لا يُحفظ نصًا أبدًا. */
  pendingCode: string | null;
  biometricEnabled: boolean;
  biometricSkipped: boolean;
  screamTried: boolean;
}

/** هل أُكملت الخطوات الإلزامية؟ (الرمز إلزامي؛ البصمة اختيارية). */
export function setupCanFinish(state: SetupState): boolean {
  return state.pendingCode !== null && state.screamTried;
}

export function setupElapsedSeconds(state: SetupState, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - state.startedAtMs) / 1000));
}

export function nextStep(current: SetupStep): SetupStep {
  const i = SETUP_STEPS.indexOf(current);
  return SETUP_STEPS[Math.min(SETUP_STEPS.length - 1, i + 1)];
}
