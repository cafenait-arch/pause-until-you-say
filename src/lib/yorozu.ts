import { styleTokens } from "@/lib/css-tokens";
import combat from "@/data/combat.json";
import type { Battle, Fighter, Proj, Ability, AbilityChoice, Domain } from "./engine";

/**
 * Yorozu — Construção. Tudo nasce da mesma técnica: armas, metal líquido e suas variações,
 * Armadura e Asas de Inseto, Esfera Verdadeira e a Aflição Tripla.
 */
const W = combat.arena.width, H = combat.arena.height, SIZE = combat.arena.fighterSize, DOMAIN_R = combat.arena.domainRadius;

export const YZ_TYPES = new Set(["construct", "liquidMetal", "insectArmor", "insectWings", "perfectSphere"]);
const YZ_PROJ = new Set<Proj["kind"]>(["construct", "metal", "yzBlade", "yzChain", "yzLance"]);

export type YzState = {
  wings: number; wingMult: number; plates: number; platesT: number; weapon: number;
  combo: number; comboT: number; comboMetalCd: number; morph: number;
  rush: { t: number; turn: number; flip: number; ab: Ability } | null;
  /** Massa de Metal Líquido em volta dela: fica até ela recolher */
  pool: boolean;
  /** Molde em preparação (forma escolhida e tempo até sair) */
  mold: { key: string; t: number; max: number } | null;
  /** Espera até o metal moldar a próxima forma */
  moldCd: number;
  /** Recarga de cada forma (moldes do metal e Investida) */
  formCd: Record<string, number>;
};
export type YzEnt =
  | { kind: "cage"; owner: number; ab: Ability; x: number; y: number; r: number; life: number; max: number; tick: number }
  | { kind: "spikes"; owner: number; ab: Ability; x: number; y: number; r: number; warm: number; life: number; max: number; hit: boolean; dirs: number[]; dmg: number; free?: boolean }
  | { kind: "drone"; owner: number; ab: Ability; x: number; y: number; vx: number; vy: number; life: number; max: number; cd: number; seed: number };

export const makeYz = (): YzState => ({ wings: 0, wingMult: 1, plates: 0, platesT: 0, weapon: 0, combo: 0, comboT: 0, comboMetalCd: 0, morph: 0, rush: null, pool: false, mold: null, moldCd: 0, formCd: {} });
export const flightMult = (f: Fighter) => (f.yz && f.yz.wings > 0 ? f.yz.wingMult : 1);

const sm = (a: Ability) => a.timing?.speedMult ?? 1;
const first = (me: Fighter) => me.def.name.split(" ")[0];
const idxOf = (b: Battle, f: Fighter) => b.f.indexOf(f);
const metalAb = (me: Fighter) => me.def.abilities.find((a) => a.type === "liquidMetal");
/** Formas do Metal Líquido (correntes, gaiola, espinhos...) e a Investida da Armadura: ataques sem botão. */
export const metalForm = (me: Fighter, key: string) => metalAb(me)?.forms?.[key];
const rushAb = (me: Fighter) => me.def.abilities.find((a) => a.type === "insectArmor")?.forms?.["rush"];
const need = (me: Fighter, a: Ability) => (a.cost ?? 0) * (me.def.costMult ?? 1) * (combat.energy?.costMult ?? 1);

/** Domínio Aflição Tripla ativo com o alvo dentro: as construções ganham acerto garantido. */
export function sureDomain(b: Battle, owner: number): Domain | undefined {
  const op = b.f[1 - owner];
  if (!op) return undefined;
  return b.domains.find((d) => d.owner === owner && d.active && d.ab.yorozuDomain && Math.hypot(op.x - d.x, op.y - d.y) <= d.r && !b.domainImmune(op, d.ab));
}

// ===================== técnicas =====================
function spawn(b: Battle, me: Fighter, idx: number, a: Ability, kind: Proj["kind"], ang: number, speed: number, dmg: number, extra: Partial<Proj> = {}) {
  const v = speed * sm(a);
  b.projs.push({ x: me.x, y: me.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dmg: dmg * b.dm(me), owner: idx, kind, life: a.durationMs ?? a.projectileLifeMs ?? 1500, ab: a, name: a.name, ...extra });
}
function launchSphere(b: Battle, me: Fighter, op: Fighter, idx: number, a: Ability, sure: boolean) {
  me.sphere = false;
  const ang = Math.atan2(op.y - me.y, op.x - me.x), v = (a.speed ?? 2.2) * sm(a);
  b.projs.push({ x: me.x, y: me.y - SIZE, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dmg: 0, owner: idx, kind: "sphere", life: a.projectileLifeMs ?? 6500, ab: a, name: a.name, sure, hold: me.windup, originX: me.x, originY: me.y });
  b.fx.push({ kind: "ring", x: me.x, y: me.y - SIZE, r: 44, color: "#f4f4f5", life: 420, max: 420 });
  b.say(sure ? `${first(me)}: Esfera Verdadeira · acerto garantido pela Aflição Tripla` : `${first(me)} libera a Esfera Verdadeira`);
}

export function yorozuUnavailable(_b: Battle, me: Fighter, _op: Fighter, a: Ability): string | null | undefined {
  if (!YZ_TYPES.has(a.type)) return undefined;
  if (a.type === "liquidMetal" && me.yz?.pool) return null; // recolher o metal é sempre possível
  return undefined;
}

export function castYorozu(b: Battle, me: Fighter, op: Fighter, idx: number, a: Ability, choice: AbilityChoice = {}): boolean {
  const yz = me.yz; if (!yz) return false;
  const dist = Math.hypot(op.x - me.x, op.y - me.y), ang = Math.atan2(op.y - me.y, op.x - me.x);
  const say = (s = a.name) => b.say(`${first(me)}: ${s}`);
  if (a.type === "perfectSphere") {
    if (me.sphere) { launchSphere(b, me, op, idx, a, !!sureDomain(b, idx)); return true; }
    if (me.casting || !b.ready(me, a)) return false;
    b.use(me, a, a.cost ?? 0);
    me.casting = { ab: a, t: (a.castMs ?? 0) * (sureDomain(b, idx) ? 0.5 : 1) };
    say("concentra matéria · Esfera Verdadeira em construção..."); return true;
  }
  if (a.type === "liquidMetal" && yz.pool) {
    yz.pool = false; yz.mold = null; me.metal = 0;
    say("Metal Líquido recolhido"); return true;
  }
  if (a.type === "construct") {
    const cpu = a.costPerUnit ?? 0;
    const units = Math.max(1, Math.min(a.maxUnits ?? 1, choice.units ?? Math.floor(me.en / Math.max(1, cpu * (me.def.costMult ?? 1)))));
    if (!b.ready(me, a, units * cpu)) return false;
    b.use(me, a, units * cpu);
    if (dist < SIZE + 60) {
      yz.weapon = a.durationMs ?? 6000;
      b.fx.push({ kind: "slash", x: op.x, y: op.y, r: 22 + units * 5, color: "", life: 260, max: 260, ang: ang + 1.2 });
      b.punch(me, op, units * (a.damagePerUnit ?? 0) * b.dm(me), `Construção: lâmina x${units}`);
      say(`Construção · arma criada (x${units})`); return true;
    }
    const la = b.leadAngle(me, op, (a.speed ?? 8) * sm(a));
    for (let k = 0; k < units; k++) spawn(b, me, idx, a, "construct", la + (k - (units - 1) / 2) * 0.16, a.speed ?? 8, a.damagePerUnit ?? 0, { shape: 3 + ((k + Math.floor(b.time / 97)) % 4), home: 0.015, life: a.projectileLifeMs ?? 1600 });
    say(`Construção x${units}`); return true;
  }
  if (!b.ready(me, a)) return false;
  switch (a.type) {
    case "liquidMetal": {
      b.use(me, a, a.cost ?? 0);
      yz.pool = true; yz.mold = null; yz.moldCd = (a.delayMs ?? 0) + (a.moldIntervalMs ?? 600);
      b.fx.push({ kind: "ring", x: me.x, y: me.y, r: 46, color: "#e4e4e7", life: 500, max: 500 });
      say("Metal Líquido · a massa de metal fica em volta dela e se molda durante a luta"); return true;
    }
    case "insectArmor": {
      b.use(me, a, a.cost ?? 0);
      me.armor = a.hp ?? 550; me.buff = a.mult ?? null;
      b.fx.push({ kind: "ring", x: me.x, y: me.y, r: 38, color: "#e4e4e7", life: 500, max: 500 });
      say(); return true;
    }
    case "insectWings": {
      b.use(me, a, a.cost ?? 0);
      yz.wings = a.durationMs ?? 7000; yz.wingMult = a.mult?.speed ?? 1.35;
      say("Asas de Inseto · voo"); return true;
    }
  }
  return false;
}

/** O metal líquido toma a forma escolhida e ataca (ou defende). Os tempos vêm do `timing` de cada forma. */
function fireForm(b: Battle, me: Fighter, op: Fighter, idx: number, a: Ability) {
  const yz = me.yz; if (!yz) return;
  const ang = Math.atan2(op.y - me.y, op.x - me.x);
  b.fx.push({ kind: "txt", x: me.x, y: me.y - SIZE, r: 0, color: "#e5e7eb", life: 900, max: 900, text: a.name });
  const say = (s = a.name) => b.say(`${first(me)}: ${s}`);
  switch (a.type) {
    case "metalTentacles": {
      const n = a.count ?? 4;
      // tentáculos saem em leque aberto e convergem: ataques simultâneos de várias direções
      for (let k = 0; k < n; k++) spawn(b, me, idx, a, "metal", ang + (k - (n - 1) / 2) * (1.6 / Math.max(1, n - 1)), a.speed ?? 8, (a.damage ?? 0) / n, { home: 0.075, life: a.projectileLifeMs ?? 1300 });
      say("Metal Líquido · tentáculos"); return;
    }
    case "metalCocoon": { me.metal = a.durationMs ?? 2000; say("Metal Líquido · casulo defensivo"); return; }
    case "metalChain": case "piercingChain": {
      const n = a.count ?? 1, pierce = a.type === "piercingChain";
      for (let k = 0; k < n; k++) spawn(b, me, idx, a, "yzChain", ang + (k - (n - 1) / 2) * 0.7, a.speed ?? 9, (a.damage ?? 0) / n, { home: a.turnSpeed ?? (pierce ? 0.06 : 0.08), shape: pierce ? 1 : 0 });
      say(); return;
    }
    case "metalCage": {
      const life = a.durationMs ?? 2200;
      b.yzEnts.push({ kind: "cage", owner: idx, ab: a, x: op.x, y: op.y, r: a.radius ?? 40, life, max: life, tick: 300 });
      say(); return;
    }
    case "metalSpikes": {
      const warm = a.warmupMs ?? 380, life = (a.durationMs ?? 900) + warm;
      b.yzEnts.push({ kind: "spikes", owner: idx, ab: a, x: Math.max(20, Math.min(W - 20, op.x + op.vx * warm / 32)), y: Math.max(20, Math.min(H - 20, op.y + op.vy * warm / 32)), r: a.radius ?? 58, warm, life, max: life, hit: false, dmg: (a.damage ?? 0) * b.dm(me), dirs: Array.from({ length: 11 }, (_, i) => i / 11 * Math.PI * 2 + Math.random() * 0.4) });
      say(); return;
    }
    case "metalPlates": { yz.plates = a.count ?? 3; yz.platesT = a.durationMs ?? 5000; say(); return; }
    case "remoteMetal": {
      const life = a.durationMs ?? 5000;
      b.yzEnts.push({ kind: "drone", owner: idx, ab: a, x: me.x, y: me.y, vx: Math.cos(ang) * 4, vy: Math.sin(ang) * 4, life, max: life, cd: 300, seed: Math.random() * 10 });
      say(); return;
    }
    case "metalBlades": {
      const n = a.count ?? 5;
      for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2); spawn(b, me, idx, a, "yzBlade", ang + off * 0.22, a.speed ?? 10, (a.damage ?? 0) / n, { shape: k % 3, curve: -off * 0.012, home: 0.02 }); }
      say(); return;
    }
    case "multiConstruct": {
      const n = a.count ?? 6, r = a.radius ?? 130, warm = a.warmupMs ?? 450, v = (a.speed ?? 14) * sm(a);
      for (let k = 0; k < n; k++) {
        const pa = ang + Math.PI + k / n * Math.PI * 2, x = op.x + Math.cos(pa) * r, y = op.y + Math.sin(pa) * r;
        b.projs.push({ x, y, vx: -Math.cos(pa) * v, vy: -Math.sin(pa) * v, dmg: (a.damage ?? 0) / n * b.dm(me), owner: idx, kind: "yzLance", life: a.durationMs ?? 1400, ab: a, name: a.name, hold: warm + k * 40, originX: x, originY: y, shape: pa });
      }
      say("Múltiplas Construções · cerco de lanças"); return;
    }
  }
}

const DEFENSE = new Set(["plates", "cocoon"]);
/** Ataque perigoso chegando: o metal vira placas ou casulo na hora, mesmo no meio de outro molde. */
function pickDefense(b: Battle, me: Fighter, op: Fighter, idx: number, ma: Ability): string | null {
  const yz = me.yz; if (!yz || yz.plates > 0 || me.metal > 0) return null;
  const dist = Math.hypot(op.x - me.x, op.y - me.y);
  const danger = b.projs.some((p) => p.owner !== idx && p.dmg >= 40 && p.life > 0 && Math.hypot(p.x - me.x, p.y - me.y) < 130) || (dist < 50 && op.meleeCd <= 0 && op.stun <= 0);
  if (!danger) return null;
  for (const k of ["plates", "cocoon"]) { const f = ma.forms?.[k]; if (f && (yz.formCd[k] ?? 0) <= 0 && me.en >= need(me, f)) return k; }
  return null;
}

/** Escolhe sozinho a próxima forma do metal conforme a luta: defesa primeiro, depois a melhor forma para a distância. */
function pickForm(b: Battle, me: Fighter, op: Fighter, idx: number, ma: Ability): string | null {
  const yz = me.yz; if (!yz) return null;
  const dist = Math.hypot(op.x - me.x, op.y - me.y), rnd = Math.random, reserve = ma.reserveEnergy ?? 0;
  const ok = (k: string, defense = false) => {
    const f = ma.forms?.[k]; if (!f || (yz.formCd[k] ?? 0) > 0) return false;
    if (f.maxRange !== undefined && dist > f.maxRange) return false;
    return me.en - need(me, f) >= (defense ? 0 : reserve);
  };
  if (sureDomain(b, idx)) { for (const k of ["multi", "pchain", "blades", "chain", "spikes", "tentacles"]) if (ok(k)) return k; }
  if (b.yzEnts.some((e) => e.kind === "cage" && e.owner === idx)) { for (const k of ["multi", "spikes", "pchain"]) if (ok(k)) return k; }
  if (op.stun > 250 && ok("spikes")) return "spikes";
  if (dist > 70 && dist < 300 && op.stun <= 0 && rnd() < 0.2 && ok("cage")) return "cage";
  if (dist > 120 && !b.yzEnts.some((e) => e.kind === "drone" && e.owner === idx) && rnd() < 0.2 && ok("remote")) return "remote";
  if (rnd() > 0.6) return null;
  const pool = (dist < 110 ? ["spikes", "tentacles"] : dist < 300 ? ["blades", "chain", "pchain", "tentacles", "spikes", "multi"] : ["pchain", "chain", "blades"]).filter((k) => ok(k));
  return pool[Math.floor(rnd() * pool.length)] ?? null;
}

/** Casting da Esfera terminou: pronta acima da cabeça (ou lançada direto, garantida, dentro do domínio). */
export function yorozuSphereReady(b: Battle, me: Fighter, op: Fighter, idx: number, a: Ability) {
  me.sphere = true;
  b.say(`${first(me)}: Esfera Verdadeira pronta · pressão idealizada infinita`);
  if (sureDomain(b, idx)) launchSphere(b, me, op, idx, a, true);
}

/** Aflição Tripla aberta: três construções garantidas e integração com a Esfera Verdadeira. */
export function yorozuDomainOpen(b: Battle, me: Fighter, op: Fighter, idx: number, domain: Domain, a: Ability) {
  b.say(`${me.def.name}: EXPANSÃO DE DOMÍNIO · AFLIÇÃO TRIPLA`);
  if (me.yz && !me.yz.pool) { me.yz.pool = true; me.yz.moldCd = 0; } // o domínio já vem cheio de metal
  if (b.domainImmune(op, a)) { b.say(`${op.def.name}: Restrição Celestial · acerto garantido não encontra alvo`); return; }
  const lance = metalForm(me, "multi") ?? a;
  for (let k = 0; k < 3; k++) {
    const pa = -Math.PI / 2 + k * Math.PI * 2 / 3, x = op.x + Math.cos(pa) * 150, y = op.y + Math.sin(pa) * 150;
    b.projs.push({ x, y, vx: -Math.cos(pa) * 12, vy: -Math.sin(pa) * 12, dmg: (a.damage ?? 240) / 3 * b.dm(me), owner: idx, kind: "yzLance", life: 1600, ab: lance, name: "Aflição Tripla", hold: 260 + k * 160, sure: true, originX: x, originY: y, shape: pa });
  }
  const sphere = me.def.abilities.find((x) => x.type === "perfectSphere");
  if (me.sphere && sphere) launchSphere(b, me, op, idx, sphere, true);
  domain.tick = 0;
}

export function yorozuSphereHit(b: Battle, p: Proj, t: Fighter) {
  const name = p.ab?.name ?? "Esfera Verdadeira";
  if (p.sure) {
    const lethal = t.hp + t.armor + 1, through = b.absorbSure(t, lethal);
    if (through <= 0) {
      // Domínio Simples neutralizou o acerto garantido: a esfera perde a trava e é repelida
      p.sure = false; p.home = -700; p.vx *= -0.6; p.vy *= -0.6;
      b.fx.push({ kind: "ring", x: t.x, y: t.y, r: 40, color: "#93c5fd", life: 400, max: 400 });
      b.say(`${name}: acerto garantido neutralizado`); return;
    }
  }
  b.fx.push({ kind: "boom", x: t.x, y: t.y, r: 110, color: "rgba(0,0,0,0.92)", life: 800, max: 800 });
  b.fx.push({ kind: "ring", x: t.x, y: t.y, r: 70, color: "#f4f4f5", life: 600, max: 600 });
  b.damage(t, b.abilityDamage(t, p.ab?.damage ?? 1000, p.ab), p.sure ? `${name} (acerto garantido)` : `${name} · pressão infinita`, false, true);
  p.life = 0;
}

export function yorozuChainHit(b: Battle, p: Proj, t: Fighter, lost: number) {
  const owner = b.f[p.owner]; if (!owner || lost <= 0 || t.hp <= 0) return;
  const a = Math.atan2(owner.y - t.y, owner.x - t.x), pierce = p.shape === 1;
  const pull = Math.abs(p.ab?.knockback ?? (pierce ? 3 : 7));
  t.vx += Math.cos(a) * pull; t.vy += Math.sin(a) * pull;
  t.stun = Math.max(t.stun, p.ab?.stunMs ?? (pierce ? 260 : 380)); t.beam = null;
  if (pierce) t.casting = null;
  b.fx.push({ kind: "slash", x: t.x, y: t.y, r: pierce ? 26 : 18, color: "", life: 260, max: 260, ang: Math.atan2(p.vy, p.vx) + 1.3 });
}

export function yorozuPlateBlock(b: Battle, t: Fighter, src: string) {
  const yz = t.yz; if (!yz || yz.plates <= 0 || yz.platesT <= 0) return false;
  yz.plates--;
  b.fx.push({ kind: "ring", x: t.x, y: t.y, r: 30, color: "#e4e4e7", life: 300, max: 300 });
  b.say(`Placa Metálica de ${first(t)} bloqueou ${src} · ${yz.plates} restantes`);
  return true;
}

// ===================== corpo a corpo com a Armadura de Inseto =====================
export function yorozuMelee(b: Battle, me: Fighter, op: Fighter): boolean {
  const yz = me.yz; if (!yz) return false;
  const armor = me.armor > 0, weapon = yz.weapon > 0, air = yz.wings > 0;
  if (!armor && !weapon) return false;
  const step = yz.combo % 3; yz.combo++; yz.comboT = 950;
  const ang = Math.atan2(op.y - me.y, op.x - me.x);
  const names = weapon ? ["Corte da Lâmina Construída", "Estocada Construída", "Golpe Giratório Construído"] : ["Soco de Inseto", "Gancho de Inseto", "Chute de Inseto"];
  const mult = [1, 1.15, 1.7][step] ?? 1;
  const dmg = me.def.taijutsu.damage * mult * (air ? 1.2 : 1) * (weapon ? 1.5 : 1) * b.dm(me);
  b.fx.push({ kind: "slash", x: op.x, y: op.y, r: step === 2 ? 30 : 18, color: "", life: 220, max: 220, ang: ang + (step === 1 ? -1.1 : 1.1) });
  b.punch(me, op, dmg, air ? `${names[step]} (aéreo)` : names[step] ?? "Taijutsu", step === 2 ? { knockback: 8, stunMs: 260 } : { knockback: 2.5, stunMs: 120 });
  if (step < 2) me.meleeCd *= 0.7;
  if (step === 2 && armor && yz.pool && yz.comboMetalCd <= 0 && op.hp > 0) {
    // combinação: o chute termina com espinhos de metal brotando sob o alvo
    yz.comboMetalCd = 2600;
    const spikes = metalForm(me, "spikes");
    if (spikes && yz.pool) b.yzEnts.push({ kind: "spikes", owner: idxOf(b, me), ab: spikes, x: op.x, y: op.y, r: 36, warm: 160, life: 600, max: 600, hit: false, dmg: 30 * b.dm(me), free: true, dirs: Array.from({ length: 7 }, (_, i) => i / 7 * Math.PI * 2) });
  }
  return true;
}

// ===================== atualização por frame =====================
function steer(p: Proj, tx: number, ty: number, rate: number) {
  const sp = Math.hypot(p.vx, p.vy) || 1, cur = Math.atan2(p.vy, p.vx);
  let d = Math.atan2(ty - p.y, tx - p.x) - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
  const na = cur + Math.max(-rate, Math.min(rate, d));
  p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
}

export function updateYorozu(b: Battle, dt: number) {
  const k = dt / 16;
  for (const [i, me] of b.f.entries()) {
    const yz = me.yz; if (!yz) continue;
    const op = b.f[1 - i]; if (!op) continue;
    yz.morph += dt * (1 + Math.hypot(me.vx, me.vy) * 0.4);
    yz.wings = Math.max(0, yz.wings - dt); yz.weapon = Math.max(0, yz.weapon - dt); yz.comboMetalCd = Math.max(0, yz.comboMetalCd - dt);
    yz.platesT = Math.max(0, yz.platesT - dt); if (yz.platesT <= 0) yz.plates = 0;
    for (const key in yz.formCd) yz.formCd[key] = (yz.formCd[key] ?? 0) - dt;
    if ((yz.comboT -= dt) <= 0) yz.combo = 0;
    if (me.armor <= 0 && yz.rush) yz.rush = null;
    const dist = Math.hypot(op.x - me.x, op.y - me.y), ang = Math.atan2(op.y - me.y, op.x - me.x);
    const free = me.hp > 0 && op.hp > 0 && me.stun <= 0 && me.sealed <= 0;
    // Metal Líquido: a massa fica com ela e se molda sozinha conforme a luta, até ela recolher
    const ma = metalAb(me), sure = !!sureDomain(b, i);
    const defense = yz.pool && ma && free && !(yz.mold && DEFENSE.has(yz.mold.key)) ? pickDefense(b, me, op, i, ma) : null;
    if (!yz.pool || !ma || !free) yz.mold = null;
    else if (defense) {
      const f = ma.forms?.[defense];
      if (f) {
        me.en = Math.max(0, me.en - need(me, f)); yz.formCd[defense] = f.cooldown ?? 0;
        const prep = f.delayMs ?? 0;
        yz.mold = null; yz.moldCd = Math.max(yz.moldCd, prep + (f.timing?.recoveryMs ?? 0));
        if (prep > 0) yz.mold = { key: defense, t: prep, max: prep }; else fireForm(b, me, op, i, f);
      }
    } else if (yz.mold) {
      if ((yz.mold.t -= dt) <= 0) { const f = ma.forms?.[yz.mold.key]; yz.mold = null; if (f) fireForm(b, me, op, i, f); }
    } else if ((yz.moldCd -= dt * (sure ? 2 : 1)) <= 0) {
      const key = pickForm(b, me, op, i, ma), f = key ? ma.forms?.[key] : undefined;
      if (key && f) {
        me.en = Math.max(0, me.en - need(me, f)); yz.formCd[key] = f.cooldown ?? 0;
        const prep = f.delayMs ?? 0;
        yz.moldCd = prep + (ma.moldIntervalMs ?? 600) + (f.timing?.recoveryMs ?? 0);
        if (prep > 0) yz.mold = { key, t: prep, max: prep }; else fireForm(b, me, op, i, f);
      } else yz.moldCd = 120;
    }
    // Investida de Inseto: parte do combate com a armadura, sem botão
    const ra = rushAb(me);
    if (ra && free && me.armor > 0 && !yz.rush && (yz.formCd["rush"] ?? 0) <= 0 && me.windup <= 0 && me.recovery <= 0 && !me.casting && !me.beam && dist > 80 && dist < (ra.maxRange ?? 360) && me.en >= need(me, ra)) {
      const manual = b.player === i;
      const go = manual ? b.input.x * Math.cos(ang) + b.input.y * Math.sin(ang) > 0.6 : Math.random() < (yz.wings > 0 ? 0.03 : 0.015) * k;
      if (go) {
        me.en -= need(me, ra); yz.formCd["rush"] = ra.cooldown ?? 0;
        me.windup = Math.max(me.windup, ra.delayMs ?? 0);
        yz.rush = { t: ra.durationMs ?? 650, turn: 0, flip: Math.random() < 0.5 ? 1 : -1, ab: ra };
        b.fx.push({ kind: "txt", x: me.x, y: me.y - SIZE, r: 0, color: "#e5e7eb", life: 900, max: 900, text: ra.name });
        b.say(`${first(me)}: ${yz.wings > 0 ? "Investida aérea" : ra.name}`);
      }
    }
    // investida: dispara depois da preparação e muda de direção no meio do ataque
    const r = yz.rush;
    if (r && me.windup <= 0 && me.stun <= 0) {
      r.t -= dt; r.turn -= dt;
      const v = me.def.speed * (me.buff?.speed ?? 1) * flightMult(me) * (r.ab.speed ?? 4) * sm(r.ab);
      if (r.turn <= 0) { r.turn = 150; r.flip *= -1; }
      const zig = dist > 70 ? r.flip * 0.38 : 0;
      me.dodgeX = Math.cos(ang + zig) * v; me.dodgeY = Math.sin(ang + zig) * v; me.dodgeT = Math.max(me.dodgeT, 60);
      if (dist < SIZE + 14) {
        yz.rush = null; me.dodgeT = 0;
        b.withImpact(i, r.ab, () => {
          b.fx.push({ kind: "boom", x: op.x, y: op.y, r: 34, color: "rgba(228,228,231,0.5)", life: 320, max: 320 });
          b.punch(me, op, (r.ab.damage ?? 85) * (yz.wings > 0 ? 1.25 : 1) * b.dm(me), yz.wings > 0 ? "Investida Aérea" : r.ab.name, { knockback: r.ab.knockback ?? 9, stunMs: r.ab.stunMs ?? 300 });
        });
        me.recovery = Math.max(me.recovery, r.ab.timing?.recoveryMs ?? 0);
        yz.combo = 2; yz.comboT = 900; me.meleeCd = Math.min(me.meleeCd, 120);
      } else if (r.t <= 0) { yz.rush = null; }
    }
    // construções em voo: guiadas à distância; com Aflição Tripla, acerto garantido
    for (const p of b.projs) {
      if (p.owner !== i) continue;
      if (p.kind === "sphere") { updateSphere(b, p, op, dt); continue; }
      if (!YZ_PROJ.has(p.kind)) continue;
      if (p.kind === "yzLance" && (p.hold ?? 0) > 0) {
        // lanças cercando o alvo até o disparo simultâneo
        const pa = (p.shape ?? 0) + dt * 0.0006, rr = Math.hypot(p.x - op.x, p.y - op.y) || 120;
        p.shape = pa; p.x = op.x + Math.cos(pa) * rr; p.y = op.y + Math.sin(pa) * rr;
        const sp = Math.hypot(p.vx, p.vy); p.vx = -Math.cos(pa) * sp; p.vy = -Math.sin(pa) * sp;
        continue;
      }
      if ((p.hold ?? 0) > 0) continue;
      if (sure) { p.sure = true; steer(p, op.x, op.y, 0.5); continue; }
      if (p.curve) { const a = Math.atan2(p.vy, p.vx) + p.curve * k, sp = Math.hypot(p.vx, p.vy); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
      if (p.home) steer(p, op.x, op.y, p.home * k);
    }
  }
  // entidades: gaiola, espinhos e metal remoto
  for (const e of b.yzEnts) {
    const me = b.f[e.owner], op = b.f[1 - e.owner]; if (!me || !op) { e.life = 0; continue; }
    e.life -= dt;
    const sure = !!sureDomain(b, e.owner);
    const hit = (dmg: number, src: string) => b.withImpact(e.owner, e.ab, () => {
      const d = sure ? b.absorbSure(op, dmg, true) : dmg;
      if (d > 0) b.damage(op, d, sure ? `${src} (acerto garantido)` : src, !sure, sure);
    });
    if (e.kind === "cage") {
      const dx = op.x - e.x, dy = op.y - e.y, dist = Math.hypot(dx, dy) || 1, lim = Math.max(4, e.r - SIZE / 2);
      if (dist > lim) { op.x = e.x + dx / dist * lim; op.y = e.y + dy / dist * lim; const out = (op.vx * dx + op.vy * dy) / dist; if (out > 0) { op.vx -= out * dx / dist; op.vy -= out * dy / dist; } }
      if ((e.tick -= dt) <= 0) { e.tick = 400; hit((e.ab.damage ?? 40) / Math.max(1, e.max / 400) * me.def.taijutsu.damage / 26, "Gaiola Metálica (pressão)"); }
    } else if (e.kind === "spikes") {
      if (!e.hit && (e.warm -= dt) <= 0) {
        e.hit = true;
        b.fx.push({ kind: "crater", x: e.x, y: e.y, r: e.r * 0.5, color: "", life: 1400, max: 1400 });
        const dist = Math.hypot(op.x - e.x, op.y - e.y);
        if (dist < e.r + SIZE / 2 || sure) {
          const a = Math.atan2(op.y - e.y, op.x - e.x);
          hit(e.dmg, e.free ? "Espinhos do combo" : e.ab.name);
          op.vx += Math.cos(a) * (e.ab.knockback ?? 7); op.vy += Math.sin(a) * (e.ab.knockback ?? 7); op.stun = Math.max(op.stun, e.ab.stunMs ?? 300);
        }
      }
    } else if (e.kind === "drone") {
      // manipulação remota: o metal flanqueia pelo lado oposto à Yorozu
      const away = Math.atan2(op.y - me.y, op.x - me.x) + Math.sin(b.time / 600 + e.seed) * 1.1;
      let tx = op.x + Math.cos(away) * 40, ty = op.y + Math.sin(away) * 40;
      const range = e.ab.maxRange ?? 600;
      if (Math.hypot(tx - me.x, ty - me.y) > range) { const a = Math.atan2(ty - me.y, tx - me.x); tx = me.x + Math.cos(a) * range; ty = me.y + Math.sin(a) * range; }
      const sp = (e.ab.speed ?? 6) * sm(e.ab) * (sure ? 1.6 : 1), a = Math.atan2(ty - e.y, tx - e.x);
      e.vx += (Math.cos(a) * sp - e.vx) * 0.12 * k; e.vy += (Math.sin(a) * sp - e.vy) * 0.12 * k;
      e.x = Math.max(8, Math.min(W - 8, e.x + e.vx * k)); e.y = Math.max(8, Math.min(H - 8, e.y + e.vy * k));
      e.cd -= dt;
      if (e.cd <= 0 && Math.hypot(op.x - e.x, op.y - e.y) < 44) {
        e.cd = e.ab.tickMs ?? 550;
        b.fx.push({ kind: "slash", x: op.x, y: op.y, r: 20, color: "", life: 200, max: 200, ang: Math.atan2(op.y - e.y, op.x - e.x) + 1.4 });
        hit((e.ab.damage ?? 30) * b.dm(me), e.ab.name);
      }
    }
  }
  b.yzEnts = b.yzEnts.filter((e) => e.life > 0);
}

/** Esfera Verdadeira: lenta, acelera, persegue e esmaga tudo que toca — não é um projétil comum. */
function updateSphere(b: Battle, p: Proj, op: Fighter, dt: number) {
  if ((p.hold ?? 0) > 0) return;
  const a = p.ab, k = dt / 16, r = a?.hitRadius ?? 20;
  if (p.home !== undefined && p.home < 0) p.home = Math.min(0, p.home + dt);
  const sp = Math.min(p.sure ? 9 : 6.5, Math.hypot(p.vx, p.vy) + 0.035 * k);
  const cur = Math.atan2(p.vy, p.vx); p.vx = Math.cos(cur) * sp; p.vy = Math.sin(cur) * sp;
  if (p.sure) steer(p, op.x, op.y, 1);
  else if ((p.home ?? 0) >= 0) steer(p, op.x, op.y, (a?.turnSpeed ?? 0.03) * k);
  // pressão infinita: qualquer estrutura que toca a superfície deixa de existir
  for (const q of b.projs) if (q !== p && q.owner !== p.owner && q.life > 0 && Math.hypot(q.x - p.x, q.y - p.y) < r + 10) {
    q.life = 0; b.fx.push({ kind: "boom", x: q.x, y: q.y, r: 16, color: "rgba(0,0,0,0.8)", life: 260, max: 260 });
  }
  for (const o of b.orbs) if (o.owner !== p.owner && Math.hypot(o.x - p.x, o.y - p.y) < r + 10) o.life = 0;
  for (const o of b.blues) if (o.owner !== p.owner && Math.hypot(o.x - p.x, o.y - p.y) < r + 14) o.life = 0;
  for (const o of b.doors) if (o.owner !== p.owner && Math.hypot(o.x - p.x, o.y - p.y) < r + 24) o.life = 0;
  for (const o of b.spirits) if (o.owner !== p.owner && Math.hypot(o.x - p.x, o.y - p.y) < r + 12) { o.hp = 0; o.life = 0; }
  for (const e of b.yzEnts) if (e.owner !== p.owner && Math.hypot(e.x - p.x, e.y - p.y) < r + 16) e.life = 0;
  if (op.garuda && op.garuda.hp > 0 && Math.hypot(op.garuda.x - p.x, op.garuda.y - p.y) < r + 12) { op.garuda.hp = 0; b.say("Esfera Verdadeira esmagou o Garuda"); }
  if (Math.floor(b.time / 90) !== Math.floor((b.time - dt) / 90)) b.fx.push({ kind: "crater", x: p.x, y: p.y + 4, r: 9, color: "", life: 900, max: 900 });
}

// ===================== IA =====================
/** IA da Yorozu: só escolhe as técnicas com botão; o metal líquido e a investida agem sozinhos. */
export function decideYorozu(b: Battle, me: Fighter, op: Fighter, idx: number, dist: number, _ang: number, _danger: boolean): boolean {
  const yz = me.yz; if (!yz) return false;
  const A = (t: string) => me.def.abilities.find((a) => a.type === t);
  const go = (t: string, choice: AbilityChoice = {}) => { const a = A(t); return !!a && castYorozu(b, me, op, idx, a, choice); };
  const rnd = Math.random, hpR = me.hp / me.def.hp, opHpR = op.hp / op.def.hp;
  const dom = me.def.abilities.find((a) => a.yorozuDomain), sphere = A("perfectSphere");
  const inDomain = !!sureDomain(b, idx);

  // a massa de metal líquido fica sempre com ela
  if (!yz.pool && go("liquidMetal")) return true;
  // corpo de inseto
  if (me.armor <= 0 && (dist < 230 || hpR < 0.75) && go("insectArmor")) return true;
  if (yz.wings <= 0 && (me.armor > 0 || dist > 260) && rnd() < 0.5 && go("insectWings")) return true;

  // Esfera Verdadeira + Aflição Tripla
  if (me.sphere) {
    if (dom && b.ready(me, dom) && !b.domains.length && dist < DOMAIN_R * 0.75) { if (b.beginDomain(me, op, idx, dom)) { b.say(`${first(me)}: ${dom.name.toUpperCase()}`); return true; } }
    if (dist < 460 && (!dom || !b.ready(me, dom) || op.stun > 0 || op.casting || rnd() < 0.08) && rnd() < 0.45) return go("perfectSphere");
  } else if (sphere && !me.casting && b.ready(me, sphere) && (inDomain || ((dist > 170 || op.stun > 400 || b.yzEnts.some((e) => e.kind === "cage" && e.owner === idx)) && rnd() < 0.35))) {
    return go("perfectSphere");
  }
  if (dom && !me.sphere && b.ready(me, dom) && !b.domains.length && dist < DOMAIN_R * 0.6 && sphere && (me.cd[sphere.id] ?? 0) > 4000 && (opHpR < 0.55 || rnd() < 0.05)) {
    if (b.beginDomain(me, op, idx, dom)) { b.say(`${first(me)}: ${dom.name.toUpperCase()}`); return true; }
  }

  // construções: arma na mão de perto, arremessos de longe
  const c = A("construct");
  if (c && dist > 140 && rnd() < (inDomain ? 0.6 : 0.3)) {
    const units = op.stun > 0 || inDomain ? c.maxUnits ?? 1 : 1 + Math.floor(rnd() * (c.maxUnits ?? 1));
    if (go("construct", { units: Math.min(units, Math.floor(me.en / Math.max(1, c.costPerUnit ?? 1))) || 1 })) return true;
  }
  if (dist < SIZE + 60 && yz.weapon <= 0 && me.armor <= 0 && rnd() < 0.3 && go("construct", { units: 2 })) return true;
  return false;
}

// ===================== visual =====================
let tokCache: { t: number; get: (k: string) => string } | null = null;
function tok(b: Battle) {
  if (tokCache && tokCache.t === b.time) return tokCache.get;
  const css = styleTokens, memo = new Map<string, string>();
  const get = (k: string) => { let v = memo.get(k); if (v === undefined) { v = css.getPropertyValue(`--${k}`).trim(); memo.set(k, v); } return v; };
  tokCache = { t: b.time, get }; return get;
}

/** Metal líquido: forma orgânica de tinta negra com brilhos brancos. */
function inkBlob(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, spikes: number, spikeLen: number, ink: string, sheen: string) {
  c.fillStyle = ink; c.beginPath();
  const n = Math.max(8, spikes * 2);
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, out = i % 2 === 0 ? spikeLen * (0.6 + 0.4 * Math.sin(t / 90 + i * 1.7)) : 0;
    const rr = r + out + Math.sin(a * 3 + t / 140) * r * 0.12;
    if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
  c.strokeStyle = sheen; c.lineWidth = 1; c.globalAlpha *= 0.8;
  for (let i = 0; i < 3; i++) { const a = t / 300 + i * 2.1; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2); c.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); c.stroke(); }
  c.globalAlpha /= 0.8;
}

export function drawYorozuFighter(b: Battle, c: CanvasRenderingContext2D, f: Fighter) {
  const yz = f.yz; if (!yz) return;
  const get = tok(b), ink = get("yz-ink"), sheen = get("yz-sheen"), armor = get("yz-armor"), edge = get("yz-armor-edge"), wing = get("yz-wing");
  const op = b.f.find((o) => o !== f); const face = op ? Math.atan2(op.y - f.y, op.x - f.x) : 0;
  const speed = Math.hypot(f.vx, f.vy), move = Math.atan2(f.vy, f.vx), t = yz.morph;
  c.save();
  // asas: voo com sombra no chão
  if (yz.wings > 0) {
    c.globalAlpha = 0.35; c.fillStyle = ink; c.beginPath(); c.ellipse(f.x, f.y + SIZE * 0.95, SIZE * 0.6, SIZE * 0.2, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    const flap = Math.sin(b.time / 28) * 0.5, back = face + Math.PI;
    for (const side of [-1, 1]) for (const [len, off] of [[34, 0.55], [26, 1.0]] as const) {
      c.save(); c.translate(f.x + Math.cos(back) * 6, f.y + Math.sin(back) * 6); c.rotate(back + side * (off + flap));
      c.fillStyle = wing; c.strokeStyle = sheen; c.lineWidth = 1;
      c.beginPath(); c.ellipse(len / 2, 0, len / 2, len / 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(2, 0); c.lineTo(len - 2, 0); c.moveTo(len * 0.4, 0); c.lineTo(len * 0.7, side * len / 9); c.stroke();
      c.restore();
    }
  }
  // massa de Metal Líquido: fica em volta dela e muda de forma com o movimento
  // (lâminas para trás quando corre, espinhos quando parada) e se junta na direção do próximo molde
  if (yz.pool) {
    c.globalAlpha = 0.95;
    const running = speed > 1.2, ribbons = running ? 6 : 5;
    for (let i = 0; i < ribbons; i++) {
      if (running) {
        const base = move + Math.PI + (i - (ribbons - 1) / 2) * 0.3, len = 18 + speed * 6, sway = Math.sin(t / 120 + i * 1.9) * 0.3;
        const ox = f.x + Math.cos(base) * SIZE * 0.45, oy = f.y + Math.sin(base) * SIZE * 0.45;
        c.fillStyle = ink; c.beginPath();
        c.moveTo(ox + Math.cos(base + 1.57) * 5, oy + Math.sin(base + 1.57) * 5);
        c.quadraticCurveTo(ox + Math.cos(base + sway) * len * 0.6, oy + Math.sin(base + sway) * len * 0.6, ox + Math.cos(base + sway * 1.6) * len, oy + Math.sin(base + sway * 1.6) * len);
        c.lineTo(ox + Math.cos(base - 1.57) * 5, oy + Math.sin(base - 1.57) * 5); c.closePath(); c.fill();
      } else {
        const a = i / ribbons * Math.PI * 2 + t / 1400, rr = SIZE * 1.05;
        inkBlob(c, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 10, t + i * 90, 6, 7, ink, sheen);
      }
    }
    if (yz.mold) {
      const k = 1 - yz.mold.t / Math.max(1, yz.mold.max), mx = f.x + Math.cos(face) * SIZE * 1.1, my = f.y + Math.sin(face) * SIZE * 1.1;
      inkBlob(c, mx, my, 5 + k * 9, b.time, 7, 3 + k * 8, ink, sheen);
    }
    c.globalAlpha = 1;
  }
  // Armadura de Inseto: exoesqueleto branco segmentado com elmo de mandíbulas
  if (f.armor > 0) {
    c.save(); c.translate(f.x, f.y); c.rotate(face);
    c.fillStyle = armor; c.strokeStyle = edge; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(-8 + i * 4, 0, 6, 13 - i * 1.5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(6, -9); c.quadraticCurveTo(19, -8, 21, 0); c.quadraticCurveTo(19, 8, 6, 9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = edge; c.beginPath(); c.ellipse(14, -4, 3, 2, 0.3, 0, Math.PI * 2); c.ellipse(14, 4, 3, 2, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(20, -3); c.lineTo(27, -6); c.moveTo(20, 3); c.lineTo(27, 6); c.moveTo(12, -9); c.quadraticCurveTo(10, -18, 3, -22); c.moveTo(12, 9); c.quadraticCurveTo(10, 18, 3, 22); c.stroke();
    c.restore();
  }
  // arma construída na mão
  if (yz.weapon > 0) {
    const hx = f.x + Math.cos(face + 0.7) * 18, hy = f.y + Math.sin(face + 0.7) * 18, swing = f.meleeCd > 150 ? 0.5 : -0.2;
    c.save(); c.translate(hx, hy); c.rotate(face + swing);
    c.fillStyle = armor; c.strokeStyle = edge; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-4, -2); c.lineTo(30, -3); c.lineTo(38, 0); c.lineTo(30, 3); c.lineTo(-4, 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = ink; c.fillRect(-9, -3, 6, 6); c.restore();
  }
  // placas metálicas orbitando
  for (let i = 0; i < yz.plates; i++) {
    const a = b.time / 420 + i / Math.max(1, yz.plates) * Math.PI * 2, px = f.x + Math.cos(a) * 30, py = f.y + Math.sin(a) * 30;
    c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2);
    c.fillStyle = ink; c.strokeStyle = sheen; c.lineWidth = 1.2; c.beginPath();
    for (let j = 0; j < 6; j++) { const q = j / 6 * Math.PI * 2; if (j) c.lineTo(Math.cos(q) * 9, Math.sin(q) * 5); else c.moveTo(9, 0); }
    c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  // casulo de metal líquido
  if (f.metal > 0) { c.globalAlpha = 0.55; inkBlob(c, f.x, f.y, 25, b.time, 9, 6, ink, sheen); c.globalAlpha = 1; }
  // investida: rastro
  if (yz.rush) { c.strokeStyle = sheen; c.globalAlpha = 0.5; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(f.x - f.vx * i * 3 - 8, f.y - f.vy * i * 3); c.lineTo(f.x - f.vx * (i * 3 + 4) - 8, f.y - f.vy * (i * 3 + 4)); c.stroke(); } c.globalAlpha = 1; }
  // Esfera Verdadeira acima da cabeça (crescendo durante a construção)
  const cast = f.casting?.ab.type === "perfectSphere" ? 1 - f.casting.t / Math.max(1, f.casting.ab.castMs ?? 1) : f.sphere ? 1 : 0;
  if (cast > 0) drawSphereBody(c, f.x, f.y - SIZE - 14, 3 + cast * 15, b.time, get, false);
  c.restore();
}

function drawSphereBody(c: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, get: (k: string) => string, sure: boolean) {
  const ink = get("yz-ink"), sheen = get("yz-sheen");
  c.save();
  // espaço sendo esmagado ao redor: anéis distorcidos e estrias radiais
  c.strokeStyle = sheen; c.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = 0.18 + 0.1 * i; c.beginPath();
    for (let j = 0; j <= 40; j++) { const a = j / 40 * Math.PI * 2, rr = r * (1.5 + i * 0.35) + Math.sin(a * 6 + time / (60 + i * 20)) * r * 0.12; if (j) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.stroke();
  }
  c.globalAlpha = 0.6;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + time / 500; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1); c.lineTo(x + Math.cos(a) * r * (1.35 + (i % 3) * 0.15), y + Math.sin(a) * r * (1.35 + (i % 3) * 0.15)); c.stroke(); }
  c.globalAlpha = 1; c.fillStyle = ink; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = sheen; c.lineWidth = 1.5; c.stroke();
  c.globalAlpha = 0.5; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, Math.PI, Math.PI * 1.5); c.stroke();
  if (sure) { c.globalAlpha = 0.5 + 0.4 * Math.sin(time / 70); c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 2.2, 0, Math.PI * 2); c.stroke(); }
  c.restore();
}

export function drawYorozuProj(b: Battle, c: CanvasRenderingContext2D, p: Proj) {
  const get = tok(b), ink = get("yz-ink"), sheen = get("yz-sheen"), armor = get("yz-armor");
  const a = Math.atan2(p.vy, p.vx);
  c.save();
  if ((p.hold ?? 0) > 0) c.globalAlpha = p.kind === "yzLance" ? 0.45 : 0.75;
  if (p.kind === "sphere") drawSphereBody(c, p.x, p.y, p.ab?.hitRadius ?? 20, b.time, get, !!p.sure);
  else if (p.kind === "construct") {
    const n = p.shape ?? 4, r = 8 + Math.min(6, p.dmg / 20), rot = b.time / 80;
    c.fillStyle = armor; c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i < n; i++) { const q = rot + (i / n) * Math.PI * 2, rr = i % 2 ? r * 0.55 : r; if (i) c.lineTo(p.x + Math.cos(q) * rr, p.y + Math.sin(q) * rr); else c.moveTo(p.x + Math.cos(q) * rr, p.y + Math.sin(q) * rr); }
    c.closePath(); c.fill(); c.stroke();
  } else if (p.kind === "metal") {
    c.translate(p.x, p.y); c.rotate(a); c.fillStyle = ink;
    c.beginPath(); c.moveTo(12, 0); c.quadraticCurveTo(2, -6, -18, -1 + Math.sin(b.time / 50) * 2); c.quadraticCurveTo(2, 6, 12, 0); c.fill();
    c.strokeStyle = sheen; c.lineWidth = 1; c.beginPath(); c.moveTo(8, -1); c.lineTo(-6, -2); c.stroke();
  } else if (p.kind === "yzBlade") {
    c.translate(p.x, p.y); c.rotate(p.shape === 1 ? b.time / 30 : a); c.fillStyle = ink; c.strokeStyle = sheen; c.lineWidth = 1.2; c.beginPath();
    if (p.shape === 0) { c.arc(0, 0, 11, -1.3, 1.3); c.arc(-5, 0, 9, 1.1, -1.1, true); }
    else if (p.shape === 1) { for (let i = 0; i < 12; i++) { const q = i / 12 * Math.PI * 2, rr = i % 2 ? 5 : 11; if (i) c.lineTo(Math.cos(q) * rr, Math.sin(q) * rr); else c.moveTo(rr, 0); } }
    else { c.moveTo(14, 0); c.lineTo(-2, -5); c.lineTo(-10, 0); c.lineTo(-2, 5); }
    c.closePath(); c.fill(); c.stroke();
  } else if (p.kind === "yzChain") {
    const src = b.f[p.owner];
    if (src) {
      const dx = p.x - src.x, dy = p.y - src.y, len = Math.hypot(dx, dy), n = Math.max(3, Math.ceil(len / 8)), ang = Math.atan2(dy, dx);
      for (let i = 1; i <= n; i++) {
        const t = i / n, wave = Math.sin(t * Math.PI * 2.5 - b.time / 90) * Math.sin(t * Math.PI) * Math.min(18, len * 0.1);
        const x = src.x + dx * t - Math.sin(ang) * wave, y = src.y + dy * t + Math.cos(ang) * wave;
        c.fillStyle = ink; c.beginPath(); c.ellipse(x, y, 4.2, i % 2 ? 2.4 : 1.6, ang, 0, Math.PI * 2); c.fill();
        if (i % 3 === 0) { c.fillStyle = sheen; c.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
      }
    }
    c.translate(p.x, p.y); c.rotate(a); c.fillStyle = ink; c.strokeStyle = sheen; c.lineWidth = 1; c.beginPath();
    if (p.shape === 1) { c.moveTo(16, 0); c.lineTo(-2, -5); c.lineTo(2, 0); c.lineTo(-2, 5); }
    else { c.moveTo(8, 0); c.quadraticCurveTo(4, -9, -4, -7); c.lineTo(-1, -2); c.lineTo(-4, 2); c.quadraticCurveTo(4, 7, 8, 0); }
    c.closePath(); c.fill(); c.stroke();
  } else if (p.kind === "yzLance") {
    c.translate(p.x, p.y); c.rotate(a); c.fillStyle = ink; c.strokeStyle = sheen; c.lineWidth = 1;
    c.beginPath(); c.moveTo(20, 0); c.lineTo(-14, -4); c.lineTo(-20, 0); c.lineTo(-14, 4); c.closePath(); c.fill(); c.stroke();
    if (p.sure) { c.globalAlpha = 0.5; c.beginPath(); c.moveTo(-20, 0); c.lineTo(-40, 0); c.stroke(); }
  }
  c.restore();
}

export function drawYorozuWorld(b: Battle, c: CanvasRenderingContext2D) {
  if (!b.yzEnts.length) return;
  const get = tok(b), ink = get("yz-ink"), sheen = get("yz-sheen");
  for (const e of b.yzEnts) {
    c.save();
    if (e.kind === "cage") {
      const k = Math.min(1, (e.max - e.life) / 160);
      c.strokeStyle = ink; c.lineWidth = 4;
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = e.r * k; c.beginPath(); c.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); c.lineTo(e.x + Math.cos(a) * r * 0.25, e.y + Math.sin(a) * r * 0.25 - 4); c.stroke(); }
      c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, e.r * k, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = sheen; c.lineWidth = 1; c.globalAlpha = 0.7; c.beginPath(); c.arc(e.x, e.y, e.r * k - 2, -0.6, 0.4); c.stroke();
    } else if (e.kind === "spikes") {
      if (!e.hit) {
        const k = 1 - e.warm / Math.max(1, e.ab.warmupMs ?? 380);
        c.globalAlpha = 0.5; c.fillStyle = ink; c.beginPath(); c.ellipse(e.x, e.y, e.r * k, e.r * k * 0.6, 0, 0, Math.PI * 2); c.fill();
      } else {
        const k = Math.min(1, (e.max - e.life - (e.ab.warmupMs ?? 380)) / 90 + 0.2), fade = Math.min(1, e.life / 300);
        c.globalAlpha = fade; c.fillStyle = ink; c.strokeStyle = sheen; c.lineWidth = 1;
        for (const a of e.dirs) {
          const L = e.r * k * (0.75 + 0.25 * Math.sin(a * 7)), w = 5;
          c.beginPath(); c.moveTo(e.x + Math.cos(a + 1.57) * w, e.y + Math.sin(a + 1.57) * w);
          c.lineTo(e.x + Math.cos(a) * L, e.y + Math.sin(a) * L); c.lineTo(e.x + Math.cos(a - 1.57) * w, e.y + Math.sin(a - 1.57) * w); c.closePath(); c.fill();
          c.beginPath(); c.moveTo(e.x + Math.cos(a) * L * 0.3, e.y + Math.sin(a) * L * 0.3); c.lineTo(e.x + Math.cos(a) * L * 0.8, e.y + Math.sin(a) * L * 0.8); c.stroke();
        }
        c.beginPath(); c.arc(e.x, e.y, 9, 0, Math.PI * 2); c.fill();
      }
    } else if (e.kind === "drone") {
      const owner = b.f[e.owner];
      if (owner) { c.strokeStyle = ink; c.globalAlpha = 0.25; c.setLineDash([2, 5]); c.beginPath(); c.moveTo(owner.x, owner.y); c.lineTo(e.x, e.y); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
      inkBlob(c, e.x, e.y, 8, b.time + e.seed * 100, 6, e.cd > (e.ab.tickMs ?? 550) - 150 ? 9 : 4, ink, sheen);
    }
    c.restore();
  }
}

/** Aflição Tripla: céu branco-acinzentado com cachos de vagens dourado-oliva pendurados e vagens grandes desfocadas na frente. */
export function drawTripleAffliction(b: Battle, c: CanvasRenderingContext2D, d: Domain) {
  const get = tok(b), sky = get("yz-domain-sky"), haze = get("yz-domain-haze"), pod = get("yz-domain-pod"), podLight = get("yz-domain-pod-light"), podDark = get("yz-domain-pod-dark"), podInk = get("yz-domain-pod-ink");
  const base = d.active ? 1 : 0.55, R = d.r, top = d.y - R;
  const rand = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  c.save();
  c.globalAlpha = base;
  // céu claro, levemente mais escuro nas bordas
  const g = c.createRadialGradient(d.x + R * 0.15, d.y - R * 0.1, R * 0.1, d.x, d.y, R * 1.05);
  g.addColorStop(0, sky); g.addColorStop(1, haze);
  c.fillStyle = g; c.fillRect(d.x - R, d.y - R, R * 2, R * 2);
  // nuvens suaves
  c.globalAlpha = base * 0.35; c.fillStyle = haze;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(d.x + (rand(i) - 0.5) * R * 1.6 + Math.sin(b.time / 6000 + i) * 8, d.y + (rand(i + 9) - 0.3) * R, R * (0.35 + rand(i + 3) * 0.3), R * 0.08, -0.15, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = base;

  const drawPod = (x: number, y: number, r: number, ang: number, seed: number, tip: boolean) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    // corpo bulboso (tipo bulbo de alho/botão de lótus)
    c.fillStyle = pod; c.strokeStyle = podInk; c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(0, -r * 1.05);
    c.bezierCurveTo(r * 1.25, -r * 0.9, r * 1.2, r * 0.75, 0, r * 1.05);
    c.bezierCurveTo(-r * 1.2, r * 0.75, -r * 1.25, -r * 0.9, 0, -r * 1.05);
    c.closePath(); c.fill(); c.stroke();
    // gomos
    c.lineWidth = 0.8; c.beginPath();
    c.moveTo(0, -r * 0.95); c.quadraticCurveTo(r * 0.55, 0, 0, r * 0.95);
    c.moveTo(0, -r * 0.95); c.quadraticCurveTo(-r * 0.5, 0, -r * 0.1, r * 0.95);
    c.stroke();
    // sombra lateral e brilho
    c.globalAlpha = base * 0.45; c.fillStyle = podDark;
    c.beginPath(); c.ellipse(r * 0.45, r * 0.15, r * 0.35, r * 0.7, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = base * 0.8; c.fillStyle = podLight;
    c.beginPath(); c.ellipse(-r * 0.4, -r * 0.3, r * 0.22, r * 0.38, -0.3, 0, Math.PI * 2); c.fill();
    c.globalAlpha = base;
    // pequenas sépalas no topo
    c.fillStyle = podDark; c.strokeStyle = podInk; c.lineWidth = 0.9;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, -r * 1.05); c.quadraticCurveTo(s * r * 0.7, -r * 1.25, s * r * (0.5 + rand(seed + s) * 0.4), -r * 0.6); c.quadraticCurveTo(s * r * 0.25, -r * 0.85, 0, -r * 1.05); c.fill(); c.stroke(); }
    if (tip) { c.fillStyle = pod; c.beginPath(); c.moveTo(-r * 0.3, r * 0.95); c.quadraticCurveTo(r * 0.15, r * 1.9, r * 0.1, r * 2.3); c.quadraticCurveTo(r * 0.05, r * 1.5, r * 0.3, r * 0.95); c.closePath(); c.fill(); c.stroke(); }
    c.restore();
  };

  // cachos pendurados vindos de cima
  const vines = 8;
  for (let i = 0; i < vines; i++) {
    const x0 = d.x - R * 0.95 + (i + 0.3 + rand(i) * 0.4) * (R * 1.9 / vines);
    const len = R * (0.55 + rand(i + 20) * 0.75), lean = (rand(i + 40) - 0.5) * 0.35 + Math.sin(b.time / 1700 + i * 1.3) * 0.05;
    const podR = 6 + rand(i + 60) * 5, step = podR * 2.6, n = Math.max(3, Math.floor(len / step));
    const pt = (t: number) => { const L = t * len, curve = Math.sin(t * Math.PI * 1.2 + i) * 6; return { x: x0 + Math.sin(lean) * L + curve, y: top + Math.cos(lean) * L }; };
    // haste
    c.strokeStyle = podInk; c.lineWidth = 3; c.lineCap = "round"; c.beginPath();
    for (let s = 0; s <= 24; s++) { const p = pt(s / 24); if (s) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
    c.stroke();
    c.strokeStyle = podDark; c.lineWidth = 1.6; c.stroke();
    // vagens ao longo da haste
    for (let k = 1; k <= n; k++) {
      const t = k / n, p = pt(t), q = pt(Math.max(0, t - 0.02)), ang = Math.atan2(p.y - q.y, p.x - q.x) - Math.PI / 2;
      const r = podR * (0.8 + rand(i * 10 + k) * 0.4);
      // folhinhas espinhosas soltas
      if (rand(i * 7 + k) > 0.55) { c.strokeStyle = podInk; c.lineWidth = 1; const s = rand(k + i) > 0.5 ? 1 : -1; c.beginPath(); c.moveTo(p.x, p.y - r * 1.5); c.quadraticCurveTo(p.x + s * r * 1.4, p.y - r * 1.2, p.x + s * r * 1.9, p.y - r * 0.4); c.stroke(); }
      drawPod(p.x, p.y, r, ang, i * 13 + k, k === n);
      if (rand(i * 3 + k * 5) > 0.7) drawPod(p.x + r * 1.1, p.y - r * 0.4, r * 0.7, ang + 0.4, i * 17 + k, false);
    }
  }

  // vagens grandes e desfocadas em primeiro plano (canto inferior esquerdo)
  c.save();
  c.filter = "blur(3px)";
  const fx = d.x - R * 0.85, fy = d.y + R * 0.2;
  const big: [number, number, number][] = [[0, -R * 0.55, R * 0.16], [R * 0.05, -R * 0.15, R * 0.2], [R * 0.25, R * 0.3, R * 0.28], [-R * 0.05, R * 0.6, R * 0.22]];
  for (const [ox, oy, r] of big) {
    c.fillStyle = podDark; c.beginPath(); c.ellipse(fx + ox, fy + oy, r, r * 1.15, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = podInk; c.globalAlpha = base * 0.85; c.beginPath(); c.ellipse(fx + ox + r * 0.25, fy + oy - r * 0.25, r * 0.75, r * 0.7, -0.4, 0, Math.PI * 2); c.fill();
    c.globalAlpha = base;
  }
  c.restore();

  c.globalAlpha = base;
  c.fillStyle = podInk; c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillText("AFLIÇÃO TRIPLA", d.x, d.y + R * 0.72);
  if (d.active) { c.font = "9px monospace"; c.fillText("acerto garantido · construções", d.x, d.y + R * 0.72 + 13); }
  c.restore();
}
