// ستر — التطبيق (القطعة الأولى: iOS أولًا — منبّه حركة + صفارة + مهلة 3 ثوانٍ)
// واجهة عربية فقط. لا حساب، لا بريد، لا بيانات تخرج من الهاتف.
//
// التوصيل (قرار §9/1: iOS أولًا):
// - GuardRuntime (النواة المشتركة) هو مالك الحالة الوحيد.
// - عينات الحركة تأتي من GuardModeModule.swift عبر حدث `GuardSensorSample`
//   (NativeEventEmitter) — الوحدة الأصلية ترسل العينات فقط، والقرار في النواة.
// - بدء/إيقاف الحراسة الأصلية مربوط بحالة النواة: أي حالة غير «متوقفة»
//   تشغّل startGuardMode (iOS) أو startGuard (Android)، و«متوقفة» توقفها.
//   (قبل هذا الربط لم يكن startGuardMode يُستدعى من JS إطلاقًا —
//   فلم تكن أي عينة لتصل على جهاز حقيقي.)
// - الصفارة والبصمة عبر GuardModeModule (iOS) / AlarmModule (Android لاحقًا) —
//   التوقيع يختلف بين المنصتين (انظر src/native/bridge.ts) فيُكيَّف هنا.
// - الخروج من المقدمة على iOS يوقف الحراسة (حدث GuardInterrupted).
// - رمز الإيقاف: سجله (Salt + Hash، لا نص) يأتي من الإعداد ويُحفظ في
//   Keystore على Android أصليًا؛ على iOS يبقى في الذاكرة لجلسة واحدة
//   حتى يُبنى جسر Keychain لـ GuardModeModule (لا يُدَّعى غير ذلك).
// لم يُختبر هذا التوصيل على جهاز بعد — Swift غير مترجَم (لا Xcode هنا).
import React, { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { statusLabelAr } from './core/armMachine';
import type { ArmEvent, ArmState } from './core/armMachine';
import { DEFAULT_SCREAM_CONFIG, SCREAM_SOUNDS } from './core/scream';
import type { ScreamConfig } from './core/scream';
import { DEFAULT_SENSITIVITY_ID, SENSITIVITY_LEVELS } from './core/motion';
import type { SensitivityLevel } from './core/motion';
import { GuardRuntime } from './core/guardRuntime';
import { SETUP_STEPS } from './core/setup';
import { verifyStopCode as verifyStopCodeTs } from './core/stopCode';
import type { StopCodeRecord } from './core/stopCode';
import { isGuardModeModule, pickGuardModule } from './native/bridge';
import type { GuardNativeModule } from './native/bridge';
import { HomeScreen } from './ui/screens/HomeScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { SensitivityScreen } from './ui/screens/SensitivityScreen';
import { ExplainerScreen } from './ui/screens/ExplainerScreen';

type Tab = 'home' | 'sensitivity' | 'explainer';

/** عينة حساس واحدة من الوحدة الأصلية (iOS: GuardModeModule). */
interface NativeSensorSample {
  ax: number;
  ay: number;
  az: number;
  gx?: number;
  gy?: number;
  gz?: number;
}

export default function App(): React.JSX.Element {
  // في النسخة الكاملة تُقرأ من MMKV؛ هنا: الإعداد يُعرض أول مرة.
  const [setupDone, setSetupDone] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [armState, setArmState] = useState<ArmState>({ status: 'disarmed' });
  const [guardInterrupted, setGuardInterrupted] = useState(false);
  const [sensitivityId, setSensitivityId] = useState<SensitivityLevel['id']>(DEFAULT_SENSITIVITY_ID);
  const sensitivityRef = useRef<SensitivityLevel['id']>(DEFAULT_SENSITIVITY_ID);
  /** هل الحراسة الأصلية تعمل الآن (يمنع إعادة بدئها عند كل تغيّر حالة)؟ */
  const nativeGuardRunningRef = useRef(false);
  /** صوت الهاتف منخفض وقت التسليح — iOS لا يرفع الصوت برمجيًا. */
  const [lowVolume, setLowVolume] = useState(false);
  /** هذا الجهاز بلا حساسات حركة — الحراسة لا تعمل عليه. */
  const [motionUnavailable, setMotionUnavailable] = useState(false);
  /** سجل رمز الإيقاف (Salt + Hash فقط، لا نص) — من الإعداد. */
  const stopCodeRecordRef = useRef<StopCodeRecord | null>(null);
  const runtimeRef = useRef<GuardRuntime | null>(null);

  /**
   * تجربة الصوت 3 ثوانٍ ثم إيقافه — تُستخدم في الإعداد («جرّب الصرخة»)
   * وفي منفذ المعاينة. النسخة السابقة كانت تشغّل الصفارة في حلقة
   * ولا توقفها أبدًا (خطأ): المعاينة بلا إيقاف تعني صفارة لا تتوقف.
   */
  const previewScream = async (config: ScreamConfig): Promise<void> => {
    const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
    if (!native) return;
    if (isGuardModeModule(native)) {
      const file = SCREAM_SOUNDS[config.sound].file.replace(/\.wav$/, '');
      await native.startScream(file, false, 0);
    } else {
      await native.startScream({ ...config, graduated: false, rampSeconds: 0 });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await native.stopScream().catch(() => undefined);
  };

  if (runtimeRef.current === null) {
    const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
    runtimeRef.current = new GuardRuntime(
      {
        scream: {
          start: async (config: ScreamConfig) => {
            if (!native) throw new Error('لا وحدة أصلية مثبّتة — ابنِ الكود الأصلي أولًا');
            if (isGuardModeModule(native)) {
              // iOS: وسائط موضعية، اسم ملف بلا امتداد.
              const file = SCREAM_SOUNDS[config.sound].file.replace(/\.wav$/, '');
              await native.startScream(file, config.graduated, config.rampSeconds);
            } else {
              // Android: كائن إعدادات (AlarmModule.startScream(config)).
              await native.startScream(config);
            }
          },
          stop: async () => {
            await native?.stopScream();
          },
          isPlaying: async () => {
            // isPlaying موجودة في وحدة iOS فقط — وحدة Android لا تملكها؛
            // الاستدعاء المباشر `native?.isPlaying?.()` كان خطأ نوعيًا
            // (الخاصية غير موجودة على AlarmNativeModule) رغم عمله وقت التشغيل.
            if (!native || !isGuardModeModule(native)) return false;
            try {
              return (await native.isPlaying()) === true;
            } catch {
              return false;
            }
          },
          preview: async (config: ScreamConfig) => {
            await previewScream(config);
          },
        },
        biometric: {
          authenticate: async (reason: string) => {
            if (!native) return 'failed';
            const result: string = await native.authenticate(reason);
            if (result === 'success') return 'success';
            if (result === 'cancelled') return 'cancelled';
            return 'failed';
          },
          isAvailable: async () => {
            try {
              return (await native?.isBiometricAvailable?.()) === true;
            } catch {
              return false;
            }
          },
        },
        onState: (s: ArmState) => setArmState(s),
        onIncident: (_summary: string, _screamed: boolean) => {
          // سجل الحوادث يُبنى في المرحلة 3 — يُسجَّل هنا لاحقًا لا الآن.
        },
        onEvidenceRequested: (_kind: 'photo' | 'video-5s') => {
          // PLACEHOLDER: دليل المتطفل (قرار §9/6 و7) لم يُبنَ بعد — لا كود كاميرا.
        },
      },
      { sensitivity: SENSITIVITY_LEVELS[DEFAULT_SENSITIVITY_ID], hasBarometer: false },
      DEFAULT_SCREAM_CONFIG,
    );
  }

  // بدء/إيقاف الحراسة الأصلية مع حالة النواة — بلا هذا الربط لا تصل
  // أي عينة حساس على جهاز حقيقي (startGuardMode لم يكن يُستدعى).
  //
  // يُستدعى بدء الحراسة مرة واحدة لكل جلسة تسليح فقط — لا عند كل
  // تغيّر حالة: النسخة السابقة كانت تعيد بدء الحراسة الأصلية عند
  // كل انتقال (arming → armed → grace → screaming)، وبدء الحراسة
  // على iOS يوقف الصفارة أولًا (stopGuardMode داخل startGuardMode)،
  // فكان سباقًا قد يقتل الصفارة لحظة بدئها إن تأخر الـeffect عنها.
  useEffect(() => {
    const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
    if (!native) return undefined;
    if (armState.status === 'disarmed') {
      if (!nativeGuardRunningRef.current) return undefined;
      nativeGuardRunningRef.current = false;
      if (isGuardModeModule(native)) {
        void native.stopGuardMode().catch(() => undefined);
      } else {
        void native.stopGuard().catch(() => undefined);
      }
    } else if (!nativeGuardRunningRef.current) {
      nativeGuardRunningRef.current = true;
      if (isGuardModeModule(native)) {
        void native.startGuardMode().catch(() => undefined);
      } else {
        void native.startGuard(sensitivityRef.current).catch(() => undefined);
      }
    }
    return undefined;
  }, [armState.status]);

  // تحذير الصوت المنخفض عند التسليح — iOS فقط: iOS لا يرفع صوت النظام
  // برمجيًا إلى الأقصى، ومستوى الصوت ملك للمستخدم — إن كان منخفضًا تظهر
  // رسالة صريحة بدل أن تكتشف الصفارة صامتة وقت الحاجة. (نص اختبار
  // القبول كان يدّعي وجود هذا التحذير ولم يكن موصولًا أصلًا.)
  // على Android لا تحذير: ScreamPlayer يرفع مسار التنبيه STREAM_ALARM
  // إلى الأقصى بنفسه عند بدء الصفارة (تدرّج + حارس صوت)، فقراءة مستوى
  // المسار وقت التسليح لا تعني شيئًا هناك، ونص «لا يرفع الصوت برمجيًا»
  // كاذب على Android.
  useEffect(() => {
    if (armState.status !== 'arming' && armState.status !== 'armed') {
      setLowVolume(false);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
        if (!native || !isGuardModeModule(native)) {
          if (!cancelled) setLowVolume(false);
          return;
        }
        const volume = await native.currentVolume();
        if (!cancelled) setLowVolume(volume < 0.5);
      } catch {
        // تعذّرت القراءة — لا تحذير كاذب.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [armState.status]);

  // عينات الحركة من الوحدة الأصلية → النواة المشتركة (القرار هناك).
  useEffect(() => {
    const emitter = new NativeEventEmitter(NativeModules.GuardModeModule ?? NativeModules.AlarmModule);
    const samples = emitter.addListener('GuardSensorSample', (sample: NativeSensorSample) => {
      void runtimeRef.current?.onSensorSample({ t: Date.now(), ...sample });
    });
    const interrupted = emitter.addListener('GuardInterrupted', () => {
      setGuardInterrupted(true);
      void runtimeRef.current?.interruptGuard();
    });
    // جهاز بلا حساسات حركة (GuardModeModule يرسلها عند بدء الحراسة):
    // بلا هذا المستمع كان التطبيق يعرض «الحماية شغّالة» على جهاز لا
    // تصل منه أي عينة أبدًا. الثابت GUARD_MOTION_UNAVAILABLE_EVENT
    // كان معرّفًا في bridge.ts بلا أي مستمع له.
    const motionGone = emitter.addListener('GuardMotionUnavailable', () => {
      setMotionUnavailable(true);
    });
    return () => {
      samples.remove();
      interrupted.remove();
      motionGone.remove();
    };
  }, []);

  // مؤقّت واحد كل ثانية: العد التنازلي 10 ثوانٍ + عدّاد الصفارة.
  useEffect(() => {
    if (armState.status !== 'arming' && armState.status !== 'screaming') {
      return undefined;
    }
    const t = setInterval(() => {
      runtimeRef.current?.tickOneSecond();
    }, 1000);
    return () => clearInterval(t);
  }, [armState.status]);

  /** إنهاء الإعداد مع سجل رمز الإيقاف (Salt + Hash، لا نص أبدًا). */
  const handleSetupDone = async (record: StopCodeRecord | null): Promise<void> => {
    stopCodeRecordRef.current = record;
    const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
    if (record && native && !isGuardModeModule(native)) {
      // Android: خزّن السجل في Keystore أصليًا؛ فإن فشل بقي في الذاكرة للجلسة.
      try {
        await native.storeStopCode(record);
      } catch {
        // لا شيء — التحقق من الذاكرة أدناه يغطي الجلسة.
      }
    }
    // iOS: لا جسر Keychain بعد — السجل في الذاكرة لجلسة واحدة فقط.
    setSetupDone(true);
  };

  /** تحقق من رمز الإيقاف: أصليًا على Android، ومن السجل في الذاكرة على iOS. */
  const verifyStopCode = async (code: string): Promise<boolean> => {
    const native: GuardNativeModule | undefined = pickGuardModule(NativeModules);
    if (native && !isGuardModeModule(native)) {
      try {
        return await native.verifyStopCode(code);
      } catch {
        // سقط للتحقق من الذاكرة أدناه.
      }
    }
    const record = stopCodeRecordRef.current;
    if (!record) return false;
    return verifyStopCodeTs(code, record);
  };

  /** تغيير الحساسية من شاشة الحساسية — تُطبَّق فورًا على النواة. */
  const changeSensitivity = (id: SensitivityLevel['id']): void => {
    setSensitivityId(id);
    sensitivityRef.current = id;
    runtimeRef.current?.setSensitivity(SENSITIVITY_LEVELS[id]);
  };

  /** محوّل أحداث HomeScreen إلى GuardRuntime (مالك الحالة الوحيد). */
  const dispatch = (event: ArmEvent): void => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    switch (event.type) {
      case 'PRESS_ARM':
      case 'CANCEL_ARMING':
        runtime.pressArmButton();
        setGuardInterrupted(false);
        setMotionUnavailable(false);
        break;
      case 'OWNER_VERIFIED':
      case 'STOP_CODE_CORRECT':
        void runtime.stopByOwner();
        break;
      case 'STOP_CODE_WRONG':
        runtime.recordWrongStopCode();
        break;
      default:
        break; // العدّادات تُدار من مؤقّت التشغيل أعلاه
    }
  };

  if (!setupDone) {
    return (
      <SetupScreen
        onDone={(record) => void handleSetupDone(record)}
        onTryScream={() => void previewScream(DEFAULT_SCREAM_CONFIG)}
        steps={SETUP_STEPS}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>ستر</Text>
        <Text style={styles.subtitle}>﴿وَلَا تَجَسَّسُوا﴾ — الحجرات: 12</Text>
        <Text style={styles.status}>{statusLabelAr(armState)}</Text>
        {lowVolume && (
          <Text style={styles.lowVolume}>
            صوت الهاتف منخفض — ارفع صوت النظام حتى تُسمع الصفارة؛ التطبيق لا يرفع الصوت برمجيًا إلى الأقصى.
          </Text>
        )}
        {guardInterrupted && (
          <Text style={styles.interrupted}>
            توقفت الحراسة لأنك خرجت من التطبيق — على آيفون تعمل الحراسة والتطبيق مفتوح فقط. اضغط «فعّل الحماية» من جديد.
          </Text>
        )}
        {motionUnavailable && (
          <Text style={styles.interrupted}>
            لا حساسات حركة على هذا الجهاز — إنذار الحركة لا يعمل هنا.
          </Text>
        )}
        {tab === 'home' && <HomeScreen state={armState} dispatch={dispatch} verifyStopCode={verifyStopCode} />}
        {tab === 'sensitivity' && <SensitivityScreen selected={sensitivityId} onSelect={changeSensitivity} />}
        {tab === 'explainer' && <ExplainerScreen />}
        <View style={styles.nav}>
          <Text style={styles.navItem} onPress={() => setTab('home')}>الرئيسية</Text>
          <Text style={styles.navItem} onPress={() => setTab('sensitivity')}>الحساسية</Text>
          <Text style={styles.navItem} onPress={() => setTab('explainer')}>ماذا يعمل على هاتفك؟</Text>
        </View>
        <Text style={styles.footnote}>
          مجاني، بلا إعلانات، بلا حساب، بلا خادم — كل شيء على هاتفك فقط.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1F16', direction: 'rtl' },
  scroll: { padding: 20, alignItems: 'center' },
  title: { fontSize: 34, fontWeight: 'bold', color: '#F5EFE0', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#C9BFA3', marginTop: 4, textAlign: 'center' },
  status: { fontSize: 20, color: '#FFFFFF', marginVertical: 16, textAlign: 'center' },
  lowVolume: { fontSize: 16, fontWeight: 'bold', color: '#FFB74D', textAlign: 'center', marginBottom: 12 },
  interrupted: { fontSize: 16, fontWeight: 'bold', color: '#FFB74D', textAlign: 'center', marginBottom: 12 },
  nav: { flexDirection: 'row', gap: 18, marginTop: 24 },
  navItem: { color: '#7ED491', fontSize: 16, textDecorationLine: 'underline' },
  footnote: { color: '#8A9A8E', fontSize: 13, marginTop: 24, textAlign: 'center' },
});
