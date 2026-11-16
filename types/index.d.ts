declare function percyScreenshot(
  arg: percyScreenshot.DetoxDevice | percyScreenshot.DetoxElement,
  name: string,
  options?: percyScreenshot.PercyOptions
): Promise<percyScreenshot.SnapshotResponse | undefined>;

declare namespace percyScreenshot {
  interface Rect {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  interface DetoxDevice {
    getPlatform(): Promise<'ios' | 'android'> | 'ios' | 'android';
    takeScreenshot(name: string): Promise<string>;
    id?: string;
    name?: string;
    /** Detox device type, e.g. `android.cloud` on BrowserStack App Automate. */
    type?: string;
    /** CloudPlatform channel from `@browserstack/detox` (20.51.3-cloud.2+). */
    cloudPlatform?(method: string, args?: Record<string, unknown>): Promise<unknown>;
  }

  interface DetoxElement {
    takeScreenshot(name: string): Promise<string>;
    getAttributes(): Promise<unknown>;
  }

  interface PercyOptions {
    fullscreen?: boolean;
    /** Accepted but inert — @percy/detox produces a single-tile capture. Warns once per process on true. */
    fullPage?: boolean;
    deviceName?: string;
    osVersion?: string;
    orientation?: 'portrait' | 'landscape';
    statusBarHeight?: number;
    navigationBarHeight?: number;
    ignoreRegionIds?: string[];
    ignoreRegionElements?: DetoxElement[];
    customIgnoreRegions?: Rect[];
    considerRegionIds?: string[];
    considerRegionElements?: DetoxElement[];
    customConsiderRegions?: Rect[];
    testCase?: string;
    labels?: string;
    sync?: boolean;
    /**
     * `auto` (default): on App Automate, host-side full-screen capture when available, else
     * element capture; device capture elsewhere. `cloud` forces the App Automate capture.
     */
    screenshotMode?: 'auto' | 'device' | 'element' | 'cloud';
    /** testID of the view to capture in element mode. Required on iOS. */
    rootTestID?: string;
    /** Scale for point-based custom regions. App Automate uses the device density by default. */
    scaleFactor?: number;
  }

  interface SnapshotResponse {
    link?: string;
    [key: string]: unknown;
  }

  function isPercyEnabled(): Promise<boolean>;
  function isDetoxDevice(arg: unknown): arg is DetoxDevice;

  const CLIENT_INFO: string;
  const ENV_INFO: string;
}

export = percyScreenshot;
