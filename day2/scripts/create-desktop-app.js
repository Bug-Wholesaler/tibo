const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

/**
 * Generate a 64x64 32-bit RGBA Windows .ico file (Energy Core HUD Icon)
 * Zero external image library dependencies.
 */
function generateEnergyCoreIco(outputPath) {
  const size = 64;
  const pixelBytes = size * size * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowBytes * size;
  const dibHeaderSize = 40;
  const imageSize = dibHeaderSize + pixelBytes + maskBytes;

  const buf = Buffer.alloc(6 + 16 + imageSize);
  // ICONDIR header
  buf.writeUInt16LE(0, 0); // Reserved
  buf.writeUInt16LE(1, 2); // Type: 1 = ICO
  buf.writeUInt16LE(1, 4); // Count: 1 image

  // ICONDIRENTRY
  buf.writeUInt8(size, 6);        // Width
  buf.writeUInt8(size, 7);        // Height
  buf.writeUInt8(0, 8);           // ColorCount
  buf.writeUInt8(0, 9);           // Reserved
  buf.writeUInt16LE(1, 10);       // Planes
  buf.writeUInt16LE(32, 12);      // BitCount (32-bit BGRA)
  buf.writeUInt32LE(imageSize, 14);
  buf.writeUInt32LE(22, 18);      // Offset to BMP data

  // BITMAPINFOHEADER (40 bytes)
  const dibOffset = 22;
  buf.writeUInt32LE(dibHeaderSize, dibOffset);
  buf.writeInt32LE(size, dibOffset + 4);
  buf.writeInt32LE(size * 2, dibOffset + 8); // Height * 2 (XOR + AND mask)
  buf.writeUInt16LE(1, dibOffset + 12);      // Planes
  buf.writeUInt16LE(32, dibOffset + 14);     // BitCount
  buf.writeUInt32LE(0, dibOffset + 16);      // Compression (BI_RGB)
  buf.writeUInt32LE(pixelBytes + maskBytes, dibOffset + 20);

  const pxOffset = dibOffset + dibHeaderSize;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  // BMP rows are stored bottom-up
  for (let y = 0; y < size; y++) {
    const bmpY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const p = pxOffset + (bmpY * size + x) * 4;

      if (r > 30.5) {
        // Transparent outside circle
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 0;
      } else if (r <= 9.5) {
        // Glowing white-cyan center core
        const t = r / 9.5;
        buf[p] = 255;                             // B
        buf[p + 1] = Math.round(255 - t * 30);    // G
        buf[p + 2] = Math.round(255 - t * 140);   // R
        buf[p + 3] = 255;                         // A
      } else if (r >= 17.5 && r <= 23.0) {
        // Outer cyan-emerald energy ring
        buf[p] = 248;   // B
        buf[p + 1] = 189; // G
        buf[p + 2] = 56;  // R
        buf[p + 3] = 250; // A
      } else if (r >= 12.0 && r <= 15.0) {
        // Inner purple-indigo ring
        buf[p] = 247;   // B
        buf[p + 1] = 85;  // G
        buf[p + 2] = 168; // R
        buf[p + 3] = 235; // A
      } else {
        // Deep space dark slate disc
        const edgeAlpha = r > 29 ? Math.max(0, Math.round((30.5 - r) * 160)) : 245;
        buf[p] = 35;      // B
        buf[p + 1] = 20;  // G
        buf[p + 2] = 12;  // R
        buf[p + 3] = edgeAlpha;
      }
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  return outputPath;
}

function createWindowsShortcuts(appRoot) {
  if (process.platform !== 'win32') return [];
  let electronExe;
  try {
    electronExe = require('electron');
  } catch {
    return [];
  }

  const desktopDir = path.join(os.homedir(), 'Desktop');
  const desktopShortcut = fs.existsSync(desktopDir)
    ? path.join(desktopDir, 'YPod.lnk')
    : null;

  const targets = [desktopShortcut].filter(Boolean);
  for (const lnkPath of targets) {
    const psScript = [
      `$ws = New-Object -ComObject WScript.Shell`,
      `$s = $ws.CreateShortcut('${lnkPath.replace(/'/g, "''")}')`,
      `$s.TargetPath = '${electronExe.replace(/'/g, "''")}'`,
      `$s.Arguments = '"${appRoot}"'`,
      `$s.WorkingDirectory = '${appRoot.replace(/'/g, "''")}'`,
      `$s.IconLocation = '${electronExe.replace(/'/g, "''")},0'`,
      `$s.Description = 'YPod - 桌面 AI 监工悬浮舱'`,
      `$s.Save()`
    ].join('; ');
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch {}
  }
  return targets;
}

function buildStandalonePortableApp(appRoot) {
  let electronExe;
  try {
    electronExe = require('electron');
  } catch {
    throw new Error('Electron runtime not found in node_modules');
  }

  const electronDistDir = path.dirname(electronExe);
  const outDir = path.join(appRoot, 'dist', 'YPod-Portable');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(electronDistDir, outDir, { recursive: true });

  // Remove default_app.asar so Electron loads resources/app directly
  const defaultAsar = path.join(outDir, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultAsar)) {
    fs.rmSync(defaultAsar, { force: true });
  }

  // Copy application source files into resources/app
  const targetAppDir = path.join(outDir, 'resources', 'app');
  fs.mkdirSync(targetAppDir, { recursive: true });
  for (const item of ['package.json', 'main.js', 'preload.js', 'LICENSE', 'README.md', 'src', 'ui', 'build', 'bin']) {
    const srcItem = path.join(appRoot, item);
    if (fs.existsSync(srcItem)) {
      fs.cpSync(srcItem, path.join(targetAppDir, item), { recursive: true });
    }
  }

  // Rename electron.exe -> YPod.exe
  const oldExe = path.join(outDir, process.platform === 'win32' ? 'electron.exe' : 'electron');
  const newExe = path.join(outDir, process.platform === 'win32' ? 'YPod.exe' : 'YPod');
  if (fs.existsSync(oldExe)) {
    fs.renameSync(oldExe, newExe);
  }
  return newExe;
}

if (require.main === module) {
  const appRoot = path.resolve(__dirname, '..');
  const iconPath = path.join(appRoot, 'build', 'icon.ico');
  const extractPsScript = path.join(__dirname, 'extract-original-icon.ps1');

  // Ensure original default icon is extracted
  if (!fs.existsSync(iconPath)) {
    try {
      if (fs.existsSync(extractPsScript)) {
        execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', extractPsScript], {
          stdio: 'inherit'
        });
      }
    } catch {}
  }

  const wantPortable = process.argv.includes('--portable');
  const wantShortcut = process.argv.includes('--shortcut') || !wantPortable;

  if (wantPortable) {
    const portableExe = buildStandalonePortableApp(appRoot);
    console.log('[YPod Build] Built standalone portable executable:', portableExe);
  }
  if (wantShortcut) {
    const created = createWindowsShortcuts(appRoot);
    console.log('[YPod Build] Refreshed native shortcuts:', created);
  }
  console.log('[YPod Build] Using application icon:', iconPath);
}

module.exports = { generateEnergyCoreIco, createWindowsShortcuts, buildStandalonePortableApp };
