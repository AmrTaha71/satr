// ستر — آلة حالات التسليح / الإلغاء (فكرة 81 + مخطط §4)
// ============================================================
// زر واحد كبير + عد تنازلي 10 ثوانٍ. القاعدة الذهبية:
// الإمساك بالهاتف وحده لا يلغي التسليح أبدًا — الإلغاء فقط
// بالبصمة/الوجه أو رمز الإيقاف.
// دالة خالصة (pure reducer) — تُختبَر دون هاتف.
//
// الوضع (§9 قرار 5 — أجابه عمرو 2026-11-12): صارم فقط.
// بعد مهلة 3 ثوانٍ → الصفارة فورًا، بلا أي مرحلة تحذير.
// لا وضع «مهذب» ولا حالة تحذير 3-2-1 في الكود إطلاقًا —
// أُزيلا نهائيًا في مراجعة الجولة 1 (2026-11-12): القرار
// «بلا مرحلة تحذير مهذبة» يعني لا وجود لها، لا أنها غير افتراضية.

export const ARM_COUNTDOWN_SECONDS = 10;

export type ArmState =
  | { status: 'disarmed' }
  | { status: 'arming'; secondsLeft: number }
  | { status: 'armed' }
  | { status: 'grace'; msLeft: number }
  | { status: 'screaming'; elapsedSeconds: number }
  | { status: 'cooldown'; secondsLeft: number };

export type ArmEvent =
  | { type: 'PRESS_ARM' }
  | { type: 'COUNTDOWN_TICK' }
  | { type: 'CANCEL_ARMING' }
  | { type: 'MOTION_LIFT' }
  | { type: 'GRACE_TICK'; msLeft: number }
  | { type: 'OWNER_VERIFIED' }
  | { type: 'GRACE_FAILED_OR_EXPIRED' }
  | { type: 'SCREAM_TICK'; elapsedSeconds: number }
  | { type: 'PRESS_DISARM' }
  | { type: 'STOP_CODE_CORRECT' }
  | { type: 'STOP_CODE_WRONG' }
  | { type: 'COOLDOWN_TICK' }
  | { type: 'COOLDOWN_DONE' }
  /** خرج التطبيق من المقدمة (iOS: قفل الشاشة أو التبديل لتطبيق آخر) — الحراسة توقفت، لا إلغاء بالمالك. */
  | { type: 'GUARD_INTERRUPTED' };

export function armReducer(state: ArmState, event: ArmEvent): ArmState {
  // انقطاع الحراسة (خروج من المقدمة) يلغي التسليح من أي حالة نشطة —
  // ليس إلغاءً بالمالك، بل توقفًا قسريًا للمراقبة (iOS خاصة).
  if (event.type === 'GUARD_INTERRUPTED') {
    return state.status === 'disarmed' || state.status === 'arming' ? state : { status: 'disarmed' };
  }
  switch (state.status) {
    case 'disarmed':
      if (event.type === 'PRESS_ARM') return { status: 'arming', secondsLeft: ARM_COUNTDOWN_SECONDS };
      return state;
    case 'arming':
      if (event.type === 'COUNTDOWN_TICK') {
        const left = state.secondsLeft - 1;
        return left <= 0 ? { status: 'armed' } : { status: 'arming', secondsLeft: left };
      }
      if (event.type === 'CANCEL_ARMING') return { status: 'disarmed' };
      return state;
    case 'armed':
      if (event.type === 'MOTION_LIFT') return { status: 'grace', msLeft: 3000 };
      if (event.type === 'PRESS_DISARM') return state; // إلغاء التسليح يتطلب تحققًا — يبدأ من الواجهة
      if (event.type === 'OWNER_VERIFIED') return { status: 'disarmed' };
      return state;
    case 'grace':
      if (event.type === 'OWNER_VERIFIED') return { status: 'disarmed' };
      if (event.type === 'GRACE_FAILED_OR_EXPIRED') {
        // صارم فقط: صفارة فورًا بلا أي تحذير (قرار §9/5).
        return { status: 'screaming', elapsedSeconds: 0 };
      }
      if (event.type === 'GRACE_TICK') return { status: 'grace', msLeft: event.msLeft };
      return state;
    case 'screaming':
      if (event.type === 'OWNER_VERIFIED') return { status: 'disarmed' };
      if (event.type === 'STOP_CODE_CORRECT') return { status: 'disarmed' };
      if (event.type === 'STOP_CODE_WRONG') return state; // رمز خاطئ لا يوقف شيئًا ويُسجَّل
      if (event.type === 'SCREAM_TICK') return { status: 'screaming', elapsedSeconds: event.elapsedSeconds };
      return state;
    case 'cooldown':
      if (event.type === 'COOLDOWN_TICK') {
        const left = state.secondsLeft - 1;
        return left <= 0 ? { status: 'disarmed' } : { status: 'cooldown', secondsLeft: left };
      }
      if (event.type === 'COOLDOWN_DONE') return { status: 'disarmed' };
      return state;
    default:
      return state;
  }
}

/** نص الحالة الكبير الظاهر في الواجهة. */
export function statusLabelAr(state: ArmState): string {
  switch (state.status) {
    case 'disarmed': return 'الحماية متوقفة';
    case 'arming': return `ضع الهاتف في مكانه بهدوء — ${state.secondsLeft}`;
    case 'armed': return 'الحماية شغّالة';
    case 'grace': return 'تحقّق من هويتك…';
    case 'screaming': return 'الإنذار يعمل — أدخل رمز الإيقاف أو بصمتك';
    case 'cooldown': return 'مهلة تهدئة — حاول لاحقًا';
    default: return '';
  }
}
