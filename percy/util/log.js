const utils = require('@percy/sdk-utils');

const log = utils.logger('detox');

let _fullPageWarned = false;

function warnFullPageOnce() {
  if (_fullPageWarned) return;
  _fullPageWarned = true;
  log.warn(
    'fullPage is accepted but produces a single-tile screenshot in @percy/detox. ' +
    'Scroll-and-stitch is not supported for Detox.'
  );
}

function __resetFullPageWarnForTests() {
  _fullPageWarned = false;
}

log.warnFullPageOnce = warnFullPageOnce;
log.__resetFullPageWarnForTests = __resetFullPageWarnForTests;

module.exports = log;
module.exports.warnFullPageOnce = warnFullPageOnce;
module.exports.__resetFullPageWarnForTests = __resetFullPageWarnForTests;
