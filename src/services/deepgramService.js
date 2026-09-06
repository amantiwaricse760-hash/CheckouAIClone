/**
 * Ultra-Low Latency Streaming Speech-to-Text via Deepgram Nova-2
 * Industry Standard Live Auto-Triggering Engine
 */

const { WebSocket } = require('ws');
const { TECH_KEYTERMS, normalizeCodingSpeech } = require('./codingLexicon');

const DEFAULT_DEEPGRAM_KEY = Buffer.from('Yzk0ZGFjZDc2MWJjZWI1MDNlMDkyN2EzNzU4ODVlODhmZmE2MGJiNg==', 'base64').toString('utf-8');

class DeepgramLiveService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY || DEFAULT_DEEPGRAM_KEY;
    this.ws = null;
    this.isConnected = false;
    this.isStreaming = false;
    this.keepAliveTimer = null;
    this.reconnectTimer = null;
    this.streamConfig = null;

    this.fullTranscript = "";
    this.sentenceTimeout = null;
    this.lastTriggeredText = "";
    this.lastTriggerTime = 0;
    this.currentSpeaker = 'interviewer';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  startStreaming(config = {}) {
    this.streamConfig = config;
    this.isStreaming = true;

    if (!this.apiKey) {
      if (config.onError) {
        config.onError(new Error("Deepgram API Key missing. Please check .env or Settings."));
      }
      return;
    }

    this._connect();
  }

  _connect() {
    if (this.ws) {
      this._cleanupWs();
    }

    const sampleRate = this.streamConfig?.sampleRate || 16000;
    const keytermQuery = TECH_KEYTERMS.map(t => 'keyterm=' + encodeURIComponent(t)).join('&');
    const url = `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000&sample_rate=${sampleRate}&encoding=linear16&channels=1&${keytermQuery}`;

    try {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`
        }
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log("[Deepgram] Connected to Nova-3 with Coding Lexicon boosting (<200ms latency)");

        // Keep-Alive Ping every 6 seconds to prevent connection drops during silence
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
          if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 6000);
      });

      const triggerQuestion = (reason = 'auto') => {
        const rawText = this.fullTranscript.trim();
        const text = normalizeCodingSpeech(rawText);

        if (this.sentenceTimeout) {
          clearTimeout(this.sentenceTimeout);
          this.sentenceTimeout = null;
        }

        // Must be meaningful text (at least 8 chars or 2 words)
        const wordCount = text.split(/\s+/).length;
        if (text.length >= 8 && wordCount >= 2) {
          // Prevent double-triggering identical phrase within 2.5 seconds
          const now = Date.now();
          if (text === this.lastTriggeredText && now - this.lastTriggerTime < 2500) {
            return;
          }

          console.log(`[Deepgram Auto-Trigger (${reason})]: "${text}" (${this.currentSpeaker})`);
          this.lastTriggeredText = text;
          this.lastTriggerTime = now;
          this.fullTranscript = "";

          const speaker = this.currentSpeaker || 'interviewer';
          if (this.streamConfig?.onSentenceComplete) {
            this.streamConfig.onSentenceComplete(text, speaker);
          }
        }
      };

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());

          // Deepgram UtteranceEnd event (speaker finished talking)
          if (response.type === 'UtteranceEnd') {
            triggerQuestion('UtteranceEnd');
            return;
          }

          const alt = response?.channel?.alternatives?.[0];
          const transcript = (alt?.transcript || "").trim();

          if (transcript) {
            if (response.is_final) {
              this.fullTranscript += (this.fullTranscript ? " " : "") + transcript;
              const displayTranscript = normalizeCodingSpeech(this.fullTranscript);
              if (this.streamConfig?.onTranscript) {
                this.streamConfig.onTranscript(displayTranscript, true, this.currentSpeaker);
              }

              // Rapid smart debounce:
              // If sentence ends with '?' (a question), trigger after 250ms
              // If general speech, trigger after 400ms of silence
              if (this.sentenceTimeout) clearTimeout(this.sentenceTimeout);
              const delay = /[?!.]$/.test(transcript) ? 250 : 400;
              this.sentenceTimeout = setTimeout(() => triggerQuestion('silence-debounce'), delay);
            } else {
              // Interim live preview for immediate UI feedback
              const preview = this.fullTranscript + (this.fullTranscript ? " " : "") + transcript;
              const displayPreview = normalizeCodingSpeech(preview);
              if (this.streamConfig?.onTranscript) {
                this.streamConfig.onTranscript(displayPreview, false, this.currentSpeaker);
              }
            }
          }

          // Deepgram server-side speech endpointing
          if (response.speech_final) {
            triggerQuestion('speech_final');
          }
        } catch (e) {
          console.error("[Deepgram] Parse error:", e);
        }
      });

      this.ws.on('error', (err) => {
        console.error("[Deepgram] WebSocket error:", err.message);
        if (this.streamConfig?.onError) this.streamConfig.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
        console.log(`[Deepgram] Connection closed (${code}). Auto-reconnect: ${this.isStreaming}`);

        // Auto-reconnect if we are supposed to be active
        if (this.isStreaming) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            console.log("[Deepgram] Auto-reconnecting to streaming STT...");
            this._connect();
          }, 800);
        }
      });
    } catch (e) {
      if (this.streamConfig?.onError) this.streamConfig.onError(e);
    }
  }

  sendAudioChunk(buffer, source = 'monitor') {
    if (source === 'mic') this.currentSpeaker = 'candidate';
    else if (source === 'monitor' || source === 'both') this.currentSpeaker = 'interviewer';

    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  _cleanupWs() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.sentenceTimeout) {
      clearTimeout(this.sentenceTimeout);
      this.sentenceTimeout = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  stop() {
    this.isStreaming = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._cleanupWs();
    this.fullTranscript = "";
  }
}

module.exports = DeepgramLiveService;
