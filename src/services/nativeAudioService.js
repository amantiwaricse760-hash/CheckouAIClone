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
    this.silenceThreshold = 750; // 750ms of silence to trigger answer (ultra-fast!)
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
    console.log(`[NativeAudio] Starting capture from: ${deviceName} (${this.currentSource}) at 16kHz mono`);

    // Pure linear16 PCM stream to stdout (compatible with Deepgram & avoids parec file error)
    this.process = spawn('parec', [
      '--format=s16le',
      '--rate=16000',
      '--channels=1',
      '-d', deviceName,
      '--latency-msec=20'
    ]);

    this.process.stdout.on('data', (data) => {
      if (!this.isRecording) return;
      this.chunks.push(data);
      this.emit('chunk', data);

      // Fast audio level calculation from raw PCM
      let sum = 0;
      const step = 4;
      for (let i = 0; i < data.length - 1; i += step) {
        const sample = data.readInt16LE(i);
        sum += sample * sample;
      }
      const count = Math.max(1, data.length / (step / 2));
      const rms = Math.sqrt(sum / count);
      const level = Math.min(100, Math.round((rms / 32768) * 100 * 6));

      this.emit('level', level);

      // Voice Activity Detection
      if (level > 8) {
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

    // High-frequency silence monitor (checks every 75ms)
    this.silenceCheckInterval = setInterval(() => {
      if (!this.isRecording || !this.isSpeaking) return;

      const silenceDuration = Date.now() - this.lastSoundTime;
      const totalSpeechDuration = Date.now() - this.speechStartTime;

      if (silenceDuration > this.silenceThreshold && totalSpeechDuration > 600) {
        console.log(`[NativeAudio] Question ended (${silenceDuration}ms silence). Triggering answer!`);
        this.isSpeaking = false;
        this.finalizeAndEmitAudio();
      }
    }, 75);
  }

  finalizeAndEmitAudio() {
    if (this.chunks.length === 0) return;
    const rawPcm = Buffer.concat(this.chunks);
    this.chunks = [];

    // Only process if audio size is meaningful (> 15KB)
    if (rawPcm.length > 15000) {
      const wavBuffer = this.addWavHeader(rawPcm, 16000, 1, 16);
      this.emit('audio-ready', {
        audioBase64: wavBuffer.toString('base64'),
        mimeType: 'audio/wav',
        source: this.currentSource
      });
    }
  }

  addWavHeader(samples, sampleRate = 16000, numChannels = 1, bitDepth = 16) {
    const buffer = Buffer.alloc(44 + samples.length);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples.length, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitDepth / 8), 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples.length, 40);
    samples.copy(buffer, 44);
    return buffer;
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
