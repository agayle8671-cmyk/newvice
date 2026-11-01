"use client";

// ─── NewVice V3 Master Web Audio DSP Graph ───────────────────────────────────
// Persistent single-AudioContext processing pipeline shared across dual <video>
// DOM buffers (Slot A & Slot B):
//
//   [Slot A MediaElementSource] -> [Slot A Gain] ──┐
//                                                  ├──> [Cabin FM Lowpass + Mid Warmth]
//   [Slot B MediaElementSource] -> [Slot B Gain] ──┘           │
//                                                              ▼
//                                                   [Voice Duck Gain (-12 dB)]
//                                                              │
//                                                              ▼
//                                              [DynamicsCompressorNode Normalizer]
//                                                              │
//                                                              ▼
//                                              [AnalyserNode (20-120 Hz Sub-Bass)]
//                                                              │
//                                                              ▼
//                                                  [Master Gain] -> Destination

const attachedElementNodes = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>();

const DUCK_LINEAR_GAIN = Math.pow(10, -12 / 20); // -12 dB (~0.2512)

export class DriveInAudioGraph {
  private ctx: AudioContext | null = null;
  private slotAGain: GainNode | null = null;
  private slotBGain: GainNode | null = null;
  private cabinLowpass: BiquadFilterNode | null = null;
  private cabinMidPeak: BiquadFilterNode | null = null;
  private voiceDuckGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;

  private cabinMode = false;
  private ducked = false;
  private volume = 0.85;
  private muted = true;

  /** Lazily creates and unlocks the shared AudioContext on first user interaction */
  public unlock(
    slotA?: HTMLVideoElement | null,
    slotB?: HTMLVideoElement | null
  ): boolean {
    if (typeof window === "undefined") return false;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return false;

    if (!this.ctx) {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.slotAGain = ctx.createGain();
      this.slotBGain = ctx.createGain();

      // Cabin FM Radio acoustic stage (20 kHz transparent open-air; 950 Hz warm dashboard FM)
      this.cabinLowpass = ctx.createBiquadFilter();
      this.cabinLowpass.type = "lowpass";
      this.cabinLowpass.frequency.value = this.cabinMode ? 950 : 20_000;
      this.cabinLowpass.Q.value = 0.707;

      this.cabinMidPeak = ctx.createBiquadFilter();
      this.cabinMidPeak.type = "peaking";
      this.cabinMidPeak.frequency.value = 1100;
      this.cabinMidPeak.Q.value = 1.1;
      this.cabinMidPeak.gain.value = this.cabinMode ? 3.5 : 0;

      // -12 dB voice ducking stage for Cabin FM WebRTC talkover
      this.voiceDuckGain = ctx.createGain();
      this.voiceDuckGain.gain.value = this.ducked ? DUCK_LINEAR_GAIN : 1.0;

      // Broadcast loudness normalizer across heterogeneous 20-platform clips
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      // fftSize 2048 -> ~23.4 Hz bin resolution @ 48 kHz so bins 1..5 isolate 20-120 Hz sub-bass
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;
      this.freqBins = new Uint8Array(this.analyser.frequencyBinCount);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;

      // Wire signal chain
      this.slotAGain.connect(this.cabinLowpass);
      this.slotBGain.connect(this.cabinLowpass);
      this.cabinLowpass.connect(this.cabinMidPeak);
      this.cabinMidPeak.connect(this.voiceDuckGain);
      this.voiceDuckGain.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    this.attachVideoSlots(slotA, slotB);
    return this.ctx.state === "running";
  }

  /**
   * Safely binds persistent <video> DOM slots into the AudioContext once.
   * Only attaches elements configured with crossOrigin="anonymous" so non-CORS
   * fallback streams never suffer MediaElementSource silence.
   */
  public attachVideoSlots(
    slotA?: HTMLVideoElement | null,
    slotB?: HTMLVideoElement | null
  ): void {
    if (!this.ctx || !this.slotAGain || !this.slotBGain) return;

    const bindSlot = (el: HTMLVideoElement | null | undefined, gain: GainNode) => {
      if (!el || !this.ctx) return;
      if (el.crossOrigin !== "anonymous") return;
      if (attachedElementNodes.has(el)) return;

      try {
        const source = this.ctx.createMediaElementSource(el);
        source.connect(gain);
        attachedElementNodes.set(el, source);
      } catch {
        // Element was already bound in an earlier lifecycle
      }
    };

    bindSlot(slotA, this.slotAGain);
    bindSlot(slotB, this.slotBGain);
  }

  public isElementRouted(el: HTMLVideoElement | null | undefined): boolean {
    return Boolean(el && attachedElementNodes.has(el));
  }

  public setActiveSlot(slot: "A" | "B"): void {
    if (!this.ctx || !this.slotAGain || !this.slotBGain) return;
    const t = this.ctx.currentTime;
    this.slotAGain.gain.setTargetAtTime(slot === "A" ? 1 : 0, t, 0.008);
    this.slotBGain.gain.setTargetAtTime(slot === "B" ? 1 : 0, t, 0.008);
  }

  public setMasterVolume(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const target = muted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }
  }

  /** Toggle warm 950 Hz Cabin FM Radio acoustic filter (Phase 2 Cabin Mode ready) */
  public setCabinRadioMode(enabled: boolean): void {
    this.cabinMode = enabled;
    if (!this.ctx || !this.cabinLowpass || !this.cabinMidPeak) return;
    const t = this.ctx.currentTime;
    this.cabinLowpass.frequency.setTargetAtTime(enabled ? 950 : 20_000, t, 0.04);
    this.cabinMidPeak.gain.setTargetAtTime(enabled ? 3.5 : 0, t, 0.04);
  }

  /** Smoothly ducks movie audio by -12 dB while a cabin passenger is speaking */
  public setVoiceDucking(active: boolean): void {
    this.ducked = active;
    if (!this.ctx || !this.voiceDuckGain) return;
    const target = active ? DUCK_LINEAR_GAIN : 1.0;
    this.voiceDuckGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /**
   * Samples the 20-120 Hz sub-bass frequency band (normalized 0..1)
   * to drive reactive vehicle neon underglow pulses in sync with explosions & synthwave bass.
   */
  public getSubBassEnergy(): number {
    if (!this.ctx || !this.analyser || !this.freqBins || this.muted) return 0;
    this.analyser.getByteFrequencyData(this.freqBins);

    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const minBin = Math.max(1, Math.floor(20 / binHz));
    const maxBin = Math.min(
      this.freqBins.length - 1,
      Math.ceil(120 / binHz)
    );

    let sum = 0;
    let count = 0;
    for (let i = minBin; i <= maxBin; i++) {
      sum += this.freqBins[i];
      count++;
    }
    return count > 0 ? Math.min(1, sum / (count * 255)) : 0;
  }

  /**
   * Synthesizes a 3D spatially-panned car horn positioned at the caller's parking stall
   * (panX: -1 far left .. +1 far right; zDepth: 0.2 front row .. 0.9 back row).
   */
  public playSpatialHorn(
    hornId = "synth_horn",
    panX = 0,
    zDepth = 0.5
  ): void {
    if (!this.ctx || this.ctx.state !== "running" || this.muted) return;

    const now = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, panX));

    const envGain = this.ctx.createGain();
    const distanceAttenuation = Math.max(0.25, 1 - zDepth * 0.55);
    const peakGain = 0.16 * this.volume * distanceAttenuation;

    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain), now + 0.02);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    // Dual-tone automotive chord (Vice synth fifth vs classic muscle horn)
    const freqs: [number, number] =
      hornId === "vice_siren"
        ? [587.33, 880.0]
        : hornId === "lowrider_chime"
        ? [523.25, 659.25]
        : [349.23, 440.0];

    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = hornId === "synth_horn" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(envGain);
      osc.start(now);
      osc.stop(now + 0.4);
    }

    envGain.connect(panner);
    panner.connect(this.ctx.destination);
  }
}

// Singleton accessor for client components (e.g. Phase 2 Spatial Lot Underglow & Horn triggers)
let sharedDriveInAudioGraph: DriveInAudioGraph | null = null;

export function getDriveInAudioGraph(): DriveInAudioGraph {
  if (!sharedDriveInAudioGraph) {
    sharedDriveInAudioGraph = new DriveInAudioGraph();
  }
  return sharedDriveInAudioGraph;
}
