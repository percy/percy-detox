const { resolveProvider, resetResolverStateForTests } = require('../../percy/providers/providerResolver');
const { GenericProvider } = require('../../percy/providers/genericProvider');
const { AppAutomateProvider } = require('../../percy/providers/appAutomateProvider');
const log = require('../../percy/util/log');

function cloudDevice(extra = {}) {
  return {
    type: 'android.cloud',
    getPlatform: async () => 'android',
    takeScreenshot: async () => '',
    cloudPlatform: async () => ({ success: true, result: {} }),
    ...extra
  };
}

const resolve = (arg, options = {}, argKind = 'device') =>
  resolveProvider(arg, { argKind, options, deviceConfig: {}, getDetox: () => null });

describe('resolveProvider', () => {
  beforeEach(() => {
    resetResolverStateForTests();
    delete process.env.PERCY_DETOX_SCREENSHOT_MODE;
  });

  it('picks AppAutomateProvider on android.cloud with cloudPlatform (auto)', () => {
    expect(resolve(cloudDevice())).toBeInstanceOf(AppAutomateProvider);
  });

  it('picks AppAutomateProvider in screenshotMode "cloud" (option or env)', () => {
    expect(resolve(cloudDevice(), { screenshotMode: 'cloud' })).toBeInstanceOf(AppAutomateProvider);
    process.env.PERCY_DETOX_SCREENSHOT_MODE = 'cloud';
    expect(resolve(cloudDevice())).toBeInstanceOf(AppAutomateProvider);
    delete process.env.PERCY_DETOX_SCREENSHOT_MODE;
  });

  it('uses the Detox device config type when device.type is absent', () => {
    const p = resolveProvider(cloudDevice({ type: undefined }), {
      argKind: 'device', options: {}, deviceConfig: { type: 'android.cloud' }, getDetox: () => null
    });
    expect(p).toBeInstanceOf(AppAutomateProvider);
  });

  it('respects explicit element/device modes', () => {
    for (const screenshotMode of ['element', 'device']) {
      const p = resolve(cloudDevice(), { screenshotMode });
      expect(p).toBeInstanceOf(GenericProvider);
      expect(p).not.toBeInstanceOf(AppAutomateProvider);
    }
  });

  it('uses GenericProvider (element capture) when cloudPlatform is missing, logging once', () => {
    const debugSpy = spyOn(log, 'debug');
    const device = cloudDevice({ cloudPlatform: undefined });
    expect(resolve(device)).not.toBeInstanceOf(AppAutomateProvider);
    resolve(device);
    const msgs = debugSpy.calls.allArgs().filter(([m]) => /cloudPlatform is not available/.test(m));
    expect(msgs.length).toBe(1);
  });

  it('uses GenericProvider for local devices', () => {
    const local = { type: 'android.emulator', getPlatform: async () => 'android', takeScreenshot: async () => 'x' };
    expect(resolve(local)).not.toBeInstanceOf(AppAutomateProvider);
  });

  it('uses GenericProvider for element arguments, even on cloud', () => {
    const el = { takeScreenshot: async () => 'x', getAttributes: async () => ({}) };
    expect(resolve(el, {}, 'element')).not.toBeInstanceOf(AppAutomateProvider);
  });

  it('reads the Detox config and module by default', () => {
    const local = { getPlatform: async () => 'android', takeScreenshot: async () => 'x' };
    const p = resolveProvider(local, { argKind: 'device' });
    expect(p).toBeInstanceOf(GenericProvider);
    expect(p).not.toBeInstanceOf(AppAutomateProvider);
  });

  it('rejects unknown screenshot modes', () => {
    expect(() => resolve(cloudDevice(), { screenshotMode: 'bogus' })).toThrowError(TypeError, /screenshotMode/);
  });
});
