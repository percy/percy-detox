const { createAndroidMetadata } = require('../../percy/metadata/androidMetadata');

function mockExec(responses) {
  return async (cmd, args) => {
    const key = args.join(' ');
    for (const [pattern, stdout] of responses) {
      if (key.includes(pattern)) return { stdout: Buffer.from(stdout), stderr: Buffer.from('') };
    }
    return { stdout: Buffer.from(''), stderr: Buffer.from('') };
  };
}

describe('androidMetadata', () => {
  const device = { id: 'emulator-5554', name: 'Pixel_5_API_33' };

  it('returns Android for osName', async () => {
    const m = createAndroidMetadata(device, {}, { exec: mockExec([]) });
    expect(await m.osName()).toBe('Android');
  });

  it('reads osVersion via adb getprop', async () => {
    const exec = mockExec([['ro.build.version.release', '14']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.osVersion()).toBe('14');
  });

  it('prefers options.osVersion override', async () => {
    const m = createAndroidMetadata(device, { osVersion: '12' }, { exec: mockExec([]) });
    expect(await m.osVersion()).toBe('12');
  });

  it('reads screen size, preferring Override when present', async () => {
    const exec = mockExec([['wm size', 'Physical size: 1080x2340\nOverride size: 720x1560']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.screenSize()).toEqual({ width: 720, height: 1560 });
  });

  it('falls back to Physical size when no Override', async () => {
    const exec = mockExec([['wm size', 'Physical size: 1080x2340']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.screenSize()).toEqual({ width: 1080, height: 2340 });
  });

  it('falls back to 360x640 when wm size output is unparseable', async () => {
    const exec = mockExec([['wm size', 'garbage']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.screenSize()).toEqual({ width: 360, height: 640 });
  });

  it('computes scaleFactor from wm density', async () => {
    const exec = mockExec([['wm density', 'Physical density: 480']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.scaleFactor()).toBe(3);
  });

  it('prefers Override density', async () => {
    const exec = mockExec([['wm density', 'Physical density: 480\nOverride density: 320']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.scaleFactor()).toBe(2);
  });

  it('defaults scaleFactor to 2 when density not parseable', async () => {
    const exec = mockExec([['wm density', 'error']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.scaleFactor()).toBe(2);
  });

  it('returns "portrait" by default orientation', async () => {
    const m = createAndroidMetadata(device, {}, { exec: mockExec([]) });
    expect(await m.orientation()).toBe('portrait');
  });

  it('returns bar heights from options, else 0', async () => {
    const m1 = createAndroidMetadata(device, {}, { exec: mockExec([]) });
    expect(await m1.statusBarHeight()).toBe(0);
    expect(await m1.navigationBarHeight()).toBe(0);

    const m2 = createAndroidMetadata(device, { statusBarHeight: 24, navigationBarHeight: 48 }, { exec: mockExec([]) });
    expect(await m2.statusBarHeight()).toBe(24);
    expect(await m2.navigationBarHeight()).toBe(48);
  });

  it('swallows shell errors and returns fallbacks', async () => {
    const exec = async () => { throw new Error('adb not found'); };
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
    expect(await m.screenSize()).toEqual({ width: 360, height: 640 });
    expect(await m.scaleFactor()).toBe(2);
  });

  it('deviceName falls back to device.name when no option', async () => {
    const m = createAndroidMetadata(device, {}, { exec: mockExec([]) });
    expect(await m.deviceName()).toBe('Pixel_5_API_33');
  });

  it('deviceName uses adb when device.name absent', async () => {
    const exec = mockExec([['ro.product.model', 'Pixel 7']]);
    const m = createAndroidMetadata({ id: 'emulator-5554' }, {}, { exec });
    expect(await m.deviceName()).toBe('Pixel 7');
  });

  it('deviceName falls back to "unknown" when adb returns empty and no device info', async () => {
    const m = createAndroidMetadata({ id: 'x' }, {}, { exec: mockExec([]) });
    expect(await m.deviceName()).toBe('unknown');
  });

  it('osVersion prefers options.osVersion override even when device available', async () => {
    const m = createAndroidMetadata(device, { osVersion: '11' }, { exec: mockExec([]) });
    expect(await m.osVersion()).toBe('11');
  });

  it('deviceName prefers options.deviceName override', async () => {
    const m = createAndroidMetadata(device, { deviceName: 'CustomName' }, { exec: mockExec([]) });
    expect(await m.deviceName()).toBe('CustomName');
  });

  it('returns empty string from sh when device is null', async () => {
    const m = createAndroidMetadata(null, {}, { exec: mockExec([['ro.build.version.release', '14']]) });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('returns empty string from sh when device.id is missing', async () => {
    const m = createAndroidMetadata({ name: 'X' }, {}, { exec: mockExec([['ro.build.version.release', '14']]) });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('caches screenSize across calls', async () => {
    const calls = [];
    const exec = async (cmd, args) => {
      calls.push(args.join(' '));
      return { stdout: Buffer.from('Physical size: 100x200'), stderr: Buffer.from('') };
    };
    const m = createAndroidMetadata(device, {}, { exec });
    const a = await m.screenSize();
    const b = await m.screenSize();
    expect(a).toBe(b);
    expect(calls.filter((c) => c.includes('wm size')).length).toBe(1);
  });

  it('caches scaleFactor across calls', async () => {
    const calls = [];
    const exec = async (cmd, args) => {
      calls.push(args.join(' '));
      return { stdout: Buffer.from('Physical density: 320'), stderr: Buffer.from('') };
    };
    const m = createAndroidMetadata(device, {}, { exec });
    await m.scaleFactor();
    await m.scaleFactor();
    expect(calls.filter((c) => c.includes('wm density')).length).toBe(1);
  });

  it('clamps scaleFactor to 2 when computed value is non-finite', async () => {
    // Density 0 → 0/160 = 0 → scale<=0 → fallback 2
    const exec = mockExec([['wm density', 'Physical density: 0']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.scaleFactor()).toBe(2);
  });

  it('uses default exec when not injected', async () => {
    // This will attempt real adb; either returns real value or fails into "unknown".
    // The critical coverage point is the default exec branch is exercised.
    const m = createAndroidMetadata({ id: 'nonexistent-device-xyz' }, {});
    expect(typeof await m.osVersion()).toBe('string');
  });

  it('uses default options when constructed without them', async () => {
    // Hits `options = {}` default branch
    const m = createAndroidMetadata(device);
    expect(typeof await m.statusBarHeight()).toBe('number');
  });

  it('osVersion falls back to "unknown" when adb returns whitespace only', async () => {
    const exec = mockExec([['ro.build.version.release', '   ']]);
    const m = createAndroidMetadata(device, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
  });
});
