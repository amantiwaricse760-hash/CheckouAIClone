/**
 * Native Linux PulseAudio Capture Service
 * Directly records from Google Meet / System Audio monitor with 0 lag
 */

const { spawn, execSync } = require('child_process');
const EventEmitter = require('events');

class NativeAudioService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isRecording = false;
    this.chunks = [];
    this.currentSource = 'monitor'; // 'monitor' (Google Meet/Interviewer) or 'mic' (User)
    this.devices = this.detectDevices();
    
    this.lastSoundTime = 0;
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceThreshold = 1800; // 1.8 seconds of silence to trigger answer
    this.silenceCheckInterval = null;
  }

  detectDevices() {
    try {
      const info = execSync('pactl info', { encoding: 'utf-8' });
      const sinkMatch = info.match(/Default Sink:\s*(\S+)/);
      const sourceMatch = info.match(/Default Source:\s*(\S+)/);

      return {
        monitor: sinkMatch ? sinkMatch[1] + '.monitor' : 'default.monitor',
        mic: sourceMatch ? sourceMatch[1] : 'default'
      };
    } catch (e) {
      console.warn("Could not detect PulseAudio devices:", e);
      return { monitor: 'default.monitor', mic: 'default' };
    }
  }

  setSource(sourceType) {
    this.currentSource = sourceType === 'mic' ? 'mic' : 'monitor';
    if (this.isRecording) {
      this.stop();
      this.start();
    }
  }

  start() {
    if (this.isRecording) return;
    this.chunks = [];
    this.isRecording = true;
    this.isSpeaking = false;

    const deviceName = this.currentSource === 'mic' ? this.devices.mic : this.devices.monitor;
    console.log(`[NativeAudio] Starting capture from: ${deviceName} (${this.currentSource})`);

    // Spawn parec writing WAV format to stdout
    this.process = spawn('parec', [
      '--file-format=wav',
      '-d', deviceName,
      '--latency-msec=50'
    ]);

    this.process.stdout.on('data', (data) => {
      if (!this.isRecording) return;
      this.chunks.push(data);

      // Simple RMS audio volume level calculation
      let sum = 0;
      const step = 4;
      for (let i = 44; i < data.length - 1; i += step) {
        const sample = data.readInt16LE(i);
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / ((data.length - 44) / (step / 2)));
      const level = Math.min(100, Math.round((rms / 32768) * 100 * 5)); // Scaled 0-100

      this.emit('level', level);

      // Voice Activity Detection
      if (level > 8) { // Sound detected
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.speechStartTime = Date.now();
          this.emit('speech-start');
        }
        this.lastSoundTime = Date.now();
      }
    });

    this.process.stderr.on('data', (err) => {
      console.error("[NativeAudio] parec error:", err.toString());
    });

    this.process.on('close', (code) => {
      this.isRecording = false;
    });

    // Background silence monitor (auto-trigger answer after question ends)
    this.silenceCheckInterval = setInterval(() => {
      if (!this.isRecording || !this.isSpeaking) return;

      const silenceDuration = Date.now() - this.lastSoundTime;
      const totalSpeechDuration = Date.now() - this.speechStartTime;

      // If spoken for at least 1.5 seconds and now paused for 1.8 seconds
      if (silenceDuration > this.silenceThreshold && totalSpeechDuration > 1500) {
        console.log(`[NativeAudio] Question ended (${silenceDuration}ms silence). Triggering answer!`);
        this.isSpeaking = false;
        this.finalizeAndEmitAudio();
      }
    }, 200);
  }

  finalizeAndEmitAudio() {
    if (this.chunks.length === 0) return;
    const fullBuffer = Buffer.concat(this.chunks);
    this.chunks = []; // Reset for next question

    // Only process if audio size is meaningful (> 15KB)
    if (fullBuffer.length > 15000) {
      const base64Audio = fullBuffer.toString('base64');
      this.emit('audio-ready', {
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        source: this.currentSource
      });
    }
  }

  stop() {
    this.isRecording = false;
    this.isSpeaking = false;
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.finalizeAndEmitAudio();
  }
}

module.exports = NativeAudioService;
