#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const appRoot = path.resolve(__dirname, '..');

if (process.argv.includes('--server-only')) {
  require(path.join(appRoot, 'src', 'server.js'));
} else {
  let electronBin;
  try {
    electronBin = require('electron');
  } catch {
    console.error('[YPod] Electron binary not found. Run `npm install` first.');
    process.exit(1);
  }

  const child = spawn(electronBin, [appRoot], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}
