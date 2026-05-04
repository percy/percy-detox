# @percy/detox

[![npm](https://img.shields.io/npm/v/@percy/detox.svg)](https://www.npmjs.com/package/@percy/detox)
[![Test](https://github.com/percy/percy-detox/actions/workflows/test.yml/badge.svg)](https://github.com/percy/percy-detox/actions/workflows/test.yml)

[Percy](https://percy.io) visual testing SDK for [Detox](https://wix.github.io/Detox/) — the gray-box E2E framework for React Native apps.

## Quick start

```sh
npm install --save-dev @percy/cli @percy/detox
```

Add a screenshot call to any Detox test:

```js
const { device, element, by } = require('detox');
const percyScreenshot = require('@percy/detox');

describe('Login flow', () => {
  it('renders the welcome screen', async () => {
    await expect(element(by.id('welcome'))).toBeVisible();
    await percyScreenshot(device, 'Welcome screen');
  });
});
```

Run under Percy CLI's `app:exec` with an **App-type** project token (`app_...`):

```sh
export PERCY_TOKEN=<app_...>
npx percy app:exec -- npx detox test -c android.emu.debug
```

A working example app is available at [percy/example-percy-detox](https://github.com/percy/example-percy-detox).

## Requirements

- Node ≥ 18
- Detox ≥ 20.32.0
- An App-type Percy project (token starts with `app_`)

## Supported execution targets

| Target | Status |
|---|---|
| Android — local emulator | ✅ Fully supported |
| Android — local USB-attached real device | ✅ Same local driver as emulator |
| iOS — local simulator | ✅ Supported |
| iOS — local real device | ⚠️ Works in principle; uncommon |
| Android — BrowserStack App Automate (cloud) | ⏳ Wired end-to-end, blocked on BS server-side `takeScreenshot` |
| iOS — BrowserStack App Automate (cloud) | ❌ Detox does not support BS iOS ([wix/Detox#4694](https://github.com/wix/Detox/issues/4694)) |

## API

```js
await percyScreenshot(deviceOrElement, name, options?)
```

- **`deviceOrElement`** — the Detox `device` object, or an element handle from `element(by.id(...))`.
- **`name`** — unique snapshot name within the build.
- **`options`** *(all optional)*:

| Option | Type | Description |
|---|---|---|
| `fullscreen` | `boolean` | Treat the screenshot as full-screen (no chrome cropping). |
| `fullPage` | `boolean` | Accepted for API parity; produces a single-tile capture (warns once per process). |
| `deviceName` | `string` | Override auto-detected device name. |
| `osVersion` | `string` | Override auto-detected OS version. |
| `orientation` | `'portrait' \| 'landscape'` | Override; defaults to `'portrait'`. |
| `statusBarHeight` | `number` | Pixel override; default `0`. |
| `navigationBarHeight` | `number` | Pixel override; default `0`. |
| `ignoreRegionIds` | `string[]` | Mask elements located via `by.id(testID)`. |
| `ignoreRegionElements` | `DetoxElement[]` | Mask pre-matched Detox element handles. |
| `customIgnoreRegions` | `{top,bottom,left,right}[]` | Mask rectangles in **point** coordinates. |
| `considerRegionIds` | `string[]` | Restrict diff to these elements. |
| `considerRegionElements` | `DetoxElement[]` | Restrict diff to these handles. |
| `customConsiderRegions` | `{top,bottom,left,right}[]` | Restrict diff to these rects (points). |
| `testCase` | `string` | Group snapshot in the Percy review UI. |
| `labels` | `string` | Comma-separated label chips for the snapshot. |
| `sync` | `boolean` | Block until the Percy build finalizes. |
| `getSessionId` | `() => string \| null \| Promise<string \| null>` | Resolve BrowserStack session ID for the debug-URL link. |
| `getBuildId` | `() => string \| null \| Promise<string \| null>` | Resolve BrowserStack build ID. |

**Coordinate space:** all region options accept **point** coordinates. The SDK multiplies by the device scale factor automatically. Do not pre-multiply.

## Examples

### Element-level capture

```js
const hero = element(by.id('hero'));
await expect(hero).toBeVisible();
await percyScreenshot(hero, 'Hero element');
```

### Ignore dynamic regions

```js
await percyScreenshot(device, 'Dashboard', {
  ignoreRegionIds: ['live-clock', 'unread-count'],
  customIgnoreRegions: [{ top: 0, bottom: 100, left: 0, right: 414 }]
});
```

### Group snapshots by test case

```js
await percyScreenshot(device, 'Login screen', { testCase: 'auth-suite' });
```

## Configuration

| Environment variable | Effect |
|---|---|
| `PERCY_TOKEN` | Required. App-type Percy project token (starts with `app_`). |
| `PERCY_IGNORE_ERRORS` | If `'true'`, screenshot failures are logged and swallowed instead of failing the test. |
| `PERCY_LOGLEVEL` | `silent`, `info`, `debug`. Defaults to `info`. |
| `BROWSERSTACK_SESSION_ID` | Fallback for `getSessionId` callback. |
| `BROWSERSTACK_BUILD_ID` | Fallback for `getBuildId` callback. |

## BrowserStack App Automate

BrowserStack runs Detox Android tests on real devices. Percy shows a debug-URL link to the BrowserStack session when both session ID and build ID are available. Because BrowserStack does **not** auto-inject these into the Detox test process, pass them via callbacks:

```js
await percyScreenshot(device, 'Home', {
  getSessionId: async () => process.env.MY_BS_SESSION_ID || null,
  getBuildId: async () => process.env.MY_BS_BUILD_ID || null
});
```

Returning explicit `null` from a callback suppresses the env-var fallback. iOS POA is **not supported** — Detox does not run on BrowserStack real iOS devices.

> **Note (current BrowserStack limitation):** As of the latest `@browserstack/detox` cloud build, the cloud Android driver's `takeScreenshot` is a stub that returns an empty string. The `@percy/detox` SDK and example repo are wired end-to-end against BS cloud — the moment BrowserStack ships server-side screenshot capture, Percy builds will start producing on cloud devices with no SDK changes required.

## Migration from `@percy/appium-app`

| `@percy/appium-app` option | `@percy/detox` equivalent |
|---|---|
| `ignoreRegionXpaths` | **Rejected** — Detox has no XPath. Use `ignoreRegionIds`. |
| `ignoreRegionAccessibilityIds` | `ignoreRegionIds`. |
| `ignoreRegionAppiumElements` | `ignoreRegionElements`. |
| `considerRegionXpaths` | **Rejected** — use `considerRegionIds`. |
| `considerRegionAccessibilityIds` | `considerRegionIds`. |
| `considerRegionAppiumElements` | `considerRegionElements`. |
| `scrollableXpath`, `scrollableId`, `screenLengths`, `topScrollviewOffset`, `bottomScrollviewOffset`, `androidScrollAreaPercentage`, `scrollSpeed`, `iosOptimizedFullpage` | **Rejected** — fullPage scroll-and-stitch is not supported on Detox. |
| `thTestCaseExecutionId` | **Rejected** — TestHub is not supported. |

Passing a rejected key throws `TypeError` with a migration hint — nothing is silently ignored.

## Known limitations

- `element.takeScreenshot` misses TextureView, GLSurfaceView, Skia canvases, and other hardware-accelerated content on Android ([wix/Detox#4489](https://github.com/wix/Detox/issues/4489)). Use `device.takeScreenshot` for views backed by these surfaces.
- iOS: `atIndex(n).getAttributes()` is silently ignored ([wix/Detox#4633](https://github.com/wix/Detox/issues/4633)). When multi-match occurs, `@percy/detox` uses the first result and logs a warning.
- `fullPage` is accepted but produces a single-tile capture — Detox has no server-side stitching channel (unlike BrowserStack's Appium executor).
- iOS scale factor is inferred from PNG width: `>=1080 → 3x`, otherwise `2x`. iPad retina at 2x with width 1536+ may be misclassified; override with explicit options or open an issue.

## Resources

- [Example app + tests](https://github.com/percy/example-percy-detox)
- [Percy App Percy docs](https://www.browserstack.com/docs/percy/integrate/overview)
- [Detox docs](https://wix.github.io/Detox/)

## License

MIT
