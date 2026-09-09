const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const GeminiService = require('../services/geminiService');
const CompanionServer = require('../services/companionServer');
const NativeAudioService = require('../services/nativeAudioService');
const DeepgramLiveService = require('../services/deepgramService');
const ScreenCaptureService = require('../services/screenCaptureService');
const InterviewConversationAnalyzer = require('../services/conversationAnalyzer');

// Embedded default API keys (Ensures .exe works out-of-the-box on Windows without asking user)
const DEFAULT_GEMINI_KEY = Buffer.from('QVEuQWI4Uk42S3VvLVNWa1dEMkJTeHdFejJnT3dadkVpMFk3TjFaOGNUdlB4b1BRdU5XMVE=', 'base64').toString('utf-8');
const DEFAULT_DEEPGRAM_KEY = Buffer.from('Yzk0ZGFjZDc2MWJjZWI1MDNlMDkyN2EzNzU4ODVlODhmZmE2MGJiNg==', 'base64').toString('utf-8');

let mainWindow = null;
let snipWindow = null;
let isGhostMode = false;
let geminiService = null;
let companionServer = null;
let nativeAudio = null;
let deepgramService = null;
let screenCaptureService = null;
let conversationAnalyzer = null;
let lastFullScreenshot = null;
let currentActiveMode = 'code';
let isUserDirectSpeaking = false;

// Paths for profile & config
const userDataPath = app.getPath('userData');
const profileFilePath = path.join(userDataPath, 'profile.json');
const defaultProfilePath = path.join(__dirname, '../config/profile.json');
const configFilePath = path.join(userDataPath, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configFilePath)) {
      return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    }
  } catch (e) {
    console.error("Error loading config:", e);
  }
  return {};
}

function saveConfig(data) {
  try {
    const current = loadConfig();
    fs.writeFileSync(configFilePath, JSON.stringify({ ...current, ...data }, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error("Error saving config:", e);
    return false;
  }
}

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
    show: false, // CRITICAL: Start hidden so Windows OS never creates a taskbar button on launch
    width: 480,
    height: 640,
    x: width - 500, // Top right corner
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true, // NEVER show icon in Windows taskbar
    title: '', // Disguised empty title
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Enables local audio and loopback permissions
    }
  });

  // CRITICAL STEALTH FEATURE: Clean Screen Share Invisibility & Complete Taskbar Removal
  // 1. WDA_EXCLUDEFROMCAPTURE (17) -> Eliminates black box on Google Meet / Zoom screen share
  // 2. Win32 WS_EX_TOOLWINDOW (0x80) & strip WS_EX_APPWINDOW (0x40000) -> 100% hidden on Windows taskbar
  const applyStealthProtection = () => {
    try {
      mainWindow.setSkipTaskbar(true);
      if (process.platform === 'win32') {
        const handle = mainWindow.getNativeWindowHandle();
        const hwnd = handle.length >= 8 ? handle.readBigInt64LE().toString() : handle.readInt32LE().toString();
        const { spawn } = require('child_process');
        const psScript = `
          $sig = @'
            using System;
            using System.Runtime.InteropServices;
            public class WinStealth {
              [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")]
              private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
              [DllImport("user32.dll", EntryPoint="GetWindowLong")]
              private static extern IntPtr GetWindowLong32(IntPtr hWnd, int nIndex);
              public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
                return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLong32(hWnd, nIndex);
              }
              [DllImport("user32.dll", EntryPoint="SetWindowLongPtr")]
              private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
              [DllImport("user32.dll", EntryPoint="SetWindowLong")]
              private static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
              public static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong) {
                return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong) : SetWindowLong32(hWnd, nIndex, dwNewLong);
              }
              [DllImport("user32.dll")]
              public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
              [DllImport("user32.dll")]
              public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);
            }
'@;
          Add-Type -TypeDefinition $sig -Name WinStealth -Namespace Win32Helper -IgnoreWarnings;
          $h = [IntPtr]${hwnd};
          [Win32Helper.WinStealth]::SetWindowDisplayAffinity($h, 17);
          $cur = [Win32Helper.WinStealth]::GetWindowLongPtr($h, -20).ToInt64();
          $newStyle = ($cur -band -bnot 0x00040000) -bor 0x00000080;
          [Win32Helper.WinStealth]::SetWindowLongPtr($h, -20, [IntPtr]$newStyle);
          [Win32Helper.WinStealth]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 0, 0, 0x0037);
        `;
        const ps = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          psScript
        ], { windowsHide: true, stdio: 'ignore' });
        ps.unref();
      }
      console.log("[Stealth] Taskbar exclusion & clean screen share affinity applied");
    } catch (e) {
      console.warn("[Stealth] Error applying window affinity:", e);
    }
  };

  mainWindow.once('ready-to-show', () => {
    mainWindow.setSkipTaskbar(true);
    applyStealthProtection();
    mainWindow.showInactive();
  });

  mainWindow.on('show', () => {
    mainWindow.setSkipTaskbar(true);
    applyStealthProtection();
  });

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

  // Ctrl + S: Instant Coding Question Capture & Solve
  globalShortcut.register('CommandOrControl+S', () => {
    console.log('[Shortcut] Ctrl+S pressed: Auto-capturing coding question from screen...');
    triggerScreenSolve();
  });

  // Ctrl + Shift + S: Interactive Region Snip Tool
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    console.log('[Shortcut] Ctrl+Shift+S pressed: Opening snip overlay...');
    openSnipWindow();
  });

  // Alt + Q: Instant Speak Question Toggle
  try {
    globalShortcut.register('Alt+Q', () => {
      console.log('[Shortcut] Alt+Q pressed: Toggling Speak Question mode...');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('toggle-speak-question');
      }
    });
  } catch (e) {
    console.error('Failed to register Alt+Q shortcut:', e);
  }

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
  const savedConfig = loadConfig();
  const apiKey = (savedConfig.geminiApiKey && savedConfig.geminiApiKey.trim()) || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
  const deepgramKey = (savedConfig.deepgramApiKey && savedConfig.deepgramApiKey.trim()) || process.env.DEEPGRAM_API_KEY || DEFAULT_DEEPGRAM_KEY;

  // Persist default keys so the local config always has valid tokens
  if (!savedConfig.geminiApiKey || !savedConfig.deepgramApiKey) {
    saveConfig({ geminiApiKey: apiKey, deepgramApiKey: deepgramKey });
  }

  geminiService = new GeminiService(apiKey);
  conversationAnalyzer = new InterviewConversationAnalyzer(apiKey);

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
  deepgramService = new DeepgramLiveService(deepgramKey);
  screenCaptureService = new ScreenCaptureService();
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

  nativeAudio.on('chunk', (chunk, source) => {
    if (deepgramService && deepgramService.isConnected) {
      deepgramService.sendAudioChunk(chunk, source);
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
ipcMain.on('start-native-audio', (event, { source, mode, sampleRate }) => {
  if (nativeAudio) {
    currentActiveMode = mode || 'points';
    nativeAudio.setSource(source || 'both');

    if (deepgramService && deepgramService.apiKey) {
      deepgramService.startStreaming({
        sampleRate: sampleRate || 16000,
        onTranscript: (text, isFinal, speaker) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-transcribed', { question: text, isFinal, speaker });
          }
        },
        onSentenceComplete: async (rawText, speaker) => {
          console.log(`[Auto-Trigger]: Raw transcript captured: "${rawText}" (Speaker: ${speaker})`);

          // If Candidate Direct Speech Mode is active ("Speak Question" button):
          // Listen carefully to what the user said and answer directly without filtering out!
          if (isUserDirectSpeaking) {
            const userQ = (rawText || '').trim();
            if (userQ.length >= 3) {
              console.log(`[Direct-Speak Candidate Question Captured]: "${userQ}". Auto-answering immediately...`);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ai-transcribed', { question: userQ, isCleanQuestion: true });
                mainWindow.webContents.send('direct-speak-auto-answer', { question: userQ });
              }
            }
            return;
          }

          if (!conversationAnalyzer) {
            conversationAnalyzer = new InterviewConversationAnalyzer(geminiService?.apiKey || DEFAULT_GEMINI_KEY);
          }

          const analysis = await conversationAnalyzer.analyze(rawText, speaker);
          console.log(`[ConversationAnalyzer Result]:`, analysis);

          if (!analysis.isQuestion || !analysis.question) {
            console.log(`[ConversationAnalyzer] Filtered out turn: Not an interviewer question (Speaker: ${analysis.speaker}, Confidence: ${analysis.confidence})`);
            return;
          }

          const question = analysis.question;
          console.log(`[Copilot Auto-Answer] Valid Interviewer Question identified: "${question}". Generating answer...`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-transcribed', { question, isCleanQuestion: true, metadata: analysis });
          }
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

ipcMain.on('set-direct-speak-mode', (event, active) => {
  isUserDirectSpeaking = !!active;
  console.log(`[Direct-Speak Mode] set to: ${isUserDirectSpeaking}`);
});

ipcMain.on('incoming-browser-audio-chunk', (event, { chunk, source }) => {
  if (deepgramService && deepgramService.isConnected) {
    try {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      deepgramService.sendAudioChunk(buffer, source || 'both');
    } catch (e) {
      console.error('[BrowserAudioChunk Error]:', e.message);
    }
  }
});

ipcMain.handle('get-initial-data', () => {
  const savedConfig = loadConfig();
  const currentGeminiKey = (savedConfig.geminiApiKey && savedConfig.geminiApiKey.trim()) || (geminiService && geminiService.apiKey) || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
  const currentDeepgramKey = (savedConfig.deepgramApiKey && savedConfig.deepgramApiKey.trim()) || (deepgramService && deepgramService.apiKey) || process.env.DEEPGRAM_API_KEY || DEFAULT_DEEPGRAM_KEY;

  return {
    profile: loadProfile(),
    lanIp: companionServer ? companionServer.getLanIp() : '127.0.0.1',
    port: companionServer ? companionServer.port : 3890,
    hasApiKey: true,
    hasDeepgramKey: true,
    geminiApiKey: currentGeminiKey,
    deepgramApiKey: currentDeepgramKey,
    platform: process.platform,
    isLinux: process.platform === 'linux'
  };
});

ipcMain.handle('save-profile', (event, profile) => {
  return saveProfile(profile);
});

ipcMain.handle('update-api-key', (event, newKey) => {
  if (geminiService) geminiService.setApiKey(newKey);
  if (conversationAnalyzer) conversationAnalyzer.setApiKey(newKey);
  saveConfig({ geminiApiKey: newKey });
  console.log('[Config] Gemini API key updated and saved permanently');
  return true;
});

ipcMain.handle('update-deepgram-key', (event, newKey) => {
  if (deepgramService) deepgramService.setApiKey(newKey);
  saveConfig({ deepgramApiKey: newKey });
  console.log('[Config] Deepgram API key updated and saved permanently');
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

// Screen Question Capture & Solve Logic (Ctrl+S / Snipping Tool)
async function triggerScreenSolve(imageBuffer = null) {
  try {
    let base64 = imageBuffer;

    if (!base64) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-transcribed', { question: '📸 Scanning screen for coding question...' });
      }
      base64 = await screenCaptureService.captureFullScreen(mainWindow);
    }

    if (!base64) return;

    if (companionServer) {
      companionServer.broadcast({ type: 'STATUS', data: 'generating' });
    }

    const profile = loadProfile();
    await geminiService.streamVisionAnswer(
      base64,
      profile,
      'code',
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
      (err) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-error', { error: err.message });
        }
      }
    );
  } catch (e) {
    console.error('[ScreenSolve Error]:', e);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-error', { error: 'Screen capture failed: ' + e.message });
    }
  }
}

async function openSnipWindow() {
  try {
    lastFullScreenshot = await screenCaptureService.captureFullScreen(mainWindow);

    if (snipWindow && !snipWindow.isDestroyed()) {
      snipWindow.close();
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    snipWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    });

    snipWindow.loadFile(path.join(__dirname, '../snip/snip.html'));
    snipWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch (e) {
    console.error('[Snip Window Error]:', e);
  }
}

function closeSnipWindow() {
  if (snipWindow && !snipWindow.isDestroyed()) {
    snipWindow.close();
    snipWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

ipcMain.on('capture-screen-solve', () => {
  triggerScreenSolve();
});

ipcMain.on('start-snip-capture', () => {
  openSnipWindow();
});

ipcMain.on('snip-completed', (event, bounds) => {
  if (lastFullScreenshot && screenCaptureService) {
    const cropped = screenCaptureService.cropImage(lastFullScreenshot, bounds);
    closeSnipWindow();
    triggerScreenSolve(cropped);
  } else {
    closeSnipWindow();
  }
});

ipcMain.on('snip-cancelled', () => {
  closeSnipWindow();
});
