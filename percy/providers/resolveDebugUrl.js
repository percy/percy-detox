const log = require('../util/log');

async function resolveDebugUrl(options = {}) {
  const sessionId = await resolveValue(
    options.getSessionId,
    'BROWSERSTACK_SESSION_ID',
    'getSessionId'
  );
  const buildId = await resolveValue(
    options.getBuildId,
    'BROWSERSTACK_BUILD_ID',
    'getBuildId'
  );

  if (!sessionId) return null;
  if (!buildId) {
    log.debug(
      'BROWSERSTACK_SESSION_ID present but BROWSERSTACK_BUILD_ID missing; skipping debug URL'
    );
    return null;
  }
  return `https://app-automate.browserstack.com/dashboard/v2/builds/${buildId}/sessions/${sessionId}`;
}

async function resolveValue(callback, envKey, callbackName) {
  if (typeof callback === 'function') {
    let result;
    try {
      result = await callback();
    } catch (e) {
      log.debug(`${callbackName} callback failed: ${e.message}`);
      result = undefined;
    }
    // explicit null from callback suppresses env fallback
    if (result === undefined) {
      return process.env[envKey] || null;
    }
    return result || null;
  }
  return process.env[envKey] || null;
}

module.exports = { resolveDebugUrl };
