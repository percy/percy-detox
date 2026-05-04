const { exec } = require('../../percy/util/exec');

describe('exec', () => {
  it('resolves with stdout/stderr buffers on success', async () => {
    const { stdout, stderr } = await exec('node', ['-e', 'process.stdout.write("hi"); process.stderr.write("err")']);
    expect(stdout.toString()).toBe('hi');
    expect(stderr.toString()).toBe('err');
  });

  it('rejects when command exits non-zero', async () => {
    await expectAsync(
      exec('node', ['-e', 'process.exit(1)'])
    ).toBeRejected();
  });

  it('rejects when command not found', async () => {
    await expectAsync(
      exec('this-command-does-not-exist-12345', [])
    ).toBeRejected();
  });

  it('uses defaults when args/options omitted', async () => {
    const { stdout, stderr } = await exec('node', ['-e', '']);
    expect(Buffer.isBuffer(stdout)).toBe(true);
    expect(Buffer.isBuffer(stderr)).toBe(true);
  });

  it('honors custom timeoutMs', async () => {
    await expectAsync(
      exec('node', ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 50 })
    ).toBeRejected();
  });

  it('falls through to default args array when only command given', async () => {
    // Hits `args = []` default branch
    await expectAsync(exec('true')).toBeResolved();
  });

  it('uses default options object when none passed', async () => {
    // Hits `{ ... } = {}` default branch
    const { stdout } = await exec('node', ['-e', 'process.stdout.write("x")']);
    expect(stdout.toString()).toBe('x');
  });

  it('honors custom maxBuffer option', async () => {
    await expectAsync(
      exec('node', ['-e', 'process.stdout.write("a".repeat(100))'], { maxBuffer: 10 })
    ).toBeRejected();
  });
});
