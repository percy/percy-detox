const Module = require('module');
const { detoxDeviceConfig, isCloudDevice, getDetox } = require('../../percy/util/detox');

// Serve a fake `detox/internals` module for the duration of fn.
function withInternals(internals, fn) {
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'detox/internals') return internals;
    return origLoad.call(this, request, ...rest);
  };
  try {
    return fn();
  } finally {
    Module._load = origLoad;
  }
}

describe('util/detox', () => {
  it('getDetox returns null when detox is not installed', () => {
    expect(getDetox()).toBe(null);
  });

  it('detoxDeviceConfig returns {} when detox/internals is missing', () => {
    expect(detoxDeviceConfig()).toEqual({});
  });

  it('detoxDeviceConfig returns {} when there is no device config', () => {
    expect(withInternals({}, detoxDeviceConfig)).toEqual({});
    expect(withInternals({ config: {} }, detoxDeviceConfig)).toEqual({});
  });

  it('detoxDeviceConfig reads config.device', () => {
    const internals = {
      config: { device: { type: 'android.cloud', device: { name: 'Samsung Galaxy S22', osVersion: '12.0' } } }
    };
    expect(withInternals(internals, detoxDeviceConfig))
      .toEqual({ type: 'android.cloud', name: 'Samsung Galaxy S22', osVersion: '12.0' });
  });

  it('detoxDeviceConfig reads config.deviceConfig with avdName/os aliases', () => {
    const internals = { config: { deviceConfig: { type: 'android.emulator', device: { avdName: 'Pixel', os: '14' } } } };
    expect(withInternals(internals, detoxDeviceConfig))
      .toEqual({ type: 'android.emulator', name: 'Pixel', osVersion: '14' });
  });

  it('detoxDeviceConfig tolerates a non-object device block', () => {
    const internals = { config: { device: { type: 'ios.simulator', device: 'iPhone 15' } } };
    expect(withInternals(internals, detoxDeviceConfig))
      .toEqual({ type: 'ios.simulator', name: undefined, osVersion: undefined });
  });

  it('isCloudDevice matches *.cloud types only', () => {
    expect(isCloudDevice({ type: 'android.cloud' })).toBe(true);
    expect(isCloudDevice({ type: 'android.emulator' })).toBe(false);
    expect(isCloudDevice({})).toBe(false);
    expect(isCloudDevice(undefined)).toBe(false);
  });
});
