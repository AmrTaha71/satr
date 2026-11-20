package com.walatajassasu.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * محرك الصرخة — Android (فكرتا 97 و6).
 *
 * - الصوت ملف محلي داخل التطبيق (res/raw/siren.wav) — يعمل دون إنترنت.
 * - يُشغَّل عبر مسار التنبيه STREAM_ALARM (USAGE_ALARM) فيتجاوز الوضع
 *   الصامت ووضع «عدم الإزعاج» على Android.
 * - الصرخة متدرجة افتراضيًا: تبدأ منخفضة وتصل للأقصى خلال 5 ثوانٍ
 *   (تقدير غير مقيس — فكرة 6).
 * - زر خفض الصوت لا يوقف الصرخة: نعيد ضبط مستوى مسار التنبيه دوريًا
 *   أثناء الصرخة، ونستعيد المستوى السابق عند الإيقاف.
 * - الإيقاف فقط عبر BiometricPrompt أو رمز الإيقاف — لا يوجد هنا أي
 *   مسار إيقاف آخر، ولا أي تشغيل عن بُعد (بلا خادم أصلًا).
 *
 * ملاحظة التحقق: هذا الكود لم يُترجَم على جهاز البناء (لا Android SDK
 * في هذه البيئة) — يجب ترجمته واختباره في Android Studio على جهاز حقيقي.
 */
class ScreamPlayer(private val context: Context) {

    private var player: MediaPlayer? = null
    private var previousAlarmVolume: Int = -1
    private val audioManager: AudioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var volumeGuard: Runnable? = null
    @Volatile var isPlaying: Boolean = false
        private set

    /**
     * ابدأ الصرخة في حلقة.
     * @param rawResId ملف الصوت (مثال: R.raw.siren)
     * @param graduated متدرجة (افتراضي true) أم فورية
     * @param rampSeconds زمن الوصول للأقصى (تقدير غير مقيس: 5)
     */
    fun start(rawResId: Int, graduated: Boolean, rampSeconds: Int) {
        if (isPlaying) return
        stopInternal()

        // احفظ مستوى مسار التنبيه الحالي لاستعادته بعد الإيقاف.
        previousAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        val startVolume = if (graduated) (maxVolume * 0.2f).toInt().coerceAtLeast(1) else maxVolume
        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, startVolume, 0)

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        // MediaPlayer مباشر + setDataSource من الملف الخام: يعمل على كل
        // مستويات API المدعومة (minSdk 24) — لا يعتمد على تحميل
        // MediaPlayer.create(context, resId, AudioAttributes, int)
        // (API 31+) الذي كانت نسخة سابقة تستدعيه بتوقيع خاطئ.
        val player = MediaPlayer()
        try {
            player.apply {
                setAudioAttributes(attributes)
                val fd = context.resources.openRawResourceFd(rawResId)
                    ?: throw IllegalStateException("ملف الصوت res/raw/siren.wav غير موجود")
                setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                fd.close()
                isLooping = true
                setOnErrorListener { _, _, _ -> true }
                prepare()
                start()
            }
        } catch (e: Exception) {
            player.release()
            // فشل البدء بعد خفض/رفع مستوى مسار التنبيه أعلاه كان يترك
            // المستوى مبدَّلًا بلا استعادة (ولا حارس صوت يُجدوَل بعد
            // فشل — فيبقى مستوى التنبيه على مستوى البدء إلى أجل غير
            // مسمى). استعد المستوى السابق قبل إعادة رمي الخطأ.
            if (previousAlarmVolume >= 0) {
                audioManager.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0)
                previousAlarmVolume = -1
            }
            throw e
        }
        this.player = player
        isPlaying = true

        // التدرّج: ارفع الصوت خطوة كل ثانية حتى الأقصى.
        if (graduated && rampSeconds > 0) {
            val steps = rampSeconds
            var step = 0
            val ramp = object : Runnable {
                override fun run() {
                    if (!isPlaying) return
                    step++
                    val v = (maxVolume * (0.2 + 0.8 * step / steps)).toInt().coerceAtMost(maxVolume)
                    audioManager.setStreamVolume(AudioManager.STREAM_ALARM, v, 0)
                    if (step < steps) handler.postDelayed(this, 1000)
                }
            }
            handler.postDelayed(ramp, 1000)
        }

        // حارس الصوت: زر خفض الصوت لا يوقف الصرخة — أعد الأقصى كل ثانيتين.
        // يبدأ فقط بعد انتهاء التدرّج: النسخة السابقة كانت تبدأه بعد
        // ثانيتين فترفع الصوت للأقصى في منتصف التدرّج (خطأ)، ثم تعيد
        // خطوات التدرّج خفضه — فيصعد الصوت وينزل بدل التدرّج الصاعد.
        volumeGuard = object : Runnable {
            override fun run() {
                if (!isPlaying) return
                audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)
                handler.postDelayed(this, 2000)
            }
        }
        val guardDelayMs = if (graduated && rampSeconds > 0) rampSeconds * 1000L else 2000L
        handler.postDelayed(volumeGuard!!, guardDelayMs)
    }

    /** أوقف الصرخة واستعد مستوى الصوت السابق. */
    fun stop() {
        stopInternal()
        if (previousAlarmVolume >= 0) {
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0)
            previousAlarmVolume = -1
        }
    }

    private fun stopInternal() {
        isPlaying = false
        volumeGuard?.let { handler.removeCallbacks(it) }
        volumeGuard = null
        player?.let {
            try { if (it.isPlaying) it.stop() } catch (_: IllegalStateException) { }
            it.release()
        }
        player = null
    }
}
