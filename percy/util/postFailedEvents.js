const utils = require('@percy/sdk-utils');
const log = require('./log');

async function postFailedEvents(err) {
  try {
    if (typeof utils.postBuildEvents !== 'function') return;
    await utils.postBuildEvents({
      errorKind: 'sdk',
      message: err && err.message,
      client_info: '@percy/detox'
    });
  } catch (e) {
    log.debug(`postFailedEvents: upstream call failed: ${e.message}`);
  }
}

module.exports = postFailedEvents;
