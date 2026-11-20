// Jest — اختبارات النواة المشتركة (src/core/__tests__/).
// يُشغَّل على MacBook بعد `npm install` عبر `npm test`.
// على جهاز البناء هذا (بلا node_modules) تُشغَّل المعادلات نفسها
// عبر فحص Node مؤقت — انظر README «التحقق».
module.exports = {
  preset: 'react-native',
  testMatch: ['**/src/core/__tests__/**/*.test.ts'],
};
