/**
 * pcmAudioPlayer.ts
 * Reproduce audio incremental en PCM 16-bit mono a 24000 Hz recibido de Gemini Live,
 * con programación continua de buffers, jitter buffer adaptativo y corte instantáneo de audio en interrupciones.
 */

export class PcmAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private sampleRate = 24000;
  public onPlaybackStarted?: () => void;
  public onPlaybackEnded?: () => void;

  constructor() {
    this.initContext();
  }

  private initContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
  }

  public async playChunk(pcm16Bytes: Uint8Array): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Convertir PCM 16-bit little-endian a Float32Array (-1.0 a 1.0)
    const samplesCount = Math.floor(pcm16Bytes.length / 2);
    if (samplesCount === 0) return;

    const float32 = new Float32Array(samplesCount);
    const view = new DataView(pcm16Bytes.buffer, pcm16Bytes.byteOffset, pcm16Bytes.byteLength);

    for (let i = 0; i < samplesCount; i++) {
      const int16 = view.getInt16(i * 2, true); // Little endian
      float32[i] = int16 / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(1, samplesCount, this.sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    
    // Jitter buffer: si el tiempo programado quedó atrás, añadir margen de 80ms
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.08;
    }

    const wasEmpty = this.activeSources.length === 0;
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;

    this.activeSources.push(source);
    if (wasEmpty) {
      this.onPlaybackStarted?.();
    }

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
      if (this.activeSources.length === 0) {
        this.onPlaybackEnded?.();
      }
    };
  }

  /**
   * Detiene inmediatamente la reproducción de todos los fragmentos programados
   * y reinicia los contadores (usado al interrumpir al asistente).
   */
  public interrupt(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignorar si ya se detuvo
      }
    }
    this.activeSources = [];
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
    this.onPlaybackEnded?.();
  }

  public get isPlaying(): boolean {
    return this.activeSources.length > 0;
  }

  public close(): void {
    this.interrupt();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
