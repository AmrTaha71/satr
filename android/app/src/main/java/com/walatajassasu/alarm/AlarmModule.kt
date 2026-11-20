package com.walatajassasu.alarm

import android.hardware.SensorEvent
import android.hardware.biometrics.BiometricPrompt
import android.os.CancellationSignal
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/**
 * الجسر الأصلي AlarmModule — يربط النواة المشتركة (TypeScript) بالكود الأصلي.
 *
 * ما يفعله:
 * - بدء/إيقاف خدمة الحراسة الأمامية (MotionAlarmService).
 * - تشغيل/إيقاف الصرخة (ScreamPlayer).
 * - نافذة BiometricPrompt الرسمية للمهلة 3 ثوانٍ وإلغاء التسليح.
 * - تخزين هاش رمز الإيقاف في Android Keystore (AES-GCM) والتحقق منه
 *   أصليًا — الرمز النصي لا يُحفظ أبدًا ولا يغادر الجهاز.
 *
 * ما لا يفعله (عمدًا): لا شبكة، لا خادم، لا تشغيل عن بُعد، لا قفل
 * تطبيقات في هذه القطعة (قفل التطبيقات عبر AccessibilityService
 * في المرحلة 2 — ليس هنا).
 *
 * لم يُترجَم على جهاز البناء (لا Android SDK هنا).
 */
class AlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val KEYSTORE_ALIAS = "wala_tajassasu_stop_code"
        private const val PREFS = "wala_tajassasu_secure"
        private const val KEY_HASH = "stop_code_hash_b64"
        private const val KEY_SALT = "stop_code_salt_b64"
        private const val KEY_IV = "stop_code_iv_b64"

        private var eventEmitter: ReactApplicationContext? = null

        /** تُستدعى من MotionAlarmService عند كل عينة حساس. */
        fun emitSensorSample(event: SensorEvent) {
            val ctx = eventEmitter ?: return
            val payload: WritableMap = Arguments.createMap().apply {
                putDouble("t", System.currentTimeMillis().toDouble())
                putDouble("ax", event.values.getOrNull(0)?.toDouble() ?: 0.0)
                putDouble("ay", event.values.getOrNull(1)?.toDouble() ?: 0.0)
                putDouble("az", event.values.getOrNull(2)?.toDouble() ?: 0.0)
            }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                // الاسم القانوني للحدث على المنصتين (انظر src/native/bridge.ts) —
                // الواجهة تستمع لـ GuardSensorSample فقط.
                .emit("GuardSensorSample", payload)
        }
    }

    private val screamPlayer = ScreamPlayer(reactContext)

    override fun getName(): String = "AlarmModule"

    init {
        eventEmitter = reactContext
    }

    @ReactMethod
    fun startGuard(sensitivity: String, promise: Promise) {
        try {
            MotionAlarmService.start(reactContext, sensitivity)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_GUARD_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopGuard(promise: Promise) {
        try {
            screamPlayer.stop()
            MotionAlarmService.stop(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_GUARD_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isGuardRunning(promise: Promise) {
        // القطعة الأولى: تُدار الحالة في النواة المشتركة؛ الخدمة نفسها
        // لا تقدّم استعلام حالة رسميًا — نعيد false كقيمة محافظة
        // ويُستبدل باستعلام ActivityManager في المرحلة 1.
        promise.resolve(false)
    }

    @ReactMethod
    fun startScream(config: ReadableMap, promise: Promise) {
        try {
            val graduated = if (config.hasKey("graduated")) config.getBoolean("graduated") else true
            val ramp = if (config.hasKey("rampSeconds")) config.getInt("rampSeconds") else 5
            // ملف الصوت: res/raw/siren.wav (الافتراضي في القطعة الأولى).
            val rawId = reactContext.resources.getIdentifier("siren", "raw", reactContext.packageName)
            require(rawId != 0) { "ملف الصوت res/raw/siren.wav غير موجود" }
            screamPlayer.start(rawId, graduated, ramp)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SCREAM_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopScream(promise: Promise) {
        screamPlayer.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun authenticate(reason: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "لا توجد Activity ظاهرة لعرض نافذة البصمة")
            return
        }
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    promise.resolve("success")
                }

                override fun onAuthenticationFailed() {
                    // فشل واحد لا ينهي المهلة — يُسجَّل ويُعاد العرض إن بقي وقت.
                    promise.resolve("failed")
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    promise.resolve("cancelled")
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("ستر")
            .setSubtitle(reason)
            .setNegativeButtonText("استخدم رمز الإيقاف")
            .build()
        prompt.authenticate(info)
    }

    @ReactMethod
    fun isBiometricAvailable(promise: Promise) {
        try {
            val manager = reactContext.getSystemService(
                android.content.Context.BIOMETRIC_SERVICE,
            ) as android.hardware.biometrics.BiometricManager
            val result = manager.canAuthenticate(
                android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG,
            )
            promise.resolve(result == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    // --- رمز الإيقاف: Hash + Salt في Keystore ---
    // التجزئة SHA-256 تتم في النواة المشتركة (src/core/stopCode.ts)؛
    // هنا يُشفَّر السجل (salt + hash) بمفتاح Keystore قبل حفظه في
    // SharedPreferences الخاصة بالتطبيق — فلا يظهر الهاش نصًا أبدًا.

    @ReactMethod
    fun storeStopCode(record: ReadableMap, promise: Promise) {
        try {
            val saltHex = record.getString("saltHex") ?: ""
            val hashHex = record.getString("hashHex") ?: ""
            require(saltHex.isNotEmpty() && hashHex.isNotEmpty()) { "سجل رمز فارغ" }
            val plain = "$saltHex:$hashHex".toByteArray(Charsets.UTF_8)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
            val iv = cipher.iv
            val encrypted = cipher.doFinal(plain)
            val prefs = reactContext.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_HASH, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .putString(KEY_SALT, saltHex)
                .apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STORE_CODE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun verifyStopCode(code: String, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            val encB64 = prefs.getString(KEY_HASH, null) ?: run { promise.resolve(false); return }
            val ivB64 = prefs.getString(KEY_IV, null) ?: run { promise.resolve(false); return }
            val saltHex = prefs.getString(KEY_SALT, "") ?: ""
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)))
            val plain = String(cipher.doFinal(Base64.decode(encB64, Base64.NO_WRAP)), Charsets.UTF_8)
            val storedHash = plain.substringAfter(":", "")
            // SHA-256(salt + ":" + code) — نفس صيغة النواة المشتركة.
            val digest = MessageDigest.getInstance("SHA-256")
            val candidate = digest.digest("$saltHex:$code".toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
            // مقارنة ثابتة الزمن.
            promise.resolve(MessageDigest.isEqual(candidate.toByteArray(), storedHash.toByteArray()))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun hasStopCode(promise: Promise) {
        val prefs = reactContext.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        promise.resolve(prefs.contains(KEY_HASH))
    }

    @ReactMethod
    fun getAlarmVolume(promise: Promise) {
        val am = reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
        val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM).coerceAtLeast(1)
        promise.resolve(am.getStreamVolume(android.media.AudioManager.STREAM_ALARM).toDouble() / max)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val spec = KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(spec)
        }.generateKey()
    }
}
