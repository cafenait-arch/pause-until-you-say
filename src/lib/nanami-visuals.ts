import type { Fx } from "./engine";

type Body = { x: number; y: number; meleeCd: number; buff: unknown; weaponHp: number };
const CYAN = "#22d3ee", DARK = "#0b1f1c";

function seeded(seed = 0.5) {
  let s = Math.floor(seed * 233280) || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Cutelo do Nanami: lâmina branca com manchas pretas e cabo preto; em Horas Extras a gravata envolve o cabo */
export function drawCleaver(c: CanvasRenderingContext2D, x: number, y: number, angle: number, wrapped: boolean) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(0.55, 0.55);
  c.fillStyle = "#111111"; c.fillRect(-18, -3, 19, 6);
  if (wrapped) { c.fillStyle = "#1e3a5f"; for (let i = 0; i < 3; i++) c.fillRect(-16 + i * 5, -4, 3, 8); }
  c.fillStyle = "#f5f5f4"; c.strokeStyle = "#111111"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, -6); c.lineTo(34, -8); c.lineTo(37, -5); c.lineTo(37, 8); c.lineTo(0, 6); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#111111";
  for (const [sx, sy, rx, ry] of <[number, number, number, number][]>[[7, -2, 2.6, 1.8], [14, 3, 3, 2], [21, -4, 2.2, 1.6], [29, 3, 2.8, 2.1], [11, -4.5, 1.4, 1], [25, -0.5, 1.7, 1.3], [33, -4, 1.5, 1.2]]) {
    c.beginPath(); c.ellipse(sx, sy, rx, ry, 0.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

export function drawNanami(c: CanvasRenderingContext2D, f: Body, op: { x: number; y: number }, time: number) {
  const angle = Math.atan2(op.y - f.y, op.x - f.x);
  if (f.buff) { // Horas Extras: energia liberada
    c.save(); c.strokeStyle = CYAN; c.globalAlpha = 0.35 + Math.sin(time / 120) * 0.2; c.lineWidth = 2;
    c.strokeRect(f.x - 19, f.y - 19, 38, 38); c.restore();
  }
  if (f.weaponHp <= 0) return;
  const handX = f.x + Math.cos(angle + 0.65) * 20, handY = f.y + Math.sin(angle + 0.65) * 20;
  drawCleaver(c, handX, handY, angle + (f.meleeCd > 200 ? -0.7 : 0.35), !!f.buff);
}

/** Efeitos do Nanami: régua 7:3 com ponto fraco, rastro em ondas e o redemoinho do Colapso */
export function drawNanamiFx(c: CanvasRenderingContext2D, e: Fx, k: number) {
  const base = c.globalAlpha;
  if (e.kind === "ratio") {
    const L = e.r * 2, px = -L / 2 + L * 0.7, grow = Math.min(1, (1 - k) * 5 + 0.2), rnd = seeded(e.seed);
    c.save(); c.translate(e.x, e.y); c.rotate(e.ang ?? 0);
    c.fillStyle = "#dc2626";
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, len = (6 + rnd() * 22) * grow, w = 1 + rnd() * 2.5;
      c.beginPath(); c.moveTo(px + Math.cos(a + 1.57) * w, Math.sin(a + 1.57) * w); c.lineTo(px + Math.cos(a) * len, Math.sin(a) * len); c.lineTo(px + Math.cos(a - 1.57) * w, Math.sin(a - 1.57) * w); c.fill();
    }
    for (let i = 0; i < 6; i++) { const a = rnd() * 7, d = (14 + rnd() * 16) * grow; c.beginPath(); c.arc(px + Math.cos(a) * d, Math.sin(a) * d, 1 + rnd() * 1.5, 0, 7); c.fill(); }
    c.beginPath(); c.arc(px, 0, 6 * grow, 0, 7); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.shadowColor = "#ffffff"; c.shadowBlur = 4;
    c.beginPath(); c.moveTo(-L / 2, 0); c.lineTo(L / 2, 0);
    c.moveTo(-L / 2, -5); c.lineTo(-L / 2, 5); c.moveTo(L / 2, -5); c.lineTo(L / 2, 5);
    for (let i = 1; i < 10; i++) { const x = -L / 2 + (L * i) / 10; c.moveTo(x, -3); c.lineTo(x, 3); }
    c.stroke(); c.shadowBlur = 0;
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(px, 0, 1.6, 0, 7); c.fill();
    c.restore();
    c.font = "bold 8px sans-serif"; c.textAlign = "center"; c.fillStyle = "#ffffff"; c.fillText("RATIO", e.x, e.y + e.r * 0.75);
  } else if (e.kind === "nwave") {
    c.save(); c.translate(e.x, e.y); c.rotate(e.ang ?? 0); c.globalAlpha = base * 0.85;
    c.fillStyle = CYAN; c.beginPath(); c.ellipse(0, 0, e.r * 1.5, e.r * 0.6, 0, 0, 7); c.fill();
    c.fillStyle = DARK; c.beginPath(); c.ellipse(-2, 1, e.r * 0.9, e.r * 0.22, 0, 0, 7); c.fill();
    c.restore();
  } else if (e.kind === "collapse") {
    const g = 1 - k, R = e.r * (0.55 + g * 0.8), rnd = seeded(e.seed);
    c.save(); c.translate(e.x, e.y); c.rotate((e.ang ?? 0) + g * 2.5); c.lineCap = "round";
    c.fillStyle = "rgba(220,250,255,0.9)"; c.beginPath(); c.arc(0, 0, R * 0.55, 0, 7); c.fill();
    c.strokeStyle = CYAN; c.lineWidth = R * 0.35; c.beginPath(); c.arc(0, 0, R * 0.85, 0.3, Math.PI * 2 - 0.6); c.stroke();
    c.strokeStyle = DARK; c.lineWidth = R * 0.22; c.beginPath(); c.arc(0, 0, R * 0.72, 1.2, Math.PI * 2 + 0.2); c.stroke();
    c.fillStyle = CYAN;
    for (let i = 0; i < 7; i++) {
      const a = rnd() * 7, d = R * (1.05 + g * 0.6 + rnd() * 0.3), s = 2 + rnd() * 4;
      c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, s * 1.8, s * 0.7, a + 1.2, 0, 7); c.fill();
    }
    c.restore();
  }
  c.globalAlpha = base;
}
