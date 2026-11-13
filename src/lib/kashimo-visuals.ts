import { styleTokens } from "@/lib/css-tokens";
type Point = { x: number; y: number };
type Wave = Point & { vx: number; vy: number; kind: string; life: number; shape?: number };
const palette = () => {
  const css = styleTokens;
  return (name: string) => css.getPropertyValue(`--${name}`).trim();
};

export function drawKashimoWave(c: CanvasRenderingContext2D, p: Wave, time: number) {
  const color = palette();
  c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx));
  c.lineJoin = "round";
  if (p.kind === "sound") {
    // rajada roxa simples: leve de desenhar
    c.fillStyle = color("kashimo-sound"); c.globalAlpha = 0.85;
    c.beginPath(); c.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; c.fillStyle = color("kashimo-sound-light");
    c.beginPath(); c.ellipse(5, 0, 10, 5, 0, 0, Math.PI * 2); c.fill();
  } else {
    const r = 7 + (p.shape ?? 0) % 4 + Math.sin(time / 65) * 1.5;
    c.shadowColor = color("kashimo-radiation-edge"); c.shadowBlur = 16;
    for (const [token, scale] of [["kashimo-radiation-edge", 1.6], ["kashimo-radiation", 1.18], ["kashimo-amber", 0.8]] as const) {
      c.fillStyle = color(token); c.beginPath(); c.ellipse(0, 0, r * scale * 1.35, r * scale, 0, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

export function drawAmberFlow(c: CanvasRenderingContext2D, f: Point, time: number) {
  const color = palette();
  c.save(); c.translate(f.x, f.y); c.lineCap = "round";
  // pele de plasma laranja, menor e sem brilho pesado
  c.globalAlpha = 0.45; c.fillStyle = color("kashimo-amber");
  c.beginPath();
  for (let j = 0; j <= 32; j++) {
    const a = j / 32 * Math.PI * 2, r = 16 + Math.sin(a * 7 - time / 55) * 2;
    if (j === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath(); c.fill(); c.globalAlpha = 1;
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4 + time / 350, r = 6 + (i % 3) * 3, x = Math.cos(a) * r, y = Math.sin(a) * r;
    c.strokeStyle = color(i % 3 ? "kashimo-amber" : "energy-core"); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4, y - 3); c.lineTo(x + 1.5, y - 6); c.stroke();
  }
  c.restore();
}

export function drawWorldCut(c: CanvasRenderingContext2D, p: Wave) {
  const color = palette();
  c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx));
  c.fillStyle = color("cut-void"); c.strokeStyle = color("cut-edge");
  c.lineWidth = 2.5; c.shadowColor = color("cut-glow"); c.shadowBlur = 9;
  c.beginPath(); c.moveTo(-26, -72);
  c.bezierCurveTo(40, -35, 44, 39, -27, 74);
  c.lineTo(10, 68); c.bezierCurveTo(61, 25, 53, -43, 9, -70);
  c.closePath(); c.fill(); c.stroke(); c.restore();
}