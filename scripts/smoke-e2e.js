#!/usr/bin/env node
/* eslint-disable no-console */
// End-to-end smoke for @percy/detox.
//
// Generates realistic-looking app screenshots (status bar + header + body
// with cards + nav bar) and uploads them via the SDK. Two modes:
//
//   PERCY_VARIANT=baseline (default) → baseline build
//   PERCY_VARIANT=diff              → intentional visual diffs for comparison
//
// Run under Percy CLI:
//   app-t && npx percy app:exec -- node scripts/smoke-e2e.js
//   app-t && PERCY_VARIANT=diff npx percy app:exec -- node scripts/smoke-e2e.js

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const percyScreenshot = require('..');

const VARIANT = (process.env.PERCY_VARIANT || 'baseline').toLowerCase();

// ---------------------------------------------------------------------------
// PNG encoder (pure Node — no deps)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgbaBuffer) {
  const SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  // Add PNG filter byte (0) at the start of each row
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    rgbaBuffer.copy(raw, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Scene renderer — draws layered rectangles into an RGBA buffer
// ---------------------------------------------------------------------------

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buf = Buffer.alloc(width * height * 4);
  }
  fill([r, g, b, a] = [255, 255, 255, 255]) {
    for (let i = 0; i < this.buf.length; i += 4) {
      this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b; this.buf[i + 3] = a;
    }
  }
  rect(x, y, w, h, [r, g, b, a] = [0, 0, 0, 255]) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const o = (py * this.width + px) * 4;
        this.buf[o] = r; this.buf[o + 1] = g; this.buf[o + 2] = b; this.buf[o + 3] = a;
      }
    }
  }
  /**
   * Render vertical stripes (visible, deterministic "text"-ish marker) so each
   * screen is visibly distinct even without a font renderer.
   */
  stripes(x, y, count, stripeW, stripeH, gap, color) {
    for (let i = 0; i < count; i++) {
      this.rect(x + i * (stripeW + gap), y, stripeW, stripeH, color);
    }
  }
  toPng() {
    return encodePng(this.width, this.height, this.buf);
  }
}

// ---------------------------------------------------------------------------
// Screen catalog — one "screen" per feature; each returns a canvas
// ---------------------------------------------------------------------------

const PALETTE = {
  background: [245, 247, 250, 255],
  statusBar: [30, 41, 59, 255],
  header: [99, 102, 241, 255],      // indigo
  accent: [14, 165, 233, 255],       // sky
  success: [34, 197, 94, 255],       // green
  warning: [234, 179, 8, 255],       // yellow
  danger: [239, 68, 68, 255],        // red
  card: [255, 255, 255, 255],
  cardBorder: [226, 232, 240, 255],
  text: [15, 23, 42, 255],
  muted: [148, 163, 184, 255]
};

function baseLayout(width, height, headerColor) {
  const c = new Canvas(width, height);
  c.fill(PALETTE.background);
  // status bar
  c.rect(0, 0, width, Math.round(height * 0.035), PALETTE.statusBar);
  // header band
  c.rect(0, Math.round(height * 0.035), width, Math.round(height * 0.09), headerColor);
  // bottom nav
  c.rect(0, height - Math.round(height * 0.07), width, Math.round(height * 0.07), PALETTE.card);
  c.rect(0, height - Math.round(height * 0.07), width, 2, PALETTE.cardBorder);
  // nav dots
  const navY = height - Math.round(height * 0.04);
  const navSize = Math.round(width * 0.03);
  for (let i = 0; i < 4; i++) {
    const color = i === 0 ? PALETTE.accent : PALETTE.muted;
    c.rect(width * 0.15 + i * width * 0.22, navY, navSize, navSize, color);
  }
  return c;
}

function screenHome(width, height, isDiff) {
  const c = baseLayout(width, height, PALETTE.header);
  // title stripes
  c.stripes(width * 0.08, height * 0.09, isDiff ? 18 : 14, 12, 4, 8, PALETTE.card);
  // hero card
  c.rect(width * 0.06, height * 0.17, width * 0.88, height * 0.18, PALETTE.card);
  c.rect(width * 0.06, height * 0.17, width * 0.88, height * 0.18, PALETTE.cardBorder);
  c.rect(width * 0.06 + 1, height * 0.17 + 1, width * 0.88 - 2, height * 0.18 - 2, PALETTE.card);
  c.stripes(width * 0.1, height * 0.22, 10, 16, 6, 10,
    isDiff ? PALETTE.danger : PALETTE.accent);   // DIFF: color change
  c.rect(width * 0.1, height * 0.28, width * 0.32, height * 0.04,
    isDiff ? PALETTE.warning : PALETTE.success); // CTA button
  // list of three cards
  for (let i = 0; i < 3; i++) {
    const y = height * (0.4 + i * 0.14);
    c.rect(width * 0.06, y, width * 0.88, height * 0.11, PALETTE.card);
    c.rect(width * 0.06, y, width * 0.88, height * 0.11, PALETTE.cardBorder);
    c.rect(width * 0.06 + 1, y + 1, width * 0.88 - 2, height * 0.11 - 2, PALETTE.card);
    c.rect(width * 0.1, y + height * 0.015, width * 0.18, height * 0.08, PALETTE.header);
    c.stripes(width * 0.32, y + height * 0.025, 12, 10, 4, 6, PALETTE.text);
    c.stripes(width * 0.32, y + height * 0.06, 8, 8, 3, 4, PALETTE.muted);
  }
  // DIFF: add a badge on first card
  if (isDiff) {
    c.rect(width * 0.8, height * 0.4 + height * 0.01, width * 0.1, height * 0.03, PALETTE.danger);
  }
  return c;
}

function screenProductList(width, height, isDiff) {
  const c = baseLayout(width, height, PALETTE.accent);
  c.stripes(width * 0.08, height * 0.09, 20, 10, 3, 6, PALETTE.card);
  // grid of 6 product cards (2 cols x 3 rows)
  const cols = 2, rows = 3;
  const cardW = width * 0.42, cardH = height * 0.18;
  const gap = width * 0.05;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = gap + col * (cardW + gap * 0.4);
      const y = height * 0.15 + r * (cardH + height * 0.015);
      c.rect(x, y, cardW, cardH, PALETTE.card);
      c.rect(x, y, cardW, cardH, PALETTE.cardBorder);
      c.rect(x + 1, y + 1, cardW - 2, cardH - 2, PALETTE.card);
      const thumbH = cardH * 0.6;
      const thumbColor = isDiff && r === 0 && col === 0
        ? PALETTE.danger                  // DIFF: first tile changes color
        : [60 + r * 40, 80 + col * 50, 180 - r * 20, 255];
      c.rect(x + cardW * 0.08, y + cardH * 0.05, cardW * 0.84, thumbH, thumbColor);
      c.stripes(x + cardW * 0.08, y + cardH * 0.72, 10, 6, 3, 3, PALETTE.text);
      c.stripes(x + cardW * 0.08, y + cardH * 0.85, 6, 6, 3, 3, PALETTE.muted);
    }
  }
  return c;
}

function screenProductDetail(width, height, isDiff) {
  const c = baseLayout(width, height, PALETTE.header);
  // hero image
  c.rect(0, height * 0.035 + height * 0.09, width, height * 0.32,
    isDiff ? [90, 180, 220, 255] : [60, 130, 200, 255]);
  // title + price
  c.stripes(width * 0.08, height * 0.48, 22, 10, 4, 6, PALETTE.text);
  c.stripes(width * 0.08, height * 0.53, 10, 12, 5, 6, PALETTE.success);
  // DIFF: price-changed indicator
  if (isDiff) c.rect(width * 0.6, height * 0.53, width * 0.3, height * 0.03, PALETTE.danger);
  // description block
  for (let i = 0; i < 4; i++) {
    c.stripes(width * 0.08, height * 0.6 + i * height * 0.03, 28, 8, 2, 4, PALETTE.muted);
  }
  // CTA
  c.rect(width * 0.08, height * 0.8, width * 0.84, height * 0.055, PALETTE.accent);
  return c;
}

function screenCart(width, height, isDiff) {
  const c = baseLayout(width, height, PALETTE.success);
  c.stripes(width * 0.08, height * 0.09, 12, 12, 4, 8, PALETTE.card);
  // line items
  const items = isDiff ? 4 : 3;  // DIFF: one extra line item
  for (let i = 0; i < items; i++) {
    const y = height * (0.16 + i * 0.12);
    c.rect(width * 0.06, y, width * 0.88, height * 0.09, PALETTE.card);
    c.rect(width * 0.06, y, width * 0.88, height * 0.09, PALETTE.cardBorder);
    c.rect(width * 0.06 + 1, y + 1, width * 0.88 - 2, height * 0.09 - 2, PALETTE.card);
    c.rect(width * 0.1, y + height * 0.01, width * 0.14, height * 0.07,
      [50 + i * 45, 90, 150 - i * 20, 255]);
    c.stripes(width * 0.28, y + height * 0.02, 16, 8, 3, 4, PALETTE.text);
    c.stripes(width * 0.28, y + height * 0.05, 8, 8, 3, 4, PALETTE.success);
  }
  // total bar
  const totalY = height * 0.8;
  c.rect(width * 0.06, totalY, width * 0.88, height * 0.07, PALETTE.card);
  c.stripes(width * 0.1, totalY + height * 0.02, 8, 12, 4, 6, PALETTE.text);
  c.stripes(width * 0.7, totalY + height * 0.02, 6, 14, 5, 6, PALETTE.header);
  return c;
}

function screenSettings(width, height, isDiff) {
  const c = baseLayout(width, height, [100, 116, 139, 255]);
  c.stripes(width * 0.08, height * 0.09, 14, 10, 4, 8, PALETTE.card);
  // profile row
  c.rect(width * 0.06, height * 0.15, width * 0.88, height * 0.12, PALETTE.card);
  c.rect(width * 0.1, height * 0.165, width * 0.2, height * 0.09, PALETTE.accent);
  c.stripes(width * 0.34, height * 0.18, 16, 10, 4, 4, PALETTE.text);
  c.stripes(width * 0.34, height * 0.22, 10, 8, 3, 4, PALETTE.muted);
  // settings rows
  const rows = ['Notifications', 'Privacy', 'Security', 'Appearance', 'About'];
  for (let i = 0; i < rows.length; i++) {
    const y = height * (0.3 + i * 0.09);
    c.rect(width * 0.06, y, width * 0.88, height * 0.07, PALETTE.card);
    c.stripes(width * 0.1, y + height * 0.025, 14, 8, 3, 4, PALETTE.text);
    // toggle
    const on = isDiff ? (i % 2 === 1) : (i % 2 === 0); // DIFF: inverted toggles
    c.rect(width * 0.78, y + height * 0.02, width * 0.12, height * 0.03,
      on ? PALETTE.success : PALETTE.muted);
  }
  return c;
}

// ---------------------------------------------------------------------------
// PNG writing — one per capture
// ---------------------------------------------------------------------------

async function saveScreen(name, screenFn, { width, height, isDiff }) {
  const dir = path.join(os.tmpdir(), `percy-detox-smoke-${process.pid}`);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, `${name}-${Date.now()}.png`);
  const canvas = screenFn(width, height, isDiff);
  await fs.writeFile(filepath, canvas.toPng());
  return filepath;
}

function makeDevice({ platform, name, id, width, height, isDiff }, screenFn) {
  return {
    id, name,
    getPlatform: async () => platform,
    takeScreenshot: async (snapName) =>
      saveScreen(snapName || name, screenFn, { width, height, isDiff })
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const IOS_DEVICE = {
  platform: 'ios',
  name: 'iPhone 14 Pro',
  id: '00008120-0011445A3C0B801E',
  width: 1179,
  height: 2556
};

const ANDROID_DEVICE = {
  platform: 'android',
  name: 'Pixel 7',
  id: 'emulator-5554',
  width: 1080,
  height: 2400
};

async function capture(device, snapName, screenFn, extraOpts = {}) {
  const d = makeDevice({ ...device, isDiff: VARIANT === 'diff' }, screenFn);
  console.log(`  [${d.name}] ${snapName}`);
  const r = await percyScreenshot(d, snapName, {
    deviceName: d.name,
    osVersion: device.platform === 'ios' ? '17' : '14',
    orientation: 'portrait',
    testCase: 'detox-e2e',
    labels: `variant:${VARIANT}`,
    ...extraOpts
  });
  return r;
}

async function main() {
  console.log(`=== @percy/detox E2E — variant=${VARIANT} ===`);
  const enabled = await percyScreenshot.isPercyEnabled();
  console.log(`Percy enabled: ${enabled}`);
  if (!enabled) {
    console.error('Percy CLI daemon not running — wrap in `percy app:exec --`');
    process.exit(1);
  }

  // One screenshot per feature, paired across iOS + Android where it makes sense.
  console.log('\n[ Home ]');
  await capture(IOS_DEVICE,     'iOS | Home',           screenHome);
  await capture(ANDROID_DEVICE, 'Android | Home',       screenHome);

  console.log('\n[ Product list ]');
  await capture(IOS_DEVICE,     'iOS | Product List',   screenProductList);
  await capture(ANDROID_DEVICE, 'Android | Product List', screenProductList);

  console.log('\n[ Product detail ]');
  await capture(IOS_DEVICE,     'iOS | Product Detail', screenProductDetail, {
    customIgnoreRegions: [{ top: 0, bottom: 90, left: 0, right: IOS_DEVICE.width }]
  });
  await capture(ANDROID_DEVICE, 'Android | Product Detail', screenProductDetail);

  console.log('\n[ Cart ]');
  await capture(IOS_DEVICE,     'iOS | Cart',           screenCart);
  await capture(ANDROID_DEVICE, 'Android | Cart',       screenCart);

  console.log('\n[ Settings ]');
  await capture(IOS_DEVICE,     'iOS | Settings',       screenSettings);
  await capture(ANDROID_DEVICE, 'Android | Settings',   screenSettings);

  console.log(`\n=== done — variant=${VARIANT} ===`);
}

main().catch((e) => {
  console.error('E2E failed:', e);
  process.exit(1);
});
