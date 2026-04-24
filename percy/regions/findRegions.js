const log = require('../util/log');

function defaultGetDetox() {
  try {
    return require('detox');
  } catch {
    return null;
  }
}

async function findRegions({ kind, scaleFactor, options }, deps = {}) {
  const getDetox = deps.getDetox || defaultGetDetox;
  const detox = getDetox();

  const prefix = kind;
  const ids = options[`${prefix}RegionIds`] || [];
  const elements = options[`${prefix}RegionElements`] || [];
  const customKey = `custom${capitalize(prefix)}Regions`;
  const custom = options[customKey] || [];
  const out = [];

  for (const id of ids) {
    try {
      if (!detox || typeof detox.element !== 'function' || !detox.by || typeof detox.by.id !== 'function') {
        log.info(`Detox module unavailable; cannot resolve ${prefix}RegionIds id '${id}'`);
        continue;
      }
      const attrs = await detox.element(detox.by.id(id)).getAttributes();
      const frame = extractFrame(attrs, `id: ${id}`);
      if (frame) out.push(frameToRegion(`id: ${id}`, frame, scaleFactor));
    } catch (e) {
      log.info(`Detox id '${id}' not resolvable: ${e.message}`);
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    try {
      if (!el || typeof el.getAttributes !== 'function') {
        log.info(`${prefix}RegionElements[${i}] is not a Detox element (missing getAttributes); skipping`);
        continue;
      }
      const attrs = await el.getAttributes();
      const frame = extractFrame(attrs, `element[${i}]`);
      if (frame) out.push(frameToRegion(`element[${i}]`, frame, scaleFactor));
    } catch (e) {
      log.info(`${prefix}RegionElements[${i}] getAttributes failed: ${e.message}`);
    }
  }

  for (const rect of custom) {
    if (!isValidRect(rect)) {
      log.info(`${customKey}: invalid rect; skipping`);
      continue;
    }
    out.push({
      selector: 'custom',
      coOrdinates: {
        top: rect.top * scaleFactor,
        bottom: rect.bottom * scaleFactor,
        left: rect.left * scaleFactor,
        right: rect.right * scaleFactor
      }
    });
  }

  return out;
}

function extractFrame(attrs, label) {
  if (!attrs || typeof attrs !== 'object') return null;

  // Detox iOS returns `{ elements: [...] }` on matcher multi-match or when
  // atIndex is unsupported (wix/Detox#4633). Android returns a flat object.
  if (Array.isArray(attrs.elements)) {
    if (attrs.elements.length === 0) {
      log.info(`${label}: multi-match returned zero items; skipping`);
      return null;
    }
    if (attrs.elements.length > 1) {
      log.warn(`${label}: multi-match (${attrs.elements.length} items); using [0]`);
    }
    const first = attrs.elements[0];
    return first && first.frame ? first.frame : null;
  }
  return attrs.frame || null;
}

function frameToRegion(selector, frame, scaleFactor) {
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return {
    selector,
    coOrdinates: {
      top: toPixel(frame.y) * s,
      bottom: (toPixel(frame.y) + toPixel(frame.height)) * s,
      left: toPixel(frame.x) * s,
      right: (toPixel(frame.x) + toPixel(frame.width)) * s
    }
  };
}

function toPixel(v) {
  return Number.isFinite(v) ? v : 0;
}

function isValidRect(rect) {
  return (
    rect &&
    typeof rect === 'object' &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right)
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { findRegions, extractFrame, frameToRegion, isValidRect };
