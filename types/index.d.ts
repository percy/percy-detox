export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DetoxDevice {
  getPlatform(): Promise<'ios' | 'android'> | 'ios' | 'android';
  takeScreenshot(name: string): Promise<string>;
  id?: string;
  name?: string;
}

export interface DetoxElement {
  takeScreenshot(name: string): Promise<string>;
  getAttributes(): Promise<unknown>;
}

export interface PercyOptions {
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

export interface SnapshotResponse {
  link?: string;
  [key: string]: unknown;
}

declare function percyScreenshot(
  arg: DetoxDevice | DetoxElement,
  name: string,
  options?: PercyOptions
): Promise<SnapshotResponse | undefined>;

declare namespace percyScreenshot {
  function isPercyEnabled(): Promise<boolean>;
  function isDetoxDevice(arg: unknown): arg is DetoxDevice;
}

export = percyScreenshot;
