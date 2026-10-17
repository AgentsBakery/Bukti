// Low-level audio plumbing for the live interview.
// Mic: getUserMedia → AudioWorklet → 16 kHz PCM16 mono little-endian frames.
// Playback: 24 kHz PCM16 chunks scheduled gaplessly on an AudioContext queue.

const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.acc = 0;
    this.n = 0;
    this.frame = new Int16Array(640); // 40 ms at 16 kHz
    this.i = 0;
    this.muted = false;
    this.port.onmessage = (e) => { if (e.data && typeof e.data.muted === 'boolean') this.muted = e.data.muted; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.acc += ch[k];
      this.n++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        let s = this.acc / this.n;
        this.acc = 0; this.n = 0;
        if (this.muted) s = 0;
        s = Math.max(-1, Math.min(1, s));
        this.frame[this.i++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.i === this.frame.length) {
          if (!this.muted) this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
          this.frame = new Int16Array(640);
          this.i = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('bukti-pcm-capture', PcmCapture);
`

function rmsLevel(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return Math.min(1, Math.sqrt(rms) * 1.6)
}

export interface MicCapture {
  level(): number
  setMuted(muted: boolean): void
  stop(): void
}

export async function startMic(onFrame: (pcm16: ArrayBuffer) => void): Promise<MicCapture> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is not available in this browser')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }))
  try {
    await ctx.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'bukti-pcm-capture')
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  const buf = new Float32Array(analyser.fftSize)
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onFrame(e.data)
  source.connect(analyser)
  source.connect(node)
  // Worklet must be pulled by the graph; route through a muted gain so nothing is heard.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)
  let muted = false
  return {
    level: () => (muted ? 0 : rmsLevel(analyser, buf)),
    setMuted: (m) => {
      muted = m
      node.port.postMessage({ muted: m })
    },
    stop: () => {
      stream.getTracks().forEach((t) => t.stop())
      node.disconnect()
      source.disconnect()
      void ctx.close()
    },
  }
}

export class PcmPlayer {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private buf: Float32Array<ArrayBuffer>
  private nextTime = 0
  private sources = new Set<AudioBufferSourceNode>()
  private speaking = false
  private onSpeaking?: (s: boolean) => void
  private timer: number | undefined

  constructor(onSpeaking?: (s: boolean) => void) {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.buf = new Float32Array(this.analyser.fftSize)
    this.analyser.connect(this.ctx.destination)
    this.onSpeaking = onSpeaking
  }

  resume() {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  enqueue(pcm16: ArrayBuffer, sampleRate = 24000) {
    const ints = new Int16Array(pcm16)
    if (!ints.length) return
    const audio = this.ctx.createBuffer(1, ints.length, sampleRate)
    const ch = audio.getChannelData(0)
    for (let i = 0; i < ints.length; i++) ch[i] = ints[i] / 0x8000
    const src = this.ctx.createBufferSource()
    src.buffer = audio
    src.connect(this.analyser)
    const start = Math.max(this.nextTime, this.ctx.currentTime + 0.03)
    src.start(start)
    this.nextTime = start + audio.duration
    this.sources.add(src)
    src.onended = () => {
      this.sources.delete(src)
      this.checkDrained()
    }
    this.setSpeaking(true)
  }

  /** Barge-in: drop everything queued. */
  flush() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear()
    this.nextTime = 0
    this.setSpeaking(false)
  }

  level(): number {
    return this.sources.size ? rmsLevel(this.analyser, this.buf) : 0
  }

  close() {
    this.flush()
    window.clearTimeout(this.timer)
    void this.ctx.close()
  }

  private checkDrained() {
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      if (!this.sources.size) this.setSpeaking(false)
    }, 180)
  }

  private setSpeaking(s: boolean) {
    if (s === this.speaking) return
    this.speaking = s
    this.onSpeaking?.(s)
  }
}
