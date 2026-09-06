// State variables
let currentMode = 'points';
let isListening = false;
let isGhostMode = false;
let isMiniDock = false;
let baseFontSize = 14;
let recognition = null;
let profileData = {};
let lanUrl = '';
let currentQuestion = '';

// DOM Elements
const hudContainer = document.getElementById('hudContainer');
const statusBadge = document.getElementById('statusBadge');
const statusPulse = document.getElementById('statusPulse');
const statusLabel = document.getElementById('statusLabel');

const btnListen = document.getElementById('btnListen');
const listenText = document.getElementById('listenText');
const btnAudioSource = document.getElementById('btnAudioSource');
const opacitySlider = document.getElementById('opacitySlider');
const opacityChips = document.querySelectorAll('.opacity-chip');

const modePills = document.querySelectorAll('.mode-pill');
const questionInput = document.getElementById('questionInput');
const answerDisplay = document.getElementById('answerDisplay');

const btnAskNow = document.getElementById('btnAskNow');
const btnRegen = document.getElementById('btnRegen');
const btnMoreDetails = document.getElementById('btnMoreDetails');
const btnCopy = document.getElementById('btnCopy');
const btnClear = document.getElementById('btnClear');

const btnMiniDock = document.getElementById('btnMiniDock');
const btnPhone = document.getElementById('btnPhone');
const btnGhost = document.getElementById('btnGhost');
const btnSettings = document.getElementById('btnSettings');
const btnMinimize = document.getElementById('btnMinimize');
const btnHide = document.getElementById('btnHide');

const btnFontInc = document.getElementById('btnFontInc');
const btnFontDec = document.getElementById('btnFontDec');

// Modals
const settingsModal = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const inputApiKey = document.getElementById('inputApiKey');
const inputRole = document.getElementById('inputRole');
const inputExp = document.getElementById('inputExp');
const inputSkills = document.getElementById('inputSkills');
const inputResume = document.getElementById('inputResume');
const inputInstructions = document.getElementById('inputInstructions');

const phoneModal = document.getElementById('phoneModal');
const btnClosePhone = document.getElementById('btnClosePhone');
const phoneUrlBox = document.getElementById('phoneUrlBox');
const btnCopyPhoneUrl = document.getElementById('btnCopyPhoneUrl');

// Initialize
async function init() {
  if (window.copilotAPI) {
    const data = await window.copilotAPI.getInitialData();
    profileData = data.profile || {};
    lanUrl = `http://${data.lanIp}:${data.port}`;
    phoneUrlBox.innerText = lanUrl;

    // Pre-populate settings
    inputRole.value = profileData.targetRole || '';
    inputExp.value = profileData.yearsOfExperience || '';
    inputSkills.value = (profileData.primarySkills || []).join(', ');
    inputResume.value = profileData.resumeSummary || '';
    inputInstructions.value = profileData.customInstructions || '';

    // IPC Listeners
    window.copilotAPI.onAiToken(({ chunk, fullText }) => {
      setStatus('generating', 'Answering...');
      renderMarkdown(fullText);
    });

    window.copilotAPI.onAiComplete(({ fullText }) => {
      setStatus('ready', 'Ready');
      renderMarkdown(fullText);
    });

    window.copilotAPI.onAiError(({ error }) => {
      setStatus('error', 'Error');
      answerDisplay.innerHTML = `<div style="color: #ef4444; padding: 10px;">⚠️ ${error}</div>`;
    });

    window.copilotAPI.onGhostModeChanged((ghost) => {
      isGhostMode = ghost;
      btnGhost.style.background = isGhostMode ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.07)';
      btnGhost.style.color = isGhostMode ? '#38bdf8' : '#94a3b8';
    });

    window.copilotAPI.onClearRequest(() => {
      clearUI();
    });

    window.copilotAPI.onCompanionAction((action) => {
      if (action.action === 'mode') {
        setMode(action.value);
      } else if (action.action === 'clear') {
        clearUI();
      }
    });
  } else {
    setupBrowserSocket();
  }

  setupSpeechRecognition();
  setupEventListeners();
}

let browserSocket = null;
function setupBrowserSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  browserSocket = new WebSocket(wsUrl);

  browserSocket.onopen = () => {
    setStatus('ready', 'Connected (Web)');
  };

  browserSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'SYNC_STATE') {
        if (msg.data.question) questionInput.value = msg.data.question;
        if (msg.data.answer) renderMarkdown(msg.data.answer);
      } else if (msg.type === 'TOKEN') {
        setStatus('generating', 'Answering...');
        renderMarkdown(msg.fullText);
      } else if (msg.type === 'STATUS') {
        setStatus(msg.data === 'generating' ? 'generating' : 'ready', msg.data === 'generating' ? 'Answering...' : 'Ready');
      } else if (msg.type === 'CLEAR') {
        clearUI();
      } else if (msg.type === 'ERROR') {
        setStatus('error', 'Error');
        answerDisplay.innerHTML = `<div style="color: #ef4444; padding: 10px;">⚠️ ${msg.data}</div>`;
      }
    } catch (e) {}
  };

  browserSocket.onclose = () => {
    setTimeout(setupBrowserSocket, 2000);
  };
}

function setStatus(state, label) {
  statusLabel.innerText = label;
  if (state === 'listening') {
    statusPulse.style.background = '#eab308';
    statusPulse.style.boxShadow = '0 0 8px #eab308';
  } else if (state === 'generating') {
    statusPulse.style.background = '#a855f7';
    statusPulse.style.boxShadow = '0 0 8px #a855f7';
  } else if (state === 'error') {
    statusPulse.style.background = '#ef4444';
    statusPulse.style.boxShadow = '0 0 8px #ef4444';
  } else {
    statusPulse.style.background = '#22c55e';
    statusPulse.style.boxShadow = '0 0 6px #22c55e';
  }
}

// Markdown and Code Formatter
function renderMarkdown(rawText) {
  let html = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced Code blocks
  html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Bullet points
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '• $1');

  answerDisplay.innerHTML = html;
  answerDisplay.scrollTop = answerDisplay.scrollHeight;
}

// Speech-to-Text Setup
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interim;
    questionInput.value = currentText;

    // Auto trigger if final pause is detected
    if (finalTranscript.trim().length > 10) {
      triggerAsk(finalTranscript.trim());
      finalTranscript = '';
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed') {
      setStatus('error', 'Mic blocked');
    }
  };

  recognition.onend = () => {
    if (isListening) {
      recognition.start();
    }
  };
}

function triggerAsk(question, extraInstruction = '') {
  if (!question || !question.trim()) return;
  currentQuestion = question.trim();

  let finalPrompt = currentQuestion;
  if (extraInstruction) {
    finalPrompt = `${currentQuestion}\n\n[INSTRUCTION: ${extraInstruction}]`;
  }

  // If in mini-dock mode, expand to show answer
  if (isMiniDock) toggleMiniDock(false);

  setStatus('generating', 'Thinking...');
  answerDisplay.innerHTML = '<div class="placeholder-text">Analyzing question & your background...</div>';

  if (window.copilotAPI) {
    window.copilotAPI.askCopilot({
      question: finalPrompt,
      mode: currentMode
    });
  } else if (browserSocket && browserSocket.readyState === WebSocket.OPEN) {
    browserSocket.send(JSON.stringify({
      action: 'ask',
      question: finalPrompt,
      mode: currentMode
    }));
  }
}

function setMode(mode) {
  currentMode = mode;
  modePills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.mode === mode);
  });
  if (questionInput.value.trim()) {
    triggerAsk(questionInput.value.trim());
  }
}

function clearUI() {
  questionInput.value = '';
  currentQuestion = '';
  answerDisplay.innerHTML = '<div class="placeholder-text">When your interviewer speaks, bullet-point answers and code snippets will stream here instantly.</div>';
  setStatus('ready', 'Ready');
  if (browserSocket && browserSocket.readyState === WebSocket.OPEN) {
    browserSocket.send(JSON.stringify({ action: 'clear' }));
  }
}

function toggleMiniDock(forceState) {
  isMiniDock = typeof forceState === 'boolean' ? forceState : !isMiniDock;
  hudContainer.classList.toggle('mini-dock', isMiniDock);
  btnMiniDock.innerText = isMiniDock ? '🗖 Expand' : '🗖 Mini';
  btnMiniDock.style.borderColor = isMiniDock ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)';

  if (window.copilotAPI) {
    if (isMiniDock) {
      window.copilotAPI.setWindowSize({ width: 480, height: 50 });
    } else {
      window.copilotAPI.setWindowSize({ width: 480, height: 640 });
    }
  }
}

function setOpacity(val) {
  opacitySlider.value = val;
  hudContainer.style.background = `rgba(13, 17, 27, ${val / 100})`;
  opacityChips.forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.val, 10) === val);
  });
}

function setupEventListeners() {
  // Listen Button
  btnListen.addEventListener('click', () => {
    isListening = !isListening;
    if (isListening) {
      btnListen.classList.add('active');
      listenText.innerText = 'Listening...';
      setStatus('listening', 'Listening');
      try {
        if (recognition) recognition.start();
      } catch (e) {}
    } else {
      btnListen.classList.remove('active');
      listenText.innerText = 'Start Listening';
      setStatus('ready', 'Ready');
      try {
        if (recognition) recognition.stop();
      } catch (e) {}
    }
  });

  // Mini Dock Button
  btnMiniDock.addEventListener('click', () => toggleMiniDock());

  // Ask Now Button
  btnAskNow.addEventListener('click', () => {
    triggerAsk(questionInput.value);
  });

  // Regenerate Button
  btnRegen.addEventListener('click', () => {
    if (currentQuestion || questionInput.value.trim()) {
      triggerAsk(currentQuestion || questionInput.value.trim(), 'Give a fresh, alternative angle or alternative solution.');
    }
  });

  // More Details Button
  btnMoreDetails.addEventListener('click', () => {
    if (currentQuestion || questionInput.value.trim()) {
      triggerAsk(currentQuestion || questionInput.value.trim(), 'Elaborate in greater depth with edge cases, trade-offs, and implementation details.');
    }
  });

  // Mode Pills
  modePills.forEach(pill => {
    pill.addEventListener('click', () => setMode(pill.dataset.mode));
  });

  // Manual Question Enter
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerAsk(questionInput.value);
    }
  });

  // Font Size Adjusters
  btnFontInc.addEventListener('click', () => {
    if (baseFontSize < 22) {
      baseFontSize += 2;
      document.documentElement.style.setProperty('--base-font-size', `${baseFontSize}px`);
    }
  });

  btnFontDec.addEventListener('click', () => {
    if (baseFontSize > 11) {
      baseFontSize -= 2;
      document.documentElement.style.setProperty('--base-font-size', `${baseFontSize}px`);
    }
  });

  // Opacity Slider & Chips
  opacitySlider.addEventListener('input', (e) => {
    setOpacity(parseInt(e.target.value, 10));
  });

  opacityChips.forEach(chip => {
    chip.addEventListener('click', () => {
      setOpacity(parseInt(chip.dataset.val, 10));
    });
  });

  // Copy Button
  btnCopy.addEventListener('click', () => {
    const text = answerDisplay.innerText;
    if (text) {
      navigator.clipboard.writeText(text);
      btnCopy.innerText = '✅ Copied!';
      setTimeout(() => { btnCopy.innerText = '📋 Copy'; }, 1500);
    }
  });

  // Clear Button
  btnClear.addEventListener('click', () => {
    clearUI();
    if (window.copilotAPI) window.copilotAPI.broadcastClear();
  });

  // Ghost Mode Button
  btnGhost.addEventListener('click', () => {
    isGhostMode = !isGhostMode;
    if (window.copilotAPI) window.copilotAPI.setGhostMode(isGhostMode);
    btnGhost.style.background = isGhostMode ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.07)';
    btnGhost.style.color = isGhostMode ? '#38bdf8' : '#94a3b8';
  });

  // Window Controls
  btnMinimize.addEventListener('click', () => window.copilotAPI?.minimizeApp());
  btnHide.addEventListener('click', () => window.copilotAPI?.hideApp());

  // Phone Modal
  btnPhone.addEventListener('click', () => { phoneModal.style.display = 'flex'; });
  btnClosePhone.addEventListener('click', () => { phoneModal.style.display = 'none'; });
  btnCopyPhoneUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(lanUrl);
    btnCopyPhoneUrl.innerText = '✅ Copied!';
    setTimeout(() => { btnCopyPhoneUrl.innerText = 'Copy URL'; }, 1500);
  });

  // Settings Modal
  btnSettings.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
  btnCloseSettings.addEventListener('click', () => { settingsModal.style.display = 'none'; });
  btnSaveSettings.addEventListener('click', async () => {
    const newProfile = {
      targetRole: inputRole.value.trim(),
      yearsOfExperience: inputExp.value.trim(),
      primarySkills: inputSkills.value.split(',').map(s => s.trim()).filter(Boolean),
      resumeSummary: inputResume.value.trim(),
      customInstructions: inputInstructions.value.trim()
    };

    if (inputApiKey.value.trim() && window.copilotAPI) {
      await window.copilotAPI.updateApiKey(inputApiKey.value.trim());
    }

    if (window.copilotAPI) {
      await window.copilotAPI.saveProfile(newProfile);
    }

    settingsModal.style.display = 'none';
  });
}

init();
