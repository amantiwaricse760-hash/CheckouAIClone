/**
 * Ultra-Low Latency Streaming Speech-to-Text via Deepgram Nova-2
 * Uses native WebSockets (already installed: ws)
 * Latency: < 200ms
 */

const { WebSocket } = require('ws');

class DeepgramLiveService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY || "";
    this.ws = null;
    this.isConnected = false;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  startStreaming({ sampleRate = 16000, onTranscript, onSentenceComplete, onError }) {
    if (!this.apiKey) {
      if (onError) onError(new Error("Deepgram API Key missing. Add it in Settings or .env for <200ms instant transcription."));
      return;
    }

    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&endpointing=300&sample_rate=${sampleRate}&encoding=linear16&channels=1`;

    try {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`
        }
      });

      let fullTranscript = "";
      let sentenceTimeout = null;

      const triggerQuestion = () => {
        if (fullTranscript.trim().length > 5) {
          const q = fullTranscript.trim();
          console.log(`[Deepgram] Rapid auto-trigger: "${q}"`);
          fullTranscript = "";
          if (sentenceTimeout) clearTimeout(sentenceTimeout);
          sentenceTimeout = null;
          if (onSentenceComplete) onSentenceComplete(q);
        }
      };

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log("[Deepgram] Connected to Nova-2 streaming STT (<200ms latency)");
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          const alt = response?.channel?.alternatives?.[0];
          const transcript = (alt?.transcript || "").trim();

          if (transcript) {
            if (response.is_final) {
              fullTranscript += (fullTranscript ? " " : "") + transcript;
              if (onTranscript) onTranscript(fullTranscript, true);

              // 400ms silence debounce: rapid AI trigger
              if (sentenceTimeout) clearTimeout(sentenceTimeout);
              sentenceTimeout = setTimeout(triggerQuestion, 400);
            } else {
              const preview = fullTranscript + (fullTranscript ? " " : "") + transcript;
              if (onTranscript) onTranscript(preview, false);
            }
          }

          // Trigger immediately whenever Deepgram detects end-of-speech (even on empty endpoint frame)
          if (response.speech_final) {
            triggerQuestion();
          }
        } catch (e) {
          console.error("[Deepgram] Parse error:", e);
        }
      });

      this.ws.on('error', (err) => {
        console.error("[Deepgram] WebSocket error:", err);
        if (onError) onError(err);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        console.log("[Deepgram] Stream closed");
      });
    } catch (e) {
      if (onError) onError(e);
    }
  }

  sendAudioChunk(buffer) {
    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  stop() {
    if (this.ws) {
      if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        // Send empty JSON to tell Deepgram stream is finished
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

module.exports = DeepgramLiveService;
