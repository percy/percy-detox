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

  it('returns fallback when called with only one argument', async () => {
    // Hits `options = {}` and `deps = {}` defaults
    const m = await resolveMetadata(null);
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

  it('scaleFactor returns 3 for >=1080-width PNG', async () => {
    const PNG = Buffer.alloc(25);
    PNG.writeUInt8(0x89, 0); PNG.writeUInt8(0x50, 1); PNG.writeUInt8(0x4E, 2); PNG.writeUInt8(0x47, 3);
    PNG.writeUInt32BE(13, 8);
    PNG.write('IHDR', 12);
    PNG.writeUInt32BE(1170, 16);
    PNG.writeUInt32BE(2532, 20);
    const m = createFallbackMetadata({}, { readFile: async () => PNG });
    expect(await m.scaleFactor('/p')).toBe(3);
  });

  it('scaleFactor handles readFile errors and returns 2', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => { throw new Error('ENOENT'); }
    });
    expect(await m.scaleFactor('/missing')).toBe(2);
  });

  it('screenSize defaults when readFile yields a non-PNG', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => Buffer.from('not a png')
    });
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('screenSize defaults when readFile throws', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => { throw new Error('boom'); }
    });
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('screenSize defaults when buffer too short', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => Buffer.from([0x89, 0x50, 0x4E, 0x47])
    });
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('caches screenSize after first compute', async () => {
    const PNG = Buffer.alloc(25);
    PNG.writeUInt8(0x89, 0); PNG.writeUInt8(0x50, 1); PNG.writeUInt8(0x4E, 2); PNG.writeUInt8(0x47, 3);
    PNG.writeUInt32BE(13, 8);
    PNG.write('IHDR', 12);
    PNG.writeUInt32BE(828, 16);
    PNG.writeUInt32BE(1792, 20);
    let calls = 0;
    const m = createFallbackMetadata({}, {
      readFile: async () => { calls++; return PNG; }
    });
    await m.screenSize('/p');
    await m.screenSize('/p');
    expect(calls).toBe(1);
  });

  it('uses default fs.readFile when no readFile dep injected', async () => {
    const m = createFallbackMetadata({});
    // Without pngPath, returns default — readFile is never called.
    expect(await m.screenSize()).toEqual({ width: 360, height: 640 });
  });

  it('scaleFactor returns 2 with no pngPath', async () => {
    const m = createFallbackMetadata({});
    expect(await m.scaleFactor()).toBe(2);
  });

  it('uses default fs.readFile when constructed with no deps', async () => {
    // Hits `{ readFile = fs.readFile } = {}` default branch. With no pngPath, no actual file read.
    const m = createFallbackMetadata();
    expect(await m.osName()).toBe('unknown');
    expect(await m.osVersion()).toBe('unknown');
  });

  it('parsePngDims rejects undersized buffer', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => Buffer.alloc(10) // < 24 bytes
    });
    expect(await m.scaleFactor('/x')).toBe(2);
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('parsePngDims rejects when readFile returns null', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => null
    });
    expect(await m.scaleFactor('/x')).toBe(2);
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('parsePngDims rejects buffer with bad magic bytes (large enough)', async () => {
    const m = createFallbackMetadata({}, {
      readFile: async () => Buffer.alloc(100) // 100 zero bytes — large enough, wrong magic
    });
    expect(await m.scaleFactor('/x')).toBe(2);
    expect(await m.screenSize('/x')).toEqual({ width: 360, height: 640 });
  });

  it('uses default options when called with no args', async () => {
    const m = createFallbackMetadata();
    expect(await m.osVersion()).toBe('unknown');
    expect(await m.deviceName()).toBe('unknown');
    expect(await m.orientation()).toBe('portrait');
    expect(await m.statusBarHeight()).toBe(0);
    expect(await m.navigationBarHeight()).toBe(0);
  });

  it('scaleFactor caches after first compute', async () => {
    const PNG = Buffer.alloc(25);
    PNG.writeUInt8(0x89, 0); PNG.writeUInt8(0x50, 1); PNG.writeUInt8(0x4E, 2); PNG.writeUInt8(0x47, 3);
    PNG.writeUInt32BE(13, 8);
    PNG.write('IHDR', 12);
    PNG.writeUInt32BE(828, 16);
    PNG.writeUInt32BE(1792, 20);
    let calls = 0;
    const m = createFallbackMetadata({}, {
      readFile: async () => { calls++; return PNG; }
    });
    await m.scaleFactor('/p');
    await m.scaleFactor('/p');
    expect(calls).toBe(1);
  });
});
