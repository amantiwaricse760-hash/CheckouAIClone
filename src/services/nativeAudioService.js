/**
 * Native Linux PulseAudio Dual-Stream Capture Service
 * Captures BOTH Interviewer (Google Meet monitor) AND Candidate (Microphone) simultaneously
 * Zero missed words, 100% crystal-clear 16kHz linear PCM
 */

const { spawn, execSync } = require('child_process');
const EventEmitter = require('events');

class NativeAudioService extends EventEmitter {
  constructor() {
    super();
    this.micProcess = null;
    this.monProcess = null;
    this.isRecording = false;
    this.currentSource = 'both'; // 'both' (Google Meet + Mic), 'monitor' (Meet only), or 'mic' (Mic only)
    this.devices = this.detectDevices();

    this.lastSoundTime = 0;
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceThreshold = 550;
    this.silenceCheckInterval = null;

    this.monQueue = [];
    this.micQueue = [];
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
    this.currentSource = sourceType || 'both';
    if (this.isRecording) {
      this.stop();
      this.start();
    }
  }

  calculateLevel(buffer) {
    let sum = 0;
    const step = 4;
    for (let i = 0; i < buffer.length - 1; i += step) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    const count = Math.max(1, buffer.length / (step / 2));
    const rms = Math.sqrt(sum / count);
    return Math.min(100, Math.round((rms / 32768) * 100 * 6));
  }

  mixPcm(bufA, bufB) {
    if (!bufA && !bufB) return Buffer.alloc(0);
    if (!bufA) return bufB;
    if (!bufB) return bufA;

    const len = Math.max(bufA.length, bufB.length);
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i += 2) {
      const a = i < bufA.length ? bufA.readInt16LE(i) : 0;
      const b = i < bufB.length ? bufB.readInt16LE(i) : 0;
      let sum = a + b;
      if (sum > 32767) sum = 32767;
      else if (sum < -32768) sum = -32768;
      out.writeInt16LE(sum, i);
    }
    return out;
  }

  start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.isSpeaking = false;
    this.monQueue = [];
    this.micQueue = [];

    console.log(`[NativeAudio] Active capture mode: "${this.currentSource}" | Mic: ${this.devices.mic} | Meet: ${this.devices.monitor}`);

    // 1. Microphone capture (Candidate voice)
    if (this.currentSource === 'both' || this.currentSource === 'mic') {
      this.micProcess = spawn('parec', [
        '--format=s16le',
        '--rate=16000',
        '--channels=1',
        '-d', this.devices.mic,
        '--latency-msec=20'
      ]);

      this.micProcess.stdout.on('data', (data) => {
        if (!this.isRecording) return;
        this.handleIncomingAudio(data, 'mic');
      });

      this.micProcess.stderr.on('data', (e) => {
        console.error('[NativeAudio mic error]:', e.toString());
      });
    }

    // 2. Google Meet monitor capture (Interviewer voice)
    if (this.currentSource === 'both' || this.currentSource === 'monitor') {
      this.monProcess = spawn('parec', [
        '--format=s16le',
        '--rate=16000',
        '--channels=1',
        '-d', this.devices.monitor,
        '--latency-msec=20'
      ]);

      this.monProcess.stdout.on('data', (data) => {
        if (!this.isRecording) return;
        this.handleIncomingAudio(data, 'monitor');
      });

      this.monProcess.stderr.on('data', (e) => {
        console.error('[NativeAudio monitor error]:', e.toString());
      });
    }

    // Silence monitor
    this.silenceCheckInterval = setInterval(() => {
      if (!this.isRecording || !this.isSpeaking) return;

      const silenceDuration = Date.now() - this.lastSoundTime;
      const totalSpeechDuration = Date.now() - this.speechStartTime;

      if (silenceDuration > this.silenceThreshold && totalSpeechDuration > 500) {
        this.isSpeaking = false;
      }
    }, 80);
  }

  handleIncomingAudio(data, source) {
    const level = this.calculateLevel(data);

    if (this.currentSource !== 'both') {
      // Single source mode
      this.emit('chunk', data);
      this.emit('level', level);
      this.checkVoiceActivity(level);
      return;
    }

    // Dual source mode: balance and mix
    if (source === 'mic') {
      this.micQueue.push(data);
    } else {
      this.monQueue.push(data);
    }

    if (this.micQueue.length > 0 && this.monQueue.length > 0) {
      const micChunk = this.micQueue.shift();
      const monChunk = this.monQueue.shift();
      const mixed = this.mixPcm(micChunk, monChunk);
      const combinedLevel = Math.max(this.calculateLevel(micChunk), this.calculateLevel(monChunk));

      this.emit('chunk', mixed);
      this.emit('level', combinedLevel);
      this.checkVoiceActivity(combinedLevel);
    } else if (this.micQueue.length > 4) {
      const micChunk = this.micQueue.shift();
      const lvl = this.calculateLevel(micChunk);
      this.emit('chunk', micChunk);
      this.emit('level', lvl);
      this.checkVoiceActivity(lvl);
    } else if (this.monQueue.length > 4) {
      const monChunk = this.monQueue.shift();
      const lvl = this.calculateLevel(monChunk);
      this.emit('chunk', monChunk);
      this.emit('level', lvl);
      this.checkVoiceActivity(lvl);
    }
  }

  checkVoiceActivity(level) {
    if (level > 8) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTime = Date.now();
        this.emit('speech-start');
      }
      this.lastSoundTime = Date.now();
    }
  }

  stop() {
    this.isRecording = false;
    this.isSpeaking = false;
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
    if (this.micProcess) {
      this.micProcess.kill();
      this.micProcess = null;
    }
    if (this.monProcess) {
      this.monProcess.kill();
      this.monProcess = null;
    }
    this.micQueue = [];
    this.monQueue = [];
  }
}

module.exports = NativeAudioService;
