const fs = require('fs/promises');
const { exec: defaultExec } = require('../util/exec');
const log = require('../util/log');

const MODULE_STATE = { scaleCache: new Map(), sizeCache: new Map() };

function createIosMetadata(device, options = {}, { exec = defaultExec, readFile = fs.readFile } = {}) {
  let _info = null;

  async function simctlInfo() {
    if (_info) return _info;
    try {
      const { stdout } = await exec('xcrun', ['simctl', 'list', 'devices', '--json'], { timeoutMs: 5000 });
      const json = JSON.parse(String(stdout));
      const udid = device && device.id;
      if (json && json.devices && udid) {
        for (const runtimeKey of Object.keys(json.devices)) {
          const arr = Array.isArray(json.devices[runtimeKey]) ? json.devices[runtimeKey] : [];
          const match = arr.find((d) => d && d.udid === udid);
          if (match) {
            const versionMatch = runtimeKey.match(/iOS-(\d+)(?:-(\d+))?/);
            const osVersion = versionMatch ? versionMatch[1] : null;
            _info = { name: match.name || null, osVersion };
            return _info;
          }
        }
      }
    } catch (e) {
      log.debug(`xcrun simctl list failed: ${e.message}`);
    }
    _info = { name: null, osVersion: null };
    return _info;
  }

  async function parsePngDims(pngPath) {
    try {
      const buf = await readFile(pngPath);
      if (!buf || buf.length < 24) return null;
      if (!buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return null;
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height };
    } catch (e) {
      log.debug(`PNG dim parse failed for ${pngPath}: ${e.message}`);
      return null;
    }
  }

  return {
    osName: async () => 'iOS',

    osVersion: async () => {
      if (options.osVersion) return options.osVersion;
      const info = await simctlInfo();
      return info.osVersion || 'unknown';
    },

    deviceName: async () => {
      if (options.deviceName) return options.deviceName;
      if (device && device.name) return device.name;
      const info = await simctlInfo();
      return info.name || 'unknown';
    },

    // Computed from the first captured PNG when path is available.
    // Cached per device.id alongside scaleFactor.
    screenSize: async (pngPath) => {
      const key = (device && device.id) || 'unknown-ios';
      if (MODULE_STATE.sizeCache.has(key)) return MODULE_STATE.sizeCache.get(key);
      if (!pngPath) return { width: 0, height: 0 };
      const dims = await parsePngDims(pngPath);
      const scale = MODULE_STATE.scaleCache.get(key) || 2;
      const size = dims && dims.width > 0
        ? { width: Math.round(dims.width / scale), height: Math.round(dims.height / scale) }
        : { width: 0, height: 0 };
      MODULE_STATE.sizeCache.set(key, size);
      return size;
    },

    orientation: async () => options.orientation || 'portrait',

    statusBarHeight: async () => options.statusBarHeight || 0,
    navigationBarHeight: async () => options.navigationBarHeight || 0,

    scaleFactor: async (pngPath) => {
      const key = (device && device.id) || 'unknown-ios';
      if (MODULE_STATE.scaleCache.has(key)) return MODULE_STATE.scaleCache.get(key);

      const dims = await parsePngDims(pngPath);
      // Heuristic: PNG widths >=1080 are 3x-class devices; <=900 are 2x-class.
      // Unknown falls back to 2. Users can override via options.scaleFactor (not plumbed
      // yet — override via explicit deviceName → known device lookup can be added later).
      let scale = 2;
      if (dims && Number.isFinite(dims.width) && dims.width >= 1080) scale = 3;
      if (dims && Number.isFinite(dims.width) && dims.width > 0 && dims.width < 320) {
        // Unusually tiny PNG — fall back
        scale = 2;
        log.warn(`iOS scaleFactor: PNG width ${dims.width} is unusually small; defaulting to 2x`);
      }
      if (!Number.isFinite(scale) || scale <= 0) scale = 2;
      MODULE_STATE.scaleCache.set(key, scale);
      return scale;
    }
  };
}

function __resetScaleCacheForTests() {
  MODULE_STATE.scaleCache.clear();
  MODULE_STATE.sizeCache.clear();
}

module.exports = { createIosMetadata, __resetScaleCacheForTests };
