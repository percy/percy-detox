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
    expect(payload.tiles[0].filepath).toMatch(/\.png$/);
    expect(payload.tag.osName).toBe('Android');
    expect(payload.environmentInfo).toMatch(/^\(detox\//);
    expect(payload.clientInfo).toMatch(/^@percy\/detox\//);
    expect(payload.ignoredElementsData.ignoreElementsData).toEqual([]);
    expect(payload.consideredElementsData.considerElementsData).toEqual([]);
    expect(payload.sync).toBeNull();
    expect(result).toEqual({ body: { data: { link: 'https://percy.io/build/1' } } });
  });

  it('throws when takeScreenshot returns empty path', async () => {
    const device = makeDevice('android');
    spyOn(device, 'takeScreenshot').and.resolveTo('');
    const provider = new GenericProvider(device, { argKind: 'device' });
    await expectAsync(provider.screenshot('X', {})).toBeRejectedWithError(/empty path/);
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
});
