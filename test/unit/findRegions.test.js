const { findRegions, extractFrame, frameToRegion, isValidRect } =
  require('../../percy/regions/findRegions');

function makeDetox(map = {}) {
  return {
    by: { id: (id) => ({ __id: id }) },
    element: (matcher) => ({
      getAttributes: async () => {
        const id = matcher && matcher.__id;
        const entry = map[id];
        if (!entry) throw new Error(`element '${id}' not found`);
        if (typeof entry === 'function') return entry();
        return entry;
      }
    })
  };
}

describe('findRegions', () => {
  it('resolves id-based regions and scales by scaleFactor', async () => {
    const detox = makeDetox({
      hero: { frame: { x: 10, y: 20, width: 100, height: 50 } }
    });
    const regions = await findRegions(
      { kind: 'ignore', scaleFactor: 2, options: { ignoreRegionIds: ['hero'] } },
      { getDetox: () => detox }
    );
    expect(regions.length).toBe(1);
    expect(regions[0].selector).toBe('id: hero');
    expect(regions[0].coOrdinates).toEqual({
      top: 40, left: 20, bottom: 140, right: 220
    });
  });

  it('skips missing ids without throwing', async () => {
    const detox = makeDetox({});
    const regions = await findRegions(
      { kind: 'ignore', scaleFactor: 2, options: { ignoreRegionIds: ['nope'] } },
      { getDetox: () => detox }
    );
    expect(regions).toEqual([]);
  });

  it('handles element-handle regions', async () => {
    const el = {
      getAttributes: async () => ({ frame: { x: 0, y: 0, width: 50, height: 50 } })
    };
    const regions = await findRegions(
      { kind: 'consider', scaleFactor: 1, options: { considerRegionElements: [el] } },
      { getDetox: () => null }
    );
    expect(regions.length).toBe(1);
    expect(regions[0].selector).toBe('element[0]');
  });

  it('skips element handles that are not Detox elements', async () => {
    const regions = await findRegions(
      {
        kind: 'ignore',
        scaleFactor: 1,
        options: { ignoreRegionElements: [null, { foo: 'bar' }, 42] }
      },
      { getDetox: () => null }
    );
    expect(regions).toEqual([]);
  });

  it('scales custom regions by scaleFactor', async () => {
    const regions = await findRegions(
      {
        kind: 'ignore',
        scaleFactor: 3,
        options: {
          customIgnoreRegions: [{ top: 10, bottom: 20, left: 5, right: 15 }]
        }
      },
      { getDetox: () => null }
    );
    expect(regions).toEqual([{
      selector: 'custom',
      coOrdinates: { top: 30, bottom: 60, left: 15, right: 45 }
    }]);
  });

  it('skips invalid custom rects', async () => {
    const regions = await findRegions(
      {
        kind: 'ignore',
        scaleFactor: 1,
        options: {
          customIgnoreRegions: [
            { top: 'x', bottom: 1, left: 0, right: 10 },
            null,
            { top: NaN, bottom: 0, left: 0, right: 0 }
          ]
        }
      },
      { getDetox: () => null }
    );
    expect(regions).toEqual([]);
  });

  it('uses consider prefix for customConsiderRegions', async () => {
    const regions = await findRegions(
      {
        kind: 'consider',
        scaleFactor: 2,
        options: {
          customConsiderRegions: [{ top: 1, bottom: 2, left: 3, right: 4 }]
        }
      },
      { getDetox: () => null }
    );
    expect(regions.length).toBe(1);
    expect(regions[0].coOrdinates.top).toBe(2);
  });

  it('returns empty array when no options given', async () => {
    const regions = await findRegions(
      { kind: 'ignore', scaleFactor: 2, options: {} },
      { getDetox: () => null }
    );
    expect(regions).toEqual([]);
  });
});

describe('extractFrame', () => {
  it('returns attrs.frame on flat Android shape', () => {
    const frame = extractFrame({ frame: { x: 1, y: 2, width: 3, height: 4 } }, 'test');
    expect(frame).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('returns null for null attrs', () => {
    expect(extractFrame(null, 'test')).toBeNull();
  });

  it('returns null when attrs has no frame', () => {
    expect(extractFrame({}, 'test')).toBeNull();
  });

  it('handles iOS multi-match by using elements[0]', () => {
    const attrs = {
      elements: [
        { frame: { x: 0, y: 0, width: 10, height: 10 } },
        { frame: { x: 100, y: 100, width: 10, height: 10 } }
      ]
    };
    const frame = extractFrame(attrs, 'test');
    expect(frame).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('returns null when elements is empty array', () => {
    expect(extractFrame({ elements: [] }, 'test')).toBeNull();
  });

  it('returns null when elements[0] has no frame', () => {
    expect(extractFrame({ elements: [{}] }, 'test')).toBeNull();
  });
});

describe('frameToRegion', () => {
  it('produces correct coordinates', () => {
    const region = frameToRegion('id: x', { x: 10, y: 20, width: 30, height: 40 }, 2);
    expect(region).toEqual({
      selector: 'id: x',
      coOrdinates: { top: 40, left: 20, bottom: 120, right: 80 }
    });
  });

  it('defaults scaleFactor to 1 when invalid', () => {
    const region = frameToRegion('x', { x: 1, y: 2, width: 3, height: 4 }, 0);
    expect(region.coOrdinates.left).toBe(1);
  });
});

describe('isValidRect', () => {
  it('accepts finite numbers', () => {
    expect(isValidRect({ top: 1, bottom: 2, left: 3, right: 4 })).toBe(true);
  });
  it('rejects missing fields', () => {
    expect(isValidRect({ top: 1, bottom: 2 })).toBe(false);
  });
  it('rejects NaN / Infinity', () => {
    expect(isValidRect({ top: NaN, bottom: 0, left: 0, right: 0 })).toBe(false);
    expect(isValidRect({ top: Infinity, bottom: 0, left: 0, right: 0 })).toBe(false);
  });
});
