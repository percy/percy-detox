const utils = require('@percy/sdk-utils');
const { GenericProvider, CLIENT_INFO, ENV_INFO, screenshotMode } = require('./genericProvider');
const { Tile } = require('../util/tile');
const { TimeIt } = require('../util/timing');
const log = require('../util/log');
const { findRegions } = require('../regions/findRegions');

const METHOD = 'percyScreenshot';
const CLOUD_DEVICE_TYPE = 'android.cloud';

// Errors that mean "this Hub/host can't capture for us": fall back to element capture.
class CloudCaptureUnavailable extends Error {}

// Process-wide state: one begin per device, and once the cloud path is unavailable
// it stays off so every later screenshot goes straight to element capture.
let beginCache = new WeakMap();
let disabledReason = null;

// On BrowserStack App Automate (`@browserstack/detox`, device type android.cloud) the
// device is remote. The Hub's percyScreenshot CloudPlatform method captures the full
// screen with adb on the host, uploads it to Percy, and returns the tile's sha.
class AppAutomateProvider extends GenericProvider {
  static supports(device, deviceConfig = {}) {
    if (!device) return false;
    const type = device.type || deviceConfig.type;
    return type === CLOUD_DEVICE_TYPE && typeof device.cloudPlatform === 'function';
  }

  constructor(arg, opts) {
    super(arg, opts);
    // The element-capture fallback keys off deviceConfig.type; `device.type` is the
    // more direct source when detox/internals didn't yield a config.
    if (!this.deviceConfig.type && this.device?.type) {
      this.deviceConfig = { ...this.deviceConfig, type: this.device.type };
    }
  }

  async screenshot(name, options) {
    const strict = screenshotMode(options) === 'cloud';
    if (disabledReason && !strict) return super.screenshot(name, options);

    let session = null;
    let response;
    let error;
    try {
      session = await this.begin(name);
      response = await this.cloudScreenshot(name, options, session);
    } catch (e) {
      if (!(e instanceof CloudCaptureUnavailable) || strict) {
        error = e;
        throw e;
      }
      disableCloudCapture(e.message);
      try {
        response = await super.screenshot(name, options);
      } catch (fe) {
        error = fe;
        throw fe;
      }
    } finally {
      if (session) await this.end(name, response, error);
    }
    return response;
  }

  async begin(name) {
    if (!beginCache.has(this.device)) {
      const pending = this.call('begin', name, {
        percyBuildId: utils.percy?.build?.id,
        percyBuildUrl: utils.percy?.build?.url
      }).then((result) => result || {});
      beginCache.set(this.device, pending);
      pending.catch(() => beginCache.delete(this.device));
    }
    return beginCache.get(this.device);
  }

  async cloudScreenshot(name, options, session) {
    const shot = await TimeIt.run('percyScreenshot:screenshot', () =>
      this.call('screenshot', name, { percyBuildId: utils.percy?.build?.id }));

    const tiles = buildTiles(shot, options);
    const tag = this.buildCloudTag(session, shot, options);
    const regionArgs = {
      scaleFactor: customRegionScale(shot, options),
      elementScaleFactor: 1, // Android element frames are already screen pixels
      options
    };
    const ignoreRegions = await findRegions({ kind: 'ignore', ...regionArgs });
    const considerRegions = await findRegions({ kind: 'consider', ...regionArgs });

    log.debug(`[${name}] mode=cloud tag=${JSON.stringify(tag)}`);
    log.debug(`[${name}] ignore=${ignoreRegions.length} consider=${considerRegions.length}`);

    return await utils.postComparison({
      name,
      tag,
      tiles,
      externalDebugUrl: debugUrl(session),
      ignoredElementsData: { ignoreElementsData: ignoreRegions },
      consideredElementsData: { considerElementsData: considerRegions },
      environmentInfo: ENV_INFO,
      clientInfo: CLIENT_INFO,
      sync: options.sync ?? null,
      testCase: options.testCase,
      labels: options.labels
    });
  }

  // Must never throw: a failed status report should not fail the test.
  async end(name, response, error) {
    try {
      const percyScreenshotUrl = response?.body?.link;
      await this.call('end', name, {
        percyBuildId: utils.percy?.build?.id,
        percyBuildUrl: utils.percy?.build?.url,
        percyScreenshotUrl,
        status: !error && percyScreenshotUrl ? 'success' : 'failure',
        errorMessage: error ? error.message : undefined
      });
    } catch (e) {
      log.debug(`[${name}] could not report screenshot status to App Automate: ${e.message}`);
    }
  }

  async call(state, name, args) {
    const res = await this.device.cloudPlatform(METHOD, {
      state,
      name,
      projectId: process.env.PERCY_ENABLE_DEV === 'true' ? 'percy-dev' : 'percy-prod',
      ...args
    });
    if (res && res.success) return parseResult(res.result);

    const message = res?.message || 'no response';
    if (/not supported/i.test(message)) throw new CloudCaptureUnavailable(message);
    throw new Error(`App Automate percyScreenshot ${state} failed: ${message}`);
  }

  buildCloudTag(session, shot, options) {
    const osVersion = options.osVersion || majorVersion(session.osVersion) ||
      this.deviceConfig.osVersion || 'unknown';
    return {
      name: options.deviceName || session.deviceName || this.deviceConfig.name || 'unknown',
      osName: 'Android',
      osVersion: String(osVersion),
      width: shot.width,
      height: shot.height,
      orientation: options.orientation || 'portrait'
    };
  }
}

function buildTiles(shot, options) {
  const tiles = Array.isArray(shot?.tiles) ? shot.tiles : [];
  if (!tiles.length) throw new CloudCaptureUnavailable('percyScreenshot returned no tiles');
  return tiles.map((t) => {
    if (t.errorMessage || typeof t.sha !== 'string' || !t.sha) {
      throw new CloudCaptureUnavailable(`percyScreenshot tile failed: ${t.errorMessage || 'empty sha'}`);
    }
    return new Tile({
      sha: t.sha.split('-')[0], // drop the build id suffix, as percy-appium-js does
      statusBarHeight: options.statusBarHeight || 0,
      navBarHeight: options.navigationBarHeight || 0,
      headerHeight: t.header_height,
      footerHeight: t.footer_height,
      fullscreen: options.fullscreen || false
    });
  });
}

// Custom regions are in points: scale them by the device density the host read.
function customRegionScale(shot, options) {
  const override = Number(options.scaleFactor);
  if (Number.isFinite(override) && override > 0) return override;
  const s = Number(shot?.scale_factor);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function debugUrl(session) {
  if (!session?.buildHash || !session?.sessionHash) return undefined;
  return `https://app-automate.browserstack.com/dashboard/v2/builds/${session.buildHash}/sessions/${session.sessionHash}`;
}

function majorVersion(v) {
  return v ? String(v).split('.')[0] : null;
}

function parseResult(result) {
  if (typeof result !== 'string') return result;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function disableCloudCapture(reason) {
  if (disabledReason) return;
  disabledReason = reason;
  log.info(`App Automate capture unavailable (${reason}); using element capture from now on`);
}

function resetAppAutomateStateForTests() {
  beginCache = new WeakMap();
  disabledReason = null;
}

module.exports = {
  AppAutomateProvider,
  CloudCaptureUnavailable,
  resetAppAutomateStateForTests
};
