// ستر — الشرح الصادق «ماذا يعمل على هاتفك؟» (فكرتا 86 و100)
// ============================================================
// القاعدة: لا ميزة مستحيلة تظهر كأنها تعمل. هذه المصفوفة هي مصدر
// الحقيقة الوحيد لصفحة الشرح — تُبنى الواجهة منها، فلا تظهر ميزة
// مستحيلة على المنصة الخطأ. (مخطط §2 و§8، أفكار §3.)

import type { PlatformId } from './motion';

export type CapabilityStatus = 'works' | 'partial' | 'impossible';

export interface CapabilityCard {
  id: string;
  titleAr: string;
  android: CapabilityStatus;
  androidNoteAr: string;
  ios: CapabilityStatus;
  iosNoteAr: string;
}

export const CAPABILITY_CARDS: CapabilityCard[] = [
  {
    id: 'motion-foreground',
    titleAr: 'إنذار الحركة والتطبيق مفتوح',
    android: 'works',
    androidNoteAr: 'يعمل بالكامل والتطبيق مفتوح.',
    ios: 'works',
    iosNoteAr: 'يعمل بالكامل والتطبيق مفتوح (وضع الحراسة).',
  },
  {
    id: 'motion-background',
    titleAr: 'إنذار الحركة والشاشة مقفلة',
    android: 'works',
    androidNoteAr: 'يعمل عبر خدمة أمامية مع إشعار دائم «الحراسة تعمل». ليس مضمونًا دائمًا: وضع Doze وقيود سامسونج/شاومي قد توقف الخدمة.',
    ios: 'impossible',
    iosNoteAr: 'مستحيل عمليًا: iOS يقيّد مراقبة الحساسات المستمرة في الخلفية. البديل: وضع حراسة مفتوح فقط.',
  },
  {
    id: 'app-lock',
    titleAr: 'قفل تطبيقات أخرى (مثل واتساب)',
    android: 'works',
    androidNoteAr: 'يعمل عبر AccessibilityService + شاشة قفل (المرحلة 2 — ليس في هذه القطعة الأولى). القائمة المعتمَدة (قرار §9/2): واتساب + تيليجرام + ماسنجر + المعرض/الصور؛ الإيميل لا يُقفل. أولوية منخفضة: إنذار الحركة هو الأولوية الأولى (تحديث 00:35).',
    ios: 'impossible',
    iosNoteAr: 'مستحيل على آيفون: النظام لا يسمح لأي تطبيق بقفل تطبيقات أخرى. البديل: خزنة داخلية + دليل Screen Time.',
  },
  {
    id: 'scream-bypass-silent',
    titleAr: 'الصرخة تتجاوز الوضع الصامت',
    android: 'works',
    androidNoteAr: 'عبر مسار التنبيه STREAM_ALARM مع رفع الصوت برمجيًا وقت الصرخة.',
    ios: 'works',
    iosNoteAr: 'عبر فئة التشغيل AVAudioSession (playback) التي تتجاوز مفتاح الصمت. لا يمكن رفع صوت النظام برمجيًا إلى الأقصى — مستوى الصوت ملك لك.',
  },
  {
    id: 'intruder-photo',
    titleAr: 'التقاط صورة المتطفل',
    android: 'partial',
    androidNoteAr: 'ممكن تقنيًا من الخدمة الأمامية (المرحلة 3) مع إشعار دائم وإفصاح بارز — يخضع لمراجعة Play. الطريقة المعتمَدة: معاينة ظاهرة (قرار §9/6) — لا التقاط صامت إطلاقًا.',
    ios: 'partial',
    iosNoteAr: 'لا كاميرا صامتة على iOS إطلاقًا. الممكن فقط: التقاط بمعاينة ظاهرة والتطبيق مفتوح في المقدمة (المرحلة 3) — الطريقة المعتمَدة (قرار §9/6).',
  },
  {
    id: 'intruder-video',
    titleAr: 'فيديو 5 ثوانٍ للمتطفل بدل الصورة',
    android: 'partial',
    androidNoteAr: 'مخطط في المرحلة 3 عبر الخدمة الأمامية (قرار §9/7: نعم، قدّمه)، بمعاينة ظاهرة — لم يُبنَ ولم يُختبر بعد.',
    ios: 'partial',
    iosNoteAr: 'مخطط في المرحلة 3، والتطبيق مفتوح في المقدمة فقط وبمعاينة ظاهرة — لا تسجيل خلفي ولا صامت على iOS. لم يُبنَ ولم يُختبر بعد.',
  },
  {
    id: 'photo-spoof',
    titleAr: 'فتح الهاتف بصورة للمالك',
    android: 'impossible',
    androidNoteAr: 'Face ID / البصمة الحديثة ترفض الصورة أصلًا (مستشعر العمق). القيمة هي عدّ المحاولات الفاشلة والصراخ عليها، لا اختراع كشف صور.',
    ios: 'impossible',
    iosNoteAr: 'نفس الشيء: Face ID يرفض الصورة أصلًا. لا ندّعي كشف الصورة بأنفسنا.',
  },
  {
    id: 'force-stop',
    titleAr: 'إيقاف الصرخة بإغلاق التطبيق بالقوة',
    android: 'partial',
    androidNoteAr: 'على Android الخدمة الأمامية تستمر بعد إغلاق التطبيق بالقوة. زر الطاقة وإعادة التشغيل القسري يوقفان أي تطبيق — حقيقة تُقال لا تُخفى.',
    ios: 'partial',
    iosNoteAr: 'على iOS الإغلاق القسري قد يوقف الصرخة — يُحذَّر المالك من ذلك صراحة.',
  },
  {
    id: 'remote',
    titleAr: 'تشغيل الصرخة عن بُعد على هاتف آخر',
    android: 'impossible',
    androidNoteAr: 'ممنوع نهائيًا بالتصميم: بلا خادم، بلا حساب — التطبيق لا يستطيع أصلًا أن يُشغَّل عن بُعد.',
    ios: 'impossible',
    iosNoteAr: 'ممنوع نهائيًا بالتصميم: بلا خادم، بلا حساب.',
  },
];

/** بطاقات صفحة الشرح لهذا الجهاز — مرتبة: ما يعمل أولًا، ثم المحدود، ثم المستحيل مع بديله. */
export function explainerCardsFor(platform: PlatformId): Array<CapabilityCard & { status: CapabilityStatus; noteAr: string }> {
  const order: Record<CapabilityStatus, number> = { works: 0, partial: 1, impossible: 2 };
  return CAPABILITY_CARDS.map((c) => ({
    ...c,
    status: platform === 'android' ? c.android : c.ios,
    noteAr: platform === 'android' ? c.androidNoteAr : c.iosNoteAr,
  })).sort((a, b) => order[a.status] - order[b.status]);
}

export const EXPLAINER_INTRO_AR =
  'هاتفك يصرخ إذا لمسه أحد غيرك. هذه الصفحة تقول بصدق ماذا يعمل على هاتفك أنت — وما لا يعمل — حتى لا تتفاجأ أبدًا.';
