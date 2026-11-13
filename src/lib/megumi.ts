import combat from "@/data/combat.json";
import type { Battle, Fighter, Ability, Domain, Fx } from "./engine";

/**
 * Megumi Fushiguro — Técnica das Dez Sombras: esconder-se e mover-se nas sombras, guardar armas,
 * invocar Shikigamis (Cão Divino, Sapos, Nue, Coelhos, Elefante Máximo, Mahoraga) e o Jardim das Sombras Justapostas.
 */
const W = combat.arena.width, H = combat.arena.height, SIZE = combat.arena.fighterSize, TIME_SCALE = combat.arena.timeScale;

export const MG_TYPES = new Set(["mgShadow", "mgArmory", "mgDog", "mgFrog", "mgNue", "mgRabbit", "mgElephant", "mgMahoraga"]);
export type MgState = { lost: Record<string, number>; hide: number; weapon: number; prevOpMelee: number; prevMyMelee: number; strikeT: number; carry: number; carryX: number; carryY: number };
export const makeMg = (): MgState => ({ lost: {}, hide: 0, weapon: 0, prevOpMelee: 0, prevMyMelee: 0, strikeT: 600, carry: 0, carryX: 0, carryY: 0 });

export type ShikiKind = "dog" | "frog" | "nue" | "rabbit" | "elephant" | "mahoraga" | "copy";
export type Shiki = {
  kind: ShikiKind; owner: number; ab: Ability; x: number; y: number; ang: number;
  hp: number; max: number; life: number; cd: number; seed: number; t: number; n: number;
  target: number; hitT: number; fall: number; spin: number; wheel: number; domT: number; flash: number; hidden: boolean;
  /** Mahoraga: quantas vezes recebeu cada tipo de ataque */
  adapt: Record<string, number>;
  tongue: { x: number; y: number; tx: number; ty: number; t: number; max: number; save: boolean; back: boolean } | null;
  lunge: { vx: number; vy: number; hit: boolean } | null;
};

// Visual / comportamento (não é balanceamento): raio de colisão de cada Shikigami
const RADIUS: Record<ShikiKind, number> = { dog: 18, frog: 9, nue: 21, rabbit: 6, elephant: 34, mahoraga: 24, copy: 15 };
const NAMES: Record<ShikiKind, string> = { dog: "Cão Divino: Totalidade", frog: "Sapo", nue: "Nue", rabbit: "Coelho", elephant: "Elefante Máximo", mahoraga: "Mahoraga", copy: "Cópia de Sombra" };
/** Mahoraga: regeneração (vida/s), redução por nível de adaptação e golpes para cada nível */
/** Elefante Máximo: pisão para esmagar quem chega perto */
const ELEPHANT_STOMP_MS = 2600, ELEPHANT_STOMP_DMG = 120;
const MAHORAGA_REGEN = 25, ADAPT_STEP = 0.22, ADAPT_HITS = 2;
const PIERCE = new Set(["purple", "world", "fuga", "sphere", "uzumaki", "plasma"]);

const first = (f: Fighter) => f.def.name.split(" ")[0];
const cx = (x: number) => Math.max(10, Math.min(W - 10, x)), cy = (y: number) => Math.max(10, Math.min(H - 10, y));
const abil = (me: Fighter, type: string) => me.def.abilities.find((a) => a.type === type);
const mine = (b: Battle, idx: number, kind: ShikiKind) => b.shiki.filter((s) => s.owner === idx && s.kind === kind && s.hp > 0);
export const megumiHidden = (f: Fighter | undefined) => !!f?.mg && f.mg.hide > 0;
export function gardenOf(b: Battle, idx: number): Domain | undefined { return b.domains.find((d) => d.owner === idx && d.active && d.ab.chimera); }
/** No Jardim das Sombras as invocações custam metade e recarregam mais rápido */
const costOf = (b: Battle, idx: number, a: Ability) => (a.cost ?? 0) * (gardenOf(b, idx) ? 0.5 : 1);
const level = (s: Shiki, cat: string) => Math.min(4, Math.floor((s.adapt[cat] ?? 0) / ADAPT_HITS));

function shadow(b: Battle, x: number, y: number, r = 22) { b.fx.push({ kind: "shadow", x, y, r, color: "", life: 520, max: 520, seed: Math.random() }); }
function spawn(b: Battle, kind: ShikiKind, owner: number, ab: Ability, x: number, y: number, extra: Partial<Shiki> = {}, fx = true): Shiki {
  const s: Shiki = { kind, owner, ab, x: cx(x), y: cy(y), ang: 0, hp: ab.hp ?? 100, max: 0, life: ab.durationMs ?? Infinity, cd: 300, seed: Math.random(), t: 0, n: 0, target: -1, hitT: 0, fall: 0, spin: 0, wheel: 0, domT: 0, flash: 0, hidden: false, adapt: {}, tongue: null, lunge: null, ...extra };
  s.max = s.hp; b.shiki.push(s); if (fx) shadow(b, s.x, s.y, RADIUS[kind] + 10); return s;
}
function moveTo(s: Shiki, tx: number, ty: number, sp: number, dt: number) {
  const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
  if (d > 1) { const st = Math.min(d, sp * dt / 16); s.x = cx(s.x + dx / d * st); s.y = cy(s.y + dy / d * st); s.ang = Math.atan2(dy, dx); }
  return d;
}

// ===================== botões =====================
const KIND_OF: Record<string, ShikiKind> = { mgDog: "dog", mgFrog: "frog", mgNue: "nue", mgRabbit: "rabbit", mgElephant: "elephant", mgMahoraga: "mahoraga" };
export function megumiUnavailable(b: Battle, me: Fighter, _op: Fighter, a: Ability): string | null | undefined {
  if (!MG_TYPES.has(a.type) || !me.mg) return undefined;
  const idx = b.f.indexOf(me), mg = me.mg;
  if (a.type === "mgShadow" && mg.hide > 0) return null;
  if (a.type === "mgNue" && mine(b, idx, "nue").length) return mg.carry > 0 ? "Voando" : (me.cd["nue:carry"] ?? 0) > 0 ? `${((me.cd["nue:carry"] ?? 0) / TIME_SCALE / 1000).toFixed(1)}s` : null;
  if (me.sealed > 0) return "Técnica confiscada";
  if (a.once && me.used.has(a.id)) return "Usada";
  const lk = KIND_OF[a.type];
  if (lk && lk !== "frog" && lk !== "rabbit" && mg.lost[lk]) return "✝ Morto";
  if ((a.type === "mgDog" || a.type === "mgElephant") && mine(b, idx, lk!).length) return null; // toque = recolher
  if ((a.type === "mgDog" || a.type === "mgElephant" || a.type === "mgRabbit" || a.type === "mgMahoraga") && mine(b, idx, ({ mgDog: "dog", mgElephant: "elephant", mgRabbit: "rabbit", mgMahoraga: "mahoraga" } as const)[a.type]).length) return "Em campo";
  const frogMax = Math.max(0, (a.maxActive ?? 5) - (mg.lost["frog"] ?? 0));
  if (a.type === "mgFrog" && !frogMax) return "✝ Mortos";
  if (a.type === "mgFrog" && mine(b, idx, "frog").length >= frogMax) return `Máx. ${frogMax}`;
  if (a.type === "mgArmory" && mg.weapon > 0) return "Em mãos";
  if ((me.cd[a.id] ?? 0) > 0) return `${((me.cd[a.id] ?? 0) / TIME_SCALE / 1000).toFixed(1)}s`;
  if (!b.ready(me, a, costOf(b, idx, a))) return "Sem EA";
  return null;
}
/** Texto do botão quando a técnica muda de função (Nue carregando, Emergir) */
export function megumiButton(b: Battle, me: Fighter, a: Ability): { label: string; note?: string } | null {
  if (!me.mg) return null;
  const idx = b.f.indexOf(me);
  if (a.type === "mgShadow" && me.mg.hide > 0) return { label: "Emergir", note: "nas sombras" };
  if (a.type === "mgNue" && mine(b, idx, "nue").length) return { label: "Nue · Carregar", note: "2º toque · joystick" };
  if ((a.type === "mgDog" || a.type === "mgElephant") && mine(b, idx, KIND_OF[a.type]!).length) return { label: "Recolher", note: a.name };
  if (a.type === "mgFrog") return { label: `Sapo (${mine(b, idx, "frog").length}/${Math.max(0, (a.maxActive ?? 5) - (me.mg.lost["frog"] ?? 0))})` };
  return null;
}

export function castMegumi(b: Battle, me: Fighter, op: Fighter, idx: number, a: Ability): boolean {
  const mg = me.mg; if (!mg) return false;
  const ang = Math.atan2(op.y - me.y, op.x - me.x);
  if (a.type === "mgShadow" && mg.hide > 0) { emerge(b, me, op, a); return true; }
  if (a.type === "mgNue") { const nue = mine(b, idx, "nue")[0]; if (nue) return nueCarry(b, me, op, a); }
  if (megumiUnavailable(b, me, op, a) !== null) return false;
  if (a.type === "mgDog" || a.type === "mgElephant") { const on = mine(b, idx, KIND_OF[a.type]!)[0]; if (on) { recall(b, on); return true; } }
  const garden = !!gardenOf(b, idx);
  b.use(me, a, costOf(b, idx, a));
  if (garden) me.cd[a.id] = (me.cd[a.id] ?? 0) * 0.4;
  switch (a.type) {
    case "mgShadow":
      mg.hide = (a.durationMs ?? 1800) * (garden ? 2 : 1); me.beam = null; shadow(b, me.x, me.y, 28);
      b.say(`${first(me)} afunda na própria sombra${b.shiki.some((s) => s.owner === idx && s.kind !== "mahoraga") ? " · Shikigamis escondidos" : ""}`); break;
    case "mgArmory":
      mg.weapon = a.durationMs ?? 8000; shadow(b, me.x, me.y, 18);
      b.say(`${first(me)} retira uma espada guardada nas sombras`); break;
    case "mgDog":
      spawn(b, "dog", idx, a, me.x + Math.cos(ang) * 30, me.y + Math.sin(ang) * 30, { ang });
      b.say(`${first(me)}: ${a.name}`); break;
    case "mgFrog": {
      const r = Math.random() * Math.PI * 2;
      spawn(b, "frog", idx, a, me.x + Math.cos(r) * 45, me.y + Math.sin(r) * 45, { ang, cd: 350 });
      b.say(`${first(me)}: Sapo`); break;
    }
    case "mgNue":
      spawn(b, "nue", idx, a, me.x, me.y - 24, { ang, cd: 500 });
      b.say(`${first(me)}: Nue`); break;
    case "mgRabbit": {
      const n = a.count ?? 50;
      for (let k = 0; k < n; k++) { const r = Math.random() * Math.PI * 2, d = 10 + Math.random() * 46; spawn(b, "rabbit", idx, a, me.x + Math.cos(r) * d, me.y + Math.sin(r) * d, { life: (a.durationMs ?? 3500) * (0.8 + Math.random() * 0.4), hp: 1, ang: r }, false); }
      shadow(b, me.x, me.y, 50);
      b.say(`${first(me)}: Fuga do Coelho · ${n} coelhos`); break;
    }
    case "mgElephant":
      spawn(b, "elephant", idx, a, op.x, op.y, { ang, fall: a.warmupMs ?? 650 });
      b.say(`${first(me)}: Elefante Máximo cai sobre ${first(op)}`); break;
    case "mgMahoraga":
      b.say(`${first(me)}: "Com este tesouro, eu invoco..."`);
      b.pending.push({ t: Math.max(1, a.delayMs ?? 0), run: () => {
        if (b.winner || me.hp <= 0) return;
        spawn(b, "mahoraga", idx, a, me.x + Math.cos(ang) * 55, me.y + Math.sin(ang) * 55, { ang, cd: 600 });
        b.say("Divino General Mahoraga! Não foi domado: ataca o primeiro alvo à sua frente");
      } }); break;
  }
  return true;
}

/** Poupa o Shikigami: volta para a sombra antes de morrer (morto não pode ser invocado de novo) */
function recall(b: Battle, s: Shiki) { s.life = 0; b.say(`${NAMES[s.kind]} recolhido às sombras`); }
function emerge(b: Battle, me: Fighter, op: Fighter, a: Ability) {
  const mg = me.mg; if (!mg) return;
  mg.hide = 0; shadow(b, me.x, me.y, 26);
  if (Math.hypot(op.x - me.x, op.y - me.y) < 80) {
    b.say(`${first(me)} emerge das sombras atrás de ${first(op)}`);
    b.punch(me, op, (a.damage ?? 70) * b.dm(me), "Ataque das Sombras", { stunMs: a.stunMs ?? 350, knockback: a.knockback ?? 6 });
  } else b.say(`${first(me)} emerge das sombras`);
}

function nueCarry(b: Battle, me: Fighter, op: Fighter, a: Ability) {
  const mg = me.mg; if (!mg || mg.carry > 0 || (me.cd["nue:carry"] ?? 0) > 0 || me.stun > 0) return false;
  const away = Math.atan2(me.y - op.y, me.x - op.x);
  let dx = 0, dy = 0;
  if (b.isPlayer(me) && Math.hypot(b.input.x, b.input.y) > 0.2) { dx = b.input.x; dy = b.input.y; }
  else {
    // foge do oponente sem ir de encontro à parede
    const dir = [away, away + 0.9, away - 0.9, away + 1.57, away - 1.57].find((t) => { const x = me.x + Math.cos(t) * 150, y = me.y + Math.sin(t) * 150; return x > 30 && x < W - 30 && y > 30 && y < H - 30; }) ?? away + 1.57;
    dx = Math.cos(dir); dy = Math.sin(dir);
  }
  const len = Math.hypot(dx, dy) || 1, sp = a.comboSpeedMult ?? 9;
  mg.carry = a.comboDurationMs ?? 650; mg.carryX = dx / len * sp; mg.carryY = dy / len * sp;
  me.cd["nue:carry"] = 1500;
  b.say(`Nue carrega ${first(me)}`);
  return true;
}

/** Abertura do Jardim das Sombras Justapostas: sem acerto garantido (expansão incompleta), cópias de Shikigamis */
export function megumiDomainOpen(b: Battle, me: Fighter, _op: Fighter, idx: number, domain: Domain, a: Ability) {
  void a; void domain; void idx; void me;
  b.say("Jardim das Sombras Justapostas · sombras por toda parte: invocações mais baratas e rápidas");
}
export function _unusedShadowStrike(b: Battle, op: Fighter, idx: number, d: Domain) {
  const a = Math.random() * Math.PI * 2, r = 130 + Math.random() * 60;
  let x = op.x + Math.cos(a) * r, y = op.y + Math.sin(a) * r;
  const dd = Math.hypot(x - d.x, y - d.y); if (dd > d.r - 12) { x = d.x + (x - d.x) / dd * (d.r - 12); y = d.y + (y - d.y) / dd * (d.r - 12); }
  const la = Math.atan2(op.y + op.vy * 6 - y, op.x + op.vx * 6 - x), sp = 9;
  spawn(b, "copy", idx, d.ab, x, y, { life: 900, hp: 60, ang: la, lunge: { vx: Math.cos(la) * sp, vy: Math.sin(la) * sp, hit: false } });
}

// ===================== dano =====================
/** Nas sombras Megumi não é atingido; no próprio Jardim às vezes afunda e escapa */
export function megumiShadowGuard(b: Battle, t: Fighter, src: string) {
  if (!t.mg) return false;
  if (t.mg.hide > 0) return true;
  if (gardenOf(b, b.f.indexOf(t)) && Math.random() < 0.25) { shadow(b, t.x, t.y, 22); b.say(`${first(t)} afundou nas sombras e evitou ${src}`); return true; }
  return false;
}
export function hurtShiki(b: Battle, s: Shiki, d: number, cat: string, label = cat) {
  if (s.hp <= 0 || s.hidden || s.fall > 0 || d <= 0) return;
  if (s.kind === "mahoraga") {
    const lv0 = level(s, cat);
    s.adapt[cat] = (s.adapt[cat] ?? 0) + 1;
    d *= Math.max(cat === "domain" ? 0.3 : 0.08, 1 - lv0 * ADAPT_STEP);
    if (level(s, cat) > lv0) {
      s.spin = 700;
      b.fx.push({ kind: "txt", x: s.x, y: s.y - 34, r: 0, color: "#facc15", life: 1100, max: 1100, text: "⎈ Adaptação" });
      b.say(`Mahoraga girou a roda · adaptação a ${label} (${Math.round((1 - Math.max(cat === "domain" ? 0.3 : 0.08, 1 - level(s, cat) * ADAPT_STEP)) * 100)}% menos dano)`);
    }
  }
  s.hp -= d; s.flash = 120;
  if (s.hp <= 0) { const mg = b.f[s.owner]?.mg; if (mg && s.kind !== "copy") mg.lost[s.kind] = (mg.lost[s.kind] ?? 0) + 1; }
  if (s.hp <= 0 && s.kind !== "rabbit" && s.kind !== "copy") {
    const perm = s.kind !== "frog" && s.kind !== "mahoraga";
    b.fx.push({ kind: "txt", x: s.x, y: s.y - RADIUS[s.kind] - 18, r: 0, color: "#ef4444", life: 2200, max: 2200, text: perm ? `✝ ${NAMES[s.kind]} MORTO · não pode mais ser invocado` : `✝ ${NAMES[s.kind]} morto` });
  }
  if (s.hp <= 0 && s.kind !== "rabbit") { shadow(b, s.x, s.y, RADIUS[s.kind] + 8); b.say(`${NAMES[s.kind]} foi destruído`); }
}

// ===================== atualização =====================
export function updateMegumi(b: Battle, dt: number) {
  if (!b.shiki.length && !b.f.some((f) => f.mg)) return;
  b.f.forEach((me, idx) => {
    const mg = me.mg, op = b.f[1 - idx]; if (!mg || !op || me.hp <= 0) return;
    mg.weapon = Math.max(0, mg.weapon - dt);
    if (mg.carry > 0) {
      mg.carry -= dt; me.x = cx(me.x + mg.carryX * dt / 16); me.y = cy(me.y + mg.carryY * dt / 16); me.vx = 0; me.vy = 0;
      const nue = mine(b, idx, "nue")[0]; if (nue) { nue.x = me.x; nue.y = me.y - 14; nue.ang = Math.atan2(mg.carryY, mg.carryX); }
    }
    if (mg.hide > 0) {
      mg.hide -= dt;
      if (b.isPlayer(me)) { me.x = cx(me.x + b.input.x * 2.2 * dt / 16); me.y = cy(me.y + b.input.y * 2.2 * dt / 16); }
      else {
        // IA: desliza pela sombra até as costas do oponente
        const a0 = Math.atan2(op.y - me.y, op.x - me.x), bx = cx(op.x + Math.cos(a0) * 34), by = cy(op.y + Math.sin(a0) * 34);
        const d = Math.hypot(bx - me.x, by - me.y), sp = 4.2 * dt / 16;
        if (d > sp) { me.x += (bx - me.x) / d * sp; me.y += (by - me.y) / d * sp; }
        me.vx *= 0.5; me.vy *= 0.5;
        if (d < 12 && op.dodgeT <= 0 && mg.hide > 0) mg.hide = 0.0001;
      }
      if (mg.hide <= 0.0001) { const sh = abil(me, "mgShadow"); mg.hide = 0; if (sh) emerge(b, me, op, sh); }
    }
    // golpes corpo a corpo acertam os Shikigamis colados em quem golpeia
    if (op.meleeCd > mg.prevOpMelee + 40) for (const s of b.shiki) if (s.owner === idx && Math.hypot(s.x - op.x, s.y - op.y) < RADIUS[s.kind] + 30) hurtShiki(b, s, op.def.taijutsu.damage * 1.3, "melee", "golpes físicos");
    if (me.meleeCd > mg.prevMyMelee + 40) for (const s of b.shiki) if (s.owner === idx && s.kind === "mahoraga" && s.target === idx && Math.hypot(s.x - me.x, s.y - me.y) < RADIUS.mahoraga + 30) hurtShiki(b, s, me.def.taijutsu.damage, "melee", "golpes físicos");
    mg.prevOpMelee = op.meleeCd; mg.prevMyMelee = me.meleeCd;
    // IA poupa Shikigamis feridos
    if (!b.isPlayer(me)) for (const s of b.shiki) if (s.owner === idx && s.life > 0 && s.hp > 0 && s.kind !== "mahoraga" && s.kind !== "rabbit" && s.kind !== "copy" && s.hp / s.max < 0.25 && !(s.kind === "nue" && mg.carry > 0)) recall(b, s);
  });

  const rabbit: Record<number, { n: number; px: number; py: number }> = {};
  for (const s of b.shiki) {
    const me = b.f[s.owner], op = b.f[1 - s.owner];
    if (!me || !op || (me.hp <= 0 && s.kind !== "mahoraga")) { s.hp = 0; continue; }
    s.life -= dt; s.cd -= dt; s.hitT -= dt; s.t += dt; s.flash -= dt;
    if (s.spin > 0) { s.wheel += Math.min(dt, s.spin) * (Math.PI * 2 / 700); s.spin -= dt; }
    s.hidden = s.kind !== "mahoraga" && megumiHidden(me);
    if (s.hidden) continue;
    // pressão de domínios inimigos (o Mahoraga se adapta)
    for (const d of b.domains) if (d.active && d.owner !== s.owner && Math.hypot(s.x - d.x, s.y - d.y) < d.r && (s.domT -= dt) <= 0) { s.domT = 500; hurtShiki(b, s, (d.ab.shrine ? 90 : 35) * 0.5, "domain", d.ab.name); }
    const opHidden = megumiHidden(op), dist = Math.hypot(op.x - s.x, op.y - s.y);
    switch (s.kind) {
      case "dog": case "copy": {
        if (s.lunge) {
          s.x += s.lunge.vx * dt / 16; s.y += s.lunge.vy * dt / 16; s.ang = Math.atan2(s.lunge.vy, s.lunge.vx);
          if (!s.lunge.hit && !opHidden && Math.hypot(op.x - s.x, op.y - s.y) < 22) {
            s.lunge.hit = true; s.life = Math.min(s.life, 180);
            b.fx.push({ kind: "slash", x: op.x, y: op.y, r: 24, color: "#fff", life: 220, max: 220, ang: s.ang + 1.2 });
            if (b.damage(op, s.ab.damage ?? 45, "Jardim das Sombras: ataque surpresa") > 0) op.stun = Math.max(op.stun, s.ab.stunMs ?? 250);
          }
          if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) s.life = 0;
          break;
        }
        const reach = RADIUS[s.kind] + SIZE / 2 + 6;
        if (opHidden) { moveTo(s, me.x + 30, me.y + 20, 3, dt); break; }
        if (dist > reach) moveTo(s, op.x, op.y, s.ab.speed ?? 5, dt); else s.ang = Math.atan2(op.y - s.y, op.x - s.x);
        if (dist <= reach + 4 && s.cd <= 0) {
          s.cd = s.ab.tickMs ?? 850;
          const copy = s.kind === "copy", dmg = (s.ab.damage ?? 45) * (copy ? 0.6 : 1);
          b.fx.push({ kind: "slash", x: op.x, y: op.y, r: 22, color: "#fff", life: 220, max: 220, ang: s.ang + 1.2 });
          if (b.damage(op, dmg, copy ? "Cópia de Sombra: Garras" : "Cão Divino: Garras") > 0) { op.vx += Math.cos(s.ang) * (s.ab.knockback ?? 3); op.vy += Math.sin(s.ang) * (s.ab.knockback ?? 3); op.stun = Math.max(op.stun, s.ab.stunMs ?? 150); }
        }
        break;
      }
      case "frog": {
        const range = s.ab.maxRange ?? 230;
        if (s.tongue) {
          const tg = s.tongue; tg.t += dt; const k = Math.min(1, tg.t / tg.max);
          if (!tg.back) {
            tg.x = s.x + (tg.tx - s.x) * k; tg.y = s.y + (tg.ty - s.y) * k;
            if (k >= 1) {
              tg.back = true; tg.t = 0;
              const victim = tg.save ? me : op;
              if (Math.hypot(victim.x - tg.tx, victim.y - tg.ty) < 24 && !megumiHidden(victim)) {
                if (tg.save) { const a = Math.atan2(s.y - me.y, s.x - me.x); me.vx = Math.cos(a) * 11; me.vy = Math.sin(a) * 11; b.say(`Sapo puxa ${first(me)} para longe do perigo`); }
                else if (b.damage(op, s.ab.damage ?? 15, "Sapo: Língua") > 0) {
                  const a = Math.atan2(op.y - me.y, op.x - me.x), kb = s.ab.knockback ?? 13;
                  op.vx = Math.cos(a) * kb; op.vy = Math.sin(a) * kb; op.stun = Math.max(op.stun, s.ab.stunMs ?? 500); op.beam = null; op.casting = null;
                  b.say(`Sapo agarra ${first(op)} com a língua e o arremessa`);
                }
              } else b.fx.push({ kind: "txt", x: tg.tx, y: tg.ty - 10, r: 0, color: "#e5e7eb", life: 700, max: 700, text: "Errou" });
            }
          } else { tg.x = tg.tx + (s.x - tg.tx) * k; tg.y = tg.ty + (s.y - tg.ty) * k; if (k >= 1) s.tongue = null; }
          break;
        }
        // fica perto do Megumi, do lado oposto ao oponente
        const away = Math.atan2(me.y - op.y, me.x - op.x) + (s.seed - 0.5) * 2.4;
        moveTo(s, cx(me.x + Math.cos(away) * 70), cy(me.y + Math.sin(away) * 70), s.ab.speed ?? 4, dt);
        if (s.cd > 0) break;
        const danger = (Math.hypot(op.x - me.x, op.y - me.y) < 60 && op.meleeCd <= 150) || b.projs.some((p) => p.owner !== s.owner && p.dmg >= 30 && Math.hypot(p.x - me.x, p.y - me.y) < 140);
        const toMe = Math.hypot(me.x - s.x, me.y - s.y);
        if (danger && !megumiHidden(me) && toMe > 25 && toMe < range) { s.tongue = { x: s.x, y: s.y, tx: me.x, ty: me.y, t: 0, max: 130, save: true, back: false }; s.cd = 1200; }
        else if (!opHidden && dist < range) { s.tongue = { x: s.x, y: s.y, tx: op.x + op.vx * 4, ty: op.y + op.vy * 4, t: 0, max: 170, save: false, back: false }; s.cd = s.ab.tickMs ?? 2200; }
        break;
      }
      case "nue": {
        if (me.mg && me.mg.carry > 0) break;
        if (s.cd <= 0 && !opHidden) {
          const d = moveTo(s, op.x, op.y, (s.ab.speed ?? 5.5) * 1.4, dt);
          if (d < (s.ab.hitRange ?? 60)) {
            s.cd = s.ab.tickMs ?? 1600;
            b.fx.push({ kind: "mgzap", x: s.x, y: s.y, r: d, color: "", life: 380, max: 380, ang: Math.atan2(op.y - s.y, op.x - s.x), seed: Math.random() });
            b.fx.push({ kind: "mgzap", x: op.x, y: op.y, r: 22, color: "", life: 380, max: 380, ang: Math.random() * 7, seed: Math.random() });
            if (b.damage(op, s.ab.damage ?? 40, "Nue: Descarga Elétrica") > 0) op.stun = Math.max(op.stun, s.ab.stunMs ?? 350);
          }
        } else {
          const oa = s.t / 600 + s.seed * 6, tgt = opHidden ? me : op;
          moveTo(s, cx(tgt.x + Math.cos(oa) * 80), cy(tgt.y + Math.sin(oa) * 80 - 10), s.ab.speed ?? 5.5, dt);
        }
        break;
      }
      case "rabbit": {
        if (opHidden) { s.life = Math.min(s.life, 200); break; }
        // cercam o alvo: cada coelho busca um ponto do anel em volta do oponente
        const ring = s.seed * Math.PI * 2, rr = dist > 60 ? 0 : SIZE / 2 + 2;
        const gx = op.x + Math.cos(ring) * rr, gy = op.y + Math.sin(ring) * rr;
        const a = Math.atan2(gy - s.y, gx - s.x) + Math.sin(s.t / 260 + s.seed * 20) * 0.35, hopOn = Math.sin(s.t / 140 + s.seed * 12) > -0.2;
        const sp = hopOn ? (s.ab.speed ?? 1.6) * (0.75 + s.seed * 0.5) : 0;
        s.x = cx(s.x + Math.cos(a) * sp * dt / 16); s.y = cy(s.y + Math.sin(a) * sp * dt / 16); s.ang = a;
        if (dist < SIZE / 2 + 4 && s.hitT <= 0) {
          s.hitT = 450; s.x -= Math.cos(a) * 14; s.y -= Math.sin(a) * 14;
          const pa = Math.atan2(op.y - me.y, op.x - me.x), acc = (rabbit[s.owner] ??= { n: 0, px: 0, py: 0 });
          acc.n++; acc.px += Math.cos(pa) * (s.ab.knockback ?? 0.9); acc.py += Math.sin(pa) * (s.ab.knockback ?? 0.9);
        }
        break;
      }
      case "elephant": {
        if (s.fall > 0) {
          s.fall -= dt;
          if (s.fall <= 0) {
            s.fall = 0;
            b.fx.push({ kind: "boom", x: s.x, y: s.y, r: 70, color: "rgba(244,167,185,0.45)", life: 500, max: 500 });
            b.fx.push({ kind: "crater", x: s.x, y: s.y, r: 40, color: "", life: 2200, max: 2200 });
            if (!opHidden && dist < (s.ab.radius ?? 55)) { if (b.damage(op, s.ab.impactDamage ?? 170, "Elefante Máximo: Esmagamento") > 0) op.stun = Math.max(op.stun, s.ab.stunMs ?? 800); }
            else b.say(`${first(op)} escapou do peso do Elefante Máximo`);
          }
          break;
        }
        // pisão: tenta esmagar quem chega perto
        s.n -= dt;
        if (s.n <= 0 && !opHidden && dist < RADIUS.elephant + SIZE / 2 + 30) {
          s.n = ELEPHANT_STOMP_MS; s.spin = 450;
          b.fx.push({ kind: "boom", x: op.x, y: op.y, r: 45, color: "rgba(244,167,185,0.4)", life: 420, max: 420 });
          b.fx.push({ kind: "crater", x: op.x, y: op.y, r: 26, color: "", life: 1600, max: 1600 });
          if (b.damage(op, ELEPHANT_STOMP_DMG, "Elefante Máximo: Pisão") > 0) op.stun = Math.max(op.stun, 500);
          else b.say(`${first(op)} escapou do pisão`);
        }
        // corpo enorme: ninguém atravessa
        const R = RADIUS.elephant + SIZE / 2;
        if (dist < R && dist > 0.1) { op.x = cx(s.x + (op.x - s.x) / dist * R); op.y = cy(s.y + (op.y - s.y) / dist * R); }
        const want = Math.atan2(op.y - s.y, op.x - s.x); let da = want - s.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        s.ang += Math.max(-1, Math.min(1, da)) * Math.min(1, dt * 0.004);
        if (dist > 220) { const keep = s.ang; moveTo(s, op.x, op.y, s.ab.speed ?? 0.8, dt); s.ang = keep; }
        if (s.cd <= 0) {
          s.cd = s.ab.tickMs ?? 140;
          const L = s.ab.maxRange ?? 280, ox = s.x + Math.cos(s.ang) * 46, oy = s.y + Math.sin(s.ang) * 46;
          const rx = op.x - ox, ry = op.y - oy, along = rx * Math.cos(s.ang) + ry * Math.sin(s.ang), side = Math.abs(-rx * Math.sin(s.ang) + ry * Math.cos(s.ang));
          if (!opHidden && along > -10 && along < L && side < 24) {
            b.damage(op, s.ab.damagePerTick ?? 7, "Elefante Máximo: Jato d'Água", true, false, true);
            op.vx += Math.cos(s.ang) * (s.ab.knockback ?? 2.2); op.vy += Math.sin(s.ang) * (s.ab.knockback ?? 2.2);
            if (s.hitT <= 0) { s.hitT = 2500; b.say(`Jato d'Água do Elefante Máximo empurra ${first(op)}`); }
          }
        }
        break;
      }
      case "mahoraga": {
        s.hp = Math.min(s.max, s.hp + MAHORAGA_REGEN * dt / 1000);
        let tgt = s.target >= 0 ? b.f[s.target] : undefined;
        if (!tgt || tgt.hp <= 0 || megumiHidden(tgt)) {
          // ataca o primeiro alvo que encontra à sua frente
          const cands = b.f.map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0 && !megumiHidden(f));
          const front = cands.filter(({ f }) => Math.cos(Math.atan2(f.y - s.y, f.x - s.x) - s.ang) > 0.3);
          const pick = (front.length ? front : cands).sort((p, q) => Math.hypot(p.f.x - s.x, p.f.y - s.y) - Math.hypot(q.f.x - s.x, q.f.y - s.y))[0];
          if (pick && pick.i !== s.target) b.say(pick.i === s.owner ? `Mahoraga ataca o próprio ${first(pick.f)}!` : `Mahoraga mira ${first(pick.f)}`);
          s.target = pick?.i ?? -1; tgt = pick?.f;
        }
        if (!tgt) break;
        const d = Math.hypot(tgt.x - s.x, tgt.y - s.y), reach = s.ab.hitRange ?? 44;
        if (d > reach) moveTo(s, tgt.x, tgt.y, s.ab.speed ?? 3.8, dt); else s.ang = Math.atan2(tgt.y - s.y, tgt.x - s.x);
        if (d <= reach + 4 && s.cd <= 0) {
          s.cd = s.ab.tickMs ?? 1100; s.n++;
          const sword = s.n % 2 === 1, curse = tgt.def.nature === "curse" || tgt.def.nature === "halfCurse" || tgt.def.id === "sukuna";
          const dmg = sword ? (s.ab.damage ?? 110) * (curse ? s.ab.damageMult ?? 2.5 : 1) : s.ab.impactDamage ?? 70;
          const pierce = tgt.inf > 0 && level(s, "infinity") >= 2;
          if (tgt.inf > 0 && !pierce) hurtShiki(b, s, 0.0001, "infinity", "Ilimitado");
          b.fx.push({ kind: "slash", x: tgt.x, y: tgt.y, r: sword ? 34 : 20, color: "#fff", life: 260, max: 260, ang: s.ang + 1.2 });
          if (sword && curse) b.fx.push({ kind: "boom", x: tgt.x, y: tgt.y, r: 40, color: "rgba(254,240,138,0.55)", life: 400, max: 400 });
          if (b.damage(tgt, dmg, sword ? (curse ? "Espada do Extermínio (energia positiva)" : "Espada do Extermínio") : "Mahoraga: Soco", true, pierce) > 0) {
            tgt.vx += Math.cos(s.ang) * (s.ab.knockback ?? 8); tgt.vy += Math.sin(s.ang) * (s.ab.knockback ?? 8); tgt.stun = Math.max(tgt.stun, s.ab.stunMs ?? 400);
          }
        }
        break;
      }
    }
  }
  for (const [o, acc] of Object.entries(rabbit)) {
    const op = b.f[1 - Number(o)]; if (!op) continue;
    b.damage(op, acc.n * (abil(b.f[Number(o)] as Fighter, "mgRabbit")?.damage ?? 1), "Fuga do Coelho", true, false, true);
    op.vx += Math.max(-3, Math.min(3, acc.px)); op.vy += Math.max(-3, Math.min(3, acc.py)); op.vx *= 0.85; op.vy *= 0.85; op.stun = Math.max(op.stun, 15);
  }
  // projéteis inimigos acertam os Shikigamis no caminho (os coelhos servem de escudo)
  for (const p of b.projs) {
    if (p.life <= 0 || (p.hold ?? 0) > 0) continue;
    for (const s of b.shiki) {
      if (s.hp <= 0 || s.hidden || s.fall > 0 || (s.owner === p.owner && s.kind !== "mahoraga")) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < RADIUS[s.kind] + 6) { hurtShiki(b, s, p.dmg, p.kind, p.name); if (!PIERCE.has(p.kind)) { p.life = 0; break; } }
    }
  }
  b.shiki = b.shiki.filter((s) => {
    if (s.hp > 0 && s.life > 0) return true;
    if (s.hp > 0 && s.kind !== "rabbit" && !s.lunge) shadow(b, s.x, s.y, RADIUS[s.kind] + 6); // volta para a sombra
    return false;
  });
}

// ===================== IA =====================
export function decideMegumi(b: Battle, me: Fighter, op: Fighter, idx: number, dist: number): boolean {
  const mg = me.mg; if (!mg) return false;
  if (mg.hide > 0 || mg.carry > 0) return true;
  const go = (t: string, chance = 1) => { const a = abil(me, t); return !!a && Math.random() < chance && castMegumi(b, me, op, idx, a); };
  const n = (k: ShikiKind) => mine(b, idx, k).length, hpR = me.hp / me.def.hp, garden = !!gardenOf(b, idx);
  const danger = b.projs.some((p) => p.owner !== idx && p.dmg >= 30 && Math.hypot(p.x - me.x, p.y - me.y) < 150) || !!op.beam || ["purple", "fuga", "worldSlash", "plasmaJet", "uzumaki"].includes(op.casting?.ab.type ?? "") || (dist < 50 && op.meleeCd <= 0 && hpR < 0.7);
  if (danger) { if (n("nue") && go("mgNue")) return true; if (go("mgShadow")) return true; }
  if (hpR < 0.35 && go("mgMahoraga")) return true;
  const dom = me.def.abilities.find((a) => a.chimera);
  if (dom && !b.domains.length && dist < 150 && b.ready(me, dom) && (op.hp / op.def.hp < 0.65 || Math.random() < 0.2) && b.beginDomain(me, op, idx, dom)) { b.say(`${first(me)}: ${dom.name.toUpperCase()}`); return true; }
  if (!n("dog") && go("mgDog")) return true;
  if (!n("nue") && dist > 110 && go("mgNue", 0.5)) return true;
  if (n("frog") < (garden ? 5 : 2) && go("mgFrog", 0.5)) return true;
  if (dist < 90 && go("mgRabbit", 0.4)) return true;
  if ((op.stun > 200 || Math.random() < 0.06) && dist < 450 && go("mgElephant")) return true;
  if (dist < 80 && go("mgArmory", 0.5)) return true;
  if (dist > 60 && dist < 260 && Math.random() < 0.04 && go("mgShadow")) return true; // aparece pelas costas
  return false;
}

// ===================== desenho =====================
function seeded(seed = 0.5) { let s = Math.floor(seed * 233280) || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const ell = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); };

export function drawMegumiFx(c: CanvasRenderingContext2D, e: Fx, k: number) {
  const base = c.globalAlpha;
  if (e.kind === "shadow") {
    const g = 1.25 - k * 0.45;
    c.globalAlpha = base * 0.9; ell(c, e.x, e.y + 4, e.r * g, e.r * 0.42 * g, "#05070f");
    c.strokeStyle = "#3b82f6"; c.lineWidth = 1.2; c.beginPath(); c.ellipse(e.x, e.y + 4, e.r * g, e.r * 0.42 * g, 0, 0, 7); c.stroke();
    const rnd = seeded(e.seed); c.strokeStyle = "#0b1020"; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const x = e.x + (rnd() - 0.5) * e.r * 1.6, h = (6 + rnd() * 14) * (1 - k); c.beginPath(); c.moveTo(x, e.y + 4); c.quadraticCurveTo(x + (rnd() - 0.5) * 8, e.y - h / 2, x, e.y + 4 - h); c.stroke(); }
  } else if (e.kind === "mgzap") {
    const rnd = seeded(e.seed), a = e.ang ?? 0, nx = -Math.sin(a), ny = Math.cos(a);
    c.save(); c.shadowColor = "#a855f7"; c.shadowBlur = 10;
    for (const [w, col] of [[3, "#a855f7"], [1.2, "#f5d0fe"]] as const) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(e.x, e.y);
      for (let i = 1; i <= 7; i++) { const t = i / 7, j = i === 7 ? 0 : (rnd() - 0.5) * 14; c.lineTo(e.x + Math.cos(a) * e.r * t + nx * j, e.y + Math.sin(a) * e.r * t + ny * j); }
      c.stroke();
    }
    c.restore();
  }
  c.globalAlpha = base;
}

function drawDog(c: CanvasRenderingContext2D, s: Shiki, time: number) {
  const run = Math.sin(time / 70 + s.seed * 9), atk = s.cd > (s.ab.tickMs ?? 850) - 160 ? 5 : 0;
  c.save(); c.translate(s.x, s.y); c.rotate(s.ang); c.scale(1.15, 1.15);
  if (s.kind === "copy") { c.globalAlpha *= 0.6; c.scale(0.85, 0.85); c.shadowColor = "#3b82f6"; c.shadowBlur = 8; }
  ell(c, 0, 3, 22, 9, "rgba(0,0,0,0.35)");
  // cauda espessa
  c.fillStyle = "#16161a"; c.beginPath(); c.moveTo(-14, -3); c.quadraticCurveTo(-28, -12 + run * 4, -36, -4); c.quadraticCurveTo(-27, 9, -14, 4); c.fill();
  c.fillStyle = "#e7e5e4"; c.beginPath(); c.moveTo(-31, -5 + run * 2); c.lineTo(-37, -4); c.lineTo(-31, -1); c.fill();
  // patas com garras
  for (const [lx, ly, ph] of [[11, -11, 1], [11, 11, -1], [-10, -11, -1], [-10, 11, 1]] as const) {
    const px = lx + run * ph * 3.5 + (lx > 0 ? atk : 0);
    ell(c, px, ly, 5.2, 3, "#e7e5e4");
    c.strokeStyle = "#0a0a0a"; c.lineWidth = 1; c.beginPath(); for (const o of [-1.6, 0, 1.6]) { c.moveTo(px + 4, ly + o); c.lineTo(px + 7, ly + o * 1.3); } c.stroke();
  }
  // corpo + juba espinhosa
  ell(c, 0, 0, 18, 11.5, "#202025");
  c.fillStyle = "#0e0e11"; c.beginPath();
  for (let i = 0; i <= 16; i++) { const a = -Math.PI * 0.85 + (i / 16) * Math.PI * 1.7, r = i % 2 ? 9 : 16.5; c.lineTo(5 + Math.cos(a) * r * 0.85, Math.sin(a) * r); }
  c.fill();
  // marcas brancas (padrão da Totalidade)
  c.strokeStyle = "#f5f5f4"; c.lineWidth = 1.6;
  for (const k of [-1, 1]) { c.beginPath(); c.moveTo(-10, k * 3); c.quadraticCurveTo(-4, k * 9, 3, k * 5); c.stroke(); }
  ell(c, 11 + atk * 0.5, 0, 5.5, 7, "#f5f5f4");
  // cabeça e focinho
  const hx = atk * 0.8;
  ell(c, 19 + hx, 0, 8, 6.5, "#26262b"); ell(c, 25.5 + hx, 0, 4.6, 3.3, "#e7e5e4"); ell(c, 29.5 + hx, 0, 1.4, 1.6, "#0a0a0a");
  c.fillStyle = "#121215"; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(16 + hx, k * 4); c.lineTo(10 + hx, k * 11.5); c.lineTo(19 + hx, k * 6.5); c.fill(); }
  c.strokeStyle = "#f5f5f4"; c.lineWidth = 1; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(17 + hx, k * 1.5); c.lineTo(23 + hx, k * 4); c.stroke(); }
  c.save(); c.shadowColor = "#ef4444"; c.shadowBlur = 5; ell(c, 21 + hx, -2.8, 1.4, 1.1, "#ef4444"); ell(c, 21 + hx, 2.8, 1.4, 1.1, "#ef4444"); c.restore();
  if (atk) { c.fillStyle = "#fafafa"; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(28 + hx, k * 1.5); c.lineTo(31 + hx, k * 0.5); c.lineTo(28 + hx, k * 0.2); c.fill(); } }
  c.restore();
}
function drawFrog(c: CanvasRenderingContext2D, s: Shiki) {
  if (s.tongue) { c.strokeStyle = "#9d4edd"; c.lineWidth = 3.5; c.lineCap = "round"; c.beginPath(); c.moveTo(s.x + Math.cos(s.ang) * 7, s.y + Math.sin(s.ang) * 7); c.lineTo(s.tongue.x, s.tongue.y); c.stroke(); c.lineCap = "butt"; ell(c, s.tongue.x, s.tongue.y, 3.8, 3.8, "#b565e8"); }
  c.save(); c.translate(s.x, s.y); c.rotate(s.ang);
  for (const k of [-1, 1]) { ell(c, -6, k * 8, 5, 2.4, "#3f8a26", k * 0.6); ell(c, 5, k * 7, 3.2, 1.8, "#3f8a26", -k * 0.5); }
  ell(c, 0, 0, 9, 7, "#5fae37"); ell(c, -2, 0, 4, 3, "#4a962b"); ell(c, -1, 0, 6, 2, "#c7e39a");
  for (const k of [-1, 1]) { ell(c, 6, k * 4.6, 2.8, 2.8, "#e0f2fe"); ell(c, 6.4, k * 4.6, 0.7, 1.8, "#1f2937"); }
  c.restore();
}
function drawNue(c: CanvasRenderingContext2D, s: Shiki, time: number) {
  const flap = 0.72 + 0.28 * Math.sin(time / 85 + s.seed * 8);
  c.save(); c.translate(s.x, s.y); c.rotate(s.ang); c.scale(1.5, 1.5);
  for (const k of [-1, 1]) {
    c.fillStyle = "#a5442f"; c.strokeStyle = "#5b1d12"; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(2, k * 3); c.lineTo(-4, k * 26 * flap); c.lineTo(-12, k * 24 * flap); c.lineTo(-10, k * 4); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#e6a08f"; c.beginPath(); for (let i = 1; i < 5; i++) { c.moveTo(-1 - i * 2, k * 4); c.lineTo(-4 - i * 2, k * (6 + i * 4) * flap); } c.stroke();
  }
  ell(c, -9, -2, 1.6, 0.8, "#111"); ell(c, -9, 2, 1.6, 0.8, "#111");
  ell(c, -1, 0, 7, 5.5, "#8d3a27"); ell(c, 5, 0, 5, 5, "#b0503a");
  c.fillStyle = "#f3f0f5"; c.fillRect(6, -3.6, 3.6, 7.2); ell(c, 8.5, -1.6, 0.9, 0.9, "#facc15"); ell(c, 8.5, 1.6, 0.9, 0.9, "#facc15");
  c.restore();
  if (s.cd < 300 || Math.sin(time / 50 + s.seed * 30) > 0.92) { c.strokeStyle = "#c084fc"; c.lineWidth = 1; c.beginPath(); const r = seeded(Math.floor(time / 60) % 97 / 97 + 0.01); c.moveTo(s.x, s.y); for (let i = 0; i < 4; i++) c.lineTo(s.x + (r() - 0.5) * 30, s.y + (r() - 0.5) * 30); c.stroke(); }
}
function drawRabbit(c: CanvasRenderingContext2D, s: Shiki, time: number) {
  const ph = Math.sin(s.t / 140 + s.seed * 12), hop = ph > -0.2 ? Math.abs(Math.sin(s.t / 70 + s.seed * 12)) * 3 : 0;
  ell(c, s.x, s.y + 2, 5, 2, "rgba(0,0,0,0.3)");
  c.save(); c.translate(s.x, s.y - hop); c.rotate(s.ang);
  ell(c, -5.5, 0, 2, 2, "#ffffff"); // cauda
  ell(c, -1, 0, 5.5, 4.2, "#f4f4f5"); ell(c, -1.5, 0, 3.5, 2.6, "#fafafa");
  ell(c, 3.5, 0, 3.4, 3, "#ffffff");
  for (const k of [-1, 1]) { const flop = Math.sin(time / 300 + s.seed * 9 + k) * 0.12; ell(c, -1, k * 2.4, 5.2, 1.5, "#f4f4f5", k * (0.35 + flop)); ell(c, -1, k * 2.4, 3.6, 0.6, "#f9a8d4", k * (0.35 + flop)); }
  ell(c, 4.6, -1.3, 0.7, 0.7, "#111827"); ell(c, 4.6, 1.3, 0.7, 0.7, "#111827"); ell(c, 6.6, 0, 0.6, 0.5, "#f472b6");
  c.restore();
}
function drawElephant(c: CanvasRenderingContext2D, s: Shiki, time: number, b: Battle) {
  if (s.fall > 0) {
    const k = s.fall / ((s.ab.warmupMs ?? 650) || 1);
    c.save(); c.globalAlpha *= 0.55; ell(c, s.x, s.y, (s.ab.radius ?? 55) * (1.1 - k * 0.5), (s.ab.radius ?? 55) * (0.6 - k * 0.25), "#000"); c.restore();
  }
  const k = s.fall > 0 ? s.fall / ((s.ab.warmupMs ?? 650) || 1) : 0;
  if (!k) { // jato d'água pela tromba
    const L = s.ab.maxRange ?? 280, ox = s.x + Math.cos(s.ang) * 46, oy = s.y + Math.sin(s.ang) * 46;
    c.save(); c.translate(ox, oy); c.rotate(s.ang);
    for (const [w, col] of [[14, "rgba(56,189,248,0.35)"], [8, "rgba(125,211,252,0.8)"], [3, "rgba(240,249,255,0.95)"]] as const) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(0, 0);
      for (let x = 0; x <= L; x += 20) c.lineTo(x, Math.sin(x / 22 - time / 60) * (2 + x / 70));
      c.stroke();
    }
    c.fillStyle = "rgba(224,242,254,0.9)"; for (let i = 0; i < 8; i++) { const x = ((time / 3 + i * 37) % L); c.beginPath(); c.arc(x, Math.sin(i * 7 + time / 90) * 10, 1.6, 0, 7); c.fill(); }
    c.restore();
  }
  c.save(); c.translate(s.x, s.y - k * 60); c.rotate(s.ang); const sc = 1 + k * 0.5; c.scale(sc, sc);
  if (k) c.globalAlpha *= 1 - k * 0.4;
  for (const [fx, fy] of [[16, -20], [16, 20], [-20, -20], [-20, 20]] as const) ell(c, fx, fy, 6, 6, "#3f3f46");
  ell(c, 0, 0, 34, 24, "#f2a7b8"); c.strokeStyle = "#b56b7c"; c.lineWidth = 1; c.stroke();
  c.strokeStyle = "#c9a227"; c.lineWidth = 3; c.beginPath(); c.ellipse(-4, 0, 15, 12, 0, 0, 7); c.stroke();
  ell(c, -4, 0, 6, 5, "#d4af37"); c.fillStyle = "#d4af37"; for (let i = 0; i < 10; i++) { const a = i * 0.63; c.beginPath(); c.arc(-4 + Math.cos(a) * 20, Math.sin(a) * 16, 1.6, 0, 7); c.fill(); }
  for (const kk of [-1, 1]) { ell(c, 20, kk * 18, 14, 10, "#f0a0b2", kk * 0.3); c.strokeStyle = "#c81e3a"; c.lineWidth = 3; c.beginPath(); c.ellipse(20, kk * 18, 14, 10, kk * 0.3, kk > 0 ? -0.2 : Math.PI * 0.2 + Math.PI, kk > 0 ? Math.PI * 0.8 : Math.PI * 1.2 + Math.PI); c.stroke(); }
  ell(c, 28, 0, 13, 12, "#f5b3c2"); c.strokeStyle = "#c9a227"; c.lineWidth = 1.5; c.strokeRect(24, -5, 8, 10);
  c.fillStyle = "#fafaf9"; for (const kk of [-1, 1]) { c.beginPath(); c.moveTo(36, kk * 4); c.lineTo(44, kk * 8); c.lineTo(37, kk * 7); c.fill(); }
  c.strokeStyle = "#eea0b2"; c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(38, 0); c.quadraticCurveTo(44, Math.sin(time / 200) * 3, 47, 0); c.stroke(); c.lineCap = "butt";
  ell(c, 32, -5, 1.4, 1.4, "#3f1d24"); ell(c, 32, 5, 1.4, 1.4, "#3f1d24");
  c.restore();
  void b;
}
function drawMahoraga(c: CanvasRenderingContext2D, s: Shiki, time: number) {
  c.save(); c.translate(s.x, s.y); c.rotate(s.ang); c.scale(1.15, 1.15);
  const swing = s.cd > (s.ab.tickMs ?? 1100) - 200 ? 0.6 : 0;
  ell(c, -6, 0, 12, 17, "#3a4a44");
  c.save(); c.translate(6, 20); c.rotate(-0.15 - swing);
  ell(c, 0, 0, 6, 4.5, "#f4f4f5"); c.strokeStyle = "#a1a1aa"; c.lineWidth = 1; for (let i = -3; i <= 3; i += 2) { c.beginPath(); c.moveTo(i, -4); c.lineTo(i + 1, 4); c.stroke(); }
  c.fillStyle = "#374151"; c.strokeStyle = "#9ca3af"; c.beginPath(); c.moveTo(2, -3); c.lineTo(46, -1); c.lineTo(52, 1); c.lineTo(2, 3); c.closePath(); c.fill(); c.stroke();
  c.restore();
  ell(c, 8, -20, 6, 5, "#f4f4f5"); ell(c, 13, -21, 2.6, 2.6, "#e4e4e7");
  ell(c, 0, 0, 13, 22, s.flash > 0 ? "#ffffff" : "#f4f4f5"); c.strokeStyle = "#a1a1aa"; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, 13, 22, 0, 0, 7); c.stroke();
  c.strokeStyle = "#1f2937"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(6, -8); c.quadraticCurveTo(10, 0, 6, 8); c.stroke();
  ell(c, 3, 0, 8, 7.5, "#fafafa"); c.fillStyle = "#e4e4e7"; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(0, k * 5); c.lineTo(-12, k * 11); c.lineTo(-3, k * 2); c.fill(); }
  c.save(); c.translate(3, 0); c.rotate(s.wheel);
  if (s.spin > 0) { c.shadowColor = "#facc15"; c.shadowBlur = 12; }
  c.strokeStyle = "#c9a227"; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.stroke();
  c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } c.stroke();
  c.fillStyle = "#d4af37"; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.arc(Math.cos(a) * 13, Math.sin(a) * 13, 2.3, 0, 7); c.fill(); }
  c.restore();
  c.restore();
  void time;
}

export function drawMegumiWorld(b: Battle, c: CanvasRenderingContext2D) {
  if (!b.shiki.length) return;
  const order: ShikiKind[] = ["elephant", "rabbit", "frog", "copy", "dog", "mahoraga", "nue"];
  for (const kind of order) for (const s of b.shiki) {
    if (s.kind !== kind || s.hidden) continue;
    c.save(); if (s.flash > 0) c.filter = "brightness(1.8)";
    if (kind === "dog" || kind === "copy") drawDog(c, s, b.time);
    else if (kind === "frog") drawFrog(c, s);
    else if (kind === "nue") drawNue(c, s, b.time);
    else if (kind === "rabbit") drawRabbit(c, s, b.time);
    else if (kind === "elephant") drawElephant(c, s, b.time, b);
    else drawMahoraga(c, s, b.time);
    c.restore();
    if (kind !== "rabbit" && s.fall <= 0) {
      const w = kind === "elephant" || kind === "mahoraga" ? 44 : kind === "frog" ? 20 : 32, y = s.y - RADIUS[kind] - 14, r = Math.max(0, s.hp / s.max);
      c.fillStyle = "rgba(0,0,0,0.75)"; c.fillRect(s.x - w / 2 - 1, y - 1, w + 2, 6);
      c.fillStyle = kind === "mahoraga" ? "#facc15" : r > 0.5 ? "#4ade80" : r > 0.25 ? "#facc15" : "#ef4444"; c.fillRect(s.x - w / 2, y, w * r, 4);
      c.fillStyle = "#e5e7eb"; c.font = "bold 8px monospace"; c.textAlign = "center"; c.fillText(`${Math.ceil(s.hp)}`, s.x, y - 2); c.textAlign = "left";
    }
  }
}
/** Megumi escondido: só a poça de sombra aparece. Devolve true para pular o quadrado. */
export function drawMegumiFighter(b: Battle, c: CanvasRenderingContext2D, f: Fighter) {
  if (!f.mg || f.mg.hide <= 0) return false;
  const p = 0.5 + Math.sin(b.time / 120) * 0.5;
  ell(c, f.x, f.y + 6, 18, 7, "#03050c");
  c.strokeStyle = `rgba(96,165,250,${0.35 + p * 0.4})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(f.x, f.y + 6, 18 + p * 3, 7 + p, 0, 0, 7); c.stroke(); c.lineWidth = 1;
  return true;
}
export function drawMegumiGear(b: Battle, c: CanvasRenderingContext2D, f: Fighter) {
  if (!f.mg || f.mg.weapon <= 0) return;
  const op = b.f.find((o) => o !== f); if (!op) return;
  const a = Math.atan2(op.y - f.y, op.x - f.x), hx = f.x + Math.cos(a + 0.6) * 18, hy = f.y + Math.sin(a + 0.6) * 18;
  c.save(); c.translate(hx, hy); c.rotate(a + (f.meleeCd > 200 ? -0.8 : 0.3));
  c.fillStyle = "#18181b"; c.fillRect(-7, -1.5, 7, 3); c.fillRect(-1, -4, 2, 8);
  c.fillStyle = "#d4d4d8"; c.strokeStyle = "#52525b"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(1, -1.8); c.lineTo(24, -1); c.lineTo(28, 0); c.lineTo(24, 1.2); c.lineTo(1, 1.8); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
/** Jardim das Sombras Justapostas: chão de sombra líquida com filamentos azuis irradiando do centro */
/** Jardim das Sombras Justapostas: fundo preto simples */
export function drawChimeraGarden(b: Battle, c: CanvasRenderingContext2D, d: Domain) {
  void b; c.fillStyle = "#000"; c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
}
