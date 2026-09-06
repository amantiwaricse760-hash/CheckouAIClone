// State variables
let currentMode = 'points';
let isListening = false;
let isGhostMode = false;
let recognition = null;
let profileData = {};
let lanUrl = '';

// DOM Elements
const hudContainer = document.getElementById('hudContainer');
const statusBadge = document.getElementById('statusBadge');
const statusPulse = document.getElementById('statusPulse');
const statusLabel = document.getElementById('statusLabel');

const btnListen = document.getElementById('btnListen');
const listenText = document.getElementById('listenText');
const btnAudioSource = document.getElementById('btnAudioSource');
const opacitySlider = document.getElementById('opacitySlider');

const modePills = document.querySelectorAll('.mode-pill');
const questionInput = document.getElementById('questionInput');
const answerDisplay = document.getElementById('answerDisplay');

const btnCopy = document.getElementById('btnCopy');
const btnClear = document.getElementById('btnClear');
const btnPhone = document.getElementById('btnPhone');
const btnGhost = document.getElementById('btnGhost');
const btnSettings = document.getElementById('btnSettings');
const btnMinimize = document.getElementById('btnMinimize');
const btnHide = document.getElementById('btnHide');

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
      btnGhost.style.background = isGhostMode ? 'rgba(56, 189, 248, 0.3)' : 'transparent';
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
  }

  setupSpeechRecognition();
  setupEventListeners();
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

// Speech-to-Text Setup (Browser/Electron Web Speech Engine)
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Web Speech API not directly supported in this renderer environment.");
    return;
  }

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

    // Detect question end pause to trigger answer
    if (finalTranscript.trim().length > 10) {
      triggerAsk(finalTranscript.trim());
      finalTranscript = '';
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition error:", event.error);
    if (event.error === 'not-allowed') {
      setStatus('error', 'Mic blocked');
    }
  };

  recognition.onend = () => {
    if (isListening) {
      recognition.start(); // Keep listening continuously
    }
  };
}

function triggerAsk(question) {
  if (!question || !question.trim()) return;
  setStatus('generating', 'Thinking...');
  answerDisplay.innerHTML = '<div class="placeholder-text">Analyzing question & resume context...</div>';

  if (window.copilotAPI) {
    window.copilotAPI.askCopilot({
      question: question.trim(),
      mode: currentMode
    });
  }
}

function setMode(mode) {
  currentMode = mode;
  modePills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.mode === mode);
  });
  // If there's already a question, re-ask in new mode
  if (questionInput.value.trim()) {
    triggerAsk(questionInput.value.trim());
  }
}

function clearUI() {
  questionInput.value = '';
  answerDisplay.innerHTML = '<div class="placeholder-text">When the interviewer speaks, bullet-point answers and code snippets will stream here instantly.</div>';
  setStatus('ready', 'Ready');
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
      } catch (e) {
        console.warn("Recognition already active");
      }
    } else {
      btnListen.classList.remove('active');
      listenText.innerText = 'Start Listening';
      setStatus('ready', 'Ready');
      try {
        if (recognition) recognition.stop();
      } catch (e) {}
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

  // Opacity Slider
  opacitySlider.addEventListener('input', (e) => {
    const val = e.target.value / 100;
    hudContainer.style.background = `rgba(13, 17, 27, ${val})`;
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
    btnGhost.style.background = isGhostMode ? 'rgba(56, 189, 248, 0.3)' : 'transparent';
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
