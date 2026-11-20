// ستر — محرك الصفارة (فكرتا 97 و6)
// ============================================================
// محلي فقط: ملف صوت داخل التطبيق، يعمل دون إنترنت.
// يتجاوز الوضع الصامت: Android عبر STREAM_ALARM / USAGE_ALARM،
// وiOS عبر AVAudioSession بفئة playback. التنفيذ الأصلي في:
//   android/.../ScreamPlayer.kt  و  ios/.../ScreamAudio.swift
// هذا الملف هو المنطق المشترك الخالص (يُختبَر دون هاتف).
//
// الصوت (§9 قرار 3 — أجابه عمرو 2026-11-12): صفارة إنذار بأسلوب
// إنذار الحريق هي الافتراضي، لا صرخة بشرية. «صرخة بشرية» أُزيلت
// من الكود تمامًا — لا خيار لها ولا ملف لها.

/** الصوت الوحيد للصفارة — صفارة إنذار حريق (قرار §9/3).
 * كان هنا خياران إضافيان ('alarm-tone' و'ringing') لكن ملفيهما
 * لم يوجدا أبدًا في الشجرة: على iOS كان اختيارهما سيُرمي خطأ
 * «ملف الصوت غير موجود» فتصمت الصفارة، وعلى Android كان الكود
 * يتجاهل الاختيار ويشغّل siren دائمًا. أُزيلا في مراجعة الجولة 1 —
 * لا خيار إلا ما يوجد ملفه فعلًا. */
export type ScreamSoundId = 'siren';

export const SCREAM_SOUNDS: Record<ScreamSoundId, { labelAr: string; file: string }> = {
  siren: { labelAr: 'صفارة إنذار حريق', file: 'siren.wav' },
};

/**
 * الرسالة المنطوقة — محسومة (قرار §9/3، تحديث 00:35): الآية الكريمة
 * «وَلَا تَجَسَّسُوا وَلَا يَغْتَب بَّعْضُكُم بَعْضًا» (الحجرات 49:12) —
 * لا النص المقترح «ابعد إيدك عن التليفون! صاحب التليفون هيصحى دلوقتي!»
 * الذي رُفض واستُبدل بالآية.
 * النص معتمَد؛ أما التسجيل الصوتي للآية (voice_message.m4a) فلم يُسجَّل
 * بعد — حتى يُسجَّل، الصفارة وحدها هي ما يُسمع فعليًا، ولا تُقدَّم
 * الرسالة كأنها تُسمع قبل التسجيل.
 */
export const SPOKEN_VERSE_MESSAGE =
  'وَلَا تَجَسَّسُوا وَلَا يَغْتَب بَّعْضُكُم بَعْضًا';

/** مصدر الرسالة المنطوقة: سورة الحجرات، الآية 12. */
export const SPOKEN_VERSE_SOURCE_AR = 'سورة الحجرات — الآية 12';

/** هل نص الرسالة العربية معتمَد؟ نعم — الآية (قرار §9/3، تحديث 00:35). */
export const ARABIC_MESSAGE_APPROVED = true;

/** هل التسجيل الصوتي للآية موجود؟ لا — لم يُسجَّل بعد (voice_message.m4a). */
export const ARABIC_MESSAGE_RECORDING_EXISTS = false;

export const ARABIC_MESSAGE_OPTIONS: Array<{ id: string; toneAr: string; text: string }> = [
  { id: 'verse', toneAr: 'آية قرآنية', text: SPOKEN_VERSE_MESSAGE },
];

export interface ScreamConfig {
  sound: ScreamSoundId;
  /** متدرجة (افتراضي، فكرة 51) أم فورية كاملة من أول لحظة. */
  graduated: boolean;
  /** زمن الوصول للأقصى بالثواني عند التدرّج — تقدير غير مقيس (فكرة 6: 5 ثوانٍ). */
  rampSeconds: number;
  /** الرسالة العربية تُعاد كل N ثانية أثناء الصرخة (فكرة 6: كل 10 ثوانٍ). */
  messageEverySeconds: number;
  /** نص الرسالة (أو '' = بلا رسالة، صفارة فقط). */
  messageText: string;
  /** تسجيل المالك بصوته بدل الرسالة الجاهزة (اختياري). */
  customVoiceMessageFile?: string;
}

export const DEFAULT_SCREAM_CONFIG: ScreamConfig = {
  sound: 'siren', // صفارة إنذار حريق — قرار §9/3
  graduated: true,
  rampSeconds: 5,
  messageEverySeconds: 10,
  // الرسالة المنطوقة: الآية (قرار §9/3، تحديث 00:35). التسجيل الصوتي
  // للآية لم يُسجَّل بعد — حتى يُسجَّل، الصفارة وحدها هي ما يُسمع فعليًا.
  messageText: SPOKEN_VERSE_MESSAGE,
};

/**
 * مستوى الصوت أثناء التدرّج: 0..1.
 * يبدأ منخفضًا ثم يصل للأقصى خلال rampSeconds (فكرة 6).
 * عند graduated=false يعود 1 فورًا.
 */
export function screamVolumeAt(elapsedSeconds: number, config: ScreamConfig): number {
  if (!config.graduated) return 1;
  if (config.rampSeconds <= 0) return 1;
  return Math.min(1, Math.max(0.2, elapsedSeconds / config.rampSeconds));
}

/** هل حان وقت إعادة الرسالة العربية؟ (كل messageEverySeconds). */
export function shouldPlayMessageAt(elapsedSeconds: number, config: ScreamConfig): boolean {
  if (!config.messageText) return false;
  if (config.messageEverySeconds <= 0) return false;
  // تُقال الرسالة عند 0 ثانية ثم كل دورة كاملة.
  return Math.abs(elapsedSeconds % config.messageEverySeconds) < 0.5;
}

/** دورة الصرخة: 3 ثوانٍ صفارة + الرسالة + 3 ثوانٍ صفارة (فكرة 6). */
export function screamCycleDescription(config: ScreamConfig): string {
  const sound = SCREAM_SOUNDS[config.sound].labelAr;
  const msg = config.messageText ? ` + رسالة «${config.messageText}» كل ${config.messageEverySeconds} ثوانٍ` : '';
  const ramp = config.graduated ? `، متدرجة تصل للأقصى خلال ${config.rampSeconds} ثوانٍ` : '، فورية بأقصى صوت';
  return `${sound}${msg}${ramp} — في حلقة حتى يوقفها المالك.`;
}

export interface ScreamEngine {
  /** ابدأ الصرخة (يستدعي الكود الأصلي: STREAM_ALARM / AVAudioSession). */
  start(config: ScreamConfig): Promise<void>;
  /** أوقف الصرخة وأعِد مستوى الصوت كما كان. */
  stop(): Promise<void>;
  /** هل الصرخة تعمل الآن؟ */
  isPlaying(): Promise<boolean>;
  /** جرّب الصوت 3 ثوانٍ بصوت منخفض قبل الاستخدام الفعلي (فكرة 97). */
  preview(config: ScreamConfig): Promise<void>;
}
