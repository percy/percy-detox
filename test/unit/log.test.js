const log = require('../../percy/util/log');

describe('log helpers', () => {
  beforeEach(() => log.__resetFullPageWarnForTests());

  it('warnFullPageOnce emits exactly one warn even when called many times', () => {
    const warnSpy = spyOn(log, 'warn');
    log.warnFullPageOnce();
    log.warnFullPageOnce();
    log.warnFullPageOnce();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.calls.argsFor(0)[0]).toMatch(/fullPage/i);
  });

  it('__resetFullPageWarnForTests re-arms the warn', () => {
    const warnSpy = spyOn(log, 'warn');
    log.warnFullPageOnce();
    log.__resetFullPageWarnForTests();
    log.warnFullPageOnce();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
