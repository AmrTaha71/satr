// ستر — النواة المشتركة (TypeScript)
// ============================================================
// ملاحظة صدق: كل الأرقام هنا (العتبات، نسب البطارية، زمن التدرّج)
// تقديرات من وثيقة الـ100 فكرة والمخطط — غير مقيسة على جهاز حقيقي.
// يجب قياسها على أجهزة حقيقية قبل كتابتها في التطبيق أو المتجر.
// لا يوجد هنا أي اتصال شبكي: التطبيق محلي فقط، بلا خادم، بلا حساب.

export type PlatformId = 'android' | 'ios';

export interface SensorSample {
  /** زمن العينة (ms منذ بدء المراقبة). */
  t: number;
  /** التسارع على المحاور الثلاثة بوحدة g (يشمل الجاذبية ~1g). */
  ax: number;
  ay: number;
  az: number;
  /** سرعة الدوران rad/s (إن توفّر الجيروسكوب). */
  gx?: number;
  gy?: number;
  gz?: number;
  /** تغيّر الضغط الجوي hPa منذ آخر عينة (بارومتر، إن وُجد). */
  pressureDeltaHpa?: number;
  /** مستشعر القرب: true = شيء قريب جدًا من الهاتف. */
  proximityNear?: boolean;
  /** لمس الشاشة أثناء التسليح. */
  screenTouched?: boolean;
}

/** نتيجة تقييم عينة واحدة. */
export type MotionVerdict =
  | { kind: 'still' }
  | { kind: 'noise'; reason: string }
  | { kind: 'suspect'; reason: string }
  | { kind: 'lift'; reason: string };

export interface SensitivityLevel {
  id: 'sleeping' | 'sitting' | 'very-sensitive';
  /** الاسم العربي الظاهر في الواجهة. */
  labelAr: string;
  /** وصف من سطر واحد. */
  hintAr: string;
  /** عتبة التسارع (انحراف عن 1g) بوحدة g — فكرة 2. */
  accelThresholdG: number;
  /** زمن التأكيد: كم يجب أن يستمر التجاوز قبل اعتباره حركة. */
  confirmMs: number;
  /** تجاهل الاهتزازات الدورية القصيرة (اهتزاز طاولة). */
  ignorePeriodicVibration: boolean;
  /** هل يفعّل مستشعر القرب / لمس الشاشة؟ */
  useProximityAndTouch: boolean;
  /** عتبة تغيّر الزاوية (درجات) لتمييز «الرفع» عن «الاهتزاز» — فكرة 5. */
  liftAngleDegrees: number;
}

/**
 * مستويات الحساسية الثلاثة — فكرة 2.
 * الأرقام من وثيقة الأفكار: نائم 0.15g / 0.2s، جالس 0.5g / 1s،
 * حسّاس جدًا 0.05g. هذه تقديرات غير مقيسة — تُعايَر على الجهاز.
 */
export const SENSITIVITY_LEVELS: Record<SensitivityLevel['id'], SensitivityLevel> = {
  sleeping: {
    id: 'sleeping',
    labelAr: 'نائم',
    hintAr: 'أي حركة مهما صغرت تُصرخ — للّيل',
    accelThresholdG: 0.15,
    confirmMs: 200,
    ignorePeriodicVibration: false,
    useProximityAndTouch: false,
    liftAngleDegrees: 15,
  },
  sitting: {
    id: 'sitting',
    labelAr: 'جالس بجانبي',
    hintAr: 'يتجاهل اهتزاز الطاولة الخفيف — الوضع الافتراضي',
    accelThresholdG: 0.5,
    confirmMs: 1000,
    ignorePeriodicVibration: true,
    useProximityAndTouch: false,
    liftAngleDegrees: 25,
  },
  'very-sensitive': {
    id: 'very-sensitive',
    labelAr: 'حسّاس جدًا',
    hintAr: 'حتى اللمس الخفيف يُصرخ',
    accelThresholdG: 0.05,
    confirmMs: 100,
    ignorePeriodicVibration: false,
    useProximityAndTouch: true,
    liftAngleDegrees: 10,
  },
};

/** الافتراضي: «جالس بجانبي» — فكرة 92 (لا يصرخ من اهتزاز طاولة خفيف). */
export const DEFAULT_SENSITIVITY_ID: SensitivityLevel['id'] = 'sitting';

export interface MotionEngineConfig {
  sensitivity: SensitivityLevel;
  /** بارومتر متاح على هذا الجهاز؟ إن غاب، يُستخدم التسارع + الجيروسكوب فقط. */
  hasBarometer: boolean;
  /** آخر قراءة ضغط مرجعية (لقياس تغيّر الارتفاع عند الرفع). */
  referencePressureHpa?: number;
}

export interface MotionEngineState {
  /** متى بدأ التجاوز الحالي (ms)، أو null إن لم يبدأ. */
  suspectSinceMs: number | null;
  /** زاوية الميل المرجعية عند التسليح (أول عينة بعد التسليح). */
  baselineTiltDegrees: number | null;
  /** عدد الاهتزازات القصيرة المتجاهَلة في هذه الجلسة (للتشخيص). */
  ignoredVibrations: number;
}

export function createMotionState(): MotionEngineState {
  return { suspectSinceMs: null, baselineTiltDegrees: null, ignoredVibrations: 0 };
}

function accelMagnitude(s: SensorSample): number {
  return Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
}

/** زاوية الميل التقديرية من متجه التسارع (0° = مستوٍ على ظهره). */
export function tiltDegrees(s: SensorSample): number {
  const mag = accelMagnitude(s);
  if (mag === 0) return 0;
  // زاوية متجه الجاذبية عن المحور العمودي للهاتف.
  return (Math.acos(Math.min(1, Math.abs(s.az) / mag)) * 180) / Math.PI;
}

/**
 * قيّم عينة واحدة.
 *
 * القاعدة (فكرتا 2 و5): «الرفع» = تغيّر زاوية + تسارع مستمر،
 * أما «اهتزاز الطاولة» = تسارع متذبذب قصير بلا تغيّر زاوية مستمر
 * فيُتجاهل في وضع «جالس بجانبي».
 *
 * هذه دالة خالصة (pure): لا تقرأ حساسات ولا تُصدر صوتًا — يسهل اختبارها.
 */
export function evaluateSample(
  sample: SensorSample,
  config: MotionEngineConfig,
  state: MotionEngineState,
): MotionVerdict {
  const level = config.sensitivity;
  const deviationG = Math.abs(accelMagnitude(sample) - 1);
  const tilt = tiltDegrees(sample);
  // زاوية الميل تُقاس مقابل وضعية التسليح (أول عينة)، لا مقابل العينة
  // السابقة: هاتف مرفوع وممسوك مائلًا يبقى مائلًا، ولو قورن بالعينة
  // السابقة لاختفى الفرق بعد عينة واحدة وعاد الحكم «ساكنًا».
  if (state.baselineTiltDegrees === null) state.baselineTiltDegrees = tilt;
  const tiltDelta = Math.abs(tilt - state.baselineTiltDegrees);

  // الوضع الحسّاس جدًا: لمس الشاشة أو اقتراب شيء = حركة فورًا.
  if (level.useProximityAndTouch && (sample.screenTouched === true || sample.proximityNear === true)) {
    return { kind: 'lift', reason: 'لمس أو اقتراب في وضع «حسّاس جدًا»' };
  }

  if (deviationG < level.accelThresholdG && tiltDelta < level.liftAngleDegrees) {
    state.suspectSinceMs = null;
    return { kind: 'still' };
  }

  // تجاوز لحظي قصير + تجاهل الاهتزاز الدوري = ضجيج طاولة، لا رفع.
  if (level.ignorePeriodicVibration && tiltDelta < level.liftAngleDegrees) {
    state.ignoredVibrations += 1;
    state.suspectSinceMs = null;
    return { kind: 'noise', reason: 'اهتزاز قصير بلا تغيّر زاوية — يُتجاهل (اهتزاز طاولة)' };
  }

  // بدأ تجاوز: ننتظر زمن التأكيد قبل الحكم (يمنع الإنذار الكاذب).
  if (state.suspectSinceMs === null) {
    state.suspectSinceMs = sample.t;
    return { kind: 'suspect', reason: 'تجاوز أولي — بانتظار التأكيد' };
  }
  if (sample.t - state.suspectSinceMs < level.confirmMs) {
    return { kind: 'suspect', reason: 'تجاوز مستمر — بانتظار التأكيد' };
  }

  // تأكّد التجاوز: هل هو رفع حقيقي (زاوية + استمرار)؟
  const isLift =
    tiltDelta >= level.liftAngleDegrees ||
    (config.hasBarometer &&
      sample.pressureDeltaHpa !== undefined &&
      Math.abs(sample.pressureDeltaHpa) > 0.02);
  state.suspectSinceMs = null;
  if (isLift) {
    return { kind: 'lift', reason: `رفع مؤكد: تغيّر زاوية ${tiltDelta.toFixed(0)}° وتسارع ${deviationG.toFixed(2)}g` };
  }
  return { kind: 'lift', reason: `حركة مؤكدة تجاوزت العتبة ${level.accelThresholdG}g لمدة ${level.confirmMs}ms` };
}
