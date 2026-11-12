const fs = require('fs/promises');
const { createAndroidMetadata } = require('./androidMetadata');
const { createIosMetadata } = require('./iosMetadata');
const log = require('../util/log');
const { isCloudDevice } = require('../util/detox');

async function resolveMetadata(device, options = {}, deps = {}) {
  const platform = device && typeof device.getPlatform === 'function'
    ? await device.getPlatform()
    : null;
  if (isCloudDevice(deps.deviceConfig)) return createCloudMetadata(platform, options, deps);
  if (platform === 'ios') return createIosMetadata(device, options, deps);
  if (platform === 'android') return createAndroidMetadata(device, options, deps);
  return createFallbackMetadata(options, deps);
}

function createFallbackMetadata(options = {}, { readFile = fs.readFile } = {}) {
  let _size = null;
  let _scale = null;

  async function parsePngDims(pngPath) {
    try {
      const buf = await readFile(pngPath);
      if (!buf || buf.length < 24) return null;
      if (!buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } catch (e) {
      log.debug(`fallback PNG dim parse failed: ${e.message}`);
      return null;
    }
  }

  return {
    osName: async () => 'unknown',
    osVersion: async () => options.osVersion || 'unknown',
    deviceName: async () => options.deviceName || 'unknown',

    // Derive from PNG when available so tag.width/height >= 1 and Percy accepts.
    screenSize: async (pngPath) => {
      if (_size) return _size;
      if (!pngPath) return { width: 360, height: 640 };
      const dims = await parsePngDims(pngPath);
      const scale = _scale || 2;
      _size = dims && dims.width > 0
        ? { width: Math.round(dims.width / scale), height: Math.round(dims.height / scale) }
        : { width: 360, height: 640 };
      return _size;
    },

    orientation: async () => options.orientation || 'portrait',
    statusBarHeight: async () => options.statusBarHeight || 0,
    navigationBarHeight: async () => options.navigationBarHeight || 0,

    scaleFactor: async (pngPath) => {
      if (_scale != null) return _scale;
      if (!pngPath) { _scale = 2; return _scale; }
      const dims = await parsePngDims(pngPath);
      _scale = dims && dims.width >= 1080 ? 3 : 2;
      return _scale;
    }
  };
}

// Cloud devices (BrowserStack App Automate) have no local adb/simctl, so device
// identity comes from options or the Detox device config, and size from the PNG.
function createCloudMetadata(platform, options = {}, { readFile = fs.readFile, deviceConfig = {} } = {}) {
  async function parsePngDims(pngPath) {
    try {
      const buf = await readFile(pngPath);
      if (!buf || buf.length < 24) return null;
      if (!buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } catch (e) {
      log.debug(`cloud PNG dim parse failed: ${e.message}`);
      return null;
    }
  }

  return {
    osName: async () => (platform === 'ios' ? 'iOS' : 'Android'),
    osVersion: async () => String(options.osVersion || deviceConfig.osVersion || 'unknown'),
    deviceName: async () => options.deviceName || deviceConfig.name || 'unknown',

    // Tag size is the captured PNG in pixels, matching local Android (`wm size`).
    screenSize: async (pngPath) => {
      const dims = pngPath ? await parsePngDims(pngPath) : null;
      return dims && dims.width > 0 ? dims : { width: 360, height: 640 };
    },

    orientation: async () => options.orientation || 'portrait',
    statusBarHeight: async () => options.statusBarHeight || 0,
    navigationBarHeight: async () => options.navigationBarHeight || 0,

    // Detox Android reports getAttributes().frame in screen pixels (per the CE
    // implementation, BrowserStackCE/percy-detox-android), so regions need no scaling
    // by default. Unverified against a real device; overridable via options.scaleFactor.
    scaleFactor: async () => {
      const s = Number(options.scaleFactor);
      return Number.isFinite(s) && s > 0 ? s : 1;
    }
  };
}

module.exports = { resolveMetadata, createFallbackMetadata, createCloudMetadata };
