const { TimeIt } = require('../../percy/util/timing');

describe('TimeIt', () => {
  beforeEach(() => {
    TimeIt.reset();
    TimeIt.enabled = false;
  });

  afterAll(() => {
    TimeIt.reset();
    TimeIt.enabled = false;
  });

  it('passes through return value when disabled and does not record', async () => {
    TimeIt.enabled = false;
    const result = await TimeIt.run('disabled', async () => 'ok');
    expect(result).toBe('ok');
    expect(TimeIt.data.disabled).toBeUndefined();
  });

  it('records elapsed time when enabled and returns value', async () => {
    TimeIt.enabled = true;
    const result = await TimeIt.run('enabled', async () => 42);
    expect(result).toBe(42);
    expect(TimeIt.data.enabled.length).toBe(1);
    expect(TimeIt.data.enabled[0]).toBeGreaterThanOrEqual(0);
  });

  it('records elapsed time even when func throws, then rethrows', async () => {
    TimeIt.enabled = true;
    await expectAsync(
      TimeIt.run('throws', async () => { throw new Error('boom'); })
    ).toBeRejectedWithError('boom');
    expect(TimeIt.data.throws.length).toBe(1);
  });

  it('appends to existing store on repeat runs', async () => {
    TimeIt.enabled = true;
    await TimeIt.run('repeat', async () => 1);
    await TimeIt.run('repeat', async () => 2);
    expect(TimeIt.data.repeat.length).toBe(2);
  });

  it('computes min/max/avg over recorded values', () => {
    TimeIt.data.metric = [10, 20, 30];
    expect(TimeIt.min('metric')).toBe(10);
    expect(TimeIt.max('metric')).toBe(30);
    expect(TimeIt.avg('metric')).toBe(20);
  });

  it('summary returns aggregate per store and includes vals when asked', () => {
    TimeIt.data.a = [1, 3];
    TimeIt.data.b = [5];
    const s = TimeIt.summary();
    expect(s.a).toEqual({ min: 1, max: 3, avg: 2, count: 2 });
    expect(s.b).toEqual({ min: 5, max: 5, avg: 5, count: 1 });
    expect(s.a.vals).toBeUndefined();

    const withVals = TimeIt.summary({ includeVals: true });
    expect(withVals.a.vals).toEqual([1, 3]);
  });

  it('reset clears all recorded data', () => {
    TimeIt.data.x = [1, 2];
    TimeIt.reset();
    expect(TimeIt.data).toEqual({});
  });
});
