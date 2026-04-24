const { classifyArg, rejectUnknownOptions } = require('../../percy/util/validations');

describe('validations', () => {
  describe('classifyArg', () => {
    it('classifies device shape', () => {
      const device = {
        getPlatform: async () => 'ios',
        takeScreenshot: async () => '/tmp/a.png',
        id: 'udid-1',
        name: 'iPhone 14'
      };
      expect(classifyArg(device)).toBe('device');
    });

    it('classifies element shape', () => {
      const el = {
        takeScreenshot: async () => '/tmp/a.png',
        getAttributes: async () => ({ frame: { x: 0, y: 0, width: 100, height: 100 } })
      };
      expect(classifyArg(el)).toBe('element');
    });

    it('throws on null / undefined', () => {
      expect(() => classifyArg(null)).toThrowError(/device or element object/);
      expect(() => classifyArg(undefined)).toThrowError(/device or element object/);
      expect(() => classifyArg(42)).toThrowError(/device or element object/);
    });

    it('throws when takeScreenshot is missing', () => {
      expect(() => classifyArg({ getPlatform: async () => 'ios' })).toThrowError(/takeScreenshot/);
    });

    it('throws when shape is ambiguous (has both getPlatform and getAttributes)', () => {
      const ambiguous = {
        getPlatform: async () => 'ios',
        getAttributes: async () => ({}),
        takeScreenshot: async () => '/tmp/a.png'
      };
      expect(() => classifyArg(ambiguous)).toThrowError(/discriminate/);
    });

    it('throws when shape is neither device nor element', () => {
      const orphan = { takeScreenshot: async () => '/tmp/a.png' };
      expect(() => classifyArg(orphan)).toThrowError(/discriminate/);
    });
  });

  describe('rejectUnknownOptions', () => {
    it('accepts supported options silently', () => {
      expect(() => rejectUnknownOptions({
        fullPage: true,
        ignoreRegionIds: ['x'],
        customIgnoreRegions: [],
        testCase: 'home',
        labels: 'smoke'
      })).not.toThrow();
    });

    it('rejects XPath options', () => {
      expect(() => rejectUnknownOptions({ ignoreRegionXpaths: ['//x'] }))
        .toThrowError(/XPath is not supported/);
      expect(() => rejectUnknownOptions({ considerRegionXpaths: ['//x'] }))
        .toThrowError(/XPath is not supported/);
    });

    it('rejects appium-specific names with migration hint', () => {
      expect(() => rejectUnknownOptions({ ignoreRegionAccessibilityIds: ['x'] }))
        .toThrowError(/Use ignoreRegionIds instead/);
      expect(() => rejectUnknownOptions({ ignoreRegionAppiumElements: [] }))
        .toThrowError(/Use ignoreRegionElements/);
    });

    it('rejects all fullPage scroll sub-options', () => {
      const keys = [
        'screenLengths', 'scrollableId', 'topScrollviewOffset',
        'bottomScrollviewOffset', 'androidScrollAreaPercentage',
        'scrollSpeed', 'iosOptimizedFullpage', 'scrollableXpath'
      ];
      for (const key of keys) {
        expect(() => rejectUnknownOptions({ [key]: 'anything' }))
          .toThrowError(new RegExp(`'${key}'`));
      }
    });

    it('rejects thTestCaseExecutionId', () => {
      expect(() => rejectUnknownOptions({ thTestCaseExecutionId: 'xyz' }))
        .toThrowError(/TestHub integration is not supported/);
    });

    it('tolerates null / undefined options', () => {
      expect(() => rejectUnknownOptions(null)).not.toThrow();
      expect(() => rejectUnknownOptions(undefined)).not.toThrow();
      expect(() => rejectUnknownOptions({})).not.toThrow();
    });
  });
});
