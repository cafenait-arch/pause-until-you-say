export function physicalImpact(force: number, baseStun = 0, baseKnockback = 2.5) {
  return { stun: Math.min(1100, Math.max(baseStun, force * 1.75)), knockback: Math.min(24, baseKnockback + force / 40) };
}

/** Velocities use pixels per simulation frame; solve interception without leading a stunned target. */
export function interceptAngle(source: { x: number; y: number }, target: { x: number; y: number; vx: number; vy: number; stun: number; casting: unknown; beam: unknown }, speed: number) {
  const dx = target.x - source.x, dy = target.y - source.y;
  const stationary = target.stun > 0 || !!target.casting || !!target.beam;
  const vx = stationary ? 0 : target.vx, vy = stationary ? 0 : target.vy;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
  let t = Math.sqrt(c) / Math.max(0.1, speed);
  const disc = b * b - 4 * a * c;
  if (Math.abs(a) > 0.001 && disc >= 0) {
    const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((n) => n > 0);
    if (roots.length) t = Math.min(...roots);
  } else if (Math.abs(b) > 0.001 && -c / b > 0) t = -c / b;
  t = Math.min(t, 45);
  return Math.atan2(dy + vy * t, dx + vx * t);
}

export function tacticalDistance(preferred: number, phase: number, retreating: boolean, opening: boolean, opponentStill: boolean) {
  if (retreating) return Math.max(150, preferred);
  if (opening) return preferred <= 60 ? 24 : Math.min(preferred, 125);
  if (opponentStill) return preferred <= 60 ? 26 : Math.min(preferred, 170);
  return [preferred, preferred <= 60 ? 105 : Math.max(35, preferred * 0.5), preferred + 65][phase] ?? preferred;
}