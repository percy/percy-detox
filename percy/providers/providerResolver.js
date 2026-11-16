const { GenericProvider, screenshotMode } = require('./genericProvider');
const { AppAutomateProvider } = require('./appAutomateProvider');
const { getDetox, detoxDeviceConfig } = require('../util/detox');
const log = require('../util/log');

let loggedMissingCloudPlatform = false;

// AppAutomateProvider (host-side full-screen capture) > element capture > device capture.
// Element and device capture are both GenericProvider; it picks between them by mode.
function resolveProvider(arg, { argKind, options, deviceConfig, getDetox: getDetoxDep = getDetox }) {
  const opts = { argKind, deviceConfig: deviceConfig || detoxDeviceConfig(), getDetox: getDetoxDep };

  // An element argument means "capture this element": always element capture.
  if (argKind !== 'device') return new GenericProvider(arg, opts);

  const mode = screenshotMode(options);
  if (mode !== 'auto' && mode !== 'cloud') return new GenericProvider(arg, opts);

  if (AppAutomateProvider.supports(arg, opts.deviceConfig)) return new AppAutomateProvider(arg, opts);

  const type = arg.type || opts.deviceConfig.type;
  if (type === 'android.cloud' && !loggedMissingCloudPlatform) {
    loggedMissingCloudPlatform = true;
    log.debug('device.cloudPlatform is not available in this Detox build; using element capture');
  }
  return new GenericProvider(arg, opts);
}

function resetResolverStateForTests() {
  loggedMissingCloudPlatform = false;
}

module.exports = { resolveProvider, resetResolverStateForTests };
