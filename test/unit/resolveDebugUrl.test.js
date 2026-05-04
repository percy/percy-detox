const { resolveDebugUrl } = require('../../percy/providers/resolveDebugUrl');

describe('resolveDebugUrl', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    delete process.env.BROWSERSTACK_SESSION_ID;
    delete process.env.BROWSERSTACK_BUILD_ID;
    Object.assign(process.env, origEnv);
  });

  it('returns null when no session ID anywhere', async () => {
    const url = await resolveDebugUrl({});
    expect(url).toBeNull();
  });

  it('uses env vars when no callbacks provided', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'sess-1';
    process.env.BROWSERSTACK_BUILD_ID = 'build-1';
    const url = await resolveDebugUrl({});
    expect(url).toBe(
      'https://app-automate.browserstack.com/dashboard/v2/builds/build-1/sessions/sess-1'
    );
  });

  it('callback takes precedence over env var', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'env-sess';
    process.env.BROWSERSTACK_BUILD_ID = 'env-build';
    const url = await resolveDebugUrl({
      getSessionId: async () => 'cb-sess',
      getBuildId: async () => 'cb-build'
    });
    expect(url).toBe(
      'https://app-automate.browserstack.com/dashboard/v2/builds/cb-build/sessions/cb-sess'
    );
  });

  it('explicit null from callback suppresses env fallback', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'env-sess';
    process.env.BROWSERSTACK_BUILD_ID = 'env-build';
    const url = await resolveDebugUrl({
      getSessionId: async () => null
    });
    expect(url).toBeNull();
  });

  it('callback undefined falls through to env var', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'env-sess';
    process.env.BROWSERSTACK_BUILD_ID = 'env-build';
    const url = await resolveDebugUrl({
      getSessionId: async () => undefined
    });
    expect(url).toBe(
      'https://app-automate.browserstack.com/dashboard/v2/builds/env-build/sessions/env-sess'
    );
  });

  it('callback that throws falls through to env var', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'env-sess';
    process.env.BROWSERSTACK_BUILD_ID = 'env-build';
    const url = await resolveDebugUrl({
      getSessionId: async () => { throw new Error('boom'); }
    });
    expect(url).toBe(
      'https://app-automate.browserstack.com/dashboard/v2/builds/env-build/sessions/env-sess'
    );
  });

  it('returns null when session present but build missing', async () => {
    process.env.BROWSERSTACK_SESSION_ID = 'sess-1';
    delete process.env.BROWSERSTACK_BUILD_ID;
    const url = await resolveDebugUrl({});
    expect(url).toBeNull();
  });

  it('supports synchronous callback return values', async () => {
    const url = await resolveDebugUrl({
      getSessionId: () => 'sync-sess',
      getBuildId: () => 'sync-build'
    });
    expect(url).toContain('sessions/sync-sess');
  });

  it('returns null when called with no options at all', async () => {
    delete process.env.BROWSERSTACK_SESSION_ID;
    delete process.env.BROWSERSTACK_BUILD_ID;
    const url = await resolveDebugUrl();
    expect(url).toBeNull();
  });

  it('treats empty-string callback return as null', async () => {
    delete process.env.BROWSERSTACK_SESSION_ID;
    const url = await resolveDebugUrl({
      getSessionId: async () => ''
    });
    expect(url).toBeNull();
  });

  it('treats empty env var as null', async () => {
    process.env.BROWSERSTACK_SESSION_ID = ''; // falsy but defined
    process.env.BROWSERSTACK_BUILD_ID = '';
    const url = await resolveDebugUrl({});
    expect(url).toBeNull();
  });

  it('callback that returns undefined and env empty string yields null', async () => {
    process.env.BROWSERSTACK_SESSION_ID = '';
    const url = await resolveDebugUrl({
      getSessionId: async () => undefined
    });
    expect(url).toBeNull();
  });
});
