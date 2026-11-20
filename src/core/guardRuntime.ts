// ستر — ربط وقت التشغيل (Guard Runtime)
// ============================================================
// يربط القطع معًا: عينات الحساس (من الخدمة الأمامية / CoreMotion)
// → محرك الحركة → آلة الحالات → مهلة 3 ثوانٍ (BiometricPrompt)
// → صرخة فورًا بعد المهلة (صارم فقط، قرار §9/5 — لا مرحلة تحذير)
// → إيقاف ببصمة أو رمز.
//
// المنافذ (ports) قابلة للحقن: تُختبَر هذه الوحدة دون هاتف،
// وعلى الجهاز تُحقَن بالوحدة الأصلية AlarmModule (Android)
// أو GuardModeModule (iOS — القطعة الأولى).

import type { ArmEvent, ArmState } from './armMachine';
import { armReducer } from './armMachine';
import type { MotionEngineConfig, MotionEngineState, SensorSample } from './motion';
import { createMotionState, evaluateSample } from './motion';
import type { ScreamConfig, ScreamEngine } from './scream';
import { DEFAULT_SCREAM_CONFIG } from './scream';
import type { BiometricPrompt } from './grace';
import { GRACE_MS } from './grace';

export interface GuardPorts {
  scream: ScreamEngine;
  biometric: BiometricPrompt;
  /** يُستدعى عند كل تغيّر حالة — الواجهة ترسم منه. */
  onState: (state: ArmState) => void;
  /** يُستدعى عند حادثة تستحق السجل (رفع مؤكد، رمز خاطئ...). */
  onIncident?: (summaryAr: string, screamed: boolean) => void;
  /**
   * دليل المتطفل (صورة / فيديو 5 ثوانٍ) — PLACEHOLDER فقط.
   * قرار §9/6 (تحديث 00:35): التصوير «نعم» بطريقة المعاينة الظاهرة
   * المؤكدة — لا التقاط صامت إطلاقًا. الفيديو 5 ثوانٍ مخطط في
   * المرحلة 3 (قرار §9/7). لا كود كاميرا خلف هذا المنفذ بعد على أي
   * منصة — يُستدعى عند بدء الصفارة ليُوصَل لاحقًا، ولا يُدَّعى أنه يعمل.
   */
  onEvidenceRequested?: (kind: 'photo' | 'video-5s') => void;
}

export class GuardRuntime {
  private state: ArmState = { status: 'disarmed' };
  private motionState: MotionEngineState = createMotionState();
  private motionConfig: MotionEngineConfig;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** مُحِلّ وعد المهلة — بلا تخزينه كان clearTimeout في stopByOwner /
   * interruptGuard يترك `await` في runGrace معلّقًا إلى الأبد (وعد
   * لا يُحَلّ أبدًا). النتيجة كانت سليمة صدفةً (لا صفارة بعد الإلغاء)
   * لكن الاستمرارية المسربة تبقى معلّقة طوال الجلسة. */
  private graceResolve: (() => void) | null = null;
  private screamStartedAt: number | null = null;

  constructor(
    private ports: GuardPorts,
    motionConfig: MotionEngineConfig,
    private screamConfig: ScreamConfig = DEFAULT_SCREAM_CONFIG,
  ) {
    this.motionConfig = motionConfig;
  }

  getState(): ArmState {
    return this.state;
  }

  /**
   * غيّر الحساسية من الواجهة (شاشة الحساسية) — تُطبَّق فورًا دون
   * إعادة تشغيل، وتُصفَّر حالة الحركة (وضعية تسليح جديدة).
   */
  setSensitivity(level: import('./motion').SensitivityLevel): void {
    this.motionConfig = { ...this.motionConfig, sensitivity: level };
    this.motionState = createMotionState();
  }

  private emit(event: ArmEvent): void {
    this.state = armReducer(this.state, event);
    this.ports.onState(this.state);
  }

  /** زر «فعّل الحماية» / «إلغاء» / «أوقف الحماية» (البصمة من الواجهة). */
  pressArmButton(): void {
    if (this.state.status === 'disarmed') this.emit({ type: 'PRESS_ARM' });
    else if (this.state.status === 'arming') this.emit({ type: 'CANCEL_ARMING' });
  }

  /** تُستدعى كل ثانية أثناء العد التنازلي 10 ثوانٍ وعدّاد الصفارة. */
  tickOneSecond(): void {
    if (this.state.status === 'arming') this.emit({ type: 'COUNTDOWN_TICK' });
    else if (this.state.status === 'screaming') {
      const elapsed = this.screamStartedAt === null ? 0 : Math.round((Date.now() - this.screamStartedAt) / 1000);
      this.emit({ type: 'SCREAM_TICK', elapsedSeconds: elapsed });
    }
  }

  /**
   * عينة حساس واحدة من الخدمة الأمامية (Android) أو CoreMotion (iOS).
   * تُقيَّم في النواة المشتركة؛ الرفع المؤكد يبدأ مهلة 3 ثوانٍ.
   */
  async onSensorSample(sample: SensorSample): Promise<void> {
    if (this.state.status !== 'armed') return;
    const verdict = evaluateSample(sample, this.motionConfig, this.motionState);
    if (verdict.kind !== 'lift') return;
    this.emit({ type: 'MOTION_LIFT' });
    this.ports.onIncident?.(`رُفع الهاتف — ${verdict.reason}`, false);
    await this.runGrace();
  }

  /** مهلة 3 ثوانٍ: نافذة بصمة فورًا؛ نجاح = إلغاء صامت، وإلا صفارة فورًا (صارم فقط، قرار §9/5). */
  private async runGrace(): Promise<void> {
    const startedAt = Date.now();
    const result = await this.ports.biometric.authenticate('تحرّك هاتفك — تحقّق أنك المالك');
    if (this.state.status !== 'grace') return; // أُلغي التسليح أثناء المهلة
    if (result === 'success') {
      this.emit({ type: 'OWNER_VERIFIED' });
      return;
    }
    // فشل أو إلغاء: انتظر بقية المهلة ثم صفارة فورًا — بلا أي تحذير.
    const remaining = GRACE_MS - (Date.now() - startedAt);
    await new Promise<void>((resolve) => {
      this.graceResolve = resolve;
      this.graceTimer = setTimeout(resolve, Math.max(0, remaining));
    });
    this.graceResolve = null;
    this.graceTimer = null;
    if (this.state.status !== 'grace') return;
    this.emit({ type: 'GRACE_FAILED_OR_EXPIRED' });
    // الصفارة تُشغَّل مباشرة هنا — بلا مراقبة دورية وبلا فحص حالة:
    // من grace هذا الحدث ينتقل حتمًا لـ screaming (لا مسار آخر بعد
    // إزالة الوضع المهذب)، والمراقبة الدورية السابقة كانت تُخفي
    // سباقًا (انظر App.tsx: إعادة بدء الحراسة الأصلية عند كل تغيّر
    // حالة كانت قد توقف الصفارة لحظة بدئها).
    this.screamStartedAt = Date.now();
    void this.ports.scream.start(this.screamConfig);
    this.ports.onIncident?.('بدأت الصفارة بعد انتهاء المهلة', true);
    // دليل المتطفل — PLACEHOLDER: يُستدعى فقط، لا يعمل بعد (قرار §9/6 و7).
    this.ports.onEvidenceRequested?.('photo');
    this.ports.onEvidenceRequested?.('video-5s');
  }

  /** إيقاف الصرخة / إلغاء التسليح بعد تحقق ناجح (بصمة أو رمز صحيح). */
  async stopByOwner(): Promise<void> {
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    // حلّ وعد المهلة المعلّق حتى تعود runGrace وتخرج بفحص الحالة —
    // بلا هذا يبقى await معلّقًا إلى الأبد بعد كل إلغاء أثناء المهلة.
    if (this.graceResolve !== null) {
      const resolve = this.graceResolve;
      this.graceResolve = null;
      resolve();
    }
    if (this.screamStartedAt !== null) {
      await this.ports.scream.stop();
      this.screamStartedAt = null;
    }
    this.emit({ type: 'OWNER_VERIFIED' });
  }

  /** رمز إيقاف خاطئ: لا يوقف شيئًا — يُسجَّل فقط (فكرة 99: عدّ المحاولات الفاشلة). */
  recordWrongStopCode(): void {
    this.ports.onIncident?.('رمز إيقاف خاطئ أثناء الصفارة', true);
  }

  /**
   * انقطاع الحراسة: خرج التطبيق من المقدمة (iOS: قفل الشاشة أو تبديل
   * التطبيق) فتوقفت مراقبة الحركة. يُوقف الصفارة إن كانت تعمل ويلغي
   * التسليح — ليس إلغاءً بالمالك، بل توقفًا قسريًا تُظهره الواجهة.
   */
  async interruptGuard(): Promise<void> {
    if (this.graceTimer !== null) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.graceResolve !== null) {
      const resolve = this.graceResolve;
      this.graceResolve = null;
      resolve();
    }
    if (this.screamStartedAt !== null) {
      await this.ports.scream.stop();
      this.screamStartedAt = null;
    }
    this.emit({ type: 'GUARD_INTERRUPTED' });
  }
}
