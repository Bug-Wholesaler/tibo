const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ypodDesktop', {
  isElectron: true,
  setWindowMode: (mode) => ipcRenderer.invoke('set-window-mode', mode),
  setPodHeight: (height) => ipcRenderer.invoke('set-pod-height', height),
  togglePin: () => ipcRenderer.invoke('toggle-pin'),
  toggleEdgeDock: () => ipcRenderer.invoke('toggle-edge-dock'),
  notifyEdgeEvent: (payload) => ipcRenderer.invoke('notify-edge-event', payload),
  onEdgeDockState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('edge-dock-state', listener);
    return () => ipcRenderer.removeListener('edge-dock-state', listener);
  },
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  alertAttention: () => ipcRenderer.invoke('alert-attention')
});
