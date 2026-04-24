const LEGACY_KEYS_REJECT = {
  ignoreRegionXpaths:
    'XPath is not supported by Detox. Use ignoreRegionIds with by.id(testID) matchers.',
  ignoreRegionAccessibilityIds:
    'Use ignoreRegionIds instead (collapsed into a single id-based selector in @percy/detox).',
  ignoreRegionAppiumElements:
    'Use ignoreRegionElements (Detox element handles) instead.',
  considerRegionXpaths:
    'XPath is not supported by Detox. Use considerRegionIds with by.id(testID) matchers.',
  considerRegionAccessibilityIds:
    'Use considerRegionIds instead.',
  considerRegionAppiumElements:
    'Use considerRegionElements (Detox element handles) instead.',
  scrollableXpath:
    'XPath is not supported. fullPage scroll is not implemented for Detox.',
  screenLengths:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  scrollableId:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  topScrollviewOffset:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  bottomScrollviewOffset:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  androidScrollAreaPercentage:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  scrollSpeed:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  iosOptimizedFullpage:
    'fullPage scroll sub-options are not supported for Detox (no executor channel).',
  thTestCaseExecutionId:
    'TestHub integration is not supported by @percy/detox.'
};

function rejectUnknownOptions(options = {}) {
  if (!options || typeof options !== 'object') return;
  for (const key of Object.keys(options)) {
    if (Object.prototype.hasOwnProperty.call(LEGACY_KEYS_REJECT, key)) {
      throw new TypeError(
        `@percy/detox: option '${key}' is not supported. ${LEGACY_KEYS_REJECT[key]}`
      );
    }
  }
}

function classifyArg(arg) {
  if (!arg || typeof arg !== 'object') {
    throw new TypeError(
      '@percy/detox: expected a Detox device or element object as the first argument.'
    );
  }
  const hasGetPlatform = typeof arg.getPlatform === 'function';
  const hasGetAttributes = typeof arg.getAttributes === 'function';
  const hasTakeScreenshot = typeof arg.takeScreenshot === 'function';

  if (!hasTakeScreenshot) {
    throw new TypeError(
      '@percy/detox: argument does not look like a Detox device or element (missing takeScreenshot).'
    );
  }
  if (hasGetPlatform && !hasGetAttributes) return 'device';
  if (!hasGetPlatform && hasGetAttributes) return 'element';
  throw new TypeError(
    '@percy/detox: could not discriminate argument as device or element. ' +
    'Device must have getPlatform(); element must have getAttributes().'
  );
}

module.exports = {
  LEGACY_KEYS_REJECT,
  rejectUnknownOptions,
  classifyArg
};
