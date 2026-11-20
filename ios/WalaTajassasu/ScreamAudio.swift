import AVFoundation
import UIKit

/// محرك الصفارة — iOS (فكرتا 97 و6).
///
/// - الصوت ملف محلي داخل التطبيق — يعمل دون إنترنت.
/// - الصوت الافتراضي: صفارة إنذار حريق `siren.wav` (قرار §9/3 — أجابه
///   عمرو 2026-11-12: صفارة إنذار، لا صرخة بشرية).
/// - فئة AVAudioSession `.playback` تتجاوز مفتاح الصمت.
/// - حدود صادقة (مخطط §8): لا يمكن رفع صوت النظام برمجيًا إلى الأقصى —
///   مستوى الصوت ملك للمستخدم؛ يُقرأ ويُنبَّه إن كان منخفضًا.
/// - الإغلاق القسري للتطبيق قد يوقف الصفارة على iOS — يُحذَّر المالك.
/// - لا قفل تطبيقات أخرى ولا مراقبة خلفية على iOS — هذه الوحدة رفيعة عمدًا.
///
/// لم يُترجَم على جهاز البناء (لا Xcode هنا) — يُترجَم في Xcode على MacBook.
@objc(ScreamAudio)
final class ScreamAudio: NSObject {
    /// ملف صفارة إنذار الحريق الافتراضي (قرار §9/3).
    static let defaultSirenFile = "siren"
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var previousCategory: AVAudioSession.Category?

    @objc static func requiresMainQueueSetup() -> Bool { true }

    /// ابدأ صفارة إنذار الحريق في حلقة. `graduated`: متدرجة (افتراضي) تصل للأقصى خلال 5 ثوانٍ (تقدير غير مقيس).
    @objc func startScream(soundFile: String, graduated: Bool, rampSeconds: Double) throws {
        stopScream()
        // تحقق من وجود الملف أولًا — قبل تبديل فئة الصوت: النسخة
        // السابقة كانت تضبط فئة playback وتفعّل الجلسة ثم ترمي عند
        // غياب الملف، فتبقى الجلسة في playback/نشطة بعد فشل البدء.
        guard let url = Bundle.main.url(forResource: soundFile, withExtension: "wav") else {
            throw NSError(domain: "WalaTajassasu", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "ملف الصوت \(soundFile).wav غير موجود في الحزمة"])
        }
        let session = AVAudioSession.sharedInstance()
        previousCategory = session.category
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setActive(true)

        do {
            player = try AVAudioPlayer(contentsOf: url)
        } catch {
            // فشل إنشاء المشغّل بعد تفعيل الجلسة — أعد الفئة السابقة
            // وألغِ التفعيل قبل إعادة رمي الخطأ.
            if let previous = previousCategory {
                try? session.setCategory(previous, mode: .default, options: [])
            }
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            throw error
        }
        player?.numberOfLoops = -1 // حلقة حتى يوقفها المالك
        player?.volume = graduated ? 0.2 : 1.0
        player?.play()

        guard graduated, rampSeconds > 0 else { return }
        // مؤقّت التدرّج يُجدوَل على حلقة التشغيل الرئيسية صراحةً:
        // startScream قد يُستدعى من خيط الجسر لا الرئيسي، ومؤقّت
        // Timer.scheduledTimer على خيط بلا RunLoop لا يعمل أبدًا.
        let steps = max(1, Int(rampSeconds)) // rampSeconds بين 0 و1 كان يعطي 0 فيقسّم على صفر
        var step = 0
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] t in
                guard let self = self, let player = self.player else { t.invalidate(); return }
                step += 1
                player.volume = Float(min(1.0, 0.2 + 0.8 * Double(step) / Double(steps)))
                if step >= steps { t.invalidate() }
            }
        }
    }

    /// أوقف الصرخة وأعد فئة الصوت السابقة.
    @objc func stopScream() {
        timer?.invalidate()
        timer = nil
        player?.stop()
        player = nil
        let session = AVAudioSession.sharedInstance()
        if let previous = previousCategory {
            try? session.setCategory(previous, mode: .default, options: [])
        }
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// مستوى صوت النظام الحالي 0..1 — للتحذير إن كان منخفضًا قبل التسليح.
    @objc func currentVolume() -> Float {
        AVAudioSession.sharedInstance().outputVolume
    }

    @objc func isPlaying() -> Bool {
        player?.isPlaying ?? false
    }
}
