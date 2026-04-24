const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { copyToSdkTmp, validatePng, PNG_MAGIC } = require('../../percy/util/tmp');

const PNG_HEADER = Buffer.concat([
  PNG_MAGIC,
  Buffer.from([0x0D, 0x0A, 0x1A, 0x0A]), // rest of PNG signature
  Buffer.from([0x00, 0x00, 0x00, 0x0D]), // IHDR length
  Buffer.from('IHDR'),
  Buffer.from([0x00, 0x00, 0x02, 0xEE]), // width = 750
  Buffer.from([0x00, 0x00, 0x05, 0x36]), // height = 1334
  Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]) // bit depth etc.
]);

function mkTmpFile(prefix, content) {
  const p = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return fs.writeFile(p, content).then(() => p);
}

describe('copyToSdkTmp', () => {
  it('copies a valid PNG to a fresh tmp path', async () => {
    const src = await mkTmpFile('src', PNG_HEADER);
    const dst = await copyToSdkTmp(src);
    expect(dst).not.toBe(src);
    expect(dst).toMatch(/percy-detox-/);
    const copied = await fs.readFile(dst);
    expect(copied.equals(PNG_HEADER)).toBe(true);
    await fs.unlink(src).catch(() => {});
    await fs.unlink(dst).catch(() => {});
  });

  it('throws when source is missing', async () => {
    await expectAsync(copyToSdkTmp('/nonexistent/path.png'))
      .toBeRejectedWithError(/ENOENT|no such file/i);
  });

  it('throws when source is empty', async () => {
    const src = await mkTmpFile('empty', Buffer.alloc(0));
    await expectAsync(copyToSdkTmp(src)).toBeRejectedWithError(/missing or empty/);
    await fs.unlink(src).catch(() => {});
  });

  it('throws when rawPath is not a string', async () => {
    await expectAsync(copyToSdkTmp(null)).toBeRejectedWithError(/missing or not a string/);
    await expectAsync(copyToSdkTmp(undefined)).toBeRejectedWithError(/missing or not a string/);
    await expectAsync(copyToSdkTmp(42)).toBeRejectedWithError(/missing or not a string/);
  });
});

describe('validatePng', () => {
  it('accepts a valid PNG header', async () => {
    const p = await mkTmpFile('png', PNG_HEADER);
    await expectAsync(validatePng(p)).toBeResolvedTo(true);
    await fs.unlink(p).catch(() => {});
  });

  it('rejects a non-PNG file', async () => {
    const p = await mkTmpFile('jpg', Buffer.from('not a png at all'));
    await expectAsync(validatePng(p)).toBeRejectedWithError(/bad magic/);
    await fs.unlink(p).catch(() => {});
  });

  it('rejects an empty file', async () => {
    const p = await mkTmpFile('empty2', Buffer.alloc(0));
    await expectAsync(validatePng(p)).toBeRejectedWithError(/too small/);
    await fs.unlink(p).catch(() => {});
  });
});
