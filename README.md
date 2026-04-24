# @percy/detox

[![npm](https://img.shields.io/npm/v/@percy/detox.svg)](https://www.npmjs.com/package/@percy/detox)

Percy visual testing SDK for [Detox](https://wix.github.io/Detox/) — React Native E2E.

## Install

```sh
npm install --save-dev @percy/cli @percy/detox
```

Requires **Node ≥ 18** and **Detox ≥ 20.32.0**.

## Usage

```js
const percyScreenshot = require('@percy/detox');

describe('Home flow', () => {
  it('renders home', async () => {
    await percyScreenshot(device, 'Home');
  });

  it('captures hero', async () => {
    await percyScreenshot(element(by.id('hero')), 'Hero');
  });
});
```

Run tests under Percy CLI's `app:exec`:

```sh
export PERCY_TOKEN=<your project token>
percy app:exec -- detox test -c ios.sim.debug
```

## API

```js
await percyScreenshot(deviceOrElement, name, options)
```

- **`deviceOrElement`** — the Detox `device` object, or an element handle from `element(by.id(...))`.
- **`name`** — unique snapshot name.
- **`options`** (all optional):

| Option | Type | Notes |
|---|---|---|
| `fullscreen` | `boolean` | Crop status/nav bars off the comparison. |
| `fullPage` | `boolean` | Accepted for API parity; produces a single-tile capture (warns once). |
| `deviceName` | `string` | Override auto-detected device name. |
| `osVersion` | `string` | Override auto-detected OS version. |
| `orientation` | `'portrait' \| 'landscape'` | Override; defaults to `'portrait'`. |
| `statusBarHeight` | `number` | Pixel override; default `0`. |
| `navigationBarHeight` | `number` | Pixel override; default `0`. |
| `ignoreRegionIds` | `string[]` | Mask elements found via `by.id(testID)`. |
| `ignoreRegionElements` | `DetoxElement[]` | Mask pre-matched element handles. |
| `customIgnoreRegions` | `{top,bottom,left,right}[]` | Mask rectangles (coordinates in points). |
| `considerRegionIds` | `string[]` | Restrict diff to these elements. |
| `considerRegionElements` | `DetoxElement[]` | Restrict diff to these handles. |
| `customConsiderRegions` | `{top,bottom,left,right}[]` | Restrict diff to these rects (points). |
| `testCase` | `string` | Group snapshot in the Percy review UI. |
| `labels` | `string` | Comma-separated label chips. |
| `sync` | `boolean` | Block until the Percy build finalizes. |
| `getSessionId` | `() => string \| null \| Promise<string \| null>` | Resolve BrowserStack session ID for the POA debug link (see below). |
| `getBuildId` | `() => string \| null \| Promise<string \| null>` | Resolve BrowserStack build ID. |

Coordinate space: **all region options accept point coordinates**. The SDK multiplies by the device scale factor. Do not pre-multiply.

## BrowserStack App Automate (Detox Android)

BrowserStack runs Detox Android tests on real devices. Percy shows a debug-URL link to the BrowserStack session when both the session ID and build ID are available. Because BrowserStack does **not** auto-inject these into the test process, pass them via a callback — typically calling the BrowserStack REST API with your credentials:

```js
const fetch = require('node-fetch');

await percyScreenshot(device, 'Home', {
  getSessionId: async () => {
    // Your pipeline resolves this — for example, by calling
    // https://api-cloud.browserstack.com/app-automate/detox/v2/android/sessions/{id}.json
    return process.env.MY_BS_SESSION_ID || null;
  },
  getBuildId: async () => process.env.MY_BS_BUILD_ID || null
});
```

Fallback: `BROWSERSTACK_SESSION_ID` and `BROWSERSTACK_BUILD_ID` environment variables are read if no callback is provided. Returning explicit `null` from the callback suppresses the env fallback.

iOS POA is **not supported** — Detox does not run on BrowserStack real iOS devices.

## Migration from `@percy/appium-app`

| `@percy/appium-app` option | `@percy/detox` equivalent |
|---|---|
| `ignoreRegionXpaths` | **Rejected** — Detox has no XPath. Use `ignoreRegionIds`. |
| `ignoreRegionAccessibilityIds` | `ignoreRegionIds` (collapsed). |
| `ignoreRegionAppiumElements` | `ignoreRegionElements`. |
| `considerRegionXpaths` | **Rejected** — use `considerRegionIds`. |
| `considerRegionAccessibilityIds` | `considerRegionIds`. |
| `considerRegionAppiumElements` | `considerRegionElements`. |
| `scrollableXpath`, `scrollableId`, `screenLengths`, `topScrollviewOffset`, `bottomScrollviewOffset`, `androidScrollAreaPercentage`, `scrollSpeed`, `iosOptimizedFullpage` | **Rejected** — fullPage scroll-and-stitch is not supported for Detox. |
| `thTestCaseExecutionId` | **Rejected** — TestHub is not supported. |

Passing a rejected key throws `TypeError` with a migration hint — nothing is silently ignored.

## Known limitations

- `element.takeScreenshot` misses TextureView, GLSurfaceView, Skia canvases, and other hardware-accelerated content on Android ([wix/Detox#4489](https://github.com/wix/Detox/issues/4489)). Use `device.takeScreenshot` for surfaces backed by these views.
- iOS: `atIndex(n).getAttributes()` is silently ignored ([wix/Detox#4633](https://github.com/wix/Detox/issues/4633)). When multi-match occurs, `@percy/detox` uses the first result and logs a warning.
- fullPage is accepted but produces a single-tile capture — Detox has no server-side stitching channel (unlike BrowserStack's Appium executor).
- iOS scale factor is inferred from PNG width: `>=1080 → 3x`, otherwise `2x`. iPad retina (2x at 1536+) may be misclassified; override with `deviceName` + a manual `scaleFactor` override (planned).

## License

MIT
