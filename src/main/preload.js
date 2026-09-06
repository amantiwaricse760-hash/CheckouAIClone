const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('copilotAPI', {
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  updateApiKey: (key) => ipcRenderer.invoke('update-api-key', key),
  updateDeepgramKey: (key) => ipcRenderer.invoke('update-deepgram-key', key),
  
  askCopilot: (data) => ipcRenderer.send('ask-copilot', data),
  askAudioCopilot: (data) => ipcRenderer.send('ask-audio-copilot', data),
  broadcastClear: () => ipcRenderer.send('broadcast-clear'),
  setGhostMode: (enable) => ipcRenderer.send('set-ghost-mode', enable),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  
  startNativeAudio: (data) => ipcRenderer.send('start-native-audio', data),
  stopNativeAudio: () => ipcRenderer.send('stop-native-audio'),
  setNativeAudioSource: (source) => ipcRenderer.send('set-native-audio-source', source),
  
  // Screen Question Capture & Snip APIs
  captureScreen: () => ipcRenderer.send('capture-screen-solve'),
  startSnip: () => ipcRenderer.send('start-snip-capture'),
  sendSnipCompleted: (bounds) => ipcRenderer.send('snip-completed', bounds),
  sendSnipCancelled: () => ipcRenderer.send('snip-cancelled'),

  minimizeApp: () => ipcRenderer.send('minimize-app'),
  hideApp: () => ipcRenderer.send('hide-app'),
  closeApp: () => ipcRenderer.send('close-app'),

  // Listeners
  onAiToken: (callback) => ipcRenderer.on('ai-token', (event, data) => callback(data)),
  onAiComplete: (callback) => ipcRenderer.on('ai-complete', (event, data) => callback(data)),
  onAiTranscribed: (callback) => ipcRenderer.on('ai-transcribed', (event, data) => callback(data)),
  onAudioLevel: (callback) => ipcRenderer.on('audio-level', (event, level) => callback(level)),
  onSpeechActive: (callback) => ipcRenderer.on('speech-active', () => callback()),
  onAiError: (callback) => ipcRenderer.on('ai-error', (event, data) => callback(data)),
  onGhostModeChanged: (callback) => ipcRenderer.on('ghost-mode-changed', (event, isGhost) => callback(isGhost)),
  onClearRequest: (callback) => ipcRenderer.on('clear-request', () => callback()),
  onCompanionAction: (callback) => ipcRenderer.on('companion-action', (event, action) => callback(action))
});
