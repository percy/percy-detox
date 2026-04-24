const utils = require('@percy/sdk-utils');
const { Tile } = require('../util/tile');
const log = require('../util/log');
const { resolveMetadata } = require('../metadata/resolveMetadata');
const { findRegions } = require('../regions/findRegions');
const { resolveDebugUrl } = require('./resolveDebugUrl');
const { copyToSdkTmp, validatePng } = require('../util/tmp');
const { warnFullPageOnce } = require('../util/log');

const SDK_PKG = require('../../package.json');
const CLIENT_INFO = `${SDK_PKG.name}/${SDK_PKG.version}`;

function safeDetoxVersion() {
  try {
    return require('detox/package.json').version;
  } catch {
    return 'unknown';
  }
}

const ENV_INFO = `(detox/${safeDetoxVersion()})`;

class GenericProvider {
  constructor(arg, { argKind } = {}) {
    this.arg = arg;
    this.argKind = argKind;
    this.device = argKind === 'device' ? arg : resolveGlobalDevice();
    this.metadata = null;
  }

  async screenshot(name, options = {}) {
    if (options.fullPage === true) warnFullPageOnce();

    this.metadata = await resolveMetadata(this.device, options);

    const rawPath = await this.arg.takeScreenshot(name);
    if (!rawPath) {
      throw new Error('Detox takeScreenshot returned an empty path');
    }

    const sdkPath = await copyToSdkTmp(rawPath);
    await validatePng(sdkPath);

    const scaleFactor = await this.metadata.scaleFactor(sdkPath);

    const tag = await this.buildTag();
    const ignoreRegions = await findRegions({
      kind: 'ignore',
      scaleFactor,
      options
    });
    const considerRegions = await findRegions({
      kind: 'consider',
      scaleFactor,
      options
    });

    const tile = new Tile({
      filepath: sdkPath,
      statusBarHeight: await this.metadata.statusBarHeight(),
      navBarHeight: await this.metadata.navigationBarHeight(),
      headerHeight: 0,
      footerHeight: 0,
      fullscreen: options.fullscreen || false
    });

    const externalDebugUrl = await resolveDebugUrl(options);

    log.debug(`[${name}] tag=${JSON.stringify(tag)}`);
    log.debug(`[${name}] scaleFactor=${scaleFactor} ignore=${ignoreRegions.length} consider=${considerRegions.length}`);

    return utils.postComparison({
      name,
      tag,
      tiles: [tile],
      externalDebugUrl,
      ignoredElementsData: { ignoreElementsData: ignoreRegions },
      consideredElementsData: { considerElementsData: considerRegions },
      environmentInfo: ENV_INFO,
      clientInfo: CLIENT_INFO,
      sync: options.sync ?? null,
      testCase: options.testCase,
      labels: options.labels
    });
  }

  async buildTag() {
    const size = await this.metadata.screenSize();
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

function resolveGlobalDevice() {
  try {
    const detox = require('detox');
    return detox && detox.device ? detox.device : null;
  } catch {
    return null;
  }
}

module.exports = { GenericProvider };
