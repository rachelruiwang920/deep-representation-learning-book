/** Short synthesized cues. No audio files, so the station works offline. */
export class Sfx {
  private context: AudioContext | null = null;

  unlock(): void {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
  }

  tick(go: boolean): void {
    this.tone(go ? 740 : 480, go ? 0.12 : 0.07, "sine", go ? 0.05 : 0.03);
  }

  hit(): void {
    this.tone(1180, 0.05, "square", 0.02);
    this.tone(1760, 0.08, "sine", 0.015);
  }

  miss(): void {
    this.tone(140, 0.12, "sawtooth", 0.02);
  }

  click(intensity: number): void {
    const pitch = 520 + Math.min(480, intensity * 18);
    this.tone(pitch, 0.03, "square", 0.012);
  }

  result(): void {
    this.tone(523, 0.12, "sine", 0.03);
    window.setTimeout(() => this.tone(659, 0.12, "sine", 0.03), 90);
    window.setTimeout(() => this.tone(784, 0.18, "sine", 0.035), 180);
  }

  private ensure(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    return this.context;
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number): void {
    try {
      const ctx = this.ensure();
      if (ctx.state === "suspended") return;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(gain, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* Audio is optional feedback; a blocked context should not stop the test. */
    }
  }
}
