class Tile {
  constructor({
    filepath,
    statusBarHeight,
    navBarHeight,
    headerHeight,
    footerHeight,
    fullscreen,
    sha
  } = {}) {
    this.filepath = filepath;
    this.statusBarHeight = statusBarHeight || 0;
    this.navBarHeight = navBarHeight || 0;
    this.headerHeight = headerHeight || 0;
    this.footerHeight = footerHeight || 0;
    this.fullscreen = !!fullscreen;
    if (sha) this.sha = sha;
  }
}

module.exports = { Tile };
