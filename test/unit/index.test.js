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
});
