function getDetox() {
  try {
    return require('detox');
  } catch {
    return null;
  }
}

// Resolved device block of the active Detox configuration, e.g.
// { type: 'android.cloud', name: 'Samsung Galaxy S22', osVersion: '12.0' }.
// Detox 20 exposes it on `detox/internals` as `config.device`.
function detoxDeviceConfig() {
  try {
    const internals = require('detox/internals');
    const dc = internals?.config?.device || internals?.config?.deviceConfig;
    if (!dc) return {};
    const d = typeof dc.device === 'object' && dc.device ? dc.device : {};
    return { type: dc.type, name: d.name || d.avdName, osVersion: d.osVersion || d.os };
  } catch {
    return {};
  }
}

// BrowserStack's cloud driver (`@browserstack/detox`, type `android.cloud`) runs the
// tester on the customer's machine with no adb path to the device, and its
// device.takeScreenshot() is a stub that returns ''.
function isCloudDevice(deviceConfig) {
  return typeof deviceConfig?.type === 'string' && /\.cloud$/.test(deviceConfig.type);
}

module.exports = { getDetox, detoxDeviceConfig, isCloudDevice };
