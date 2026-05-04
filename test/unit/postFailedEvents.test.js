const postFailedEvents = require('../../percy/util/postFailedEvents');
const utilsPath = require.resolve('@percy/sdk-utils');
const postBuildEventModulePath = utilsPath.replace(/index\.js$/, 'post-build-event.js');
let postBuildEventModule;
try {
  postBuildEventModule = require(postBuildEventModulePath);
} catch (_e) {
  postBuildEventModule = null;
}

describe('postFailedEvents', () => {
  it('returns silently when postBuildEvents is not a function', async () => {
    if (!postBuildEventModule) return;
    const original = postBuildEventModule.default;
    postBuildEventModule.default = undefined;
    try {
      await expectAsync(postFailedEvents(new Error('x'))).toBeResolved();
    } finally {
      postBuildEventModule.default = original;
    }
  });

  it('forwards err.message to postBuildEvents', async () => {
    if (!postBuildEventModule) return;
    const spy = spyOn(postBuildEventModule, 'default').and.resolveTo();
    await postFailedEvents(new Error('boom'));
    expect(spy).toHaveBeenCalled();
    const payload = spy.calls.mostRecent().args[0];
    expect(payload.message).toBe('boom');
    expect(payload.errorKind).toBe('sdk');
    expect(payload.client_info).toBe('@percy/detox');
  });

  it('swallows errors raised by postBuildEvents', async () => {
    if (!postBuildEventModule) return;
    spyOn(postBuildEventModule, 'default').and.rejectWith(new Error('upstream down'));
    await expectAsync(postFailedEvents(new Error('y'))).toBeResolved();
  });

  it('handles a missing-message error object gracefully', async () => {
    if (!postBuildEventModule) return;
    const spy = spyOn(postBuildEventModule, 'default').and.resolveTo();
    await postFailedEvents({});
    expect(spy.calls.mostRecent().args[0].message).toBeUndefined();
  });
});
