const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const utils = require('@percy/sdk-utils');
const postComparisonModule =
  require(require.resolve('@percy/sdk-utils')
    .replace(/index\.js$/, 'post-comparison.js'));

const {
  AppAutomateProvider,
  resetAppAutomateStateForTests
} = require('../../percy/providers/appAutomateProvider');
const log = require('../../percy/util/log');

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

async function makePngFile(width = 1080, height = 2340) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aa-test-'));
  const filepath = path.join(dir, 'root.png');
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  await fs.writeFile(filepath, Buffer.concat([PNG_HEADER, ihdr]));
  return filepath;
}

const BEGIN = {
  method: 'percyScreenshot',
  success: true,
  result: { deviceName: 'Samsung Galaxy S22', osVersion: '12.0', buildHash: 'bh1', sessionHash: 'sh1' }
};
const SHOT = {
  method: 'percyScreenshot',
  success: true,
  result: {
    tiles: [{ sha: 'abc123-99', status_bar: 80, nav_bar: 120, header_height: 0, footer_height: 0, index: 0 }],
    width: 1080,
    height: 2340,
    density: 480,
    scale_factor: 3
  }
};
const END = { method: 'percyScreenshot', success: true, result: {} };

// cloudPlatform fake that answers by `state`; overrides win over the defaults.
function makeDevice(overrides = {}) {
  const answers = { begin: BEGIN, screenshot: SHOT, end: END, ...overrides };
  return {
    type: 'android.cloud',
    getPlatform: async () => 'android',
    takeScreenshot: async () => '',
    cloudPlatform: jasmine.createSpy('cloudPlatform').and.callFake(async (method, args) => {
      const a = answers[args.state];
      if (a instanceof Error) throw a;
      return typeof a === 'function' ? a(args) : a;
    })
  };
}

// Detox module stub for the element-capture fallback (root view = DecorView).
function makeDetox(png) {
  const root = {
    takeScreenshot: jasmine.createSpy('rootTakeScreenshot').and.resolveTo(png),
    getAttributes: async () => ({ frame: { x: 0, y: 0, width: 1080, height: 2340 } })
  };
  return {
    root,
    by: { type: (t) => ({ type: t }), id: (id) => ({ id }) },
    element: () => ({ atIndex: () => root, ...root })
  };
}

function statesOf(device) {
  return device.cloudPlatform.calls.allArgs().map(([, args]) => args.state);
}

function makeProvider(device, detox = null) {
  return new AppAutomateProvider(device, {
    argKind: 'device',
    deviceConfig: {},
    getDetox: () => detox
  });
}

describe('AppAutomateProvider', () => {
  let postComparisonSpy;

  beforeEach(() => {
    resetAppAutomateStateForTests();
    utils.percy.build = { id: '42', url: 'https://percy.io/org/app/builds/42' };
    postComparisonSpy = spyOn(postComparisonModule, 'default').and.resolveTo({
      body: { link: 'https://percy.io/org/app/builds/42/snap/1', data: { ok: true } }
    });
    delete process.env.PERCY_DETOX_SCREENSHOT_MODE;
    delete process.env.PERCY_ENABLE_DEV;
  });

  afterEach(() => {
    delete utils.percy.build;
  });

  describe('supports', () => {
    it('needs an android.cloud device with cloudPlatform', () => {
      expect(AppAutomateProvider.supports(makeDevice())).toBe(true);
      expect(AppAutomateProvider.supports({ ...makeDevice(), cloudPlatform: undefined })).toBe(false);
      expect(AppAutomateProvider.supports({ ...makeDevice(), type: 'android.emulator' })).toBe(false);
      expect(AppAutomateProvider.supports(null)).toBe(false);
    });

    it('falls back to the Detox device config type', () => {
      const device = { ...makeDevice(), type: undefined };
      expect(AppAutomateProvider.supports(device, { type: 'android.cloud' })).toBe(true);
    });
  });

  it('runs begin → screenshot → postComparison → end with the wire contract args', async () => {
    const device = makeDevice();
    const res = await makeProvider(device).screenshot('Home', {});

    expect(statesOf(device)).toEqual(['begin', 'screenshot', 'end']);
    const [method, beginArgs] = device.cloudPlatform.calls.argsFor(0);
    expect(method).toBe('percyScreenshot');
    expect(beginArgs).toEqual(jasmine.objectContaining({
      state: 'begin',
      name: 'Home',
      percyBuildId: '42',
      percyBuildUrl: 'https://percy.io/org/app/builds/42',
      projectId: 'percy-prod'
    }));
    expect(device.cloudPlatform.calls.argsFor(1)[1]).toEqual(jasmine.objectContaining({
      state: 'screenshot', name: 'Home', percyBuildId: '42'
    }));
    expect(device.cloudPlatform.calls.argsFor(2)[1]).toEqual(jasmine.objectContaining({
      state: 'end',
      name: 'Home',
      status: 'success',
      percyScreenshotUrl: 'https://percy.io/org/app/builds/42/snap/1',
      errorMessage: undefined
    }));
    expect(res.body.data).toEqual({ ok: true });
  });

  it('posts sha tiles, the device tag and the App Automate debug URL', async () => {
    const device = makeDevice();
    await makeProvider(device).screenshot('Home', { testCase: 'tc', labels: 'a,b', sync: true });

    const payload = postComparisonSpy.calls.mostRecent().args[0];
    expect(payload.tiles.length).toBe(1);
    const tile = payload.tiles[0];
    expect(tile.sha).toBe('abc123');
    expect(tile.filepath).toBeUndefined();
    expect(tile.content).toBeUndefined();
    // Host-reported system bar heights (px) are used.
    expect(tile.statusBarHeight).toBe(80);
    expect(tile.navBarHeight).toBe(120);
    expect(payload.tag).toEqual({
      name: 'Samsung Galaxy S22',
      osName: 'Android',
      osVersion: '12',
      width: 1080,
      height: 2340,
      orientation: 'portrait'
    });
    expect(payload.externalDebugUrl)
      .toBe('https://app-automate.browserstack.com/dashboard/v2/builds/bh1/sessions/sh1');
    expect(payload.testCase).toBe('tc');
    expect(payload.labels).toBe('a,b');
    expect(payload.sync).toBe(true);
    expect(payload.clientInfo).toMatch(/^@percy\/detox\//);
  });

  it('lets options override the tag and bar heights', async () => {
    const device = makeDevice();
    await makeProvider(device).screenshot('Home', {
      deviceName: 'My Phone',
      osVersion: '13',
      orientation: 'landscape',
      statusBarHeight: 70,
      navigationBarHeight: 90,
      fullscreen: true
    });
    const { tag, tiles } = postComparisonSpy.calls.mostRecent().args[0];
    expect(tag.name).toBe('My Phone');
    expect(tag.osVersion).toBe('13');
    expect(tag.orientation).toBe('landscape');
    expect(tiles[0].statusBarHeight).toBe(70);
    expect(tiles[0].navBarHeight).toBe(90);
    expect(tiles[0].fullscreen).toBe(true);
  });

  it('uses 0 bar heights when the host could not read them', async () => {
    const tiles = [{ sha: 'abc123', status_bar: null, nav_bar: undefined, header_height: 0, footer_height: 0 }];
    const device = makeDevice({ screenshot: { ...SHOT, result: { ...SHOT.result, tiles } } });
    await makeProvider(device).screenshot('Home', {});
    const tile = postComparisonSpy.calls.mostRecent().args[0].tiles[0];
    expect(tile.statusBarHeight).toBe(0);
    expect(tile.navBarHeight).toBe(0);
  });

  it('lets an explicit 0 option override host bar heights', async () => {
    const device = makeDevice();
    await makeProvider(device).screenshot('Home', { statusBarHeight: 0, navigationBarHeight: 0 });
    const tile = postComparisonSpy.calls.mostRecent().args[0].tiles[0];
    expect(tile.statusBarHeight).toBe(0);
    expect(tile.navBarHeight).toBe(0);
  });

  it('parses a JSON-string result', async () => {
    const device = makeDevice({ screenshot: { ...SHOT, result: JSON.stringify(SHOT.result) } });
    await makeProvider(device).screenshot('Home', {});
    expect(postComparisonSpy.calls.mostRecent().args[0].tiles[0].sha).toBe('abc123');
  });

  it('sends projectId percy-dev when PERCY_ENABLE_DEV=true', async () => {
    process.env.PERCY_ENABLE_DEV = 'true';
    const device = makeDevice();
    await makeProvider(device).screenshot('Home', {});
    expect(device.cloudPlatform.calls.argsFor(0)[1].projectId).toBe('percy-dev');
  });

  it('calls begin once per device and caches the result', async () => {
    const device = makeDevice();
    await makeProvider(device).screenshot('A', {});
    await makeProvider(device).screenshot('B', {});
    expect(statesOf(device)).toEqual(['begin', 'screenshot', 'end', 'screenshot', 'end']);
    expect(postComparisonSpy.calls.mostRecent().args[0].externalDebugUrl).toContain('/sessions/sh1');
  });

  it('retries begin after a failed begin', async () => {
    let first = true;
    const device = makeDevice({
      begin: () => {
        if (first) { first = false; return { success: false, message: 'hub busy' }; }
        return BEGIN;
      }
    });
    await expectAsync(makeProvider(device).screenshot('A', {})).toBeRejectedWithError(/begin failed: hub busy/);
    await makeProvider(device).screenshot('B', {});
    expect(statesOf(device)).toEqual(['begin', 'begin', 'screenshot', 'end']);
  });

  describe('tag and debug URL fallbacks', () => {
    it('uses the Detox device config, then "unknown", when begin has no device info', async () => {
      const device = makeDevice({ begin: { success: true, result: null } });
      const provider = new AppAutomateProvider(device, {
        argKind: 'device', deviceConfig: { name: 'Config Phone', osVersion: '14' }, getDetox: () => null
      });
      await provider.screenshot('A', {});
      let payload = postComparisonSpy.calls.mostRecent().args[0];
      expect(payload.tag.name).toBe('Config Phone');
      expect(payload.tag.osVersion).toBe('14');
      expect(payload.externalDebugUrl).toBeUndefined();

      resetAppAutomateStateForTests();
      await makeProvider(makeDevice({ begin: { success: true, result: {} } })).screenshot('B', {});
      payload = postComparisonSpy.calls.mostRecent().args[0];
      expect(payload.tag.name).toBe('unknown');
      expect(payload.tag.osVersion).toBe('unknown');
    });

    it('keeps the deviceConfig type when one is present', () => {
      const provider = new AppAutomateProvider(makeDevice(), {
        argKind: 'device', deviceConfig: { type: 'android.cloud', name: 'x' }, getDetox: () => null
      });
      expect(provider.deviceConfig).toEqual({ type: 'android.cloud', name: 'x' });
    });
  });

  describe('regions', () => {
    it('does not scale Android element regions; scales custom regions by the host scale_factor', async () => {
      const el = { getAttributes: async () => ({ frame: { x: 60, y: 277, width: 960, height: 65 } }) };
      const device = makeDevice();
      await makeProvider(device).screenshot('Home', {
        ignoreRegionElements: [el],
        customIgnoreRegions: [{ top: 10, bottom: 20, left: 0, right: 100 }],
        considerRegionElements: [el]
      });
      const payload = postComparisonSpy.calls.mostRecent().args[0];
      const ignore = payload.ignoredElementsData.ignoreElementsData;
      expect(ignore[0].coOrdinates).toEqual({ top: 277, bottom: 342, left: 60, right: 1020 });
      expect(ignore[1].coOrdinates).toEqual({ top: 30, bottom: 60, left: 0, right: 300 });
      expect(payload.consideredElementsData.considerElementsData[0].coOrdinates)
        .toEqual({ top: 277, bottom: 342, left: 60, right: 1020 });
    });

    it('uses options.scaleFactor for custom regions when given', async () => {
      const device = makeDevice();
      await makeProvider(device).screenshot('Home', {
        scaleFactor: 2,
        customIgnoreRegions: [{ top: 10, bottom: 20, left: 0, right: 100 }]
      });
      const ignore = postComparisonSpy.calls.mostRecent().args[0].ignoredElementsData.ignoreElementsData;
      expect(ignore[0].coOrdinates).toEqual({ top: 20, bottom: 40, left: 0, right: 200 });
    });

    it('treats custom regions as pixels when the host could not read density', async () => {
      const device = makeDevice({ screenshot: { ...SHOT, result: { ...SHOT.result, scale_factor: null } } });
      await makeProvider(device).screenshot('Home', {
        customIgnoreRegions: [{ top: 10, bottom: 20, left: 0, right: 100 }]
      });
      const ignore = postComparisonSpy.calls.mostRecent().args[0].ignoredElementsData.ignoreElementsData;
      expect(ignore[0].coOrdinates).toEqual({ top: 10, bottom: 20, left: 0, right: 100 });
    });
  });

  describe('errors', () => {
    it('throws on a non-"not supported" screenshot failure and reports failure in end', async () => {
      const device = makeDevice({ screenshot: { success: false, message: 'adb timed out' } });
      await expectAsync(makeProvider(device).screenshot('Home', {}))
        .toBeRejectedWithError(/screenshot failed: adb timed out/);
      expect(statesOf(device)).toEqual(['begin', 'screenshot', 'end']);
      expect(device.cloudPlatform.calls.argsFor(2)[1]).toEqual(jasmine.objectContaining({
        state: 'end',
        status: 'failure',
        errorMessage: 'App Automate percyScreenshot screenshot failed: adb timed out'
      }));
      expect(postComparisonSpy).not.toHaveBeenCalled();
    });

    it('reports failure in end when postComparison fails', async () => {
      postComparisonSpy.and.rejectWith(new Error('cli down'));
      const device = makeDevice();
      await expectAsync(makeProvider(device).screenshot('Home', {})).toBeRejectedWithError('cli down');
      expect(device.cloudPlatform.calls.argsFor(2)[1]).toEqual(jasmine.objectContaining({
        state: 'end', status: 'failure', errorMessage: 'cli down'
      }));
    });

    it('throws when begin fails for another reason (no end, no fallback)', async () => {
      const device = makeDevice({ begin: { success: false, message: 'session not found' } });
      await expectAsync(makeProvider(device).screenshot('Home', {}))
        .toBeRejectedWithError(/begin failed: session not found/);
      expect(statesOf(device)).toEqual(['begin']);
    });

    it('reports "no response" when cloudPlatform resolves to nothing', async () => {
      const device = makeDevice({ begin: () => undefined });
      await expectAsync(makeProvider(device).screenshot('Home', {}))
        .toBeRejectedWithError(/begin failed: no response/);
    });

    it('never throws from end: a rejected end call is swallowed', async () => {
      const device = makeDevice({ end: new Error('socket closed') });
      const res = await makeProvider(device).screenshot('Home', {});
      expect(res.body.data).toEqual({ ok: true });
    });

    it('never throws from end: success:false is swallowed', async () => {
      const device = makeDevice({ end: { success: false, message: 'nope' } });
      await expectAsync(makeProvider(device).screenshot('Home', {})).toBeResolved();
    });

    it('end does not mask the original error', async () => {
      const device = makeDevice({ screenshot: { success: false, message: 'boom' }, end: new Error('socket closed') });
      await expectAsync(makeProvider(device).screenshot('Home', {})).toBeRejectedWithError(/boom/);
    });
  });

  describe('fallback to element capture', () => {
    let png;

    beforeEach(async () => {
      png = await makePngFile();
    });

    it('falls back when the Hub does not support percyScreenshot, and stays on element capture', async () => {
      const infoSpy = spyOn(log, 'info');
      const device = makeDevice({ begin: { success: false, message: 'method percyScreenshot not supported' } });
      const detox = makeDetox(png);

      await makeProvider(device, detox).screenshot('A', {});
      await makeProvider(device, detox).screenshot('B', {});

      expect(statesOf(device)).toEqual(['begin']); // never asked again
      expect(detox.root.takeScreenshot).toHaveBeenCalledTimes(2);
      const payload = postComparisonSpy.calls.mostRecent().args[0];
      expect(payload.tiles[0].content).toEqual(jasmine.any(String));
      expect(payload.tiles[0].sha).toBeUndefined();
      expect(payload.externalDebugUrl).toBeUndefined();
      const fallbackLogs = infoSpy.calls.allArgs().filter(([m]) => /element capture from now on/.test(m));
      expect(fallbackLogs.length).toBe(1);
    });

    it('falls back when the host does not support the screenshot state, and still calls end', async () => {
      const device = makeDevice({ screenshot: { success: false, message: 'method percyScreenshot not supported' } });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(statesOf(device)).toEqual(['begin', 'screenshot', 'end']);
      expect(device.cloudPlatform.calls.argsFor(2)[1]).toEqual(jasmine.objectContaining({
        state: 'end', status: 'success'
      }));
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
    });

    it('falls back when a tile carries errorMessage', async () => {
      const device = makeDevice({
        screenshot: { ...SHOT, result: { ...SHOT.result, tiles: [{ sha: '', errorMessage: 'upload failed' }] } }
      });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
      expect(postComparisonSpy.calls.mostRecent().args[0].tiles[0].content).toEqual(jasmine.any(String));
    });

    it('falls back when a tile has an empty sha', async () => {
      const device = makeDevice({
        screenshot: { ...SHOT, result: { ...SHOT.result, tiles: [{ sha: '' }] } }
      });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
    });

    it('falls back when the result has no tiles array', async () => {
      const device = makeDevice({ screenshot: { success: true, result: { width: 1 } } });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
    });

    it('falls back when the result is a non-JSON string', async () => {
      const device = makeDevice({ screenshot: { success: true, result: 'not json' } });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
    });

    it('logs the fallback once when concurrent screenshots both hit it', async () => {
      const infoSpy = spyOn(log, 'info');
      const device = makeDevice({ screenshot: { success: false, message: 'method percyScreenshot not supported' } });
      const detox = makeDetox(png);
      await Promise.all([
        makeProvider(device, detox).screenshot('A', {}),
        makeProvider(device, detox).screenshot('B', {})
      ]);
      const fallbackLogs = infoSpy.calls.allArgs().filter(([m]) => /element capture from now on/.test(m));
      expect(fallbackLogs.length).toBe(1);
    });

    it('falls back when no tiles come back', async () => {
      const device = makeDevice({ screenshot: { ...SHOT, result: { ...SHOT.result, tiles: [] } } });
      const detox = makeDetox(png);
      await makeProvider(device, detox).screenshot('A', {});
      expect(detox.root.takeScreenshot).toHaveBeenCalled();
    });

    it('does not fall back in screenshotMode "cloud"', async () => {
      const device = makeDevice({ begin: { success: false, message: 'method percyScreenshot not supported' } });
      const detox = makeDetox(png);
      await expectAsync(makeProvider(device, detox).screenshot('A', { screenshotMode: 'cloud' }))
        .toBeRejectedWithError(/not supported/);
      expect(detox.root.takeScreenshot).not.toHaveBeenCalled();
    });

    it('reports failure in end when the fallback itself fails', async () => {
      const device = makeDevice({ screenshot: { success: false, message: 'method percyScreenshot not supported' } });
      await expectAsync(makeProvider(device, null).screenshot('A', {}))
        .toBeRejectedWithError(/element capture needs the detox module/);
      expect(device.cloudPlatform.calls.argsFor(2)[1]).toEqual(jasmine.objectContaining({
        state: 'end', status: 'failure'
      }));
    });
  });
});
