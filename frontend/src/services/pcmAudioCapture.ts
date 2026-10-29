/**
 * pcmAudioCapture.ts
 * Captura audio del micrófono y lo convierte a PCM 16-bit mono a 16000 Hz,
 * con compuerta de ruido (Noise Gate) y supresión de eco acústico (Mute durante reproducción).
 */

export interface AudioCaptureOptions {
  onAudioData: (pcmBytes: Uint8Array) => void;
  sampleRate?: number;
  noiseThreshold?: number; // RMS mínimo para transmitir (default 0.004)
}

export class PcmAudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRecording = false;
  private options: AudioCaptureOptions;
  public isMuted = false;

  constructor(options: AudioCaptureOptions) {
    this.options = options;
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;

    // 1. Solicitar permisos de micrófono con cancelación de eco nativa
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Crear contexto de audio
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = this.options.sampleRate || 16000;
    const threshold = this.options.noiseThreshold ?? 0.003;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Buffer de 2048 muestras (~42ms a 48kHz o ~128ms a 16kHz)
    const bufferSize = 2048;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRecording) return;

      // Si está muteado (Jarvis está hablando por los altavoces), no enviar audio para evitar auto-interrupción
      if (this.isMuted) return;

      const inputChannelData = e.inputBuffer.getChannelData(0);

      // Compuerta de ruido: calcular energía RMS
      let sum = 0;
      for (let i = 0; i < inputChannelData.length; i++) {
        sum += inputChannelData[i] * inputChannelData[i];
      }
      const rms = Math.sqrt(sum / inputChannelData.length);

      // Si el volumen está por debajo del umbral de ruido de fondo, omitir
      if (rms < threshold) return;

      const resampledData = this.resample(inputChannelData, inputSampleRate, targetSampleRate);
      const pcm16 = this.floatTo16BitPCM(resampledData);

      this.options.onAudioData(pcm16);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;
  }

  public stop(): void {
    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
      }
      this.audioContext = null;
    }
  }

  private resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
    if (inRate === outRate) return input;
    const ratio = inRate / outRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = i * ratio;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, input.length - 1);
      const t = idx - lo;
      result[i] = input[lo] * (1 - t) + input[hi] * t;
    }
    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Uint8Array {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, val, true); // Little endian
    }
    return new Uint8Array(buffer);
  }
}
