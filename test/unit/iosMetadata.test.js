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

  it('screenSize returns 0,0 when no pngPath provided', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.screenSize()).toEqual({ width: 0, height: 0 });
  });

  it('screenSize computes from PNG dims divided by scaleFactor', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(1170, 2532)
      }
    );
    // prime scaleFactor first (3x for width 1170)
    await m.scaleFactor('/tmp/snap.png');
    const size = await m.screenSize('/tmp/snap.png');
    expect(size).toEqual({ width: 390, height: 844 });
  });

  it('screenSize caches per device.id', async () => {
    let calls = 0;
    const readFile = async () => { calls++; return pngBufferWithDims(828, 1792); };
    const m = createIosMetadata(
      { id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON), readFile }
    );
    await m.scaleFactor('/p1'); // 1 call
    await m.screenSize('/p1'); // 2nd call
    await m.screenSize('/p2'); // cached — no 3rd call
    expect(calls).toBe(2);
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

  it('status/nav bar heights honor option overrides', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      { statusBarHeight: 47, navigationBarHeight: 12 },
      { exec: execReturning(SIMCTL_JSON) }
    );
    expect(await m.statusBarHeight()).toBe(47);
    expect(await m.navigationBarHeight()).toBe(12);
  });

  it('osVersion prefers options.osVersion override', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      { osVersion: '15.0' },
      { exec: execReturning(SIMCTL_JSON) }
    );
    expect(await m.osVersion()).toBe('15.0');
  });

  it('deviceName falls back to device.name when not in simctl and no option', async () => {
    const m = createIosMetadata(
      { id: 'UDID-MISSING', name: 'My iPhone' },
      {},
      { exec: execReturning(SIMCTL_JSON) }
    );
    expect(await m.deviceName()).toBe('My iPhone');
  });

  it('scaleFactor warns and falls back to 2 for unusually small PNG widths', async () => {
    const m = createIosMetadata(
      { id: 'UDID-A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(200, 400) // < 320 triggers small-PNG branch
      }
    );
    expect(await m.scaleFactor('/tmp/tiny.png')).toBe(2);
  });

  it('handles iOS runtime keys without minor version', async () => {
    const exec = execReturning(JSON.stringify({
      devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17': [{ udid: 'X', name: 'iP' }] }
    }));
    const m = createIosMetadata({ id: 'X' }, {}, { exec });
    expect(await m.osVersion()).toBe('17');
  });

  it('returns unknown when simctl JSON has unexpected shape', async () => {
    const exec = execReturning('{}');
    const m = createIosMetadata({ id: 'X' }, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('handles missing device.id when looking up simctl info', async () => {
    const m = createIosMetadata(null, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.osVersion()).toBe('unknown');
    expect(await m.deviceName()).toBe('unknown');
  });

  it('caches simctlInfo across calls', async () => {
    let calls = 0;
    const exec = async () => { calls++; return { stdout: Buffer.from(SIMCTL_JSON), stderr: Buffer.from('') }; };
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec });
    await m.osVersion();
    await m.deviceName();
    await m.osVersion();
    expect(calls).toBe(1);
  });

  it('scaleFactor returns 2 when pngPath is missing', async () => {
    const m = createIosMetadata({ id: 'UDID-A' }, {}, { exec: execReturning(SIMCTL_JSON) });
    expect(await m.scaleFactor()).toBe(2);
  });

  it('handles simctl returning undefined devices array', async () => {
    const exec = execReturning(JSON.stringify({ devices: { 'iOS-17': null } }));
    const m = createIosMetadata({ id: 'A' }, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('uses default deps when third arg omitted', async () => {
    // Hits the `{ exec = defaultExec, readFile = fs.readFile } = {}` default branch
    const m = createIosMetadata({ id: 'X' });
    // simctl will probably fail on a CI runner without xcrun; either way osName is sync
    expect(await m.osName()).toBe('iOS');
  });

  it('handles missing match.name in simctl response', async () => {
    const exec = execReturning(JSON.stringify({
      devices: { 'iOS-17-0': [{ udid: 'A' }] } // no name
    }));
    const m = createIosMetadata({ id: 'A' }, {}, { exec });
    expect(await m.deviceName()).toBe('unknown');
  });

  it('matches runtime key with explicit minor version', async () => {
    const exec = execReturning(JSON.stringify({
      devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-16-4': [{ udid: 'A', name: 'X' }] }
    }));
    const m = createIosMetadata({ id: 'A' }, {}, { exec });
    expect(await m.osVersion()).toBe('16');
  });

  it('runtime key without iOS prefix does not produce a version', async () => {
    const exec = execReturning(JSON.stringify({
      devices: { 'com.apple.CoreSimulator.SimRuntime.tvOS-17-0': [{ udid: 'A', name: 'X' }] }
    }));
    const m = createIosMetadata({ id: 'A' }, {}, { exec });
    expect(await m.osVersion()).toBe('unknown');
  });

  it('parsePngDims rejects buffer that is too small', async () => {
    const m = createIosMetadata(
      { id: 'A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => Buffer.alloc(10) // too small
      }
    );
    expect(await m.scaleFactor('/p')).toBe(2);
  });

  it('parsePngDims rejects non-PNG magic bytes', async () => {
    const m = createIosMetadata(
      { id: 'A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => Buffer.alloc(50)
      }
    );
    expect(await m.scaleFactor('/p')).toBe(2);
  });

  it('screenSize falls back to 0x0 when PNG dims invalid', async () => {
    const m = createIosMetadata(
      { id: 'A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => Buffer.alloc(10) // too small
      }
    );
    expect(await m.screenSize('/p')).toEqual({ width: 0, height: 0 });
  });

  it('screenSize uses default scaleFactor 2 when not pre-primed', async () => {
    const m = createIosMetadata(
      { id: 'A' },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(828, 1792)
      }
    );
    // Direct call without priming scaleFactor first
    const size = await m.screenSize('/p');
    expect(size).toEqual({ width: 414, height: 896 });
  });

  it('screenSize keys default to "unknown-ios" when device missing', async () => {
    const m = createIosMetadata(
      null,
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(828, 1792)
      }
    );
    expect(await m.screenSize('/p')).toEqual({ width: 414, height: 896 });
  });

  it('scaleFactor key falls back to "unknown-ios" when device.id is missing', async () => {
    const m = createIosMetadata(
      { /* no id */ },
      {},
      {
        exec: execReturning(SIMCTL_JSON),
        readFile: async () => pngBufferWithDims(1170, 2532)
      }
    );
    expect(await m.scaleFactor('/p')).toBe(3);
  });
});
