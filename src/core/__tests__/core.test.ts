// ستر — اختبارات النواة المشتركة (TypeScript خالص، بلا هاتف).
// ============================================================
// تُشغَّل على MacBook بعد `npm install` عبر `npm test` (jest،
/// preset react-native — انظر jest.config.js).
// على جهاز البناء هذا (بلا node_modules) تُشغَّل المعادلات نفسها
// عبر فحص Node مؤقت يترجم src/core بـ tsc — انظر README «التحقق».
// كل ادّعاء هنا مرتبط بقرار §9 أو بفكرة من الـ100 فكرة؛ إن فشل
// اختبار واحد فالقرار غير مطبَّق — لا يُدَّعى نجاح لم يحدث.

import { createHash } from 'crypto';
import {
  ARM_COUNTDOWN_SECONDS,
  armReducer,
} from '../armMachine';
import type { ArmState } from '../armMachine';
import { createBatteryState, LOW_BATTERY_STOP_PERCENT, nextBatteryMode } from '../battery';
import {
  ANDROID_APP_LOCK_EXCLUDED_AR,
  ANDROID_APP_LOCK_LIST,
  APP_LOCK_PRIORITY,
  INTRUDER_EVIDENCE_CONFIG,
  SECTION_9_DECISIONS,
  TOP_PRIORITY_AR,
} from '../decisions';
import { EXPLAINER_INTRO_AR, explainerCardsFor } from '../explainer';
import { GRACE_MS, resolveGrace } from '../grace';
import { GuardRuntime } from '../guardRuntime';
import type { GuardPorts } from '../guardRuntime';
import {
  DEFAULT_SENSITIVITY_ID,
  SENSITIVITY_LEVELS,
  createMotionState,
  evaluateSample,
} from '../motion';
import type { SensorSample } from '../motion';
import {
  ARABIC_MESSAGE_RECORDING_EXISTS,
  DEFAULT_SCREAM_CONFIG,
  SPOKEN_VERSE_MESSAGE,
  screamVolumeAt,
} from '../scream';
import {
  createStopCodeRecord,
  generateSaltHex,
  isValidStopCode,
  sha256Hex,
  verifyStopCode,
} from '../stopCode';

function liftSample(t: number, tiltDeg: number): SensorSample {
  // هاتف مرفوع ومائل: تسارع بانحراف واضح عن 1g + زاوية ميل كبيرة.
  const rad = (tiltDeg * Math.PI) / 180;
  return { t, ax: 0.6, ay: 0.3, az: Math.cos(rad) * 0.9, gx: 0.1, gy: 0.1, gz: 0.1 };
}

function stillSample(t: number): SensorSample {
  return { t, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 };
}

describe('آلة الحالات — صارم فقط، بلا أي مرحلة تحذير (قرار §9/5)', () => {
  test('المهلة 3 ثوانٍ، والعد التنازلي 10 ثوانٍ', () => {
    expect(GRACE_MS).toBe(3000);
    expect(ARM_COUNTDOWN_SECONDS).toBe(10);
  });

  test('مهلة منتهية → صفارة فورًا بلا حالة تحذير إطلاقًا', () => {
    let s: ArmState = { status: 'disarmed' };
    s = armReducer(s, { type: 'PRESS_ARM' });
    for (let i = 0; i < ARM_COUNTDOWN_SECONDS; i++) s = armReducer(s, { type: 'COUNTDOWN_TICK' });
    expect(s.status).toBe('armed');
    s = armReducer(s, { type: 'MOTION_LIFT' });
    expect(s.status).toBe('grace');
    s = armReducer(s, { type: 'GRACE_FAILED_OR_EXPIRED' });
    expect(s.status).toBe('screaming');
  });

  test('لا وجود لحالة تحذير ولا لحدث تحذير في آلة الحالات', () => {
    // أي حالة 'warning' أو حدث 'WARNING_TICK' صار خطأ نوعيًا —
    // هذا الاختبار يثبت أن الانتقال الوحيد بعد المهلة هو الصفارة.
    let s: ArmState = { status: 'grace', msLeft: 0 };
    s = armReducer(s, { type: 'GRACE_FAILED_OR_EXPIRED' });
    expect(s.status).toBe('screaming');
    expect(s.status).not.toBe('warning' as never);
  });

  test('بصمة المالك أثناء المهلة تلغي كل شيء بصمت', () => {
    let s: ArmState = { status: 'grace', msLeft: 1500 };
    s = armReducer(s, { type: 'OWNER_VERIFIED' });
    expect(s.status).toBe('disarmed');
  });

  test('رمز خاطئ أثناء الصفارة لا يوقف شيئًا، والصحيح يوقفها', () => {
    let s: ArmState = { status: 'screaming', elapsedSeconds: 5 };
    s = armReducer(s, { type: 'STOP_CODE_WRONG' });
    expect(s.status).toBe('screaming');
    s = armReducer(s, { type: 'STOP_CODE_CORRECT' });
    expect(s.status).toBe('disarmed');
  });

  test('الخروج من المقدمة يلغي التسليح (iOS: الحراسة في المقدمة فقط)', () => {
    const s: ArmState = armReducer({ status: 'armed' }, { type: 'GUARD_INTERRUPTED' });
    expect(s.status).toBe('disarmed');
  });
});

describe('محرك الحركة — الرفع مقابل اهتزاز الطاولة (فكرتا 2 و5)', () => {
  test('وضع «جالس بجانبي» هو الافتراضي، واهتزاز قصير بلا زاوية يُتجاهل', () => {
    expect(DEFAULT_SENSITIVITY_ID).toBe('sitting');
    const state = createMotionState();
    const cfg = { sensitivity: SENSITIVITY_LEVELS.sitting, hasBarometer: false };
    expect(evaluateSample(stillSample(0), cfg, state).kind).toBe('still');
    // اهتزاز قصير: انحراف تسارع بلا تغيّر زاوية (صدمة عمودية).
    const v = evaluateSample({ t: 100, ax: 0, ay: 0, az: 1.6, gx: 0, gy: 0, gz: 0 }, cfg, state);
    expect(v.kind).toBe('noise');
  });

  test('رفع مستمر مع تغيّر زاوية → lift بعد زمن التأكيد', () => {
    const state = createMotionState();
    const cfg = { sensitivity: SENSITIVITY_LEVELS.sitting, hasBarometer: false };
    evaluateSample(stillSample(0), cfg, state); // تثبيت وضعية التسليح
    expect(evaluateSample(liftSample(100, 60), cfg, state).kind).toBe('suspect');
    expect(evaluateSample(liftSample(1200, 60), cfg, state).kind).toBe('lift');
  });
});

describe('رمز الإيقاف — SHA-256 + Salt (مخطط §7)', () => {
  test('تجزئة TypeScript تطابق Node crypto', () => {
    const input = 'abcd1234:0000';
    expect(sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'));
  });

  test('رمز صحيح يُقبَل والخاطئ يُرفَض، والشكل 4 أرقام بالضبط', () => {
    expect(isValidStopCode('1234')).toBe(true);
    expect(isValidStopCode('123')).toBe(false);
    expect(isValidStopCode('12a4')).toBe(false);
    const salt = generateSaltHex((n) => {
      const a = new Uint8Array(n);
      for (let i = 0; i < n; i++) a[i] = i * 7 + 3;
      return a;
    });
    const record = createStopCodeRecord('1234', salt);
    expect(record.hashHex).not.toContain('1234');
    expect(verifyStopCode('1234', record)).toBe(true);
    expect(verifyStopCode('0000', record)).toBe(false);
  });
});

describe('الصفارة — صفارة إنذار حريق + الآية (قرار §9/3)', () => {
  test('الافتراضي صفارة إنذار حريق متدرجة، والرسالة هي الآية (49:12)', () => {
    expect(DEFAULT_SCREAM_CONFIG.sound).toBe('siren');
    expect(DEFAULT_SCREAM_CONFIG.graduated).toBe(true);
    expect(SPOKEN_VERSE_MESSAGE).toBe('وَلَا تَجَسَّسُوا وَلَا يَغْتَب بَّعْضُكُم بَعْضًا');
    expect(DEFAULT_SCREAM_CONFIG.messageText).toBe(SPOKEN_VERSE_MESSAGE);
  });

  test('التسجيل الصوتي للآية غير موجود بعد — لا يُدَّعى أنه يُسمَع', () => {
    expect(ARABIC_MESSAGE_RECORDING_EXISTS).toBe(false);
  });

  test('التدرّج يبدأ منخفضًا ويصل للأقصى خلال زمن الوصول', () => {
    expect(screamVolumeAt(0, DEFAULT_SCREAM_CONFIG)).toBeLessThan(1);
    expect(screamVolumeAt(5, DEFAULT_SCREAM_CONFIG)).toBe(1);
    expect(screamVolumeAt(99, DEFAULT_SCREAM_CONFIG)).toBe(1);
  });
});

describe('المهلة والبطارية والإعداد', () => {
  test('نجاح البصمة = إلغاء صامت، والفشل/الانتهاء = صفارة', () => {
    expect(resolveGrace('success', false)).toBe('owner-verified');
    expect(resolveGrace('failed', false)).toBe('failed');
    expect(resolveGrace(null, true)).toBe('expired');
  });

  test('بطارية أقل من 15% تعيد المراقبة للنوم العميق لا توقفها بصمت', () => {
    const s = nextBatteryMode(createBatteryState(), 'suspect', 10);
    expect(s.mode).toBe('deep-sleep');
    expect(LOW_BATTERY_STOP_PERCENT).toBe(15);
  });

  test('الشرح الصادق: قفل واتساب مستحيل على iOS وممكن على Android (المرحلة 2)', () => {
    expect(EXPLAINER_INTRO_AR).toContain('بصدق');
    const ios = explainerCardsFor('ios').find((c) => c.id === 'app-lock');
    const android = explainerCardsFor('android').find((c) => c.id === 'app-lock');
    expect(ios?.status).toBe('impossible');
    expect(android?.status).toBe('works');
  });
});

describe('قرارات §9 — مطبَّقة في الكود لا في التعليقات فقط', () => {
  test('القرارات الـ12 كلها مسجَّلة؛ 10 نافذة + 1 مفتوحة (تقرير 04) + 1 ملغاة', () => {
    expect(SECTION_9_DECISIONS).toHaveLength(12);
    const byId = new Map(SECTION_9_DECISIONS.map((d) => [d.id, d]));
    expect(byId.get(1)?.answerAr).toContain('iOS أولًا');
    expect(byId.get(4)?.status).toBe('cancelled'); // رمز الطوارئ المموَّه — أُلغي نهائيًا
    expect(byId.get(5)?.answerAr).toContain('صارم');
    expect(byId.get(9)?.status).toBe('open'); // الفتاوى — تقرير 04
    expect(byId.get(10)?.status).toBe('answered'); // الاسم «ستر» — اختاره عمرو 2026-11-12
    expect(byId.get(10)?.answerAr).toContain('ستر');
    expect(byId.get(11)?.answerAr).toContain('مجاني');
  });

  test('قائمة قفل Android: واتساب + تيليجرام + ماسنجر + المعرض فقط؛ بلا إيميل', () => {
    expect(ANDROID_APP_LOCK_LIST.map((a) => a.id)).toEqual([
      'whatsapp',
      'telegram',
      'messenger',
      'gallery',
    ]);
    expect(ANDROID_APP_LOCK_EXCLUDED_AR).toContain('الإيميل');
  });

  test('دليل المتطفل: معاينة ظاهرة فقط — لا التقاط صامت إطلاقًا (قرار §9/6)', () => {
    expect(INTRUDER_EVIDENCE_CONFIG.method).toBe('visible-preview');
    expect(INTRUDER_EVIDENCE_CONFIG.photoEnabled).toBe(true);
    expect(INTRUDER_EVIDENCE_CONFIG.video5sEnabled).toBe(true);
  });

  test('الأولوية: إنذار الحركة أولًا؛ قفل التطبيقات أولوية منخفضة', () => {
    expect(TOP_PRIORITY_AR).toContain('إنذار الحركة هو الأولوية الأولى');
    expect(APP_LOCK_PRIORITY).toBe('low');
  });
});

describe('GuardRuntime — التدفق الصارم الكامل بمنافذ وهمية', () => {
  test('رفع → مهلة (بصمة فاشلة) → صفارة فورًا بلا تحذير → طلب دليل (صورة + فيديو 5ث)', async () => {
    const states: ArmState[] = [];
    const evidence: Array<'photo' | 'video-5s'> = [];
    const ports: GuardPorts = {
      scream: {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isPlaying: jest.fn().mockResolvedValue(false),
        preview: jest.fn().mockResolvedValue(undefined),
      },
      biometric: { authenticate: jest.fn().mockResolvedValue('failed'), isAvailable: jest.fn().mockResolvedValue(true) },
      onState: (s) => states.push(s),
      onEvidenceRequested: (kind) => evidence.push(kind),
    };
    const rt = new GuardRuntime(
      ports,
      { sensitivity: SENSITIVITY_LEVELS.sitting, hasBarometer: false },
      DEFAULT_SCREAM_CONFIG,
    );
    rt.pressArmButton();
    for (let i = 0; i < ARM_COUNTDOWN_SECONDS; i++) rt.tickOneSecond();
    expect(rt.getState().status).toBe('armed');
    // عينات: سكون لتثبيت الوضعية، ثم رفع مستمر.
    await rt.onSensorSample(stillSample(0));
    await rt.onSensorSample(liftSample(100, 60));
    await rt.onSensorSample(liftSample(1500, 60));
    // المهلة 3 ثوانٍ + فشل البصمة → صفارة.
    await new Promise((r) => setTimeout(r, 3600));
    expect(rt.getState().status).toBe('screaming');
    expect(states.some((s) => s.status === 'warning' as never)).toBe(false); // بلا تحذير إطلاقًا — لا حالة تحذير في الكود
    expect(evidence).toEqual(['photo', 'video-5s']);
    expect(ports.scream.start).toHaveBeenCalled();
  }, 10000);

  test('بصمة ناجحة أثناء المهلة تلغي كل شيء بصمت بلا صرخة', async () => {
    const states: ArmState[] = [];
    const ports: GuardPorts = {
      scream: {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isPlaying: jest.fn().mockResolvedValue(false),
        preview: jest.fn().mockResolvedValue(undefined),
      },
      biometric: { authenticate: jest.fn().mockResolvedValue('success'), isAvailable: jest.fn().mockResolvedValue(true) },
      onState: (s) => states.push(s),
    };
    const rt = new GuardRuntime(
      ports,
      { sensitivity: SENSITIVITY_LEVELS.sitting, hasBarometer: false },
    );
    rt.pressArmButton();
    for (let i = 0; i < ARM_COUNTDOWN_SECONDS; i++) rt.tickOneSecond();
    await rt.onSensorSample(stillSample(0));
    await rt.onSensorSample(liftSample(100, 60));
    await rt.onSensorSample(liftSample(1500, 60));
    expect(rt.getState().status).toBe('disarmed');
    expect(ports.scream.start).not.toHaveBeenCalled();
  }, 10000);

  test('انقطاع المقدمة أثناء الصفارة يوقف الصوت ويلغي التسليح', async () => {
    const ports: GuardPorts = {
      scream: {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isPlaying: jest.fn().mockResolvedValue(false),
        preview: jest.fn().mockResolvedValue(undefined),
      },
      biometric: { authenticate: jest.fn().mockResolvedValue('failed'), isAvailable: jest.fn().mockResolvedValue(true) },
      onState: () => undefined,
    };
    const rt = new GuardRuntime(
      ports,
      { sensitivity: SENSITIVITY_LEVELS.sitting, hasBarometer: false },
      DEFAULT_SCREAM_CONFIG,
    );
    rt.pressArmButton();
    for (let i = 0; i < ARM_COUNTDOWN_SECONDS; i++) rt.tickOneSecond();
    await rt.onSensorSample(stillSample(0));
    await rt.onSensorSample(liftSample(100, 60));
    await rt.onSensorSample(liftSample(1500, 60));
    await new Promise((r) => setTimeout(r, 3600));
    expect(rt.getState().status).toBe('screaming');
    await rt.interruptGuard();
    expect(rt.getState().status).toBe('disarmed');
    expect(ports.scream.stop).toHaveBeenCalled();
  }, 10000);
});
