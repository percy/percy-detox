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
});
