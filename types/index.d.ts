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
     * Returns the BrowserStack session ID for the current Detox run.
     * Primary path for POA integration since BrowserStack does not auto-inject
     * BROWSERSTACK_SESSION_ID into the Detox test process.
     * Return `null` explicitly to suppress env-var fallback.
     */
    getSessionId?: () => string | null | Promise<string | null>;
    getBuildId?: () => string | null | Promise<string | null>;
  }

  interface SnapshotResponse {
    link?: string;
    [key: string]: unknown;
  }

  function isPercyEnabled(): Promise<boolean>;
  function isDetoxDevice(arg: unknown): arg is DetoxDevice;
}

export = percyScreenshot;
