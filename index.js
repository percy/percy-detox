const utils = require('@percy/sdk-utils');
const { GenericProvider } = require('./percy/providers/genericProvider');
const { classifyArg, rejectUnknownOptions } = require('./percy/util/validations');
const postFailedEvents = require('./percy/util/postFailedEvents');
const log = require('./percy/util/log');

const percyScreenshot = async function percyScreenshot(deviceOrElement, name, options = {}) {
  if (typeof name !== 'string' || !name.length) {
    throw new TypeError('@percy/detox: the `name` argument is required.');
  }
  if (!deviceOrElement) {
    throw new TypeError('@percy/detox: a Detox device or element is required as the first argument.');
  }
  rejectUnknownOptions(options);
  const argKind = classifyArg(deviceOrElement);

  let percyEnabled;
  try {
    // self-reference via module.exports so tests can spy on it
    percyEnabled = await module.exports.isPercyEnabled();
  } catch (e) {
    log.debug(`[${name}] isPercyEnabled probe failed: ${e.message}`);
    percyEnabled = false;
  }
  if (!percyEnabled) {
    log.info(`[${name}] Percy is not running, skipping screenshot`);
    return undefined;
  }

  const provider = new GenericProvider(deviceOrElement, { argKind });
  let response;
  try {
    response = await provider.screenshot(name, options);
  } catch (e) {
    log.error(`[${name}] failed to take screenshot: ${e.message}`);
    if (e.stack) log.debug(e.stack);
    try {
      await postFailedEvents(e);
    } catch (pfe) {
      log.debug(`[${name}] postFailedEvents failed: ${pfe.message}`);
    }
    if (process.env.PERCY_IGNORE_ERRORS === 'true') {
      log.warn(`[${name}] suppressed (PERCY_IGNORE_ERRORS=true): ${e.message}`);
      return undefined;
    }
    throw e;
  }
  return response && response.body ? response.body.data : undefined;
};

percyScreenshot.isPercyEnabled = async function isPercyEnabled() {
  return utils.isPercyEnabled();
};

percyScreenshot.isDetoxDevice = function isDetoxDevice(arg) {
  try {
    return classifyArg(arg) === 'device';
  } catch {
    return false;
  }
};

module.exports = percyScreenshot;
