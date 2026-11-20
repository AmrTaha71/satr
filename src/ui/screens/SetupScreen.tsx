// الإعداد الأول — 60 ثانية، بلا حساب (فكرة 83)
// الخطوات: ترحيب ← رمز الإيقاف (مرتين) ← بصمة (اختياري) ← جرّب الصرخة ← الشرح الصادق.
// الرمز لا يُحفظ نصًا أبدًا: عند التأكيد يُبنى سجل (Salt + Hash) ويُسلَّم
// لـ App عبر onDone — App يخزّنه أصليًا على Android، ويبقيه في الذاكرة
// لجلسة واحدة على iOS حتى يُبنى جسر Keychain. الـ Salt مولَّد من
// Math.random هنا (يحتاج فرادة لا سرية) — مؤقت حتى جسر Keychain/Keystore
// ببذرة آمنة أصليًا.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SetupStep } from '../../core/setup';
import { SETUP_STEP_AR } from '../../core/setup';
import { createStopCodeRecord, generateSaltHex, isValidStopCode } from '../../core/stopCode';
import type { StopCodeRecord } from '../../core/stopCode';
import { StopCodePad } from '../components/StopCodePad';

interface Props {
  steps: SetupStep[];
  /** يُستدعى عند إنهاء الإعداد مع سجل رمز الإيقاف (أو null إن لم يُدخَل رمز). */
  onDone: (record: StopCodeRecord | null) => void;
  /** جرّب الصفارة 3 ثوانٍ فعلًا (خطوة «جرّب الصرخة») — من App. */
  onTryScream: () => void;
}

function interimSaltHex(): string {
  // مؤقت: فرادة فقط حتى البذرة الآمنة الأصلية (Keychain/Keystore).
  return generateSaltHex((n) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  });
}

export function SetupScreen({ steps, onDone, onTryScream }: Props): React.JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const [firstCode, setFirstCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  /** هل جرّب المستخدم الصفارة فعلًا؟ الخطوة لا تُتخطّى دون تجربة —
   * الزر السابق «فهمت — أكمل الإعداد» كان يقدّم دون أي تجربة،
   * و`screamTried` في setup.ts لم يكن يُضبَط في أي مكان أصلًا. */
  const [screamTried, setScreamTried] = useState(false);
  const step = steps[stepIndex];

  const next = () => setStepIndex((i) => Math.min(steps.length - 1, i + 1));

  /** إنهاء الإعداد: سلّم سجل الرمز (لا النص) لـ App. */
  const finish = () => {
    onDone(firstCode ? createStopCodeRecord(firstCode, interimSaltHex()) : null);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>ستر</Text>
      <Text style={styles.step}>الخطوة {stepIndex + 1} من {steps.length}: {SETUP_STEP_AR[step]}</Text>

      {step === 'welcome' && (
        <View>
          <Text style={styles.body}>هاتفك يصرخ إذا لمسه أحد غيرك.</Text>
          <Text style={styles.body}>لا حساب ولا بريد ولا بيانات تخرج من هاتفك.</Text>
          <TouchableOpacity style={styles.button} onPress={next}>
            <Text style={styles.buttonText}>ابدأ الإعداد</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'stop-code' && (
        <View>
          <Text style={styles.body}>اختر رمز إيقاف من 4 أرقام — يعرفه المالك وحده، ويوقف الصرخة.</Text>
          <Text style={styles.body}>لا يمكن تخطّي هذه الخطوة.</Text>
          <StopCodePad onSubmit={(code) => { if (isValidStopCode(code)) { setFirstCode(code); setError(''); next(); } else setError('الرمز 4 أرقام بالضبط'); }} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}

      {step === 'stop-code-confirm' && (
        <View>
          <Text style={styles.body}>أدخل الرمز نفسه مرة ثانية للتأكيد.</Text>
          <StopCodePad onSubmit={(code) => { if (code === firstCode) { setError(''); next(); } else setError('الرمزان غير متطابقين — حاول مرة ثانية'); }} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}

      {step === 'biometric' && (
        <View>
          {/* لا يوجد «تفعيل» برمجي للبصمة: التسجيل يتم من إعدادات النظام،
              والتطبيق يستخدم نافذة Face ID / Touch ID الرسمية تلقائيًا
              عند الحاجة (مهلة 3 ثوانٍ وإيقاف الإنذار). الزر السابق
              «فعّل البصمة» كان وهميًا — يقدّم دون أي استدعاء أصلي. */}
          <Text style={styles.body}>سيستخدم التطبيق بصمتك / وجهك تلقائيًا عند الحاجة — لإيقاف الإنذار وإلغاء التسليح دون إدخال رمز أمام الآخرين.</Text>
          <Text style={styles.body}>تأكد أن البصمة / الوجه مسجَّلة في إعدادات هاتفك.</Text>
          <TouchableOpacity style={styles.button} onPress={next}>
            <Text style={styles.buttonText}>متابعة</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'try-scream' && (
        <View>
          <Text style={styles.body}>جرّب الصفارة الآن لتسمعها وتعرف كيف توقفها — 3 ثوانٍ فقط.</Text>
          <TouchableOpacity style={styles.button} onPress={() => { setScreamTried(true); setError(''); onTryScream(); }}>
            <Text style={styles.buttonText}>جرّب الصفارة الآن (3 ثوانٍ)</Text>
          </TouchableOpacity>
          <Text style={styles.body}>بعد التجربة: فعّل الحماية من الرئيسية، ثم حرّك هاتفك لتسمع الصرخة الكاملة، ثم أوقفها ببصمتك أو برمزك.</Text>
          <TouchableOpacity style={styles.button} onPress={() => { if (screamTried) { setError(''); next(); } else setError('جرّب الصفارة أولًا — اضغط «جرّب الصفارة الآن» لتسمعها قبل المتابعة.'); }}>
            <Text style={styles.buttonText}>فهمت — أكمل الإعداد</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}

      {step === 'explainer' && (
        <View>
          <Text style={styles.body}>صفحة «ماذا يعمل على هاتفك؟» تقول بصدق ما يعمل على جهازك وما لا يعمل — راجعها في أي وقت من الإعدادات.</Text>
          <TouchableOpacity style={styles.button} onPress={finish}>
            <Text style={styles.buttonText}>تم — ابدأ الحماية</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1F16', padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F5EFE0', textAlign: 'center', marginBottom: 16 },
  step: { fontSize: 16, color: '#7ED491', textAlign: 'center', marginBottom: 20 },
  body: { fontSize: 18, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: '#1E7A34', borderRadius: 12, padding: 16, marginTop: 16, alignItems: 'center' },
  buttonText: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  link: { fontSize: 16, color: '#7ED491', textAlign: 'center', marginTop: 16, textDecorationLine: 'underline' },
  error: { color: '#FF6B5E', textAlign: 'center', marginTop: 8 },
});
