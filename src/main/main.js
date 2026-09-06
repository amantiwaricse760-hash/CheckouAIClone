const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const GeminiService = require('../services/geminiService');
const CompanionServer = require('../services/companionServer');
const NativeAudioService = require('../services/nativeAudioService');
const DeepgramLiveService = require('../services/deepgramService');

let mainWindow = null;
let isGhostMode = false;
let geminiService = null;
let companionServer = null;
let nativeAudio = null;
let deepgramService = null;

// Paths for profile & config
const userDataPath = app.getPath('userData');
const profileFilePath = path.join(userDataPath, 'profile.json');
const defaultProfilePath = path.join(__dirname, '../config/profile.json');

function loadProfile() {
  try {
    if (fs.existsSync(profileFilePath)) {
      return JSON.parse(fs.readFileSync(profileFilePath, 'utf-8'));
    } else if (fs.existsSync(defaultProfilePath)) {
      return JSON.parse(fs.readFileSync(defaultProfilePath, 'utf-8'));
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
  return {
    name: "Candidate",
    targetRole: "Software Engineer",
    primarySkills: ["JavaScript", "Python"],
    resumeSummary: "Full stack developer"
  };
}

function saveProfile(data) {
  try {
    fs.writeFileSync(profileFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error("Error saving profile:", err);
    return false;
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    x: width - 500, // Top right corner
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Enables local audio and loopback permissions
    }
  });

  // CRITICAL STEALTH FEATURE: Invisibility from screen share recorders
  // Works on Windows, macOS, and supported Linux X11/Wayland compositors
  try {
    mainWindow.setContentProtection(true);
    console.log("[Stealth] Content protection enabled (Window excluded from screen captures)");
  } catch (e) {
    console.warn("[Stealth] setContentProtection not supported on this compositor:", e);
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Register Global Hotkeys
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+G', () => {
    isGhostMode = !isGhostMode;
    mainWindow.setIgnoreMouseEvents(isGhostMode, { forward: true });
    mainWindow.webContents.send('ghost-mode-changed', isGhostMode);
  });

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    mainWindow.webContents.send('clear-request');
    if (companionServer) companionServer.broadcast({ type: 'CLEAR' });
  });

  globalShortcut.register('CommandOrControl+Space', () => {
    if (nativeAudio && nativeAudio.isRecording) {
      nativeAudio.finalizeAndEmitAudio();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Initialize AI Service
  const initialProfile = loadProfile();
  const apiKey = process.env.GEMINI_API_KEY || "";
  geminiService = new GeminiService(apiKey);

  // Initialize Phone Companion Server
  const companionPort = parseInt(process.env.COMPANION_PORT || '3890', 10);
  companionServer = new CompanionServer(companionPort);
  companionServer.start((action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('companion-action', action);
    }
  });

  // Initialize Native Linux Audio Loopback (records Google Meet directly)
  nativeAudio = new NativeAudioService();
  deepgramService = new DeepgramLiveService(process.env.DEEPGRAM_API_KEY || "");
  let currentActiveMode = 'points';

  nativeAudio.on('level', (level) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audio-level', level);
    }
  });

  nativeAudio.on('speech-start', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('speech-active');
    }
  });

  nativeAudio.on('chunk', (chunk) => {
    if (deepgramService && deepgramService.isConnected) {
      deepgramService.sendAudioChunk(chunk);
    }
  });

  nativeAudio.on('audio-ready', async ({ audioBase64, mimeType }) => {
    // Only use full audio multimodal if Deepgram is not active
    if (deepgramService && deepgramService.isConnected) return;

    console.log(`[NativeAudio] Audio chunk received from Google Meet. Processing...`);
    const profile = loadProfile();
    if (companionServer) companionServer.broadcast({ type: 'STATUS', data: 'generating' });

    await geminiService.streamAudioAnswer(
      audioBase64,
      mimeType,
      profile,
      currentActiveMode,
      (question) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-transcribed', { question });
        }
        if (companionServer) companionServer.broadcast({ type: 'QUESTION', data: question });
      },
      (chunk, fullText) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-token', { chunk, fullText });
        }
        if (companionServer) companionServer.broadcast({ type: 'TOKEN', chunk, fullText });
      },
      (fullText) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-complete', { fullText });
        }
        if (companionServer) companionServer.broadcast({ type: 'STATUS', data: 'idle' });
      },
      (error) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-error', { error: error.message });
        }
      }
    );
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (companionServer) companionServer.stop();
  if (nativeAudio) nativeAudio.stop();
  if (deepgramService) deepgramService.stop();
});

// IPC Handlers
ipcMain.on('start-native-audio', (event, { source, mode }) => {
  if (nativeAudio) {
    currentActiveMode = mode || 'points';
    nativeAudio.setSource(source || 'monitor');

    if (deepgramService && deepgramService.apiKey) {
      deepgramService.startStreaming({
        onTranscript: (text) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-transcribed', { question: text });
          }
        },
        onSentenceComplete: async (question) => {
          console.log(`[Deepgram] Live sentence: "${question}". Answering via Gemini...`);
          const profile = loadProfile();
          if (companionServer) {
            companionServer.broadcast({ type: 'QUESTION', data: question });
            companionServer.broadcast({ type: 'STATUS', data: 'generating' });
          }

          await geminiService.streamAnswer(
            question,
            profile,
            currentActiveMode,
            (chunk, fullText) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-token', { chunk, fullText });
              }
              if (companionServer) companionServer.broadcast({ type: 'TOKEN', chunk, fullText });
            },
            (fullText) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-complete', { fullText });
              }
              if (companionServer) companionServer.broadcast({ type: 'STATUS', data: 'idle' });
            },
            (err) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-error', { error: err.message });
              }
            }
          );
        },
        onError: (err) => console.error("[Deepgram] Error:", err)
      });
    }

    nativeAudio.start();
  }
});

ipcMain.on('stop-native-audio', () => {
  if (nativeAudio) nativeAudio.stop();
  if (deepgramService) deepgramService.stop();
});

ipcMain.on('set-native-audio-source', (event, source) => {
  if (nativeAudio) nativeAudio.setSource(source);
});
ipcMain.handle('get-initial-data', () => {
  return {
    profile: loadProfile(),
    lanIp: companionServer ? companionServer.getLanIp() : '127.0.0.1',
    port: companionServer ? companionServer.port : 3890,
    hasApiKey: Boolean(geminiService && geminiService.apiKey)
  };
});

ipcMain.handle('save-profile', (event, profile) => {
  return saveProfile(profile);
});

ipcMain.handle('update-api-key', (event, newKey) => {
  if (geminiService) geminiService.setApiKey(newKey);
  return true;
});

ipcMain.handle('update-deepgram-key', (event, newKey) => {
  if (deepgramService) deepgramService.setApiKey(newKey);
  return true;
});

ipcMain.on('set-ghost-mode', (event, enable) => {
  isGhostMode = enable;
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(isGhostMode, { forward: true });
  }
});

ipcMain.on('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('hide-app', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('set-window-size', (event, { width, height }) => {
  if (mainWindow) mainWindow.setSize(width, height, true);
});

ipcMain.on('close-app', () => {
  if (mainWindow) mainWindow.close();
});

// Stream AI Answer
ipcMain.on('ask-copilot', async (event, { question, mode }) => {
  const profile = loadProfile();

  // Notify companion phone
  if (companionServer) {
    companionServer.broadcast({ type: 'QUESTION', data: question });
    companionServer.broadcast({ type: 'STATUS', data: 'generating' });
  }

  await geminiService.streamAnswer(
    question,
    profile,
    mode || 'points',
    (chunk, fullText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-token', { chunk, fullText });
      }
      if (companionServer) {
        companionServer.broadcast({ type: 'TOKEN', chunk, fullText });
      }
    },
    (fullText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-complete', { fullText });
      }
      if (companionServer) {
        companionServer.broadcast({ type: 'STATUS', data: 'idle' });
      }
    },
    (error) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-error', { error: error.message });
      }
    }
  );
});

ipcMain.on('ask-audio-copilot', async (event, { audioBase64, mimeType, mode }) => {
  const profile = loadProfile();

  if (companionServer) {
    companionServer.broadcast({ type: 'STATUS', data: 'generating' });
  }

  await geminiService.streamAudioAnswer(
    audioBase64,
    mimeType,
    profile,
    mode || 'points',
    (question) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-transcribed', { question });
      }
      if (companionServer) {
        companionServer.broadcast({ type: 'QUESTION', data: question });
      }
    },
    (chunk, fullText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-token', { chunk, fullText });
      }
      if (companionServer) {
        companionServer.broadcast({ type: 'TOKEN', chunk, fullText });
      }
    },
    (fullText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-complete', { fullText });
      }
      if (companionServer) {
        companionServer.broadcast({ type: 'STATUS', data: 'idle' });
      }
    },
    (error) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-error', { error: error.message });
      }
    }
  );
});

ipcMain.on('broadcast-clear', () => {
  if (companionServer) companionServer.broadcast({ type: 'CLEAR' });
});
