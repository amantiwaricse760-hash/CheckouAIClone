const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('copilotAPI', {
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  updateApiKey: (key) => ipcRenderer.invoke('update-api-key', key),
  
  askCopilot: (data) => ipcRenderer.send('ask-copilot', data),
  broadcastClear: () => ipcRenderer.send('broadcast-clear'),
  setGhostMode: (enable) => ipcRenderer.send('set-ghost-mode', enable),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  hideApp: () => ipcRenderer.send('hide-app'),
  closeApp: () => ipcRenderer.send('close-app'),

  // Listeners
  onAiToken: (callback) => ipcRenderer.on('ai-token', (event, data) => callback(data)),
  onAiComplete: (callback) => ipcRenderer.on('ai-complete', (event, data) => callback(data)),
  onAiError: (callback) => ipcRenderer.on('ai-error', (event, data) => callback(data)),
  onGhostModeChanged: (callback) => ipcRenderer.on('ghost-mode-changed', (event, isGhost) => callback(isGhost)),
  onClearRequest: (callback) => ipcRenderer.on('clear-request', () => callback()),
  onCompanionAction: (callback) => ipcRenderer.on('companion-action', (event, action) => callback(action))
});
