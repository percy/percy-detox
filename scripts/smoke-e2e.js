#!/usr/bin/env node
/* eslint-disable no-console */
// End-to-end smoke test for @percy/detox.
//
// Bypasses the Detox runtime by passing a duck-typed fake `device` that returns
// a real PNG path from takeScreenshot(). Exercises the full SDK upload path
// (copy-to-tmp, PNG validation, metadata resolution, region scaling,
// postComparison against the Percy CLI daemon).
//
// Run under Percy CLI:
//   percy app:exec -- node scripts/smoke-e2e.js
//
// Requires PERCY_TOKEN in the environment.

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const percyScreenshot = require('..');

// CRC-32 table for PNG chunks (IEEE 802.3)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  }
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

// Generate a solid-color PNG — valid header, valid IDAT, valid IEND.
function makeSolidPng(width, height, [r, g, b, a] = [44, 99, 200, 255]) {
  const SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const base = y * rowSize;
    raw[base] = 0; // filter byte = None
    for (let x = 0; x < width; x++) {
      const off = base + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

async function writePng(name, width, height, rgba) {
  const dir = path.join(os.tmpdir(), `percy-detox-smoke-${process.pid}`);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, `${name}-${Date.now()}.png`);
  await fs.writeFile(filepath, makeSolidPng(width, height, rgba));
  return filepath;
}

function makeFakeDevice({ platform, width, height, rgba, deviceName, deviceId }) {
  return {
    id: deviceId,
    name: deviceName,
    getPlatform: async () => platform,
    takeScreenshot: async (name) => writePng(name || 'device', width, height, rgba)
  };
}

function makeFakeElement({ width, height, rgba }) {
  let frame = null;
  return {
    // Fake element frame (in points) — SDK scales by scaleFactor for regions.
    _frame: { x: 10, y: 20, width: 60, height: 40 },
    takeScreenshot: async (name) => writePng(name || 'element', width, height, rgba),
    getAttributes: async () => {
      frame = frame || { x: 10, y: 20, width: 60, height: 40 };
      return { frame };
    }
  };
}

async function main() {
  console.log('=== @percy/detox smoke test ===');
  console.log(`PERCY_TOKEN present: ${!!process.env.PERCY_TOKEN}`);
  console.log(`Node: ${process.version}, CWD: ${process.cwd()}`);

  const enabled = await percyScreenshot.isPercyEnabled();
  console.log(`Percy enabled: ${enabled}`);
  if (!enabled) {
    console.error('Percy CLI daemon is not running — wrap this script in `percy app:exec --`');
    process.exit(1);
  }

  // Synthetic "Android" device — 1080x1920 simulates a 3x-density screen
  const androidDevice = makeFakeDevice({
    platform: 'android',
    width: 300,
    height: 600,
    rgba: [33, 150, 243, 255], // blue
    deviceName: 'Synthetic Pixel 5 (Smoke)',
    deviceId: 'synthetic-android-0'
  });

  // Synthetic iOS device — PNG width 828 to test scaleFactor=2 branch
  const iosDevice = makeFakeDevice({
    platform: 'ios',
    width: 828,
    height: 1792,
    rgba: [76, 175, 80, 255], // green
    deviceName: 'Synthetic iPhone 11 (Smoke)',
    deviceId: 'synthetic-ios-0'
  });

  const iosElement = makeFakeElement({
    width: 200,
    height: 100,
    rgba: [244, 67, 54, 255] // red
  });

  // Capture 1: Android device-level
  console.log('\n--- capture #1: Android device screenshot ---');
  const r1 = await percyScreenshot(androidDevice, 'Smoke | Android | Home', {
    deviceName: 'Synthetic Pixel 5',
    osVersion: '14',
    orientation: 'portrait',
    statusBarHeight: 0,
    navigationBarHeight: 0,
    testCase: 'smoke',
    labels: 'e2e'
  });
  console.log(`  result: ${JSON.stringify(r1 || null)}`);

  // Capture 2: iOS device-level with custom ignore region (tests scaling)
  console.log('\n--- capture #2: iOS device screenshot + custom ignore region ---');
  const r2 = await percyScreenshot(iosDevice, 'Smoke | iOS | Home', {
    deviceName: 'Synthetic iPhone 11',
    osVersion: '17',
    orientation: 'portrait',
    customIgnoreRegions: [
      { top: 0, bottom: 50, left: 0, right: 200 }
    ],
    testCase: 'smoke',
    labels: 'e2e'
  });
  console.log(`  result: ${JSON.stringify(r2 || null)}`);

  // Capture 3: iOS element-level + element-based ignore region
  console.log('\n--- capture #3: iOS element screenshot + element region ---');
  const r3 = await percyScreenshot(iosElement, 'Smoke | iOS | Hero Element', {
    deviceName: 'Synthetic iPhone 11',
    osVersion: '17',
    ignoreRegionElements: [iosElement],
    testCase: 'smoke',
    labels: 'e2e'
  });
  console.log(`  result: ${JSON.stringify(r3 || null)}`);

  // Capture 4: fullPage:true — verifies warn-once + single-tile
  console.log('\n--- capture #4: fullPage:true (inert, warns once) ---');
  const r4 = await percyScreenshot(androidDevice, 'Smoke | Android | FullPage', {
    deviceName: 'Synthetic Pixel 5',
    osVersion: '14',
    fullPage: true,
    testCase: 'smoke',
    labels: 'e2e'
  });
  console.log(`  result: ${JSON.stringify(r4 || null)}`);

  console.log('\n=== smoke test complete ===');
}

main().catch((e) => {
  console.error('smoke test failed:', e);
  process.exit(1);
});
