const { exec: defaultExec } = require('../util/exec');
const log = require('../util/log');

function createAndroidMetadata(device, options = {}, { exec = defaultExec } = {}) {
  let _screenSize = null;
  let _scaleFactor = null;

  async function sh(args) {
    try {
      if (!device || !device.id) return '';
      const { stdout } = await exec('adb', ['-s', device.id, 'shell', ...args], { timeoutMs: 5000 });
      return String(stdout).trim();
    } catch (e) {
      log.debug(`adb shell ${args.join(' ')} failed: ${e.message}`);
      return '';
    }
  }

  return {
    osName: async () => 'Android',

    osVersion: async () => {
      if (options.osVersion) return options.osVersion;
      const out = await sh(['getprop', 'ro.build.version.release']);
      return out || 'unknown';
    },

    deviceName: async () => {
      if (options.deviceName) return options.deviceName;
      if (device && device.name) return device.name;
      const out = await sh(['getprop', 'ro.product.model']);
      return out || 'unknown';
    },

    screenSize: async () => {
      if (_screenSize) return _screenSize;
      const out = await sh(['wm', 'size']);
      const override = out.match(/Override size:\s*(\d+)x(\d+)/);
      const physical = out.match(/Physical size:\s*(\d+)x(\d+)/);
      const m = override || physical;
      _screenSize = m
        ? { width: parseInt(m[1], 10), height: parseInt(m[2], 10) }
        : { width: 0, height: 0 };
      return _screenSize;
    },

    orientation: async () => options.orientation || 'portrait',

    statusBarHeight: async () => options.statusBarHeight || 0,
    navigationBarHeight: async () => options.navigationBarHeight || 0,

    scaleFactor: async () => {
      if (_scaleFactor != null) return _scaleFactor;
      const out = await sh(['wm', 'density']);
      const override = out.match(/Override density:\s*(\d+)/);
      const physical = out.match(/Physical density:\s*(\d+)/);
      const m = override || physical;
      let scale = m ? parseInt(m[1], 10) / 160 : 2;
      if (!Number.isFinite(scale) || scale <= 0) scale = 2;
      _scaleFactor = scale;
      return _scaleFactor;
    }
  };
}

module.exports = { createAndroidMetadata };
