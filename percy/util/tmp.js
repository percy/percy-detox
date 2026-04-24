const fs = require('fs/promises');
const tmp = require('tmp');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47]);

function tmpFilePath() {
  return new Promise((resolve, reject) => {
    tmp.file(
      {
        mode: 0o644,
        prefix: 'percy-detox-',
        postfix: '.png',
        discardDescriptor: true
      },
      (err, path) => {
        if (err) return reject(err);
        resolve(path);
      }
    );
  });
}

async function copyToSdkTmp(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('copyToSdkTmp: source path is missing or not a string');
  }
  const stat = await fs.stat(rawPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`copyToSdkTmp: source is missing or empty: ${rawPath}`);
  }
  const dst = await tmpFilePath();
  await fs.copyFile(rawPath, dst);
  return dst;
}

async function validatePng(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size < 4) {
    throw new Error(`validatePng: file too small: ${filePath}`);
  }
  const fh = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    await fh.read(header, 0, 4, 0);
    if (!header.equals(PNG_MAGIC)) {
      throw new Error(`validatePng: not a PNG (bad magic bytes): ${filePath}`);
    }
  } finally {
    await fh.close();
  }
  return true;
}

module.exports = { copyToSdkTmp, validatePng, PNG_MAGIC };
