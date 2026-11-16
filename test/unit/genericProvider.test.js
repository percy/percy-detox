const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const postComparisonModule =
  require(require.resolve('@percy/sdk-utils')
    .replace(/index\.js$/, 'post-comparison.js'));

const { GenericProvider } = require('../../percy/providers/genericProvider');
const log = require('../../percy/util/log');

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

async function makePngFile(name = 'test.png') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-test-'));
  const filepath = path.join(dir, name);
  // 1x1 PNG (minimal valid: header + IHDR + IDAT + IEND, but for our PNG magic check we just need the 8-byte signature + dims)
  // Build a 100-byte buffer with valid PNG magic + IHDR width/height
  const ihdr = Buffer.alloc(25);
  // length (4 bytes) + 'IHDR' (4 bytes) + width (4) + height (4) + bit depth/color/compression/filter/interlace (5) + CRC (4) = 25
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(100, 8); // width = 100
  ihdr.writeUInt32BE(200, 12); // height = 200
  ihdr[16] = 8; ihdr[17] = 2; ihdr[18] = 0; ihdr[19] = 0; ihdr[20] = 0;
  ihdr.writeUInt32BE(0, 21);
  const buf = Buffer.concat([PNG_HEADER, ihdr]);
  await fs.writeFile(filepath, buf);
  return filepath;
}

function makeDevice(platform = 'android') {
  return {
    id: 'emulator-5554',
    name: 'Test Pixel',
    getPlatform: async () => platform,
    takeScreenshot: async () => null
  };
}

describe('GenericProvider', () => {
  let postComparisonSpy;

  beforeEach(() => {
    postComparisonSpy = spyOn(postComparisonModule, 'default').and.resolveTo({
      body: { data: { link: 'https://percy.io/build/1' } }
    });
  });

  it('takes a screenshot end-to-end and posts comparison with full payload', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);

    const provider = new GenericProvider(device, { argKind: 'device' });
    // Replace metadata with a deterministic stub once it's resolved
    spyOn(provider, 'buildTag').and.callThrough();

    const result = await provider.screenshot('Home', {});

    expect(postComparisonSpy).toHaveBeenCalled();
    const payload = postComparisonSpy.calls.mostRecent().args[0];
    expect(payload.name).toBe('Home');
    expect(Array.isArray(payload.tiles)).toBe(true);
    // Tiles carry base64 bytes, not a path (the CLI may not share this filesystem).
    expect(payload.tiles[0].filepath).toBeUndefined();
    expect(payload.tiles[0].content).toBe((await fs.readFile(png)).toString('base64'));
    expect(payload.tag.osName).toBe('Android');
    expect(payload.environmentInfo).toMatch(/^\(detox\//);
    expect(payload.clientInfo).toMatch(/^@percy\/detox\//);
    expect(payload.ignoredElementsData.ignoreElementsData).toEqual([]);
    expect(payload.consideredElementsData.considerElementsData).toEqual([]);
    expect(payload.sync).toBeNull();
    expect(result).toEqual({ body: { data: { link: 'https://percy.io/build/1' } } });
  });

  it('throws when takeScreenshot returns empty path in device mode', async () => {
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo('');
    const provider = new GenericProvider(device, { argKind: 'device' });
    await expectAsync(provider.screenshot('X', { screenshotMode: 'device' })).toBeRejectedWithError(/empty path/);
  });

  it('falls back to element capture when takeScreenshot returns empty path in auto mode', async () => {
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo('');
    const provider = new GenericProvider(device, { argKind: 'device', getDetox: () => null });
    await expectAsync(provider.screenshot('X', {})).toBeRejectedWithError(/element capture needs the detox module/);
  });

  it('throws a clear error in screenshotMode "cloud" (App Automate provider unavailable)', async () => {
    const device = makeDevice('android');
    const provider = new GenericProvider(device, { argKind: 'device' });
    await expectAsync(provider.screenshot('X', { screenshotMode: 'cloud' }))
      .toBeRejectedWithError(/screenshotMode 'cloud' needs an android\.cloud device/);
  });

  it('does not scale Android element regions but scales custom regions (points)', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, {
      argKind: 'device',
      deviceConfig: {}
    });
    const el = { getAttributes: async () => ({ frame: { x: 60, y: 277, width: 960, height: 65 } }) };
    // No adb in tests, so local Android metadata falls back to scaleFactor 2.
    await provider.screenshot('Regions', {
      ignoreRegionElements: [el],
      customIgnoreRegions: [{ top: 10, bottom: 20, left: 0, right: 100 }]
    });
    const ignore = postComparisonSpy.calls.mostRecent().args[0].ignoredElementsData.ignoreElementsData;
    expect(ignore[0].coOrdinates).toEqual({ top: 277, bottom: 342, left: 60, right: 1020 });
    expect(ignore[1].coOrdinates).toEqual({ top: 20, bottom: 40, left: 0, right: 200 });
  });

  it('warns once when fullPage option is passed', async () => {
    log.__resetFullPageWarnForTests();
    const warnSpy = spyOn(log, 'warn');
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, { argKind: 'device' });

    await provider.screenshot('A', { fullPage: true });
    await provider.screenshot('B', { fullPage: true });
    const fullPageWarns = warnSpy.calls.allArgs()
      .filter((args) => /fullPage/i.test(args[0] || ''));
    expect(fullPageWarns.length).toBe(1);
  });

  it('passes options.testCase, options.labels, options.sync, options.fullscreen through', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, { argKind: 'device' });
    await provider.screenshot('Home', {
      testCase: 'suite1',
      labels: 'foo,bar',
      sync: true,
      fullscreen: true
    });
    const payload = postComparisonSpy.calls.mostRecent().args[0];
    expect(payload.testCase).toBe('suite1');
    expect(payload.labels).toBe('foo,bar');
    expect(payload.sync).toBe(true);
    expect(payload.tiles[0].fullscreen).toBe(true);
  });

  it('resolves global device when constructed with element', async () => {
    const png = await makePngFile();
    const element = {
      takeScreenshot: async () => png,
      getAttributes: async () => ({ frame: { x: 0, y: 0, width: 10, height: 10 } })
    };
    const provider = new GenericProvider(element, { argKind: 'element' });
    expect(provider.argKind).toBe('element');
    expect(provider.device).toBe(null);
  });

  it('resolveGlobalDevice returns detox.device when detox is loaded with .device', async () => {
    // Inject a fake detox module into require.cache then re-require GenericProvider
    const Module = require('module');
    const detoxFakePath = require('path').join(require('os').tmpdir(), 'fake-detox-' + Date.now() + '.js');
    require('fs').writeFileSync(detoxFakePath, 'module.exports = { device: { id: "fake", takeScreenshot: async () => null } };');

    const gpPath = require.resolve('../../percy/providers/genericProvider');
    const cachedGp = require.cache[gpPath];
    delete require.cache[gpPath];

    // Patch Module._resolveFilename to map 'detox' to our fake path
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      if (request === 'detox') return detoxFakePath;
      return origResolve.call(this, request, ...rest);
    };

    try {
      const { GenericProvider: FreshGP } = require('../../percy/providers/genericProvider');
      const fakeElement = {
        takeScreenshot: async () => null,
        getAttributes: async () => ({})
      };
      const p = new FreshGP(fakeElement, { argKind: 'element' });
      expect(p.device).not.toBe(null);
      expect(p.device.id).toBe('fake');
    } finally {
      Module._resolveFilename = origResolve;
      if (cachedGp) require.cache[gpPath] = cachedGp;
      try { require('fs').unlinkSync(detoxFakePath); } catch { /* ignore */ }
    }
  });

  it('resolveGlobalDevice returns null when detox loaded without .device', async () => {
    const Module = require('module');
    const detoxFakePath = require('path').join(require('os').tmpdir(), 'fake-detox-no-device-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.js');
    require('fs').writeFileSync(detoxFakePath, 'module.exports = { somethingElse: true };');

    const gpPath = require.resolve('../../percy/providers/genericProvider');
    const cachedGp = require.cache[gpPath];
    delete require.cache[gpPath];

    const origResolve = Module._resolveFilename;
    const origLoad = Module._load;
    // Force require('detox') to load the fake without going through filename caching
    Module._load = function (request, ...rest) {
      if (request === 'detox') return { somethingElse: true };
      return origLoad.call(this, request, ...rest);
    };

    try {
      const { GenericProvider: FreshGP } = require('../../percy/providers/genericProvider');
      const fakeElement = {
        takeScreenshot: async () => null,
        getAttributes: async () => ({})
      };
      const p = new FreshGP(fakeElement, { argKind: 'element' });
      expect(p.device).toBe(null);
    } finally {
      Module._resolveFilename = origResolve;
      Module._load = origLoad;
      if (cachedGp) require.cache[gpPath] = cachedGp;
      try { require('fs').unlinkSync(detoxFakePath); } catch { /* ignore */ }
    }
  });

  it('uses default opts when GenericProvider constructed without second arg', async () => {
    // Hits `{ argKind } = {}` default branch
    const device = makeDevice('android');
    const provider = new GenericProvider(device);
    expect(provider.argKind).toBeUndefined();
    // device is resolved via resolveGlobalDevice() — null in clean env, fake-detox if test
    // ordering pollutes require.cache. Either is acceptable for this branch test.
    expect(provider.arg).toBe(device);
  });

  it('does not warn fullPage when option is false / absent', async () => {
    log.__resetFullPageWarnForTests();
    const warnSpy = spyOn(log, 'warn');
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, { argKind: 'device' });
    await provider.screenshot('A', { fullPage: false });
    await provider.screenshot('B', {}); // no fullPage at all
    const fullPageWarns = warnSpy.calls.allArgs()
      .filter((args) => /fullPage/i.test(args[0] || ''));
    expect(fullPageWarns.length).toBe(0);
  });

  it('uses default options when screenshot called without them', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, { argKind: 'device' });
    await provider.screenshot('OnlyName');
    const payload = postComparisonSpy.calls.mostRecent().args[0];
    expect(payload.name).toBe('OnlyName');
    expect(payload.tiles[0].fullscreen).toBe(false);
  });

  it('passes options.sync explicitly false (not coerced to null)', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    const provider = new GenericProvider(device, { argKind: 'device' });
    await provider.screenshot('Home', { sync: false });
    const payload = postComparisonSpy.calls.mostRecent().args[0];
    expect(payload.sync).toBe(false);
  });

  it('safeDetoxVersion returns "unknown" when detox is not installed (default test env)', async () => {
    // re-require fresh to recompute ENV_INFO inside genericProvider
    const gpPath = require.resolve('../../percy/providers/genericProvider');
    const cachedGp = require.cache[gpPath];
    delete require.cache[gpPath];
    try {
      const png = await makePngFile();
      const { GenericProvider: FreshGP } = require('../../percy/providers/genericProvider');
      const device = makeDevice('android');
      spyOn(device, 'takeScreenshot').and.resolveTo(png);
      const provider = new FreshGP(device, { argKind: 'device' });
      await provider.screenshot('A', {});
      const payload = postComparisonSpy.calls.mostRecent().args[0];
      expect(payload.environmentInfo).toContain('detox/');
    } finally {
      if (cachedGp) require.cache[gpPath] = cachedGp;
    }
  });

  it('ignores a failure to delete the SDK temp copy', async () => {
    const png = await makePngFile();
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo(png);
    spyOn(fs, 'unlink').and.rejectWith(new Error('EBUSY'));
    const provider = new GenericProvider(device, { argKind: 'device' });
    await expectAsync(provider.screenshot('A', {})).toBeResolved();
    expect(fs.unlink).toHaveBeenCalled();
  });

  describe('element capture', () => {
    function makeRoot(png, frame = { x: 0, y: 0, width: 100, height: 200 }) {
      return {
        takeScreenshot: jasmine.createSpy('rootShot').and.resolveTo(png),
        getAttributes: async () => ({ frame })
      };
    }
    function makeDetox(root) {
      return {
        by: { type: (t) => ({ type: t }), id: (id) => ({ id }) },
        element: jasmine.createSpy('element').and.callFake((m) => (m.id ? root : { atIndex: () => root }))
      };
    }

    it('captures a passed element and makes regions relative to its origin', async () => {
      const png = await makePngFile();
      const el = {
        takeScreenshot: async () => png,
        getAttributes: async () => ({ elements: [{ frame: { x: 10, y: 20, width: 100, height: 200 } }] })
      };
      const region = { getAttributes: async () => ({ frame: { x: 15, y: 30, width: 5, height: 5 } }) };
      const provider = new GenericProvider(el, { argKind: 'element', deviceConfig: {}, getDetox: () => null });
      await provider.screenshot('El', { ignoreRegionElements: [region] });
      const ignore = postComparisonSpy.calls.mostRecent().args[0].ignoredElementsData.ignoreElementsData;
      // No platform known (fallback metadata) → element scale = fallback scale (2).
      expect(ignore[0].coOrdinates).toEqual({ top: 20, bottom: 30, left: 10, right: 20 });
    });

    it('assumes origin 0,0 when the captured element frame cannot be read', async () => {
      const png = await makePngFile();
      const el = { takeScreenshot: async () => png, getAttributes: async () => { throw new Error('gone'); } };
      const provider = new GenericProvider(el, { argKind: 'element', deviceConfig: {}, getDetox: () => null });
      await expectAsync(provider.screenshot('El', {})).toBeResolved();
    });

    it('assumes origin 0,0 when the captured element has no frame', async () => {
      const png = await makePngFile();
      const el = { takeScreenshot: async () => png, getAttributes: async () => ({}) };
      const provider = new GenericProvider(el, { argKind: 'element', deviceConfig: {}, getDetox: () => null });
      expect(await provider.capture('El', {})).toEqual(jasmine.objectContaining({ origin: { x: 0, y: 0 } }));
    });

    it('defaults missing frame x/y to 0', async () => {
      const el = { takeScreenshot: async () => 'p.png', getAttributes: async () => ({ frame: { width: 1 } }) };
      const provider = new GenericProvider(el, { argKind: 'element', deviceConfig: {}, getDetox: () => null });
      expect((await provider.capture('El', {})).origin).toEqual({ x: 0, y: 0 });
    });

    it('captures the DecorView on cloud devices in auto mode', async () => {
      const png = await makePngFile();
      const root = makeRoot(png);
      const detox = makeDetox(root);
      const device = makeDevice('android');
      const takeSpy = spyOn(device, 'takeScreenshot');
      const provider = new GenericProvider(device, {
        argKind: 'device', deviceConfig: { type: 'android.cloud' }, getDetox: () => detox
      });
      await provider.screenshot('Cloud', {});
      expect(takeSpy).not.toHaveBeenCalled();
      expect(root.takeScreenshot).toHaveBeenCalled();
      expect(detox.element).toHaveBeenCalledWith({ type: 'android.widget.FrameLayout' });
      const payload = postComparisonSpy.calls.mostRecent().args[0];
      expect(payload.tag.width).toBe(100);
      expect(payload.tag.height).toBe(200);
    });

    it('uses rootTestID (option or env) for the root view', async () => {
      const png = await makePngFile();
      const root = makeRoot(png);
      const detox = makeDetox(root);
      const provider = new GenericProvider(makeDevice('ios'), {
        argKind: 'device', deviceConfig: {}, getDetox: () => detox
      });
      await provider.capture('A', { screenshotMode: 'element', rootTestID: 'app-root' });
      expect(detox.element).toHaveBeenCalledWith({ id: 'app-root' });
      process.env.PERCY_DETOX_ROOT_TEST_ID = 'env-root';
      try {
        await provider.capture('B', { screenshotMode: 'element' });
        expect(detox.element).toHaveBeenCalledWith({ id: 'env-root' });
      } finally {
        delete process.env.PERCY_DETOX_ROOT_TEST_ID;
      }
    });

    it('requires rootTestID on iOS', async () => {
      const detox = makeDetox(makeRoot('x.png'));
      const provider = new GenericProvider(makeDevice('ios'), {
        argKind: 'device', deviceConfig: {}, getDetox: () => detox
      });
      await expectAsync(provider.capture('A', { screenshotMode: 'element' }))
        .toBeRejectedWithError(TypeError, /needs options.rootTestID/);
    });

    it('works without a resolvable device (no platform)', async () => {
      const detox = makeDetox(makeRoot('x.png'));
      const provider = new GenericProvider(makeDevice('android'), {
        argKind: 'device', deviceConfig: {}, getDetox: () => detox
      });
      provider.device = null;
      expect((await provider.capture('A', { screenshotMode: 'element' })).mode).toBe('element');
    });

    it('throws when the root view screenshot is empty', async () => {
      const detox = makeDetox(makeRoot(''));
      const provider = new GenericProvider(makeDevice('android'), {
        argKind: 'device', deviceConfig: {}, getDetox: () => detox
      });
      await expectAsync(provider.capture('A', { screenshotMode: 'element' }))
        .toBeRejectedWithError(/root element takeScreenshot returned an empty path/);
    });
  });
});
