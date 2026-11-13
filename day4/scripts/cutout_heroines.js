'use strict';

/**
 * Heroine transparent PNG preprocessor for POV Galgame.
 * Uses 4-edge seeded BFS flood fill + 1.5px Euclidean edge feathering
 * and white-halo decontamination so interior whites (lab coat, sclera, pearls,
 * silver scissors) stay 100% opaque while exterior white backdrops become alpha = 0.
 * Zero external npm dependencies required (uses built-in node:zlib + Python PIL/System.Drawing decode).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const HEROINES = [
  'heroine_lori',
  'heroine_alice',
  'heroine_kimberly',
  'heroine_zero',
  'heroine_lisa',
];

function decodeImageToRawRGBA(filePath) {
  const pyScript = [
    'import sys, struct',
    'from PIL import Image',
    'im = Image.open(sys.argv[1]).convert("RGBA")',
    'w, h = im.size',
    'sys.stdout.buffer.write(struct.pack("<II", w, h))',
    'sys.stdout.buffer.write(im.tobytes())',
  ].join('\n');

  try {
    const buf = execFileSync('python', ['-c', pyScript, filePath], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const width = buf.readUInt32LE(0);
    const height = buf.readUInt32LE(4);
    const rgba = Buffer.from(buf.subarray(8));
    if (rgba.length !== width * height * 4) {
      throw new Error(`Decoded byte length mismatch for ${filePath}`);
    }
    return { width, height, rgba };
  } catch (pyErr) {
    // Fallback on Windows using .NET System.Drawing
    const psScript = `
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('${filePath.replace(/'/g, "''")}')
$w = $bmp.Width
$h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$bmp32 = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp32)
$g.DrawImage($bmp, 0, 0, $w, $h)
$g.Dispose()
$bmp.Dispose()
$data = $bmp32.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($w * $h * 4)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp32.UnlockBits($data)
$bmp32.Dispose()
for ($i = 0; $i -lt $bytes.Length; $i += 4) {
  $b = $bytes[$i]; $g2 = $bytes[$i+1]; $r = $bytes[$i+2]; $a = $bytes[$i+3]
  $bytes[$i] = $r; $bytes[$i+1] = $g2; $bytes[$i+2] = $b; $bytes[$i+3] = $a
}
$hdr = [BitConverter]::GetBytes([uint32]$w) + [BitConverter]::GetBytes([uint32]$h)
$out = [System.Console]::OpenStandardOutput()
$out.Write($hdr, 0, 8)
$out.Write($bytes, 0, $bytes.Length)
`;
    const buf = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', psScript],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    const width = buf.readUInt32LE(0);
    const height = buf.readUInt32LE(4);
    const rgba = Buffer.from(buf.subarray(8));
    if (rgba.length !== width * height * 4) {
      throw pyErr;
    }
    return { width, height, rgba };
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // Filter type 0 (None)
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function floodFillCutout(width, height, rgba, options = {}) {
  const whiteThresh = options.whiteThresh ?? 234;
  const maxSpread = options.maxSpread ?? 24;
  const featherThresh = options.featherThresh ?? 206;
  const total = width * height;

  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function isOuterWhite(idx) {
    const o = idx * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return r >= whiteThresh && g >= whiteThresh && b >= whiteThresh && mx - mn <= maxSpread;
  }

  function trySeed(x, y) {
    const idx = y * width + x;
    if (!visited[idx] && isOuterWhite(idx)) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  }

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }
  if (Array.isArray(options.extraSeeds)) {
    for (const [sx, sy] of options.extraSeeds) {
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        trySeed(sx, sy);
      }
    }
  }

  // 4-neighbor BFS flood fill strictly from canvas borders
  while (head < tail) {
    const idx = queue[head++];
    isBg[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;

    if (x > 0) {
      const n = idx - 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (isOuterWhite(n)) queue[tail++] = n;
      }
    }
    if (x + 1 < width) {
      const n = idx + 1;
      if (!visited[n]) {
        visited[n] = 1;
        if (isOuterWhite(n)) queue[tail++] = n;
      }
    }
    if (y > 0) {
      const n = idx - width;
      if (!visited[n]) {
        visited[n] = 1;
        if (isOuterWhite(n)) queue[tail++] = n;
      }
    }
    if (y + 1 < height) {
      const n = idx + width;
      if (!visited[n]) {
        visited[n] = 1;
        if (isOuterWhite(n)) queue[tail++] = n;
      }
    }
  }

  // Output RGBA with 1.5px Euclidean edge feathering & white-fringe decontamination
  const out = Buffer.from(rgba);
  let bgCount = 0;

  const ringOffsets = [
    [-1, 0, 1.0], [1, 0, 1.0], [0, -1, 1.0], [0, 1, 1.0],
    [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414],
    [-2, 0, 2.0], [2, 0, 2.0], [0, -2, 2.0], [0, 2, 2.0],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const o = idx * 4;
      if (isBg[idx]) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        bgCount++;
        continue;
      }

      let minBgDist = 99;
      for (let k = 0; k < ringOffsets.length; k++) {
        const nx = x + ringOffsets[k][0];
        const ny = y + ringOffsets[k][1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && isBg[ny * width + nx]) {
          if (ringOffsets[k][2] < minBgDist) {
            minBgDist = ringOffsets[k][2];
          }
        }
      }

      if (minBgDist <= 1.5) {
        const r = out[o];
        const g = out[o + 1];
        const b = out[o + 2];
        const lum = (r + g + b) / 3;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        const localThresh = minBgDist <= 1.1 ? featherThresh : featherThresh + 18;

        if (lum >= localThresh && spread <= 36) {
          const t = (lum - localThresh) / Math.max(1, 255 - localThresh);
          const distScale = minBgDist <= 1.1 ? 1.0 : 0.58;
          const newAlpha = Math.max(0, Math.min(255, Math.round((1 - t * distScale) * 255)));
          out[o + 3] = newAlpha;
          // Decontaminate slight white fringe against dark backgrounds
          if (newAlpha > 0 && newAlpha < 235) {
            const aNorm = newAlpha / 255;
            out[o] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - aNorm) * 0.45) / Math.max(0.25, aNorm))));
            out[o + 1] = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - aNorm) * 0.45) / Math.max(0.25, aNorm))));
            out[o + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - aNorm) * 0.45) / Math.max(0.25, aNorm))));
          }
        }
      }
    }
  }

  return { out, bgRatio: ((bgCount / total) * 100).toFixed(1) };
}

const EXTRA_GAP_SEEDS = {
  // 人物手臂/发梢与躯干之间被闭合黑线框住的纯白背景孔洞（绝不影响白大褂与眼白）
  heroine_alice: [
    [304, 357],
    [628, 337],
    [268, 484],
    [622, 687],
    [568, 732],
  ],
  heroine_zero: [
    [303, 378],
    [273, 100],
    [710, 88],
    [735, 159],
  ],
};

function processAllHeroines(assetsDir) {
  const results = [];
  for (const name of HEROINES) {
    const src = path.join(assetsDir, `${name}.jpg`);
    const dst = path.join(assetsDir, `${name}.png`);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing source sprite: ${src}`);
    }
    const { width, height, rgba } = decodeImageToRawRGBA(src);
    const { out, bgRatio } = floodFillCutout(width, height, rgba, {
      extraSeeds: EXTRA_GAP_SEEDS[name] || [],
    });
    const pngBuf = encodePNG(width, height, out);
    fs.writeFileSync(dst, pngBuf);

    // Corner + center sanity check
    const corners = [
      out[3],
      out[(width - 1) * 4 + 3],
      out[((height - 1) * width) * 4 + 3],
      out[((height - 1) * width + (width - 1)) * 4 + 3],
    ];
    const centerIdx = (Math.floor(height * 0.5) * width + Math.floor(width * 0.5)) * 4 + 3;
    const centerAlpha = out[centerIdx];

    results.push({ name, width, height, bgRatio, corners, centerAlpha, bytes: pngBuf.length });
    console.log(
      `[Cutout] ${name}.png (${width}x${height}) | transparentBg=${bgRatio}% | cornerAlpha=[${corners.join(',')}] | centerAlpha=${centerAlpha} | ${(pngBuf.length / 1024).toFixed(1)} KB`
    );
  }
  return results;
}

if (require.main === module) {
  const day4Dir = path.dirname(__dirname);
  const assetsDir = path.join(day4Dir, 'assets');
  processAllHeroines(assetsDir);
}

module.exports = { processAllHeroines, floodFillCutout };
