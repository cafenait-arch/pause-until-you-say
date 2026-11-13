import { styleTokens } from "@/lib/css-tokens";
type Body = { x: number; y: number; meleeCd: number; equipment: string };
function palette() {
  const css = styleTokens;
  return (key: string) => css.getPropertyValue(key).trim();
}
export function drawTojiSpear(c: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const color = palette();
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(0.6, 0.6);
  c.fillStyle = color('--toji-grip'); c.fillRect(-12, -2, 15, 4);
  c.strokeStyle = color('--toji-metal'); c.lineWidth = 2; c.beginPath(); c.arc(-13, 0, 3, 0, Math.PI * 2); c.stroke();
  c.fillStyle = color('--toji-metal'); c.fillRect(2, -6, 3, 12);
  c.beginPath(); c.moveTo(5, -5); c.lineTo(31, -4); c.lineTo(38, 0); c.lineTo(14, 0); c.lineTo(8, 3); c.lineTo(29, 3); c.lineTo(23, 7); c.lineTo(5, 6); c.closePath(); c.fill();
  c.strokeStyle = color('--toji-edge'); c.lineWidth = 1; c.stroke(); c.restore();
}
export function drawToji(c: CanvasRenderingContext2D, f: Body, op: { x: number; y: number }) {
  const color = palette(), angle = Math.atan2(op.y - f.y, op.x - f.x);
  c.save(); c.translate(f.x, f.y);
  // Segmented inventory worm wraps the shoulders and torso, not a separate summon.
  for (let i = 0; i < 13; i++) {
    const a = i / 12 * Math.PI * 1.7 + 0.2;
    c.fillStyle = color('--toji-inventory'); c.strokeStyle = color('--toji-inventory-edge'); c.lineWidth = 1;
    c.beginPath(); c.ellipse(Math.cos(a) * 18, Math.sin(a) * 17, 6, 7, a, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.fillStyle = color('--toji-inventory'); c.beginPath(); c.ellipse(18, -13, 8, 9, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = color('--toji-edge'); c.beginPath(); c.moveTo(14, -15); c.lineTo(17, -14); c.moveTo(20, -14); c.lineTo(23, -15); c.moveTo(16, -10); c.quadraticCurveTo(20, -7, 23, -11); c.stroke(); c.restore();
  const handX = f.x + Math.cos(angle + 0.65) * 20, handY = f.y + Math.sin(angle + 0.65) * 20;
  drawTojiSpear(c, handX, handY, angle + (f.meleeCd > 180 ? 0.25 : 0));
}
export function drawTojiChain(c: CanvasRenderingContext2D, source: Body, tip: { x: number; y: number; vx: number; vy: number; ab?: { type: string } }, time: number) {
  const color = palette(), dx = tip.x - source.x, dy = tip.y - source.y, length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
  c.save(); c.strokeStyle = color('--toji-metal'); c.lineWidth = 1.4;
  const links = Math.max(2, Math.ceil(length / 9));
  for (let i = 1; i <= links; i++) {
    const t = i / links, wave = Math.sin(t * Math.PI * 3 - time / 110) * Math.sin(t * Math.PI) * Math.min(22, length * 0.12);
    const x = source.x + dx * t - Math.sin(angle) * wave, y = source.y + dy * t + Math.cos(angle) * wave;
    c.beginPath(); c.ellipse(x, y, 4.5, i % 2 ? 2 : 1, angle, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
  if (tip.ab?.type === 'chainSpear') drawTojiSpear(c, tip.x, tip.y, Math.atan2(tip.vy, tip.vx));
}