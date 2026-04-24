const { createIosMetadata, __resetScaleCacheForTests } = require('../../percy/metadata/iosMetadata');

const SIMCTL_JSON = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-17-4': [
      { udid: 'UDID-A', name: 'iPhone 14', state: 'Booted' },
      { udid: 'UDID-B', name: 'iPhone SE (3rd generation)', state: 'Shutdown' }
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-16-0': [
      { udid: 'UDID-OLD', name: 'iPhone X', state: 'Shutdown' }
    ]
  }
});

function execReturning(stdout) {
  return async () => ({ stdout: Buffer.from(stdout), stderr: Buffer.from('') });
}

function pngBufferWithDims(width, height) {
  // 8-byte signature + 4-byte length + 4 bytes "IHDR" + width(4) + height(4) + 5 bytes
  const buf = Buffer.alloc(25);
  buf.writeUInt8(0x89, 0);
  buf.writeUInt8(0x50, 1);
  buf.writeUInt8(0x4E, 2);
  buf.writeUInt8(0x47, 3);
  buf.writeUInt8(0x0D, 4);
  buf.writeUInt8(0x0A, 5);
  buf.writeUInt8(0x1A, 6);
  buf.writeUInt8(0x0A, 7);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('iosMetadata', () => {
  beforeEach(() => __resetScaleCacheForTests());

  it('returns iOS for osName', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.osName()).toBe('iOS');
  });

  it('resolves osVersion from simctl runtime key', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.osVersion()).toBe('17');
  });

  it('resolves deviceName from simctl match', async () => {
    const m = createIosMetadata({ id: 'UDID-B' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.deviceName()).toBe('iPhone SE (3rd generation)');
  });

  it('prefers options.deviceName over simctl', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      { deviceName: 'Custom' },
      { exec: execReturning(SIMCTL_JSON) }
    );
    expect(await m.deviceName()).toBe('Custom');
  });

  it('returns unknown when UDID not found in simctl', async () => {
    const m = createIosMetadata({ id: 'UDID-MISSING' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.osVersion()).toBe('unknown');
    expect(await m.deviceName()).toBe('unknown');
  });

  it('swallows simctl failures', async () => {
    const exec = async () => { throw new Error('xcrun not found'); };
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('scaleFactor returns 3 for >=1080 width PNG', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(1170, 2532)
      }
    );
    expect(await m.scaleFactor('/tmp/snap.png')).toBe(3);
  });

  it('scaleFactor returns 2 for smaller PNG width', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(828, 1792)
      }
    );
    expect(await m.scaleFactor('/tmp/snap.png')).toBe(2);
  });

  it('scaleFactor returns 2 on PNG parse failure', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => { throw new Error('ENOENT'); }
      }
    );
    expect(await m.scaleFactor('/tmp/missing.png')).toBe(2);
  });

  it('scaleFactor caches per device.id', async () => {
    let calls = 0;
    const readFile = async () => { calls++; return pngBufferWithDims(1170, 2532); };
    const m = createIosMetadata(
      { id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON), readFile }
    );
    await m.scaleFactor('/p1');
    await m.scaleFactor('/p2');
    await m.scaleFactor('/p3');
    expect(calls).toBe(1);
  });

  it('screenSize returns 0,0 (Percy auto-computes)', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.screenSize()).toEqual({ width: 0, height: 0 });
  });

  it('orientation defaults to portrait, honors option', async () => {
    const m1 = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m1.orientation()).toBe('portrait');
    const m2 = createIosMetadata(
      { id: 'UDID-A' },
      { orientation: 'landscape' },
      { exec: execReturning(SIMCTL_JSON) }
    );
    expect(await m2.orientation()).toBe('landscape');
  });

  it('status/nav bar heights default to 0', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.statusBarHeight()).toBe(0);
    expect(await m.navigationBarHeight()).toBe(0);
  });
});
