const { resolveMetadata, createFallbackMetadata } = require('../../percy/metadata/resolveMetadata');

describe('resolveMetadata', () => {
  it('returns iOS metadata for ios device', async () => {
    const device = { getPlatform: async () => 'ios', id: 'UDID-A' };
    const exec = async () => ({ stdout: Buffer.from('{"devices":{}}'), stderr: Buffer.from('') });
    const m = await resolveMetadata(device, {}, { exec, readFile: async () => Buffer.alloc(0) });
    expect(await m.osName()).toBe('iOS');
  });

  it('returns Android metadata for android device', async () => {
    const device = { getPlatform: async () => 'android', id: 'emulator-5554' };
    const exec = async () => ({ stdout: Buffer.from(''), stderr: Buffer.from('') });
    const m = await resolveMetadata(device, {}, { exec });
    expect(await m.osName()).toBe('Android');
  });

  it('returns fallback metadata for unknown platform', async () => {
    const device = { getPlatform: async () => 'windows' };
    const m = await resolveMetadata(device, { deviceName: 'Foo' });
    expect(await m.osName()).toBe('unknown');
    expect(await m.deviceName()).toBe('Foo');
    expect(await m.scaleFactor()).toBe(2);
  });

  it('returns fallback when device has no getPlatform', async () => {
    const m = await resolveMetadata({}, {});
    expect(await m.osName()).toBe('unknown');
  });

  it('returns fallback when device is null', async () => {
    const m = await resolveMetadata(null, {});
    expect(await m.osName()).toBe('unknown');
  });
});

describe('createFallbackMetadata', () => {
  it('uses option overrides', async () => {
    const m = createFallbackMetadata({
      osVersion: '1',
      deviceName: 'D',
      orientation: 'landscape',
      statusBarHeight: 10,
      navigationBarHeight: 20
    });
    expect(await m.osVersion()).toBe('1');
    expect(await m.deviceName()).toBe('D');
    expect(await m.orientation()).toBe('landscape');
    expect(await m.statusBarHeight()).toBe(10);
    expect(await m.navigationBarHeight()).toBe(20);
    expect(await m.scaleFactor()).toBe(2);
  });

  it('screenSize defaults to 360x640 without pngPath', async () => {
    const m = createFallbackMetadata({});
    expect(await m.screenSize()).toEqual({ width: 360, height: 640 });
  });

  it('screenSize derives from PNG dims when pngPath provided', async () => {
    const PNG = Buffer.alloc(25);
    PNG.writeUInt8(0x89, 0); PNG.writeUInt8(0x50, 1); PNG.writeUInt8(0x4E, 2); PNG.writeUInt8(0x47, 3);
    PNG.writeUInt32BE(13, 8);
    PNG.write('IHDR', 12);
    PNG.writeUInt32BE(828, 16);
    PNG.writeUInt32BE(1792, 20);
    const m = createFallbackMetadata({}, { readFile: async () => PNG });
    await m.scaleFactor('/x'); // primes scale = 2
    const size = await m.screenSize('/x');
    expect(size).toEqual({ width: 414, height: 896 });
  });
});
