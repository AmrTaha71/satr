#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// جسر React Native لوحدة وضع الحراسة (iOS).
/// يصدّر GuardModeModule.swift إلى JavaScript: مراقبة حركة في المقدمة
/// (أحداث GuardSensorSample)، مهلة Face ID / Touch ID، وصفارة إنذار الحريق.
/// القطعة الأولى iOS أولًا (قرار §9/1).
/// ملاحظة: RCTEventEmitter لا يحتاج RCT_EXPORT_MODULE منفصلًا — الاسم
/// مأخوذ من @objc(GuardModeModule) في Swift.
@interface RCT_EXTERN_MODULE(GuardModeModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startGuardMode)
RCT_EXTERN_METHOD(stopGuardMode)

RCT_EXTERN_METHOD(authenticate:(NSString *)reason
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startScream:(NSString *)soundFile
                  graduated:(BOOL)graduated
                  rampSeconds:(double)rampSeconds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopScream)

RCT_EXTERN_METHOD(currentVolume:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isPlaying:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
