const percyScreenshot = require('../../index');
const { GenericProvider } = require('../../percy/providers/genericProvider');

function makeDevice(platform = 'ios') {
  return {
    id: 'UDID-TEST',
    name: 'Test Device',
    getPlatform: async () => platform,
    takeScreenshot: async () => '/tmp/nonexistent-detox-screenshot.png'
  };
}

describe('index — percyScreenshot entry', () => {
  let isPercyEnabledSpy, providerScreenshotSpy;

  beforeEach(() => {
    isPercyEnabledSpy = spyOn(percyScreenshot, 'isPercyEnabled');
    providerScreenshotSpy = spyOn(GenericProvider.prototype, 'screenshot')
      .and.resolveTo({ body: { data: { link: 'https://percy.io/build/1/snap/home' } } });
    delete process.env.PERCY_IGNORE_ERRORS;
  });

  it('throws when name is missing', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    const device = makeDevice();
    await expectAsync(percyScreenshot(device, '')).toBeRejectedWithError(/name.*required/i);
    await expectAsync(percyScreenshot(device)).toBeRejectedWithError(/name.*required/i);
  });

  it('throws when first argument is missing', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    await expectAsync(percyScreenshot(null, 'x')).toBeRejectedWithError(/required/i);
  });

  it('throws TypeError on unsupported option key', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    const device = makeDevice();
    await expectAsync(
      percyScreenshot(device, 'name', { ignoreRegionXpaths: ['//x'] })
    ).toBeRejectedWithError(TypeError, /XPath/);
  });

  it('returns undefined and does not call provider.screenshot when Percy is disabled', async () => {
    isPercyEnabledSpy.and.resolveTo(false);
    const device = makeDevice();
    const takeSpy = spyOn(device, 'takeScreenshot').and.callThrough();
    const result = await percyScreenshot(device, 'Home');
    expect(result).toBeUndefined();
    expect(takeSpy).not.toHaveBeenCalled();
    expect(providerScreenshotSpy).not.toHaveBeenCalled();
  });

  it('returns undefined (does not throw) when isPercyEnabled probe itself throws', async () => {
    isPercyEnabledSpy.and.rejectWith(new Error('daemon down'));
    const device = makeDevice();
    const result = await percyScreenshot(device, 'Home');
    expect(result).toBeUndefined();
    expect(providerScreenshotSpy).not.toHaveBeenCalled();
  });

  it('invokes provider.screenshot on happy path and returns response.body.data', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    const device = makeDevice();
    const result = await percyScreenshot(device, 'Home');
    expect(providerScreenshotSpy).toHaveBeenCalledWith('Home', jasmine.any(Object));
    expect(result).toEqual({ link: 'https://percy.io/build/1/snap/home' });
  });

  it('swallows provider errors when PERCY_IGNORE_ERRORS=true', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    process.env.PERCY_IGNORE_ERRORS = 'true';
    providerScreenshotSpy.and.rejectWith(new Error('Detox died'));
    const device = makeDevice();
    const result = await percyScreenshot(device, 'Home');
    expect(result).toBeUndefined();
    delete process.env.PERCY_IGNORE_ERRORS;
  });

  it('rethrows provider errors by default', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    providerScreenshotSpy.and.rejectWith(new Error('Detox died'));
    const device = makeDevice();
    await expectAsync(percyScreenshot(device, 'Home')).toBeRejectedWithError('Detox died');
  });

  it('handles errors with no stack property', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    const e = new Error('stackless');
    delete e.stack;
    providerScreenshotSpy.and.rejectWith(e);
    const device = makeDevice();
    await expectAsync(percyScreenshot(device, 'Home')).toBeRejectedWithError('stackless');
  });

  it('returns undefined when provider response has no body', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    providerScreenshotSpy.and.resolveTo(undefined);
    const device = makeDevice();
    const result = await percyScreenshot(device, 'Home');
    expect(result).toBeUndefined();
  });

  it('returns undefined when provider response.body is missing', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    providerScreenshotSpy.and.resolveTo({ status: 'ok' });
    const device = makeDevice();
    const result = await percyScreenshot(device, 'Home');
    expect(result).toBeUndefined();
  });

  it('uses default options object when none passed', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    const device = makeDevice();
    await percyScreenshot(device, 'Home'); // no options
    expect(providerScreenshotSpy).toHaveBeenCalled();
  });

  it('exposes isDetoxDevice type guard', () => {
    expect(percyScreenshot.isDetoxDevice(makeDevice())).toBe(true);
    expect(percyScreenshot.isDetoxDevice({
      takeScreenshot: async () => '',
      getAttributes: async () => ({})
    })).toBe(false);
    expect(percyScreenshot.isDetoxDevice(null)).toBe(false);
  });

  it('isPercyEnabled is exposed as a named method and is spyable', async () => {
    isPercyEnabledSpy.and.resolveTo(true);
    expect(await percyScreenshot.isPercyEnabled()).toBe(true);
  });

  it('isPercyEnabled body delegates to sdk-utils.isPercyEnabled', async () => {
    isPercyEnabledSpy.and.callThrough();
    const utils = require('@percy/sdk-utils');
    const utilsPath = require.resolve('@percy/sdk-utils');
    const isPercyEnabledModule = require(utilsPath.replace(/index\.js$/, 'percy-enabled.js'));
    spyOn(isPercyEnabledModule, 'default').and.resolveTo(true);
    expect(await percyScreenshot.isPercyEnabled()).toBe(true);
    expect(typeof utils.isPercyEnabled).toBe('function');
  });

  it('still rethrows when postFailedEvents itself throws (no double-throw)', async () => {
    // Replace utils.postBuildEvents module's default export so postFailedEvents'
    // try/catch is exercised AND its outer try/catch in index.js fires.
    // Easier: bust both caches and inject an explicitly-throwing pfe.
    const indexPath = require.resolve('../../index');
    const postFailedEventsPath = require.resolve('../../percy/util/postFailedEvents');
    const gpPath = require.resolve('../../percy/providers/genericProvider');

    const saved = {
      [indexPath]: require.cache[indexPath],
      [postFailedEventsPath]: require.cache[postFailedEventsPath],
      [gpPath]: require.cache[gpPath]
    };
    delete require.cache[indexPath];
    delete require.cache[postFailedEventsPath];
    delete require.cache[gpPath];

    require.cache[postFailedEventsPath] = {
      id: postFailedEventsPath,
      filename: postFailedEventsPath,
      loaded: true,
      exports: async () => { throw new Error('events broken'); }
    };

    try {
      const fresh = require('../../index');
      const { GenericProvider: FreshGP } = require('../../percy/providers/genericProvider');
      spyOn(fresh, 'isPercyEnabled').and.resolveTo(true);
      spyOn(FreshGP.prototype, 'screenshot').and.rejectWith(new Error('Detox died'));
      const device = makeDevice();
      await expectAsync(fresh(device, 'Home')).toBeRejectedWithError('Detox died');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v) require.cache[k] = v;
        else delete require.cache[k];
      }
    }
  });
});
