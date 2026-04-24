const { createAndroidMetadata } = require('./androidMetadata');
const { createIosMetadata } = require('./iosMetadata');

async function resolveMetadata(device, options = {}, deps = {}) {
  const platform = device && typeof device.getPlatform === 'function'
    ? await device.getPlatform()
    : null;
  if (platform === 'ios') return createIosMetadata(device, options, deps);
  if (platform === 'android') return createAndroidMetadata(device, options, deps);
  return createFallbackMetadata(options);
}

function createFallbackMetadata(options = {}) {
  return {
    osName: async () => 'unknown',
    osVersion: async () => options.osVersion || 'unknown',
    deviceName: async () => options.deviceName || 'unknown',
    screenSize: async () => ({ width: 0, height: 0 }),
    orientation: async () => options.orientation || 'portrait',
    statusBarHeight: async () => options.statusBarHeight || 0,
    navigationBarHeight: async () => options.navigationBarHeight || 0,
    scaleFactor: async () => 2
  };
}

module.exports = { resolveMetadata, createFallbackMetadata };
