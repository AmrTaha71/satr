// ستر — الجسر الأصلي (Native Bridge)
// ============================================================
// واجهتا TypeScript للوحدتين الأصليتين — كل منصة بشكلها الحقيقي،
// لا واجهة واحدة موحّدة تخفي الفروق:
//   iOS (Swift — القطعة الأولى، قرار §9/1): ios/WalaTajassasu/
//     GuardModeModule (RCTEventEmitter): وضع حراسة في المقدمة +
//     Face ID / Touch ID + صفارة إنذار حريق. يرسل عينات الحركة
//     عبر حدث GuardSensorSample، وانقطاع المقدمة عبر GuardInterrupted.
//     لا يملك تخزين رمز إيقاف (Keychain) بعد — انظر الملاحظة أدناه.
//   Android (Kotlin — ثانيًا): android/.../alarm/
//     AlarmModule + MotionAlarmService (خدمة أمامية) + ScreamPlayer.
//     يملك تخزين رمز الإيقاف في Keystore والتحقق منه أصليًا.
//
// الفروق التي يجب أن يحترمها أي كود يستدعي الوحدتين:
// - بدء الحراسة: iOS ‏startGuardMode()‎ بلا وسائط؛ Android ‏startGuard(sensitivity)‎.
// - الصرخة: iOS ‏startScream(soundFile, graduated, rampSeconds)‎ (موضعية،
//   اسم ملف بلا امتداد)؛ Android ‏startScream(config: ScreamConfig)‎ (كائن).
// - حدث العينات: الاسم القانوني على المنصتين GuardSensorSample.
// - رمز الإيقاف: Android أصليًا (store/verifyStopCode)؛ على iOS يُتحقق
//   منه في TypeScript من السجل المحفوظ في الذاكرة (App.tsx) حتى يُبنى
//   جسر Keychain لـ GuardModeModule — الرمز حينها لجلسة واحدة فقط
//   (يُفقد بإغلاق التطبيق)؛ لا يُدَّعى غير ذلك.

import type { ScreamConfig, StopCodeRecord } from '../core';

/** أحداث GuardModeModule (iOS) إلى JavaScript. */
export const GUARD_SENSOR_SAMPLE_EVENT = 'GuardSensorSample';
export const GUARD_INTERRUPTED_EVENT = 'GuardInterrupted';
export const GUARD_MOTION_UNAVAILABLE_EVENT = 'GuardMotionUnavailable';

/** عينة حساس واحدة من الوحدة الأصلية (iOS: GuardModeModule). */
export interface GuardSensorSample {
  ax: number;
  ay: number;
  az: number;
  gx?: number;
  gy?: number;
  gz?: number;
}

/** وحدة iOS الأصلية كما هي فعلًا في GuardModeModule.swift + ‎.m. */
export interface GuardModeNativeModule {
  /** ابدأ مراقبة الحركة في المقدمة (CoreMotion DeviceMotion). */
  startGuardMode(): Promise<void>;
  /** أوقف المراقبة والصفارة. */
  stopGuardMode(): Promise<void>;
  /** نافذة Face ID / Touch ID الرسمية — تعيد 'success' أو 'failed'. */
  authenticate(reason: string): Promise<string>;
  /** ابدأ صفارة إنذار الحريق (اسم ملف بلا امتداد، مثل 'siren'). */
  startScream(soundFile: string, graduated: boolean, rampSeconds: number): Promise<void>;
  stopScream(): Promise<void>;
  /** مستوى صوت النظام الحالي 0..1 (للتحذير إن كان منخفضًا). */
  currentVolume(): Promise<number>;
  isPlaying(): Promise<boolean>;
  /** غير موجودة في Swift بعد — تُستدعى بشرط الوجود فقط (App.tsx). */
  isBiometricAvailable?(): Promise<boolean>;
}

/** وحدة Android الأصلية كما هي فعلًا في AlarmModule.kt. */
export interface AlarmNativeModule {
  /** ابدأ خدمة الحراسة الأمامية (MotionAlarmService). */
  startGuard(sensitivity: string): Promise<void>;
  /** أوقف الحراسة والصرخة. */
  stopGuard(): Promise<void>;
  /** هل الحراسة تعمل الآن؟ (تعيد false محافظةً في القطعة الأولى.) */
  isGuardRunning(): Promise<boolean>;

  /** ابدأ الصرخة عبر مسار التنبيه (كائن إعدادات، لا وسائط موضعية). */
  startScream(config: ScreamConfig): Promise<void>;
  stopScream(): Promise<void>;

  /** نافذة البصمة/الوجه الرسمية للنظام. */
  authenticate(reasonAr: string): Promise<'success' | 'failed' | 'cancelled'>;
  isBiometricAvailable(): Promise<boolean>;

  /** خزّن هاش رمز الإيقاف في Keystore (لا نص أبدًا). */
  storeStopCode(record: StopCodeRecord): Promise<void>;
  /** تحقّق من الرمز أصليًا (المقارنة تتم في الكود الأصلي). */
  verifyStopCode(code: string): Promise<boolean>;
  hasStopCode(): Promise<boolean>;

  /** مستوى صوت مسار التنبيه الحالي 0..1 (تشخيصي فقط — Android يرفع
   * المسار إلى الأقصى بنفسه عند بدء الصفارة، فلا تحذير انخفاض عليه). */
  getAlarmVolume(): Promise<number>;
}

export type GuardNativeModule = GuardModeNativeModule | AlarmNativeModule;

/** اختر الوحدة الأصلية الموجودة: iOS أولًا، ثم Android. */
export function pickGuardModule(
  modules: Record<string, GuardNativeModule | undefined>,
): GuardNativeModule | undefined {
  return modules.GuardModeModule ?? modules.AlarmModule;
}

/** هل هذه وحدة iOS (GuardModeModule)؟ — بها startGuardMode لا startGuard. */
export function isGuardModeModule(mod: GuardNativeModule): mod is GuardModeNativeModule {
  return typeof (mod as GuardModeNativeModule).startGuardMode === 'function';
}

/**
 * الوحدة الأصلية غير مثبّتة (مثلًا في المحاكي قبل بناء الكود الأصلي):
 * تُرمى رسالة واضحة بدل فشل صامت.
 */
export function requireNativeModule(modules: Record<string, GuardNativeModule | undefined>): GuardNativeModule {
  const mod = pickGuardModule(modules);
  if (!mod) {
    throw new Error(
      'لا وحدة أصلية مثبّتة (GuardModeModule على iOS أو AlarmModule على Android) — ابنِ الكود الأصلي (Xcode / Android Studio) أولًا.',
    );
  }
  return mod;
}
