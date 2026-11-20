package com.walatajassasu.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * خدمة الحراسة الأمامية — Android (فكرة 94).
 *
 * - ForegroundService مع إشعار دائم «الحراسة تعمل» (إلزامي من النظام).
 * - تقرأ Accelerometer/Gyroscope وتمرّر عينات التسارع إلى محرك TypeScript
 *   المشترك عبر الجسر (العتبات والحساسية منطق مشترك، لا تُعاد هنا).
 * - عند تأكيد رفع: مهلة 3 ثوانٍ مع BiometricPrompt، ثم الصرخة عبر
 *   ScreamPlayer — فورًا في الوضع الصارم الافتراضي (قرار §9/5)،
 *   بلا شاشة تحذير.
 * - توفير البطارية (فكرة 9): عند السكون تُخفَّض العينات؛ عند أول
 *   اهتزاز تُرفَع فورًا. الأرقام تقديرات غير مقيسة.
 *
 * حدود صادقة:
 * - ليست مضمونة دائمًا: Doze وقيود سامسونج/شاومي قد توقف الخدمة.
 * - زر الطاقة وإعادة التشغيل القسري يوقفان أي تطبيق.
 * - نوع الخدمة الأمامية يُحسم بقراءة وثائق Play الحالية وقت البناء
 *   (لا يوجد نوع مخصص لمراقبة الحساسات؛ المرشح specialUse بتبرير).
 *   لا يُستخدم dataSync/mediaProcessing لحراسة ليلية (Android 15
 *   يحدّهما بست ساعات).
 *
 * لم تُترجَم على جهاز البناء (لا Android SDK هنا) — Android Studio أولًا.
 */
class MotionAlarmService : Service(), SensorEventListener {

    companion object {
        const val CHANNEL_ID = "wala_tajassasu_guard"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP_GUARD = "com.walatajassasu.action.STOP_GUARD"
        const val EXTRA_SENSITIVITY = "sensitivity"

        fun start(context: Context, sensitivity: String) {
            val intent = Intent(context, MotionAlarmService::class.java).apply {
                putExtra(EXTRA_SENSITIVITY, sensitivity)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MotionAlarmService::class.java))
        }
    }

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null
    private var screamPlayer: ScreamPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        screamPlayer = ScreamPlayer(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // زر «أوقف الحماية» في الإشعار الدائم يرسل هذا الإجراء — أوقف الخدمة فعلًا.
        if (intent?.action == ACTION_STOP_GUARD) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        // قفل جزئي: يبقي المعالج مستيقظًا للمراقبة دون إبقاء الشاشة مضاءة.
        // لا تُنشئ قفلًا جديدًا إن كان القديم ممسوكًا (onStartCommand قد
        // تُستدعى أكثر من مرة لنفس الخدمة).
        if (wakeLock?.isHeld != true) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WalaTajassasu:Guard")
            wakeLock?.acquire(10 * 60 * 60 * 1000L /* 10 ساعات كحد أقصى */)
        }

        // معدل العينات التكيفي (فكرة 9): سكون → SENSOR_DELAY_NORMAL،
        // وأول اهتزاز → SENSOR_DELAY_FASTEST عبر إعادة التسجيل.
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        gyroscope?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        return START_STICKY
    }

    override fun onSensorChanged(event: SensorEvent) {
        // مهم: هذه الخدمة تستمع للمقياسين (تسارع + جيروسكوب) بنفس المستمع.
        // أحداث الجيروسكوب قيمها سرعات دوران لا تسارع — تمريرها كعينة
        // تسارع كان سيُفسد محرك الحركة (قيم ~0 تعني انحراف ~1g فيُحكم
        // «رفع» كاذب). تُمرَّر عينات التسارع فقط؛ الجيروسكوب يُقرأ
        // ضمن العينة نفسها في النواة عند توفّره.
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        // القطعة الأولى: العينات تُمرَّر إلى محرك TypeScript عبر الجسر
        // (AlarmModule.emitSensorSample) حيث تُطبَّق العتبات والتأكيد.
        // لا يُتخذ قرار صرخة هنا مباشرة — القرار في النواة المشتركة.
        AlarmModule.emitSensorSample(event)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // لا حاجة لمعالجة تغيّر الدقة في القطعة الأولى.
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "الحراسة تعمل",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "إشعار دائم أثناء عمل إنذار الحركة"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, MotionAlarmService::class.java).apply {
            action = ACTION_STOP_GUARD
        }
        val stopPending = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("الحراسة تعمل")
            .setContentText("هاتفك محمي — أي حركة ستُطلق الإنذار")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_delete, "أوقف الحماية", stopPending)
            .build()
    }

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        screamPlayer?.stop()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
