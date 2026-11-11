const fs = require('fs');
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const { createSupervisorServer, DEFAULT_PORT } = require('./src/server');

let mainWindow = null;
let tray = null;
let supervisor = null;
let isPinned = true;
let edgeWatchTimer = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    wakeupFloatingPod();
  });
}

function getAppIcon() {
  const iconPng = path.join(__dirname, 'build', 'icon.png');
  const iconIco = path.join(__dirname, 'build', 'icon.ico');
  try {
    if (fs.existsSync(iconPng)) {
      const img = nativeImage.createFromPath(iconPng);
      if (!img.isEmpty()) return img;
    }
    if (fs.existsSync(iconIco)) {
      const img = nativeImage.createFromPath(iconIco);
      if (!img.isEmpty()) return img;
    }
  } catch {}
  return createPodNativeIcon();
}

function createPodNativeIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 15.5;
  const cy = 15.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (r <= 5.2) {
        // Bright cyan-white energy core (BGRA on Windows / RGBA via createFromBitmap)
        buf[idx] = 255;     // B
        buf[idx + 1] = 240; // G
        buf[idx + 2] = 120; // R
        buf[idx + 3] = 255; // A
      } else if (r >= 9.0 && r <= 12.6) {
        // Outer glowing cyan ring
        buf[idx] = 248;     // B
        buf[idx + 1] = 189; // G
        buf[idx + 2] = 56;  // R
        buf[idx + 3] = 245; // A
      } else if (r < 14.5) {
        // Dark slate background circle
        buf[idx] = 38;
        buf[idx + 1] = 23;
        buf[idx + 2] = 15;
        buf[idx + 3] = 220;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function wakeupFloatingPod() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  if (dockState.collapsed) {
    expandFromEdge(3500);
  }
  mainWindow.focus();
}

function togglePodHotKey() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (dockState.collapsed) {
    wakeupFloatingPod();
  } else if (dockState.edge && mainWindow.isFocused()) {
    collapseToEdge();
  } else {
    wakeupFloatingPod();
  }
}

function toggleRightEdgeDock() {
  if (!mainWindow || mainWindow.isDestroyed()) return dockState;
  const wa = getWorkAreaForWindow();
  const b = mainWindow.getBounds();

  if (dockState.edge) {
    if (dockState.collapsed) {
      expandFromEdge(1000);
    }
    dockState.edge = null;
    dockState.collapsed = false;
    try {
      mainWindow.setBounds({
        x: Math.min(b.x, wa.x + wa.width - POD_WIDTH - 36),
        y: Math.max(wa.y + 28, b.y),
        width: POD_WIDTH,
        height: lastExpandedHeight
      });
    } catch {}
    sendEdgeDockState();
    updateTrayMenu();
    return { edge: null, collapsed: false };
  }

  dockState.edge = 'right';
  dockState.savedX = wa.x + wa.width - POD_WIDTH - 4;
  dockState.savedY = b.y;
  dockState.lastCursorInsideAt = Date.now();
  dockState.holdUntil = Date.now() + 900;
  try {
    mainWindow.setBounds({
      x: dockState.savedX,
      y: dockState.savedY,
      width: POD_WIDTH,
      height: lastExpandedHeight
    });
  } catch {}
  sendEdgeDockState();
  updateTrayMenu();
  return { edge: dockState.edge, collapsed: dockState.collapsed };
}

function updateTrayMenu() {
  if (!tray) return;
  let openAtLogin = false;
  try {
    openAtLogin = Boolean(app.getLoginItemSettings().openAtLogin);
  } catch {}

  const menu = Menu.buildFromTemplate([
    {
      label: '🛸 唤醒 / 展开 YPod (Alt+Shift+Y)',
      click: () => wakeupFloatingPod()
    },
    {
      label: dockState.edge ? '🧲 解除屏幕边缘贴边隐藏' : '🧲 开启右侧边缘贴边隐藏',
      click: () => toggleRightEdgeDock()
    },
    {
      label: '📌 窗口始终置顶',
      type: 'checkbox',
      checked: isPinned,
      click: (item) => {
        isPinned = item.checked;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(isPinned, isPinned ? 'floating' : 'normal');
        }
      }
    },
    {
      label: '🚀 开机自动启动',
      type: 'checkbox',
      checked: openAtLogin,
      click: (item) => {
        try {
          app.setLoginItemSettings({ openAtLogin: item.checked });
        } catch {}
      }
    },
    { type: 'separator' },
    {
      label: '❌ 彻底退出 YPod',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function setupSystemTray(iconImg) {
  try {
    tray = new Tray(iconImg);
    tray.setToolTip('YPod · 桌面 AI 监工悬浮舱');
    tray.on('click', () => wakeupFloatingPod());
    updateTrayMenu();
  } catch {}
}

const POD_WIDTH = 530;
const EDGE_SNAP_DIST = 18;
const EDGE_UNSNAP_DIST = 30;
const STRIP_THICKNESS = 14;
const STRIP_LENGTH_VERT = 176;
const STRIP_LENGTH_HORIZ = 220;

let lastExpandedHeight = 310;
const dockState = {
  edge: null, // 'right' | 'left' | 'top' | null
  collapsed: false,
  forceOpen: false,
  holdUntil: 0,
  lastCursorInsideAt: Date.now(),
  savedX: 0,
  savedY: 28
};

function sendEdgeDockState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('edge-dock-state', {
      edge: dockState.edge,
      collapsed: dockState.collapsed
    });
  } catch {}
}

function getWorkAreaForWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return screen.getPrimaryDisplay().workArea;
  }
  const b = mainWindow.getBounds();
  return screen.getDisplayMatching(b).workArea;
}

function collapseToEdge() {
  if (!mainWindow || mainWindow.isDestroyed() || !dockState.edge || dockState.collapsed) return;
  const b = mainWindow.getBounds();
  const wa = getWorkAreaForWindow();

  dockState.savedX = b.x;
  dockState.savedY = b.y;
  dockState.collapsed = true;
  sendEdgeDockState();

  try {
    if (dockState.edge === 'right') {
      const stripY = Math.max(
        wa.y + 16,
        Math.min(wa.y + wa.height - STRIP_LENGTH_VERT - 16, b.y + 20)
      );
      mainWindow.setBounds({
        x: wa.x + wa.width - STRIP_THICKNESS,
        y: stripY,
        width: STRIP_THICKNESS,
        height: STRIP_LENGTH_VERT
      });
    } else if (dockState.edge === 'left') {
      const stripY = Math.max(
        wa.y + 16,
        Math.min(wa.y + wa.height - STRIP_LENGTH_VERT - 16, b.y + 20)
      );
      mainWindow.setBounds({
        x: wa.x,
        y: stripY,
        width: STRIP_THICKNESS,
        height: STRIP_LENGTH_VERT
      });
    } else if (dockState.edge === 'top') {
      const stripX = Math.max(
        wa.x + 20,
        Math.min(
          wa.x + wa.width - STRIP_LENGTH_HORIZ - 20,
          b.x + Math.round((POD_WIDTH - STRIP_LENGTH_HORIZ) / 2)
        )
      );
      mainWindow.setBounds({
        x: stripX,
        y: wa.y,
        width: STRIP_LENGTH_HORIZ,
        height: STRIP_THICKNESS
      });
    }
  } catch {}
}

function expandFromEdge(holdMs = 700) {
  if (!mainWindow || mainWindow.isDestroyed() || !dockState.collapsed) return;
  const wa = getWorkAreaForWindow();
  dockState.collapsed = false;
  dockState.lastCursorInsideAt = Date.now();
  dockState.holdUntil = Math.max(dockState.holdUntil, Date.now() + holdMs);
  sendEdgeDockState();

  try {
    let targetX = dockState.savedX;
    let targetY = dockState.savedY;
    if (dockState.edge === 'right') {
      targetX = wa.x + wa.width - POD_WIDTH - 4;
    } else if (dockState.edge === 'left') {
      targetX = wa.x + 4;
    } else if (dockState.edge === 'top') {
      targetY = wa.y + 4;
    }
    mainWindow.setBounds({
      x: targetX,
      y: targetY,
      width: POD_WIDTH,
      height: lastExpandedHeight
    });
  } catch {}
}

function startEdgeWatcher() {
  if (edgeWatchTimer) clearInterval(edgeWatchTimer);
  edgeWatchTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;

    const b = mainWindow.getBounds();
    const wa = getWorkAreaForWindow();
    const cursor = screen.getCursorScreenPoint();

    if (dockState.collapsed) {
      const hoverPad = 6;
      const isHoveringStrip =
        cursor.x >= b.x - hoverPad &&
        cursor.x <= b.x + b.width + hoverPad &&
        cursor.y >= b.y - hoverPad &&
        cursor.y <= b.y + b.height + hoverPad;

      if (isHoveringStrip || dockState.forceOpen) {
        expandFromEdge(650);
      }
      return;
    }

    // Detect magnetic edge proximity when expanded
    const distRight = wa.x + wa.width - (b.x + b.width);
    const distLeft = b.x - wa.x;
    const distTop = b.y - wa.y;

    let detectedEdge = dockState.edge;
    if (distRight <= EDGE_SNAP_DIST) {
      detectedEdge = 'right';
    } else if (distLeft <= EDGE_SNAP_DIST) {
      detectedEdge = 'left';
    } else if (distTop <= 12) {
      detectedEdge = 'top';
    } else if (
      distRight > EDGE_UNSNAP_DIST &&
      distLeft > EDGE_UNSNAP_DIST &&
      distTop > 22
    ) {
      detectedEdge = null;
    }

    if (detectedEdge !== dockState.edge) {
      dockState.edge = detectedEdge;
      dockState.lastCursorInsideAt = Date.now();
      sendEdgeDockState();
      updateTrayMenu();
    }

    if (!dockState.edge || dockState.forceOpen || Date.now() < dockState.holdUntil) {
      dockState.lastCursorInsideAt = Date.now();
      return;
    }

    const pad = 14;
    const insideExpanded =
      cursor.x >= b.x - pad &&
      cursor.x <= b.x + b.width + pad &&
      cursor.y >= b.y - pad &&
      cursor.y <= b.y + b.height + pad;

    if (insideExpanded) {
      dockState.lastCursorInsideAt = Date.now();
    } else if (Date.now() - dockState.lastCursorInsideAt > 480) {
      collapseToEdge();
    }
  }, 90);
}

async function createFloatingPodWindow(port) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const iconImg = getAppIcon();

  mainWindow = new BrowserWindow({
    title: 'YPod',
    icon: iconImg,
    width: POD_WIDTH,
    height: 310,
    x: Math.max(20, screenWidth - POD_WIDTH - 24),
    y: 28,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupSystemTray(iconImg);
  mainWindow.setAlwaysOnTop(true, 'floating');
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.show();
  mainWindow.focus();
  startEdgeWatcher();
}

ipcMain.handle('set-pod-height', (_event, targetHeight) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const h = Math.max(96, Math.min(700, Math.ceil(Number(targetHeight) || 300)));
  if (dockState.collapsed) return;
  lastExpandedHeight = h;
  try {
    mainWindow.setContentSize(POD_WIDTH, h);
  } catch {}
});

ipcMain.handle('set-window-mode', (_event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const fallbackH = mode === 'capsule' ? 104 : 310;
  lastExpandedHeight = fallbackH;
  if (!dockState.collapsed) {
    try {
      mainWindow.setContentSize(POD_WIDTH, fallbackH);
    } catch {}
  }
  return { mode };
});

ipcMain.handle('toggle-edge-dock', () => {
  return toggleRightEdgeDock();
});

ipcMain.handle('notify-edge-event', (_event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dockState.forceOpen = Boolean(payload.sticky);
  if (payload.wakeup) {
    dockState.holdUntil = Math.max(dockState.holdUntil, Date.now() + (payload.holdMs || 4200));
    if (dockState.collapsed) {
      expandFromEdge(payload.holdMs || 4200);
    }
  }
  return { edge: dockState.edge, collapsed: dockState.collapsed };
});

ipcMain.handle('toggle-pin', () => {
  if (!mainWindow) return { isPinned };
  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(isPinned, isPinned ? 'floating' : 'normal');
  return { isPinned };
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('alert-attention', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  dockState.forceOpen = true;
  dockState.holdUntil = Date.now() + 8000;
  if (dockState.collapsed) {
    expandFromEdge(8000);
  }
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  setTimeout(() => {
    if (mainWindow && isPinned) mainWindow.setAlwaysOnTop(true, 'floating');
  }, 3500);
});

app.whenReady().then(async () => {
  supervisor = createSupervisorServer({ port: DEFAULT_PORT });
  const { port } = await supervisor.start();
  await createFloatingPodWindow(port);

  try {
    globalShortcut.register('Alt+Shift+Y', () => togglePodHotKey());
  } catch {}
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {}
});

app.on('window-all-closed', () => {
  if (edgeWatchTimer) clearInterval(edgeWatchTimer);
  if (supervisor) supervisor.stop();
  app.quit();
});
