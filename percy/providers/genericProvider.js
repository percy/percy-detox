const fs = require('fs/promises');
const utils = require('@percy/sdk-utils');
const { Tile } = require('../util/tile');
const log = require('../util/log');
const { resolveMetadata } = require('../metadata/resolveMetadata');
const { findRegions } = require('../regions/findRegions');
const { copyToSdkTmp, validatePng } = require('../util/tmp');
const { warnFullPageOnce } = require('../util/log');
const { getDetox, detoxDeviceConfig, isCloudDevice } = require('../util/detox');

const SDK_PKG = require('../../package.json');
const CLIENT_INFO = `${SDK_PKG.name}/${SDK_PKG.version}`;

const SCREENSHOT_MODES = ['auto', 'device', 'element'];
const ANDROID_ROOT_VIEW_CLASS = 'android.widget.FrameLayout';

function safeDetoxVersion() {
  try {
    return require('detox/package.json').version;
  } catch {
    return 'unknown';
  }
}

const ENV_INFO = `(detox/${safeDetoxVersion()})`;

class GenericProvider {
  constructor(arg, { argKind, deviceConfig, getDetox: getDetoxDep = getDetox } = {}) {
    this.arg = arg;
    this.argKind = argKind;
    this.getDetox = getDetoxDep;
    this.device = argKind === 'device' ? arg : resolveGlobalDevice(this.getDetox);
    this.deviceConfig = deviceConfig || detoxDeviceConfig();
    this.metadata = null;
  }

  async screenshot(name, options = {}) {
    if (options.fullPage === true) warnFullPageOnce();

    this.metadata = await resolveMetadata(this.device, options, { deviceConfig: this.deviceConfig });

    const shot = await this.capture(name, options);
    const sdkPath = await copyToSdkTmp(shot.rawPath);
    try {
      await validatePng(sdkPath);

      const scaleFactor = await this.metadata.scaleFactor(sdkPath);
      const tag = await this.buildTag(sdkPath);
      const ignoreRegions = await findRegions({ kind: 'ignore', scaleFactor, options, origin: shot.origin });
      const considerRegions = await findRegions({ kind: 'consider', scaleFactor, options, origin: shot.origin });

      // Send bytes, not a path: the Percy CLI may not share this filesystem, and it
      // uploads after this call returns.
      const content = (await fs.readFile(sdkPath)).toString('base64');

      const tile = new Tile({
        content,
        statusBarHeight: await this.metadata.statusBarHeight(),
        navBarHeight: await this.metadata.navigationBarHeight(),
        headerHeight: 0,
        footerHeight: 0,
        fullscreen: options.fullscreen || false
      });

      log.debug(`[${name}] mode=${shot.mode} tag=${JSON.stringify(tag)}`);
      log.debug(`[${name}] scaleFactor=${scaleFactor} ignore=${ignoreRegions.length} consider=${considerRegions.length}`);

      return await utils.postComparison({
        name,
        tag,
        tiles: [tile],
        ignoredElementsData: { ignoreElementsData: ignoreRegions },
        consideredElementsData: { considerElementsData: considerRegions },
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        sync: options.sync ?? null,
        testCase: options.testCase,
        labels: options.labels
      });
    } finally {
      await fs.unlink(sdkPath).catch(() => {});
    }
  }

  // device  → device.takeScreenshot() (needs adb/simctl on this machine)
  // element → element.takeScreenshot() on the app's root view; travels over the
  //           Detox websocket, so it works on BrowserStack App Automate
  // auto    → element on cloud devices, device otherwise (falls back to element)
  async capture(name, options) {
    if (this.argKind === 'element') {
      return {
        rawPath: await this.arg.takeScreenshot(name),
        origin: await frameOrigin(this.arg),
        mode: 'element'
      };
    }

    const mode = options.screenshotMode || process.env.PERCY_DETOX_SCREENSHOT_MODE || 'auto';
    if (!SCREENSHOT_MODES.includes(mode)) {
      throw new TypeError(`@percy/detox: screenshotMode must be one of ${SCREENSHOT_MODES.join(', ')}`);
    }

    if (mode === 'device' || (mode === 'auto' && !isCloudDevice(this.deviceConfig))) {
      const rawPath = await this.arg.takeScreenshot(name);
      if (rawPath) return { rawPath, origin: null, mode: 'device' };
      if (mode === 'device') throw new Error('Detox takeScreenshot returned an empty path');
      log.debug(`[${name}] device.takeScreenshot returned an empty path; capturing the root view instead`);
    }

    const root = await this.rootElement(options);
    const rawPath = await root.takeScreenshot(name);
    if (!rawPath) throw new Error('Detox root element takeScreenshot returned an empty path');
    return { rawPath, origin: await frameOrigin(root), mode: 'element' };
  }

  async rootElement(options) {
    const detox = this.getDetox();
    if (!detox || typeof detox.element !== 'function' || !detox.by) {
      throw new Error('@percy/detox: element capture needs the detox module (element/by)');
    }
    const rootTestID = options.rootTestID || process.env.PERCY_DETOX_ROOT_TEST_ID;
    if (rootTestID) return detox.element(detox.by.id(rootTestID));

    const platform = this.device && typeof this.device.getPlatform === 'function'
      ? await this.device.getPlatform()
      : null;
    if (platform === 'ios') {
      throw new TypeError('@percy/detox: element capture on iOS needs options.rootTestID');
    }
    // The window's DecorView is a FrameLayout at index 0 of the hierarchy.
    return detox.element(detox.by.type(ANDROID_ROOT_VIEW_CLASS)).atIndex(0);
  }

  async buildTag(pngPath) {
    const size = await this.metadata.screenSize(pngPath);
    return {
      name: await this.metadata.deviceName(),
      osName: await this.metadata.osName(),
      osVersion: await this.metadata.osVersion(),
      width: size.width,
      height: size.height,
      orientation: await this.metadata.orientation()
    };
  }
}

async function frameOrigin(element) {
  try {
    const attrs = await element.getAttributes();
    const frame = Array.isArray(attrs?.elements) ? attrs.elements[0]?.frame : attrs?.frame;
    if (frame) return { x: frame.x || 0, y: frame.y || 0 };
  } catch (e) {
    log.debug(`could not read captured element frame, assuming origin 0,0: ${e.message}`);
  }
  return { x: 0, y: 0 };
}

function resolveGlobalDevice(getDetoxFn) {
  const detox = getDetoxFn();
  return detox && detox.device ? detox.device : null;
}

module.exports = { GenericProvider, CLIENT_INFO, ENV_INFO };
