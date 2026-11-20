// الشاشة الرئيسية — زر واحد كبير + عد تنازلي 10 ثوانٍ (فكرة 81)
// إلغاء التسليح: بصمة/وجه أولًا، فإن فشلت فلوحة رمز الإيقاف.
// الوحدة الأصلية مشتركة: GuardModeModule على iOS، AlarmModule على Android
// (pickGuardModule) — لا استدعاء مباشر لـ AlarmModule هنا أبدًا،
// لأنها غير موجودة على آيفون/آيباد. التحقق من الرمز يأتي من App
// (أصليًا على Android، ومن السجل في الذاكرة على iOS حتى جسر Keychain).
import React, { useState } from 'react';
import { NativeModules, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ArmEvent, ArmState } from '../../core/armMachine';
import { ARM_COUNTDOWN_SECONDS } from '../../core/armMachine';
import { pickGuardModule } from '../../native/bridge';
import { StopCodePad } from '../components/StopCodePad';

interface Props {
  state: ArmState;
  dispatch: React.Dispatch<ArmEvent>;
  /** تحقق من رمز الإيقاف (يملكه App: أصلي أو من السجل في الذاكرة). */
  verifyStopCode: (code: string) => Promise<boolean>;
}

export function HomeScreen({ state, dispatch, verifyStopCode }: Props): React.JSX.Element {
  const armed = state.status === 'armed' || state.status === 'grace' || state.status === 'screaming';
  const [showCodePad, setShowCodePad] = useState(false);
  const [codeError, setCodeError] = useState('');

  /** إلغاء التسليح: بصمة أولًا، فإن فشلت أو أُلغيت فلوحة الرمز. */
  const requestDisarm = async () => {
    try {
      const native = pickGuardModule(NativeModules);
      if (!native) throw new Error('لا وحدة أصلية');
      const result: string = await native.authenticate('أوقف الحماية — تحقّق أنك المالك');
      if (result === 'success') {
        dispatch({ type: 'OWNER_VERIFIED' });
        setShowCodePad(false);
      } else {
        setShowCodePad(true); // فشل البصمة → «أنا المالك — أدخل الرمز»
      }
    } catch {
      setShowCodePad(true);
    }
  };

  const submitCode = async (code: string) => {
    try {
      const ok: boolean = await verifyStopCode(code);
      if (ok) {
        dispatch({ type: 'STOP_CODE_CORRECT' });
        setShowCodePad(false);
        setCodeError('');
      } else {
        dispatch({ type: 'STOP_CODE_WRONG' }); // رمز خاطئ لا يوقف شيئًا ويُسجَّل
        setCodeError('رمز خاطئ — حاول مرة ثانية');
      }
    } catch {
      setCodeError('تعذّر التحقق — حاول مرة ثانية');
    }
  };

  return (
    <View style={styles.box}>
      {state.status === 'arming' && (
        <Text style={styles.countdown}>{state.secondsLeft}</Text>
      )}
      {state.status === 'arming' && (
        <Text style={styles.hint}>ضع الهاتف في مكانه بهدوء</Text>
      )}
      {state.status === 'screaming' && (
        <Text style={styles.alert}>الإنذار يعمل — لا يوقفه إلا بصمتك أو رمز الإيقاف</Text>
      )}

      <TouchableOpacity
        style={[styles.bigButton, armed ? styles.armed : styles.disarmed]}
        onPress={() => {
          if (state.status === 'disarmed') dispatch({ type: 'PRESS_ARM' });
          else if (state.status === 'arming') dispatch({ type: 'CANCEL_ARMING' });
          else if (state.status === 'armed') void requestDisarm();
          // أثناء المهلة كان الزر بلا أي أثر أيضًا: نافذة البصمة تظهر
          // فور بدء المهلة، لكن إن أغلقها المستخدم بلا تحقق بقي الزر
          // ميتًا حتى تنتهي المهلة وتبدأ الصفارة. الضغطة الآن تعيد
          // عرض البصمة — نجاحها يلغي كل شيء بصمت عبر stopByOwner.
          // (الضغطة مستحيلة أصلًا أثناء ظهور نافذة النظام، فلا
          // نافذتا بصمة متزامنتان.)
          else if (state.status === 'grace') void requestDisarm();
          // أثناء الصفارة كان الزر بلا أي أثر (خطأ): الضغطة الآن تفتح
          // البصمة/الوجه لإيقاف الإنذار — كما تقول الملاحظة أسفله.
          else if (state.status === 'screaming') void requestDisarm();
        }}
        accessibilityLabel={armed ? 'أوقف الحماية' : 'فعّل الحماية'}
      >
        <Text style={styles.bigButtonText}>
          {state.status === 'disarmed' && 'فعّل الحماية'}
          {state.status === 'arming' && 'إلغاء'}
          {state.status === 'armed' && 'أوقف الحماية'}
          {state.status === 'grace' && 'تحقّق بالبصمة لإلغاء الإنذار'}
          {state.status === 'screaming' && 'أوقف الإنذار'}
        </Text>
      </TouchableOpacity>

      {state.status === 'arming' && (
        <Text style={styles.note}>العد التنازلي {ARM_COUNTDOWN_SECONDS} ثوانٍ — الضغطة الوحيدة التي تلغي قبل التفعيل.</Text>
      )}
      {(state.status === 'screaming' || showCodePad) && (
        <View>
          <StopCodePad onSubmit={(code) => void submitCode(code)} />
          {codeError ? <Text style={styles.error}>{codeError}</Text> : null}
          {!showCodePad && state.status === 'screaming' && (
            <Text style={styles.note}>أو اضغط «أوقف الإنذار» واستخدم بصمتك.</Text>
          )}
        </View>
      )}
      {state.status === 'armed' && (
        <Text style={styles.note}>الإمساك بالهاتف وحده لا يلغي التسليح أبدًا — الإلغاء فقط بالبصمة/الوجه أو رمز الإيقاف.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', width: '100%' },
  countdown: { fontSize: 96, fontWeight: 'bold', color: '#FFFFFF' },
  hint: { fontSize: 18, color: '#F5EFE0', marginBottom: 12 },
  alert: { fontSize: 20, fontWeight: 'bold', color: '#FF6B5E', textAlign: 'center', marginBottom: 12 },
  bigButton: { width: 260, height: 260, borderRadius: 130, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  disarmed: { backgroundColor: '#1E7A34' },
  armed: { backgroundColor: '#B3261E' },
  bigButtonText: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center' },
  note: { fontSize: 14, color: '#C9BFA3', textAlign: 'center', marginTop: 16 },
  error: { fontSize: 15, color: '#FF6B5E', textAlign: 'center', marginTop: 8 },
});
