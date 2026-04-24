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
});
