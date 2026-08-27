// A rest-timer alert that actually reaches you.
//
// navigator.vibrate is the obvious choice and it is the wrong one on its own: iOS
// Safari does not implement the Vibration API at all, so on an iPhone the timer used
// to end in complete silence. Two short tones cost no asset file and work everywhere.
let ctx: AudioContext | null = null;

/**
 * Browsers only allow audio to start from a user gesture. Ticking a set off is one,
 * and that is what starts the timer, so the context is created there and is already
 * running by the time the countdown reaches zero.
 */
export function primeBeep(): void {
  try {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio is a nicety; the visible countdown is the real signal */
  }
}

function tone(at: number, freq: number, seconds: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Ramped rather than switched, so it reads as a chime instead of a click.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/** Fired when the rest timer hits zero. Silently does nothing if audio is unavailable. */
export function restOverAlert(): void {
  navigator.vibrate?.([120, 80, 120]);
  try {
    primeBeep();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    tone(now, 880, 0.16);
    tone(now + 0.22, 1174, 0.22);
  } catch {
    /* see primeBeep */
  }
}
