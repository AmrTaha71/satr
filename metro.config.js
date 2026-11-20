const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  resolver: {
    // ملفات الصوت المحلية (الصرخة) تُحزَم مع التطبيق — تعمل دون إنترنت.
    assetExts: ['wav', 'mp3', 'm4a'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
