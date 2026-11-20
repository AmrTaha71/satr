import Foundation
import LocalAuthentication
import CoreMotion
import React
import UIKit

/// وضع الحراسة — iOS (فكرة 93). القطعة الأولى الآن iOS أولًا
/// (قرار §9/1 — أجابه عمرو 2026-11-12: يختبر على آيفونه/آيباده،
/// ولا يستطيع اختبار Android).
///
/// هذه الوحدة هي الوحدة الأصلية الأساسية للقطعة الأولى:
/// - مراقبة حركة في المقدمة فقط عبر CoreMotion (DeviceMotion:
///   تسارع كامل + جيروسكوب + زاوية ميل)، وتُرسَل كل عينة إلى
///   النواة المشتركة (TypeScript) عبر حدث `GuardSensorSample`،
///   وهناك يُقرَّر «رفع» أم «اهتزاز طاولة» — لا قرار هنا.
/// - مهلة 3 ثوانٍ بنافذة Face ID / Touch ID الرسمية (LAContext).
/// - صفارة إنذار حريق عبر ScreamAudio (قرار §9/3: صفارة، لا صرخة بشرية).
/// - عند الخروج من التطبيق أو قفل الشاشة: حدث `GuardInterrupted`
///   + إيقاف المراقبة — الحراسة على iOS في المقدمة فقط.
///
/// حدود صادقة (لا وعد بما لا تستطيع المنصة فعله):
/// - لا قفل تطبيقات أخرى، لا مراقبة حركة في الخلفية،
///   لا كاميرا صامتة (التصوير بمعاينة ظاهرة فقط، المرحلة 3)،
///   لا رفع صوت النظام برمجيًا إلى الأقصى.
/// - لا تُستخدم أوضاع خلفية (audio/location) كحيلة للالتفاف على قواعد Apple.
/// - الإغلاق القسري للتطبيق قد يوقف الصفارة — يُحذَّر المالك.
///
/// الأحداث إلى JavaScript:
/// - `GuardSensorSample`: { ax, ay, az, gx, gy, gz } — عينة كل 0.1 ثانية.
/// - `GuardInterrupted`: خرج التطبيق من المقدمة — توقفت الحراسة.
/// - `GuardMotionUnavailable`: لا حساسات حركة على هذا الجهاز.
///
/// لم يُترجَم على جهاز البناء (لا Xcode هنا) — يُترجَم في Xcode على MacBook،
/// ويُختبر على آيفون/آيباد حقيقي (انظر docs/DEVICE-TEST.md).
@objc(GuardModeModule)
final class GuardModeModule: RCTEventEmitter {
    private let motionManager = CMMotionManager()
    private let scream = ScreamAudio()
    private var hasListeners = false
    private var interruptionObserver: NSObjectProtocol?

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["GuardSensorSample", "GuardInterrupted", "GuardMotionUnavailable"]
    }

    override func startObserving() { hasListeners = true }
    override func stopObserving() { hasListeners = false }

    private func emit(_ name: String, body: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }

    /// ابدأ مراقبة الحركة في المقدمة (CoreMotion DeviceMotion).
    /// تُرسَل العينات إلى النواة المشتركة؛ القرار («رفع» أم لا) هناك.
    /// بدء مكرر آمن: أوقف أي مراقبة سابقة أولًا حتى لا يتراكم مراقب
    /// انقطاع ثانٍ (interruptionObserver) بلا إزالة.
    @objc func startGuardMode() {
        stopGuardMode()
        guard motionManager.isDeviceMotionAvailable else {
            emit("GuardMotionUnavailable", body: ["reason": "no-device-motion"])
            return
        }
        motionManager.deviceMotionUpdateInterval = 0.1
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self = self, let motion = motion else { return }
            // تسارع كامل = تسارع المستخدم + الجاذبية (ما تتوقعه النواة المشتركة).
            let ax = motion.userAcceleration.x + motion.gravity.x
            let ay = motion.userAcceleration.y + motion.gravity.y
            let az = motion.userAcceleration.z + motion.gravity.z
            self.emit("GuardSensorSample", body: [
                "ax": ax, "ay": ay, "az": az,
                "gx": motion.rotationRate.x,
                "gy": motion.rotationRate.y,
                "gz": motion.rotationRate.z,
            ])
        }
        // منع القفل التلقائي أثناء الحراسة (يُعاد عند الإيقاف).
        UIApplication.shared.isIdleTimerDisabled = true
        // الخروج من المقدمة = توقف الحراسة على iOS — أبلِغ الواجهة فورًا.
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            self.stopGuardMode()
            self.emit("GuardInterrupted", body: ["reason": "app-backgrounded"])
        }
    }

    @objc func stopGuardMode() {
        motionManager.stopDeviceMotionUpdates()
        UIApplication.shared.isIdleTimerDisabled = false
        scream.stopScream()
        if let observer = interruptionObserver {
            NotificationCenter.default.removeObserver(observer)
            interruptionObserver = nil
        }
    }

    /// نافذة Face ID / Touch ID الرسمية (LAContext).
    /// تُستدعى من النواة المشتركة أثناء مهلة 3 ثوانٍ.
    @objc(authenticate:resolver:rejecter:)
    func authenticate(_ reason: String,
                      resolver: @escaping RCTPromiseResolveBlock,
                      rejecter: @escaping RCTPromiseRejectBlock) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            resolver("unavailable")
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in
            resolver(success ? "success" : "failed")
        }
    }

    /// ابدأ صفارة إنذار الحريق (siren.wav الافتراضي — قرار §9/3).
    @objc(startScream:graduated:rampSeconds:resolver:rejecter:)
    func startScream(_ soundFile: String, graduated: Bool, rampSeconds: Double,
                     resolver: @escaping RCTPromiseResolveBlock,
                     rejecter: @escaping RCTPromiseRejectBlock) {
        do {
            try scream.startScream(soundFile: soundFile, graduated: graduated, rampSeconds: rampSeconds)
            resolver(nil)
        } catch {
            rejecter("SCREAM_START_FAILED", error.localizedDescription, error)
        }
    }

    @objc func stopScream() {
        scream.stopScream()
    }

    /// مستوى صوت النظام الحالي 0..1 — للتحذير إن كان منخفضًا قبل التسليح.
    @objc(currentVolume:rejecter:)
    func currentVolume(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter: @escaping RCTPromiseRejectBlock) {
        resolve(scream.currentVolume())
    }

    @objc(isPlaying:rejecter:)
    func isPlaying(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter: @escaping RCTPromiseRejectBlock) {
        resolve(scream.isPlaying())
    }
}
