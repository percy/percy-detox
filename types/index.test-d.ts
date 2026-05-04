import { expectType, expectError, expectAssignable } from 'tsd';
import percyScreenshot = require('.');

const device: percyScreenshot.DetoxDevice = {
  getPlatform: () => 'ios',
  takeScreenshot: async (_name: string) => '/tmp/x.png',
  id: 'UDID',
  name: 'iPhone 14'
};

const element: percyScreenshot.DetoxElement = {
  takeScreenshot: async (_name: string) => '/tmp/x.png',
  getAttributes: async () => ({})
};

// Required arguments
expectError(percyScreenshot());
expectError(percyScreenshot(device));
expectError(percyScreenshot(device, 123));

// Happy paths — device + element
expectType<Promise<percyScreenshot.SnapshotResponse | undefined>>(
  percyScreenshot(device, 'Login screen')
);
expectType<Promise<percyScreenshot.SnapshotResponse | undefined>>(
  percyScreenshot(element, 'Element capture')
);

// All known options compile cleanly
const opts: percyScreenshot.PercyOptions = {
  fullscreen: true,
  fullPage: true,
  deviceName: 'iPhone 14 Pro',
  osVersion: '17.4',
  orientation: 'portrait',
  statusBarHeight: 44,
  navigationBarHeight: 0,
  ignoreRegionIds: ['hero'],
  ignoreRegionElements: [element],
  customIgnoreRegions: [{ top: 0, bottom: 100, left: 0, right: 100 }],
  considerRegionIds: ['cta'],
  considerRegionElements: [element],
  customConsiderRegions: [{ top: 0, bottom: 100, left: 0, right: 100 }],
  testCase: 'suite1',
  labels: 'foo,bar',
  sync: false,
  getSessionId: () => 'session-id',
  getBuildId: async () => 'build-id'
};
expectType<Promise<percyScreenshot.SnapshotResponse | undefined>>(
  percyScreenshot(device, 'With options', opts)
);

// Orientation enum is a literal union
expectError<percyScreenshot.PercyOptions>({ orientation: 'sideways' });

// Rect requires all 4 numeric fields
const rect: percyScreenshot.Rect = { top: 1, bottom: 2, left: 3, right: 4 };
expectAssignable<percyScreenshot.Rect>(rect);
expectError<percyScreenshot.Rect>({ top: 1, bottom: 2, left: 3 });

// getSessionId callback may return string, null, or Promise of either
expectAssignable<percyScreenshot.PercyOptions['getSessionId']>(() => 'sess');
expectAssignable<percyScreenshot.PercyOptions['getSessionId']>(() => null);
expectAssignable<percyScreenshot.PercyOptions['getSessionId']>(async () => 'sess');
expectAssignable<percyScreenshot.PercyOptions['getSessionId']>(async () => null);

// Namespace methods
expectType<Promise<boolean>>(percyScreenshot.isPercyEnabled());
expectType<boolean>(percyScreenshot.isDetoxDevice(device));

// isDetoxDevice narrows
const unknownArg: unknown = device;
if (percyScreenshot.isDetoxDevice(unknownArg)) {
  expectType<percyScreenshot.DetoxDevice>(unknownArg);
}
