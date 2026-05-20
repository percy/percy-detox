const { Tile } = require('../../percy/util/tile');

describe('Tile', () => {
  it('constructs with all fields populated', () => {
    const t = new Tile({
      filepath: '/tmp/x.png',
      statusBarHeight: 24,
      navBarHeight: 48,
      headerHeight: 60,
      footerHeight: 30,
      fullscreen: true,
      sha: 'abc123'
    });
    expect(t.filepath).toBe('/tmp/x.png');
    expect(t.statusBarHeight).toBe(24);
    expect(t.navBarHeight).toBe(48);
    expect(t.headerHeight).toBe(60);
    expect(t.footerHeight).toBe(30);
    expect(t.fullscreen).toBe(true);
    expect(t.sha).toBe('abc123');
  });

  it('defaults all numerics to 0 and fullscreen to false', () => {
    const t = new Tile({});
    expect(t.statusBarHeight).toBe(0);
    expect(t.navBarHeight).toBe(0);
    expect(t.headerHeight).toBe(0);
    expect(t.footerHeight).toBe(0);
    expect(t.fullscreen).toBe(false);
    expect(t.sha).toBeUndefined();
  });

  it('omits sha when falsy', () => {
    const t = new Tile({ sha: '' });
    expect('sha' in t).toBe(false);
  });

  it('handles no constructor argument', () => {
    const t = new Tile();
    expect(t.statusBarHeight).toBe(0);
    expect(t.fullscreen).toBe(false);
    expect(t.filepath).toBeUndefined();
  });
});
