/** Lê tokens de cor do CSS no navegador; no servidor usa valores padrão. */
const FALLBACK: Record<string, string> = {
  "--blackhole-haze": "#4c1d95", "--blackhole-ink": "#05010d", "--blackhole-light": "#c4b5fd",
  "--blood-bright": "#dc2626", "--blood-deep": "#7f1d1d", "--blood-poison": "#65a30d",
  "--cut-edge": "#f8fafc", "--cut-void": "#0b0b12",
  "--divergent-blue": "#2563eb", "--divergent-cyan": "#22d3ee", "--divergent-light": "#e0f2fe",
  "--foreground": "#f8fafc",
  "--garuda-bone": "#e7e5e4", "--garuda-edge": "#a8a29e", "--garuda-eye": "#ef4444", "--garuda-shade": "#292524", "--garuda-spike": "#78716c",
  "--gavel-handle": "#78350f", "--gavel-head": "#a16207",
  "--jackpot-cyan": "#22d3ee", "--jackpot-energy": "#4ade80", "--jackpot-light": "#ecfccb",
  "--kashimo-gold": "#facc15", "--kashimo-grip": "#1e3a8a", "--kashimo-sound": "#38bdf8", "--kashimo-sound-light": "#e0f2fe", "--kashimo-staff": "#94a3b8",
  "--metal-dark": "#3f3f46", "--metal-light": "#d4d4d8",
  "--pachinko-background": "#1e1b4b", "--pachinko-cabinet": "#312e81", "--pachinko-ink": "#f8fafc",
};
export const styleTokens = {
  getPropertyValue(name: string): string {
    if (typeof document !== "undefined") { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); if (v) return v; }
    return FALLBACK[name] ?? "#ffffff";
  },
};
