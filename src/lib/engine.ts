import { styleTokens } from "@/lib/css-tokens";
import combatDefaults from "@/data/combat.json";
import abilityStats from "@/data/abilities.json";
import { physicalImpact, interceptAngle, tacticalDistance } from "./combat-tactics";
import { drawToji, drawTojiChain } from "./toji-visuals";
import { drawNanami, drawNanamiFx } from "./nanami-visuals";
import { drawAmberFlow, drawKashimoWave, drawWorldCut } from "./kashimo-visuals";
import type { AbilityTiming } from "./timing";
import { isCastAbility } from "./timing";
import { MG_TYPES, makeMg, castMegumi, megumiUnavailable, megumiHidden, megumiShadowGuard, megumiDomainOpen, updateMegumi, decideMegumi, drawMegumiFx, drawMegumiWorld, drawMegumiFighter, drawMegumiGear, drawChimeraGarden, type MgState, type Shiki } from "./megumi";
import { YZ_TYPES, makeYz, flightMult, castYorozu, yorozuUnavailable, decideYorozu as yorozuDecide, updateYorozu, yorozuMelee, yorozuSphereReady, yorozuDomainOpen, yorozuSphereHit, yorozuChainHit, yorozuPlateBlock, drawYorozuWorld, drawYorozuFighter, drawYorozuProj, drawTripleAffliction, type YzState, type YzEnt } from "./yorozu";

export type SpiritGrade = { name: string; count: number; hp: number; damage: number; speed: number; cooldown: number; uzumakiPower: number };
export type CombatRules = typeof combatDefaults;
export type CombatOverrides = { [K in keyof CombatRules]?: Partial<CombatRules[K]> };

export type Ability = {
  id: string; name: string; type: string;
  damage?: number; cost?: number; cooldown?: number; once?: boolean;
  damagePerUnit?: number; costPerUnit?: number; maxUnits?: number;
  costPerTick?: number; tickMs?: number; durationMs?: number;
  count?: number; hitRange?: number; delayMs?: number; stunMs?: number; knockback?: number; castMs?: number; overloadMs?: number;
  mult?: { damage: number; speed: number; reflex: number };
  hp?: number; capacity?: number; hitkill?: boolean; selfDestruct?: boolean; consumeAllEnergy?: boolean;
  grades?: SpiritGrade[]; maxActive?: number; summonCount?: number; criticalSummonCount?: number; initialCooldownMs?: number;
  consumeFraction?: number; consumeFieldSpirits?: boolean; specialStunMs?: number; projectileLifeMs?: number;
  pullRadius?: number; pullForce?: number; hitRadius?: number; warmupMs?: number; turnSpeed?: number;
  blockDurationMs?: number; impactStunMs?: number; pushStunMs?: number; comboStunMs?: number; comboSpeedMult?: number; comboDurationMs?: number;
  radius?: number; slowMult?: number; damageMult?: number; maxCharges?: number; targetDamage?: number;
  ai?: { minRange?: number; maxRange?: number; chance?: number; hpRatio?: number; activationMs?: number; minSpirits?: number; criticalHpRatio?: number };
  poison?: { damage: number; tickMs: number; durationMs: number };
  maxRange?: number; materialDamage?: number;
  damagePerTick?: number; shrine?: boolean; affectsHeavenly?: boolean; trial?: boolean;
  defense?: number; requiresSphere?: boolean; ignoresSimple?: boolean; gravity?: boolean; speed?: number; impactDamage?: number; pushDamage?: number;
  /** Tempos editáveis (preparação, lançamento, velocidade, impacto, recuperação, intervalo) */
  timing?: AbilityTiming;
  /** Aflição Tripla: domínio que dá acerto garantido às construções da Yorozu */
  yorozuDomain?: boolean;
  /** Jardim das Sombras Justapostas (Megumi): expansão incompleta, sem acerto garantido */
  chimera?: boolean;
  /** Formas internas da técnica (ataques automáticos sem botão), cada uma com seus próprios tempos */
  forms?: Record<string, Ability>;
  /** Metal Líquido: EA que os moldes automáticos nunca gastam; intervalo mínimo entre moldes */
  reserveEnergy?: number; moldIntervalMs?: number;
};
export type CharDef = {
  id: string; name: string; color: string; range: string; preferredDistance: number;
  hp: number; energy: number; energyRegen: number; speed: number; reflex: number;
  taijutsu: { damage: number; cooldown: number; hitRange?: number; style: string; stunMs?: number; timing?: AbilityTiming };
  blackFlashChance?: number; blackFlashMult?: number; costMult?: number; intelligence?: number; outline?: string;
  passives?: { id: string; name: string; description?: string; costMult?: number }[];
  rangeModes?: { distances: number[]; weights: number[]; minSwitchMs: number; switchJitterMs: number };
  combat?: CombatOverrides;
  /** Arma segurada: defende só socos, aguentando até `durability` de dano antes de quebrar */
  weapon?: { id: string; name: string; durability: number; damage?: number; blockChance?: number; visualScale?: number };
  companion?: { name: string; hp: number; damage?: number; whipDamage?: number; projectileDamage?: number; speed?: number; cooldown?: number; initialCooldownMs?: number; whipDurationMs?: number; projectileDurationMs?: number; meleeRange?: number; whipRange?: number; hitRadius?: number };
  /** human: só cura se tiver rct; halfCurse/curse curam naturalmente com energia básica */
  nature?: "human" | "halfCurse" | "curse"; rct?: boolean; damageMult?: number;
  abilities: Ability[];
};

/** Custo de cura: a cada `hp` de vida recuperada gasta `en` de energia */
export const HEAL_RATES = combatDefaults.healing.rates;
const ARENA = combatDefaults.arena, PACHINKO = combatDefaults.pachinko;
const ENERGY = combatDefaults.energy;
export const JACKPOT_ENERGY = PACHINKO.jackpotEnergy, JACKPOT_MS = PACHINKO.jackpotMs;
export const W = ARENA.width, H = ARENA.height, SIZE = ARENA.fighterSize, TIME_SCALE = ARENA.timeScale, DOMAIN_R = ARENA.domainRadius;
export const PACHINKO_MS = PACHINKO.durationMs * TIME_SCALE;

export type Garuda = { massT: number; massBonus: number; hp: number; x: number; y: number; mode: "follow" | "guard" | "whip" | "ball" | "return"; cd: number; t: number; vx: number; vy: number };
export type PlayerInput = { x: number; y: number; attack: boolean; heal: boolean };
export type AbilityChoice = { mode?: string; units?: number; grade?: number };
export type AbilityOption = { id: string; name: string; choice: AbilityChoice };

export type Fighter = {
  /** Recuperação: tempo após o ataque sair em que o lutador não pode agir */
  recovery: number;
  /** Estado das técnicas da Yorozu (asas, placas, combos, investida) */
  yz: YzState | null;
  /** Técnica das Dez Sombras (Megumi) */
  mg: MgState | null;
  equipment: "spear" | "katana"; retreatT: number; exchangeLoss: number;
  weaponHp: number;
  /** Lâmina de Sangue do Choso: tempo restante da adaga na mão */
  blade: number;
  poison: { left: number; tick: number; every: number; damage: number } | null;
  charges: number; amber: number; garuda: Garuda | null; starForce: number; starT: number; anger: number; armor: number; metal: number; sphere: boolean; jackpot: number; jackpots: number; healing: boolean; arsenal: number[];
  def: CharDef; x: number; y: number; vx: number; vy: number;
  hp: number; en: number; stun: number; cd: Record<string, number>; used: Set<string>;
  buff: { damage: number; speed: number; reflex: number } | null;
  beam: { t: number; tick: number; ab: Ability; ang: number } | null;
  simple: number; simpleHp: number; wicker: boolean; dashAtk: number; casting: { ab: Ability; t: number } | null;
  inf: number; think: number; strafe: number; meleeCd: number; flash: number; aggr: number; strafeCd: number; modeT: number; want: number; wallHit: boolean; dodgeT: number; dodgeX: number; dodgeY: number;
  /** Sentença Mortal: técnica/EA confiscada; Espada do Carrasco ativa */
  /** Demora de execução: segundos até a técnica realmente sair (não é cooldown) */
  windup: number;
  sealed: number; executioner: number; gavelBig: number; gavelExt: number; gavelReach: number;
};
export type Proj = { hit?: boolean; sure?: boolean; home?: number; curve?: number; x: number; y: number; vx: number; vy: number; dmg: number; owner: number; kind: "blood" | "slash" | "red" | "purple" | "construct" | "metal" | "sphere" | "electric" | "electromagnetic" | "sound" | "uzumaki" | "plasma" | "ball" | "meteor" | "disc" | "chain" | "tojiChain" | "fuga" | "world" | "net" | "yzBlade" | "yzChain" | "yzLance" | "gavel"; life: number; hold?: number; originX?: number; originY?: number; shape?: number; stun?: number; name: string; ab?: Ability };
type Door = { x: number; y: number; owner: number; ang: number; mode: "bloqueio" | "impacto" | "empurrao" | "combinacao"; life: number; max: number };
/** Espíritos do Kenjaku por grau: 4, 3, 2, 1, especial */
export const SPIRIT_GRADES = abilityStats.kenjaku.spirits.grades;
export const ARSENAL = SPIRIT_GRADES.map((g) => g.count);
// Fixed silhouette sizes are visual design, not balance data.
const SPIRIT_RADII = [6, 7, 8, 10, 13];
const sg = (i: number) => ({ r: SPIRIT_RADII[i] ?? 6 });
type Spirit = { x: number; y: number; owner: number; grade: number; hp: number; cd: number; life: number; seed: number };
type Grav = { x: number; y: number; owner: number; r: number; dps: number; life: number; max: number; ab?: Ability };
type Blue = { x: number; y: number; owner: number; dmg: number; life: number; ab: Ability };
type Orb = { x: number; y: number; owner: number; dmg: number; stun: number; life: number; name: string; ab: Ability };
export type Domain = { tick?: number; owner: number; x: number; y: number; r: number; remaining: number; duration: number; active: boolean; ab: Ability; round: number; mode: string; chance: number; won: boolean; symbols: number[]; revealed: boolean; indicator: number; trialT?: number; verdict?: string; accusation?: string; retried?: boolean };

/** Acusações possíveis da Sentença Mortal — o Judgeman escolhe, não o Higuruma */
/** Campos do oponente/lutador que a janela de adiamento desfaz e reaplica no momento do impacto */
/** Ataques que atravessam o alvo e seguem voando */
const PASS_THROUGH = new Set(["slash", "purple", "net", "world", "fuga", "red", "uzumaki", "plasma"]);
const OP_DELTA = ["hp", "armor", "en", "simpleHp", "vx", "vy", "exchangeLoss"] as const;
const OP_MAX = ["stun", "retreatT"] as const;
const OP_SET = ["beam", "casting", "buff", "poison", "metal", "inf", "simple", "wicker", "dodgeT", "dodgeX", "dodgeY", "sealed", "charges"] as const;
const SELF_SET = ["buff", "armor", "metal", "inf", "simple", "simpleHp", "wicker", "blade", "gavelBig", "gavelExt", "amber", "charges", "executioner"] as const;
type Win = { owner: number; delay: number; winner: string | null; fx: number; orbs: number; blues: number; gravs: number; doors: number; spirits: number; ents: number; op: Record<string, unknown>; opYz: YzState | null; self: Record<string, unknown>; selfYz: YzState | null; garuda: number };
function snap(f: Fighter, keys: readonly string[]) { const o = f as unknown as Record<string, unknown>; return Object.fromEntries(keys.map((k) => [k, o[k]])); }
const ACCUSATIONS = ["agressão com técnica amaldiçoada", "destruição de propriedade", "uso ilegal de energia amaldiçoada", "tentativa de homicídio", "invasão de domínio alheio"];

export type Fx = { kind: "electric" | "jackpot" | "ring" | "slash" | "boom" | "hit" | "domain" | "bf" | "txt" | "divergentFist" | "smoke" | "crater" | "ratio" | "nwave" | "collapse" | "shadow" | "mgzap"; text?: string; x: number; y: number; r: number; color: string; life: number; max: number; ang?: number; seed?: number };

export class Battle {
  f: [Fighter, Fighter]; projs: Proj[] = []; orbs: Orb[] = []; blues: Blue[] = []; doors: Door[] = []; spirits: Spirit[] = []; gravs: Grav[] = []; fx: Fx[] = []; voidT = 0; voidX = 0; voidY = 0;
  domains: Domain[] = [];
  /** Construções da Yorozu que não são projéteis (gaiolas, espinhos, metal remoto) */
  yzEnts: YzEnt[] = [];
  /** Shikigamis do Megumi */
  shiki: Shiki[] = [];
  /** Efeitos adiados pelos tempos de preparação/lançamento/impacto */
  pending: { t: number; run: () => void }[] = [];
  win: Win | null = null;
  blackHole: { x: number; y: number; t: number; owner: number } | null = null;
  static grid: HTMLCanvasElement | null = null;
  log: string[] = []; winner: string | null = null; time = 0;
  player: 0 | 1 | null;
  input: PlayerInput = { x: 0, y: 0, attack: false, heal: false };
  constructor(a: CharDef, b: CharDef, player: 0 | 1 | null = null) {
    this.player = player;
    this.f = [this.mk(a, 140, H / 2), this.mk(b, W - 140, H / 2)];
  }
  rules<K extends keyof CombatRules>(f: Fighter, key: K): CombatRules[K] {
    return { ...combatDefaults[key], ...f.def.combat?.[key] };
  }
  spiritGrade(f: Fighter, i: number) {
    const grades = f.def.abilities.find((a) => a.type === "curseSpirits")?.grades ?? SPIRIT_GRADES;
    const grade = (grades[i] ?? SPIRIT_GRADES[0]) as SpiritGrade;
    return { ...grade, dmg: grade.damage, spd: grade.speed, power: grade.uzumakiPower, ...sg(i) };
  }
  abilityDamage(t: Fighter, d: number, a?: Ability) { return a?.hitkill ? t.hp + t.armor : d; }
  mk(def: CharDef, x: number, y: number): Fighter {
    return { recovery: 0, mg: def.abilities.some((a) => MG_TYPES.has(a.type)) ? makeMg() : null, yz: def.abilities.some((a) => YZ_TYPES.has(a.type)) ? makeYz() : null, windup: 0, equipment: "spear", retreatT: 0, exchangeLoss: 0, blade: 0, sealed: 0, executioner: 0, gavelBig: 0, gavelExt: 0, gavelReach: 0, weaponHp: def.weapon?.durability ?? 0, poison: null, arsenal: def.abilities.find((a) => a.type === "curseSpirits")?.grades?.map((g) => g.count) ?? [], charges: 0, amber: 0, garuda: def.companion ? { massT: 0, massBonus: 0, hp: def.companion.hp, x: x + 40, y: y - 35, mode: "follow", cd: def.companion.initialCooldownMs ?? 600, t: 0, vx: 0, vy: 0 } : null, starForce: def.taijutsu.damage, starT: 0, anger: 0, armor: 0, metal: 0, sphere: false, jackpot: 0, jackpots: 0, healing: false, def, x, y, vx: 0, vy: 0, hp: def.hp, en: def.energy, stun: 0, cd: {}, used: new Set(), buff: null, beam: null, simple: 0, simpleHp: 0, wicker: false, dashAtk: 0, casting: null, inf: 0, think: 0, strafe: Math.random() < 0.5 ? 1 : -1, meleeCd: 0, flash: 0, aggr: (def.combat?.ai?.aggressionBase ?? combatDefaults.ai.aggressionBase) + Math.random() * (def.combat?.ai?.aggressionJitter ?? combatDefaults.ai.aggressionJitter), strafeCd: 0, modeT: 0, want: def.preferredDistance, wallHit: false, dodgeT: 0, dodgeX: 0, dodgeY: 0 };
  }
  say(s: string) { this.log.unshift(`${(this.time / 1000).toFixed(1)}s · ${s}`); this.log = this.log.slice(0, 14); }
  amberMult(f: Fighter) { return f.amber > 0 ? f.def.abilities.find((a) => a.type === "amber")?.mult : undefined; }
  dm(f: Fighter) { return (f.buff?.damage ?? 1) * (f.def.damageMult ?? 1) * (this.amberMult(f)?.damage ?? 1); }
  updateAmber(dt: number) {
    for (const f of this.f) if (f.amber > 0) {
      f.amber = Math.max(0, f.amber - dt);
      if (f.amber === 0 && f.def.abilities.find((a) => a.type === "amber")?.selfDestruct !== false) { f.hp = 0; f.healing = false; this.say(`${f.def.name}: Besta Mítica Âmbar destruiu o corpo`); }
    }
    if (this.f.some((f) => f.hp <= 0)) {
      const alive = this.f.filter((f) => f.hp > 0);
      if (alive.length === 0) this.winner = "Empate";
      else if (alive[0]?.amber === 0) this.winner = alive[0].def.name;
    }
  }
  maxEn(f: Fighter) { return f.jackpot > 0 ? JACKPOT_ENERGY : f.def.energy * (f.def.id === "nanami" && f.used.has("overtime") ? 1.8 : 1); }
  healRate(f: Fighter) {
    const rates = this.rules(f, "healing").rates;
    if (f.def.nature === "curse") return rates.curse;
    if (f.def.nature === "halfCurse") return rates.halfCurse;
    if (f.def.rct || f.jackpot > 0) return rates.rct;
    return null;
  }
  /** Cura automática: Técnica Reversa, regeneração de maldição ou corpo do Hakari no jackpot */
  healSaid = [-1e9, -1e9];
  /** Livre para curar: sem atordoamento, sem conjurar, oponente longe e nada vindo na sua direção */
  healFree(f: Fighter, op: Fighter) {
    const h = this.rules(f, "healing");
    if (f.stun > 0 || f.casting || f.beam || op.casting || op.beam) return false;
    if (Math.hypot(op.x - f.x, op.y - f.y) < h.safeDistance) return false;
    const idx = this.f.indexOf(f);
    if (this.projs.some((p) => p.owner !== idx && Math.hypot(p.x - f.x, p.y - f.y) < h.projectileDistance)) return false;
    if (this.orbs.some((o) => o.owner !== idx && Math.hypot(o.x - f.x, o.y - f.y) < h.orbDistance)) return false;
    if (this.spirits.some((s) => s.owner !== idx && Math.hypot(s.x - f.x, s.y - f.y) < h.spiritDistance)) return false;
    return !this.gravs.some((g) => g.owner !== idx && Math.hypot(g.x - f.x, g.y - f.y) < g.r + SIZE);
  }
  wantsHeal(f: Fighter) {
    if (!this.healRate(f) || f.hp <= 0) return false;
    if (f.jackpot > 0) return f.hp < f.def.hp;
    // histerese: começa abaixo de 60%, continua até 85% enquanto estiver livre
    const h = this.rules(f, "healing");
    return f.hp / f.def.hp < (f.healing ? h.stopHpRatio : h.startHpRatio) && f.en > f.def.energy * (f.healing ? h.stopEnergyRatio : h.startEnergyRatio);
  }
  heal(f: Fighter, dt: number) {
    const rate = this.healRate(f), mult = f.def.costMult ?? 1;
    if (!rate || !this.wantsHeal(f)) { f.healing = false; return 0; }
    let gain = Math.min(this.rules(f, "healing").hpPerSecond * dt / 1000, f.def.hp - f.hp);
    const perHp = rate.en / rate.hp * mult;
    gain = Math.min(gain, f.en / perHp);
    if (gain <= 0) { f.healing = false; return 0; }
    f.hp += gain; f.en -= gain * perHp;
    if (!f.healing) {
      f.healing = true;
      const i = this.f.indexOf(f);
      if (this.time - (this.healSaid[i] ?? -1e9) > this.rules(f, "healing").messageCooldownMs) { this.healSaid[i] = this.time; this.say(`${f.def.name.split(" ")[0]}: ${f.def.nature === "curse" || f.def.nature === "halfCurse" ? "regeneração amaldiçoada" : f.jackpot > 0 && !f.def.rct ? "corpo usa Técnica Reversa sozinho" : "Técnica Reversa de Cura"}`); }
    }
    return gain;
  }
  pachinkoMode(me: Fighter) {
    let m = Math.random() * PACHINKO.modes.reduce((s, x) => s + x.probability, 0);
    const pick = PACHINKO.modes.find((x) => (m -= x.probability) < 0) ?? PACHINKO.modes[PACHINKO.modes.length - 1]!;
    return { mode: pick.name, chance: Math.min(1, pick.chance * (1 + me.jackpots * PACHINKO.chanceBonusPerRound)) };
  }
  spinPachinko(me: Fighter, chance?: number, mode?: string) {
    const roll = chance === undefined ? this.pachinkoMode(me) : { chance, mode: mode ?? "Normal" };
    if (Math.random() >= roll.chance) { this.say(`Pachinko: ${roll.mode} · sem jackpot`); return false; }
    me.jackpots++; me.jackpot = JACKPOT_MS; me.en = JACKPOT_ENERGY;
    this.fx.push({ kind: "jackpot", x: me.x, y: me.y, r: 90, color: "", life: 1800, max: 1800 });
    this.say(`🎰 JACKPOT! (${roll.mode}) Hakari · ${JACKPOT_ENERGY} EA · rodada ${me.jackpots}`);
    return true;
  }
  domainR(ab?: Ability) { return ab?.radius ?? DOMAIN_R; }
  beginDomain(me: Fighter, op: Fighter, idx: number, ab: Ability) {
    if (this.domains.length || Math.hypot(op.x - me.x, op.y - me.y) > this.domainR(ab) - SIZE) return false;
    this.use(me, ab, ab.cost ?? 0);
    me.casting = { ab, t: ab.castMs ?? 0 };
    this.captureDomain(me, op, idx, ab, false);
    if (ab.trial) {
      // Sentença Mortal: o tribunal se forma na hora — violência proibida até o veredito
      op.stun = Math.max(op.stun, (ab.castMs ?? 0) + 1500); op.beam = null; op.casting = null;
      this.say(`Judgeman: aberta a sessão · ${op.def.name.split(" ")[0]} é o réu · violência proibida no tribunal`);
    }
    return true;
  }
  captureDomain(me: Fighter, op: Fighter, idx: number, ab: Ability, active = true) {
    let domain = this.domains.find((d) => d.owner === idx && d.ab.id === ab.id);
    if (domain) { domain.active = active; return domain; }
    if (this.domains.length || Math.hypot(op.x - me.x, op.y - me.y) > this.domainR(ab) - SIZE) return null;
    const duration = ab.type === "pachinko" ? PACHINKO_MS : ab.durationMs ?? ab.overloadMs ?? 3000;
    const roll = this.pachinkoMode(me);
    domain = { owner: idx, x: me.x, y: me.y, r: this.domainR(ab), remaining: duration, duration, active, ab, round: 0, mode: roll.mode, chance: roll.chance, won: false, symbols: [1, 2, 3], revealed: false, indicator: 0 };
    this.domains.push(domain);
    this.say(ab.shrine ? `${me.def.name}: Santuário Malevolente · barreira aberta` : `${me.def.name}: barreira fechada · oponente preso`);
    return domain;
  }
  updateDomains(dt: number) {
    for (const d of this.domains) {
      const me = this.f[d.owner];
      if (!me) continue;
      if (!d.active) { if (!me.casting) d.remaining = 0; continue; }
      const before = (d.duration - d.remaining) / TIME_SCALE;
      d.remaining -= dt;
      if (d.ab.trial && d.trialT !== undefined && d.trialT > 0) {
        d.trialT -= dt;
        if (d.trialT <= 0) this.resolveTrial(d, me);
        continue;
      }
      if (d.ab.shrine) this.shrineTick(d, me, dt);
      const elapsed = (d.duration - d.remaining) / TIME_SCALE;
      if (d.ab.type === "pachinko" && !d.won) {
        for (let round = 0; round < 3; round++) {
          const reveal = 4000 + round * 3000;
          if (before + 0.000001 < reveal && elapsed + 0.000001 >= reveal) {
            d.won = this.spinPachinko(me, d.chance, d.mode); d.revealed = true;
            const symbol = 1 + Math.floor(Math.random() * 7);
            d.symbols = d.won ? [symbol, symbol, symbol] : [symbol, symbol, symbol % 7 + 1];
          }
          const restart = 5000 + round * 3000;
          if (!d.won && round < 2 && before + 0.000001 < restart && elapsed + 0.000001 >= restart) {
            d.round = round + 1; d.revealed = false;
            const roll = this.pachinkoMode(me); d.mode = roll.mode; d.chance = Math.min(1, roll.chance * (1 + d.round * PACHINKO.chanceBonusPerRound));
            this.say(`Pachinko: tentativa ${d.round + 1} · ${d.mode}`);
          }
          if (d.won) break;
        }
      }
      if (d.remaining < 0.000001) { d.remaining = 0; this.say(`${me.def.name}: barreira encerrada`); }
    }
    this.domains = this.domains.filter((d) => d.remaining > 0);
  }
  domainImmune(f: Fighter, ab?: Ability) { return !ab?.affectsHeavenly && !!f.def.passives?.some((p) => p.id === "heavenlyRestriction"); }
  /** Veredito do Judgeman: Higuruma não escolhe a punição — o julgamento decide */
  resolveTrial(d: Domain, me: Fighter) {
    const op = this.f[1 - d.owner]; if (!op || op.hp <= 0) { d.remaining = 0; return; }
    const nome = op.def.name.split(" ")[0];
    // Defesa: o réu confessa, nega ou fica em silêncio
    this.say(`${nome} ${["confessa o ato", "nega a acusação", "permanece em silêncio"][Math.floor(Math.random() * 3)]}`);
    if (Math.random() < 0.25) {
      d.verdict = "INOCENTE"; d.remaining = Math.min(d.remaining, 600);
      this.say("Judgeman: INOCENTE · a barreira se desfaz"); return;
    }
    // Novo julgamento: após a condenação, o réu pode pedir outra sessão com nova acusação (uma vez)
    if (!d.retried && Math.random() < 0.3) {
      d.retried = true; delete d.verdict; d.trialT = 2200;
      d.accusation = ACCUSATIONS[Math.floor(Math.random() * ACCUSATIONS.length)]!;
      this.say(`Judgeman: CULPADO · o réu pede um NOVO JULGAMENTO · nova acusação: ${d.accusation}`);
      return;
    }
    d.remaining = Math.min(d.remaining, 600); // a barreira se desfaz logo após o veredito
    if (Math.random() < 0.4) {
      d.verdict = "PENA DE MORTE"; me.executioner = 10000;
      this.say(`Judgeman: CULPADO · PENA DE MORTE · o martelo de ${me.def.name.split(" ")[0]} vira a Espada do Carrasco`);
      return;
    }
    d.verdict = "CONFISCO";
    if (op.def.weapon && op.weaponHp > 0) {
      op.weaponHp = 0;
      this.say(`Judgeman: CULPADO · CONFISCO · ${op.def.weapon.name} foi confiscada`);
    } else if (op.def.energy > 0) {
      op.en = 0; op.sealed = 12000; op.beam = null; op.casting = null;
      this.say(`Judgeman: CULPADO · CONFISCO · a energia amaldiçoada de ${op.def.name.split(" ")[0]} foi selada`);
    } else {
      op.sealed = 12000;
      this.say(`Judgeman: CULPADO · CONFISCO · ${op.def.name.split(" ")[0]} perdeu seus recursos`);
    }
  }
  /** Domínio Simples / Cesta Vime Oca absorvem acerto garantido; devolve o que sobra */
  absorbSure(op: Fighter, sure: number, quiet = false) {
    if (op.simple <= 0 || op.simpleHp <= 0) return sure;
    const absorbed = Math.min(op.simpleHp, sure); op.simpleHp -= absorbed;
    const nm = op.wicker ? "Cesta Vime Oca" : "Domínio Simples", who = op.def.name.split(" ")[0];
    if (!quiet) this.say(`${nm} de ${who} absorveu ${Math.round(absorbed)} do acerto garantido`);
    if (op.simpleHp <= 0) { op.simple = 0; this.say(`${nm} de ${who} foi quebrado`); }
    return sure - absorbed;
  }
  /** Santuário Malevolente: cortes contínuos (Desmantelar + Clivar) em toda a área */
  shrineTick(d: Domain, me: Fighter, dt: number) {
    if (!d.active) return;
    const op = this.f[1 - d.owner]; if (!op || op.hp <= 0) return;
    d.tick = (d.tick ?? 0) - dt;
    if (d.tick > 0) return;
    d.tick += (d.ab.tickMs ?? 150) * TIME_SCALE;
    if (Math.hypot(op.x - d.x, op.y - d.y) > d.r) return;
    // Clivar adapta à resistência: alvos com mais vida/energia recebem mais
    const dmg = this.absorbSure(op, (d.ab.damage ?? 40) * (1 + op.def.hp / 4000 + op.def.energy / 6000) * this.dm(me), true);
    this.fx.push({ kind: "slash", x: op.x + (Math.random() - 0.5) * 30, y: op.y + (Math.random() - 0.5) * 30, r: 16 + Math.random() * 14, color: "", life: 180, max: 180, ang: Math.random() * Math.PI });
    if (dmg > 0) this.damage(op, dmg, "Santuário Malevolente", false, true, true);
  }
  confine(f: Fighter) {
    for (const d of this.domains) {
      if (d.ab.shrine || this.domainImmune(f, d.ab)) continue;
      const dx = f.x - d.x, dy = f.y - d.y, distance = Math.hypot(dx, dy), limit = d.r - SIZE / Math.sqrt(2);
      if (distance <= limit) continue;
      const nx = dx / distance, ny = dy / distance;
      f.x = d.x + nx * limit; f.y = d.y + ny * limit;
      const outward = f.vx * nx + f.vy * ny;
      if (outward > 0) { f.vx -= outward * nx; f.vy -= outward * ny; }
    }
  }
  // bloqueio com energia amaldiçoada: custa 75% do dano do golpe
  tryBlock(t: Fighter, d: number, src: string): number {
    if (t.stun > 0 || t.casting || t.beam) return d;
    const defense = this.rules(t, "defense");
    const cost = d * defense.energyCostRatio * (t.def.costMult ?? 1); if (t.en < cost) return d;
    const hpR = t.hp / t.def.hp, enR = (t.en - cost) / t.def.energy;
    const lethal = d >= t.hp;
    // decide com estratégia: sempre bloqueia golpe letal; poupa energia em golpes fracos
    const worth = lethal || d >= defense.strongHitDamage || (hpR < defense.lowHpRatio && enR > defense.reserveEnergyRatio) || (enR > defense.highEnergyRatio && d >= defense.weakHitDamage);
    if (!worth || Math.random() > Math.min(defense.maxBlockChance, t.def.reflex * (t.buff?.reflex ?? 1) * defense.blockReflexMult)) return d;
    t.en -= cost;
    this.fx.push({ kind: "ring", x: t.x, y: t.y, r: 24, color: "#38bdf8", life: 260, max: 260 });
    this.say(`${t.def.name.split(" ")[0]} reduziu ${src} com energia (-${Math.round(cost)} EA)`);
    return d * (defense.blockDamageMult ?? 0.4); // bloqueio de EA só reduz o dano
  }
  /** Aplica dano e devolve quanto de vida realmente foi perdido (0 se bloqueado/absorvido). */
  /** Sentença Mortal: enquanto o julgamento corre, a violência é proibida no tribunal */
  trialActive() { return this.domains.some((d) => d.ab.trial && d.trialT !== undefined && d.trialT > 0); }
  damage(t: Fighter, d: number, src: string, blockable = true, pierceInf = false, silent = false): number {
    if (this.winner || this.blackHole || t.hp <= 0 || this.trialActive()) return 0;
    { const atk = this.f[0] === t ? this.f[1] : this.f[0]; if (atk && atk.hp > 0 && t.hp > 0 && d < t.hp) d *= this.power(atk); } // golpes enfraquecem com pouca EA (golpes fatais seguem fatais)
    if (blockable && this.garudaGuard(t, d, src)) return 0;
    if (blockable && megumiShadowGuard(this, t, src)) return 0;
    if (t.inf > 0 && !pierceInf && !src.startsWith("Veneno")) { this.fx.push({ kind: "ring", x: t.x, y: t.y, r: 22, color: "#bfdbfe", life: 300, max: 300 }); this.say(`Ilimitado parou ${src}`); return 0; }
    if (blockable && yorozuPlateBlock(this, t, src)) return 0;
    if (blockable && t.metal > 0) { t.metal = 0; this.fx.push({ kind: "ring", x: t.x, y: t.y, r: 26, color: "#cbd5e1", life: 350, max: 350 }); this.say(`Metal Líquido de ${t.def.name.split(" ")[0]} defendeu ${src}`); return 0; }
    if (blockable) d = this.tryBlock(t, d, src);
    d = Math.max(0, d);
    if (d > 0 && !src.startsWith("Veneno") && src !== "Fuga do Coelho") this.interrupt(t);
    if (t.armor > 0) {
      const absorbed = Math.min(t.armor, d); t.armor -= absorbed; d -= absorbed;
      if (!silent) this.say(`Armadura de ${t.def.name.split(" ")[0]} absorveu ${Math.round(absorbed)} · ${Math.ceil(t.armor)} vida`);
      if (t.armor <= 0) { t.armor = 0; t.buff = null; this.say(`Armadura de ${t.def.name.split(" ")[0]} foi destruída`); }
      if (d <= 0) return 0;
    }
    if (t.casting) { t.casting = null; this.blues = this.blues.filter((b) => this.f[b.owner] !== t || t.def.id !== "gojo"); this.say(`${t.def.name.split(" ")[0]} foi interrompido`); }
    d = silent ? d : Math.round(d); const lostHp = Math.min(t.hp, Math.max(0, d)); t.hp = Math.max(0, t.hp - d); t.flash = 120;
    if (t.def.abilities.some((a) => a.type === "blackHole")) t.anger = Math.min(1, t.anger + lostHp / (t.def.hp * combatDefaults.blackHoleTrigger.angerHpFraction));
    this.fx.push({ kind: "hit", x: t.x, y: t.y, r: 6, color: "#fff", life: 200, max: 200 });
    if (!silent) this.say(`${src} → ${t.def.name.split(" ")[0]} -${d}`);
    if (lostHp > 0 && !silent && src !== "Impacto na parede") this.jackpotIndicator(t);
    this.checkDeath(t);
    return lostHp;
  }
  /** Levar dano cancela a técnica em preparo, canalização e projéteis ainda não lançados (armadura não impede) */
  interrupt(t: Fighter) {
    const i = this.f.indexOf(t);
    const held = this.projs.some((p) => p.owner === i && (p.hold === undefined ? t.windup > 0 : p.hold > 0));
    if (!t.casting && !t.beam && t.windup <= 0 && !held) return;
    this.projs = this.projs.filter((p) => !(p.owner === i && (p.hold === undefined ? t.windup > 0 : p.hold > 0)));
    if (t.casting && t.def.id === "gojo") this.blues = this.blues.filter((b) => this.f[b.owner] !== t);
    t.casting = null; t.beam = null; t.windup = 0;
    this.say(`${t.def.name.split(" ")[0]} foi interrompido`);
  }
  checkDeath(t: Fighter) {
    if (t.hp > 0 || this.winner) return;
    const w = this.f.find((x) => x !== t); if (!w) return;
    if (w.amber <= 0) { this.winner = w.def.name; this.say(`🏆 ${w.def.name} venceu`); } else this.say("Oponente derrotado · Besta Mítica Âmbar continua consumindo o corpo");
  }
  /** Abre uma janela de adiamento: tudo que a técnica fizer ao oponente acontece após `delay`. */
  openWin(owner: number, delay: number) {
    this.closeWin();
    const me = this.f[owner], op = this.f[1 - owner];
    if (!me || !op || !(delay > 0)) return;
    this.win = { owner, delay, winner: this.winner, fx: this.fx.length, orbs: this.orbs.length, blues: this.blues.length, gravs: this.gravs.length, doors: this.doors.length, spirits: this.spirits.length, ents: this.yzEnts.length,
      op: snap(op, [...OP_DELTA, ...OP_MAX, ...OP_SET]), opYz: op.yz ? { ...op.yz } : null, self: snap(me, SELF_SET), selfYz: me.yz ? { ...me.yz } : null, garuda: op.garuda?.hp ?? 0 };
  }
  /** Fecha a janela: desfaz os efeitos imediatos e agenda para quando o ataque realmente acontecer. */
  closeWin() {
    const w = this.win; if (!w) return; this.win = null;
    const me = this.f[w.owner], op = this.f[1 - w.owner]; if (!me || !op) return;
    const o = op as unknown as Record<string, unknown>, m = me as unknown as Record<string, unknown>;
    const fx = this.fx.splice(w.fx), later = fx.filter((e) => e.kind !== "txt"); this.fx.push(...fx.filter((e) => e.kind === "txt"));
    const orbs = this.orbs.splice(w.orbs), blues = this.blues.splice(w.blues), gravs = this.gravs.splice(w.gravs), doors = this.doors.splice(w.doors), spirits = this.spirits.splice(w.spirits), ents = this.yzEnts.splice(w.ents);
    const delta: [string, number][] = [], max: [string, number][] = [], set: [Record<string, unknown>, string, unknown][] = [];
    for (const k of OP_DELTA) { const d = (o[k] as number) - (w.op[k] as number); if (d) { delta.push([k, d]); o[k] = w.op[k]; } }
    for (const k of OP_MAX) if (o[k] !== w.op[k]) { if ((o[k] as number) > (w.op[k] as number)) max.push([k, o[k] as number]); o[k] = w.op[k]; }
    for (const k of OP_SET) if (o[k] !== w.op[k]) { set.push([o, k, o[k]]); o[k] = w.op[k]; }
    for (const k of SELF_SET) if (m[k] !== w.self[k]) { set.push([m, k, m[k]]); m[k] = w.self[k]; }
    for (const [yz, before] of [[op.yz, w.opYz], [me.yz, w.selfYz]] as const) if (yz && before) {
      const y = yz as unknown as Record<string, unknown>, b = before as unknown as Record<string, unknown>;
      for (const k of Object.keys(b)) if (y[k] !== b[k]) { set.push([y, k, y[k]]); y[k] = b[k]; }
    }
    const garudaLoss = op.garuda ? w.garuda - op.garuda.hp : 0; if (op.garuda && garudaLoss) op.garuda.hp = w.garuda;
    this.winner = w.winner;
    if (!later.length && !orbs.length && !blues.length && !gravs.length && !doors.length && !spirits.length && !ents.length && !delta.length && !max.length && !set.length && !garudaLoss) return;
    const x0 = op.x, y0 = op.y;
    this.pending.push({ t: w.delay, run: () => {
      const sx = op.x - x0, sy = op.y - y0;
      for (const e of later) { if (Math.hypot(e.x - x0, e.y - y0) < 70) { e.x += sx; e.y += sy; } e.life = e.max; this.fx.push(e); }
      this.orbs.push(...orbs); this.blues.push(...blues); this.gravs.push(...gravs); this.doors.push(...doors); this.spirits.push(...spirits); this.yzEnts.push(...ents);
      for (const [k, d] of delta) o[k] = k === "hp" || k === "armor" || k === "en" || k === "simpleHp" ? Math.max(0, (o[k] as number) + d) : (o[k] as number) + d;
      for (const [k, v] of max) o[k] = Math.max(o[k] as number, v);
      for (const [obj, k, v] of set) obj[k] = v;
      if (op.garuda && garudaLoss) op.garuda.hp = Math.max(0, op.garuda.hp - garudaLoss);
      if (delta.some(([k, d]) => k === "hp" && d < 0)) { op.flash = 120; this.checkDeath(op); }
    } });
  }
  /** Executa `fn` com o tempo de impacto da técnica aplicado ao que ela fizer ao alvo. */
  withImpact(owner: number, ab: Ability | undefined, fn: () => void) {
    const delay = ab?.timing?.impactMs ?? 0;
    if (delay > 0) this.openWin(owner, delay);
    try { fn(); } finally { if (delay > 0) this.closeWin(); }
  }
  updatePending(dt: number) {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => (p.t -= dt) <= 0);
    this.pending = this.pending.filter((p) => p.t > 0);
    for (const p of due) { if (this.winner) break; p.run(); }
  }
  /** Sangue do Choso: venenoso só para humanos, só quando realmente penetra (tirou vida). Reaplicar renova os 8s. */
  applyPoison(t: Fighter, ab: Ability | undefined, lost: number) {
    const p = ab?.poison;
    if (!p || lost <= 0 || t.hp <= 0 || (t.def.nature ?? "human") !== "human") return;
    const fresh = !t.poison, every = p.tickMs * TIME_SCALE;
    t.poison = { left: Math.round(p.durationMs / p.tickMs), tick: every, every, damage: p.damage };
    if (fresh) this.say(`☠ Sangue venenoso penetrou em ${t.def.name.split(" ")[0]}`);
  }
  updatePoison(dt: number) {
    for (const f of this.f) {
      const p = f.poison; if (!p) continue;
      if (f.hp <= 0) { f.poison = null; continue; }
      p.tick -= dt;
      while (f.poison && p.tick <= 0 && p.left > 0) {
        p.tick += p.every; p.left--;
        this.damage(f, p.damage, "Veneno do Sangue", false, false, true);
        if (p.left <= 0) { f.poison = null; this.say(`${f.def.name.split(" ")[0]}: veneno do sangue acabou`); }
        if (this.winner) return;
      }
    }
  }
  /** Indicador de Jackpot: acertos do Hakari dentro do domínio enchem o indicador e sobem o cenário do pachinko */
  jackpotIndicator(t: Fighter) {
    const idx = this.f.indexOf(t);
    const d = this.domains.find((x) => x.ab.type === "pachinko" && x.owner === 1 - idx && x.active && !x.won && !x.revealed);
    const owner = d ? this.f[d.owner] : undefined;
    if (!d || !owner?.def.passives?.some((p) => p.id === "jackpotIndicator")) return;
    d.indicator = Math.min(1, d.indicator + PACHINKO.indicatorPerHit);
    d.chance = Math.min(1, d.chance + PACHINKO.indicatorChanceBonus);
    if (d.indicator < 1) return;
    d.indicator = 0;
    const i = PACHINKO.modes.findIndex((m) => m.name === d.mode), next = i > 0 ? PACHINKO.modes[i - 1] : undefined;
    if (next) {
      d.mode = next.name;
      d.chance = Math.max(d.chance, Math.min(1, next.chance * (1 + d.round * PACHINKO.chanceBonusPerRound)));
      this.fx.push({ kind: "jackpot", x: owner.x, y: owner.y, r: 60, color: "", life: 900, max: 900 });
      this.say(`🎰 Indicador de Jackpot cheio · cenário sobe para ${next.name}`);
    }
  }
  // todo soco tem chance de Kokusen (Black Flash): dano ×2.5, impossível de bloquear
  punch(me: Fighter, op: Fighter, d: number, src: string, impact: { stunMs?: number; knockback?: number } = {}, spear = false) {
    if (me.hp <= 0 || op.hp <= 0 || this.winner || megumiHidden(op)) return;
    const before = op.hp;
    if (me.def.passives?.some((p) => p.id === "ratio") && Math.random() < 0.3) { // 7:3: ponto fraco
      d *= 1.7;
      this.fx.push({ kind: "ratio", x: op.x, y: op.y, r: 26, color: "", life: 600, max: 600, ang: Math.atan2(op.y - me.y, op.x - me.x) + 0.5, seed: Math.random() });
    }
    if (Math.random() < (me.def.blackFlashChance ?? this.rules(me, "blackFlash").defaultChance)) {
      this.fx.push({ kind: "boom", x: op.x, y: op.y, r: 40, color: "rgba(0,0,0,0.85)", life: 500, max: 500 });
      this.fx.push({ kind: "bf", x: op.x, y: op.y, r: 70, color: "#ff1130", life: 550, max: 550 });
      this.say(`⚡ BLACK FLASH de ${me.def.name.split(" ")[0]}!`);
      this.damage(op, d * (me.def.blackFlashMult ?? this.rules(me, "blackFlash").damageMult), `Black Flash (${src})`, false);
      me.en = Math.min(this.maxEn(me), me.en + me.def.energy * this.rules(me, "blackFlash").energyRestoreRatio); // estado de zona
    } else {
      // reação corpo a corpo: esquiva ou bloqueio de guarda, por reflexo e com cooldown
      const canReact = op.stun <= 0 && !op.casting && !op.beam && (op.cd['react'] ?? 0) <= 0 && op.dodgeT <= 0;
      if (canReact) {
        const defense = this.rules(op, "defense");
        const reflexR = Math.min(defense.maxMeleeReflex, op.def.reflex * (op.buff?.reflex ?? 1) * (this.amberMult(op)?.reflex ?? 1));
        if (op.weaponHp > 0 && Math.random() < (op.def.weapon?.blockChance ?? 0.5) * reflexR) {
          op.cd['react'] = defense.guardCooldownMs;
          this.weaponBlock(op, d, src); return;
        }
        const roll = Math.random();
        if (roll < defense.dodgeChance * reflexR) {
          // esquiva: passo lateral rápido, o golpe erra por completo
          const side = Math.random() < 0.5 ? 1 : -1;
          const pa = Math.atan2(op.y - me.y, op.x - me.x) + (Math.PI / 2) * side;
          op.dodgeX = Math.cos(pa) * defense.dodgeSpeed; op.dodgeY = Math.sin(pa) * defense.dodgeSpeed; op.dodgeT = defense.dodgeDurationMs;
          op.cd['react'] = defense.dodgeCooldownMs;
          this.fx.push({ kind: "txt", x: op.x, y: op.y - SIZE, r: 0, color: "#93c5fd", life: 700, max: 700, text: "esquivou" });
          this.say(`${op.def.name.split(" ")[0]} esquivou de ${src}`);
          return;
        }
        if (roll < defense.dodgeChance * reflexR + defense.guardChance * reflexR) {
          // bloqueio de guarda: reduz 70% do dano sem gastar energia, mas é empurrado
          op.cd['react'] = defense.guardCooldownMs;
          const reduced = Math.max(1, Math.round(d * defense.guardDamageMult));
          this.fx.push({ kind: "ring", x: op.x, y: op.y, r: 20, color: "#fbbf24", life: 240, max: 240 });
          this.say(`${op.def.name.split(" ")[0]} bloqueou ${src} de guarda`);
          this.damage(op, reduced, src, false);
          const ga = Math.atan2(op.y - me.y, op.x - me.x);
          op.vx += Math.cos(ga) * defense.guardKnockback; op.vy += Math.sin(ga) * defense.guardKnockback;
          return;
        }
      }
      if (spear) this.cancelTechnique(op);
      this.damage(op, d, src, true, spear);
    }
    if (op.hp < before && op.hp > 0) {
      this.applyPhysicalImpact(me, op, op.hp < before ? Math.max(d, before - op.hp) : d, impact);
    }
    const electric = me.def.abilities.find((a) => a.type === "electricEnergy");
    if (electric && op.hp < before) {
      me.charges = Math.min(electric.maxCharges ?? 6, me.charges + 1);
      if (op.hp > 0) { this.damage(op, electric.damage ?? 20, "Choque elétrico", false); op.stun = Math.max(op.stun, electric.stunMs ?? 140); }
      this.fx.push({ kind: "electric", x: op.x, y: op.y, r: 30, color: "", life: 400, max: 400 });
      this.say(`Kashimo: carga elétrica ${me.charges}`);
    }
  }
  applyPhysicalImpact(me: Fighter, op: Fighter, force: number, base: { stunMs?: number; knockback?: number } = {}) {
    if (op.hp <= 0) return;
    const impact = physicalImpact(force, Math.max(me.def.taijutsu.stunMs ?? 0, base.stunMs ?? 0), base.knockback ?? this.rules(me, "movement").meleeKnockback);
    const angle = Math.atan2(op.y - me.y, op.x - me.x);
    op.stun = Math.max(op.stun, impact.stun); op.vx += Math.cos(angle) * impact.knockback; op.vy += Math.sin(angle) * impact.knockback;
    op.beam = null; op.exchangeLoss += force;
    me.exchangeLoss = Math.max(0, me.exchangeLoss - force * 0.5);
    if (op.exchangeLoss >= 90) op.retreatT = Math.max(op.retreatT, 1600);
  }
  cancelTechnique(op: Fighter) {
    const active = op.inf > 0 || op.simple > 0 || !!op.casting || !!op.beam || op.metal > 0 || !!op.buff;
    op.inf = 0; op.simple = 0; op.simpleHp = 0; op.casting = null; op.beam = null; op.metal = 0; op.buff = null;
    if (active) this.say("Lança Invertida do Céu: técnica anulada no contato");
  }
  tojiAbility(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const dist = Math.hypot(op.x - me.x, op.y - me.y);
    if (!this.ready(me, a)) return false;
    this.use(me, a, 0);
    const speed = a.speed ?? 16, angle = this.leadAngle(me, op, speed);
    this.projs.push({ x: me.x, y: me.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: a.damage ?? 85, owner: idx, kind: "tojiChain", life: a.projectileLifeMs ?? 1200, ab: a, name: a.name });
    return true;
  }
  empowerGaruda(me: Fighter) {
    const a = me.def.abilities.find((a) => a.type === "garudaMass"), g = me.garuda;
    if (!a || !g || g.hp <= 0 || !this.ready(me, a)) return false;
    this.use(me, a, a.cost ?? 65); g.massT = a.durationMs ?? 6500; g.massBonus = a.damage ?? 90;
    return true;
  }
  garudaHit(me: Fighter, op: Fighter, base: number, src: string) {
    const force = (base + ((me.garuda?.massT ?? 0) > 0 ? me.garuda?.massBonus ?? 0 : 0)) * this.dm(me);
    if (this.damage(op, force, src) > 0) this.applyPhysicalImpact(me, op, force);
  }
  /** Defesa com a arma (só socos): absorve até a durabilidade restante; ao quebrar, o excesso passa para o corpo */
  weaponBlock(op: Fighter, d: number, src: string) {
    const w = op.def.weapon; if (!w || op.weaponHp <= 0) return false;
    const absorbed = Math.min(op.weaponHp, d); op.weaponHp -= absorbed;
    const name = op.def.name.split(" ")[0];
    this.fx.push({ kind: "ring", x: op.x, y: op.y, r: 22, color: "#fbbf24", life: 260, max: 260 });
    this.say(`${name} defendeu ${src} com ${w.name} · ${Math.ceil(op.weaponHp)}/${w.durability}`);
    if (op.weaponHp <= 0) {
      op.weaponHp = 0; this.fx.push({ kind: "txt", x: op.x, y: op.y - SIZE, r: 0, color: "#fbbf24", life: 900, max: 900, text: `${w.name} quebrou` });
      this.say(`${w.name} de ${name} quebrou`);
      if (d > absorbed) this.damage(op, d - absorbed, src, false);
    }
    return true;
  }
  ready(f: Fighter, a: Ability, cost = a.cost ?? 0) {
    if (f.sealed > 0 && a.type !== "gavelGrow" && a.type !== "gavelExtend" && a.type !== "gavelThrow") return false; // Confisco: sem técnica amaldiçoada
    const need = cost * (f.def.costMult ?? 1) * ENERGY.costMult;
    if (!((f.cd[a.id] ?? 0) <= 0 && f.en >= need && !(a.once && f.used.has(a.id)))) return false;
    if (this.isPlayer(f)) return true;
    if (this.riskyWindup(f, a)) return false;
    return this.aiEnergyOk(f, a, need);
  }
  /** IA: não começa um ataque com preparação longa colada no oponente, onde seria interrompida */
  riskyWindup(f: Fighter, a: Ability) {
    const wind = (a.delayMs ?? 0) + (isCastAbility(a) ? a.castMs ?? 0 : 0);
    if (wind < 200 || f.inf > 0 || a.type === "simpleDomain" || a.type === "hollowWicker" || a.type === "infinity") return false;
    const op = this.f[0] === f ? this.f[1] : this.f[0];
    if (!op || op.hp <= 0 || op.stun > wind || op.casting || op.beam) return false;
    if (Math.hypot(op.x - f.x, op.y - f.y) >= this.meleeReach(op) + 70) return false;
    if (wind >= 500) f.retreatT = Math.max(f.retreatT, 500); // afasta antes de tentar de novo
    return true;
  }
  isPlayer(f: Fighter) { return this.player !== null && this.f[this.player] === f; }
  /** IA economiza EA: não repete a mesma técnica à toa e guarda reserva (mais rígido quanto maior a inteligência) */
  aiEnergyOk(f: Fighter, a: Ability, need: number) {
    if ((f.cd["ai:" + a.id] ?? 0) > 0) return false;
    if (a.type === "domain" || a.type === "simpleDomain" || a.type === "hollowWicker" || need <= 0) return true;
    const op = this.f[0] === f ? this.f[1] : this.f[0];
    if (op && op.hp / op.def.hp <= ENERGY.aiFinisherHpRatio) return true; // pode gastar tudo para finalizar
    const intel = f.def.intelligence ?? 0.7;
    return f.en - need >= f.def.energy * ENERGY.aiReserveRatio * intel;
  }
  /** Força das técnicas cai conforme a EA diminui */
  power(f: Fighter) { return f.def.energy > 0 ? ENERGY.minPower + (1 - ENERGY.minPower) * Math.max(0, Math.min(1, f.en / f.def.energy)) : 1; }
  use(f: Fighter, a: Ability, cost: number) { this.fx.push({ kind: "txt", x: f.x, y: f.y - SIZE, r: 0, color: "#e5e7eb", life: 1100, max: 1100, text: a.name }); f.en -= cost * (f.def.costMult ?? 1) * ENERGY.costMult; f.cd[a.id] = a.cooldown ?? 0; f.windup = Math.max(f.windup, a.delayMs ?? 0); f.recovery = Math.max(f.recovery, a.timing?.recoveryMs ?? 0); this.openWin(this.f.indexOf(f), f.windup + (isCastAbility(a) ? 0 : a.timing?.impactMs ?? 0)); if (!this.isPlayer(f)) f.cd["ai:" + a.id] = ENERGY.aiRepeatBaseMs + ENERGY.aiRepeatIntelMs * (f.def.intelligence ?? 0.7); /* cada técnica respeita seu cooldown; passivas e únicas não têm */ f.used.add(a.id); }

  resetInput() { this.input = { x: 0, y: 0, attack: false, heal: false }; }
  abilityOptions(a: Ability): AbilityOption[] {
    if (a.type === "doors") return ["impacto", "bloqueio", "empurrao", "combinacao"].map((mode, i) => ({ id: mode, name: ["Impacto", "Bloqueio", "Empurrão", "Combinação"][i] ?? mode, choice: { mode } }));
    if (a.type === "curseSpirits") return [{ id: "auto", name: "Automático", choice: {} }, ...(a.grades ?? []).map((g, grade) => ({ id: String(grade), name: g.name, choice: { grade } }))];
    if (a.costPerUnit && a.maxUnits) return Array.from({ length: a.maxUnits }, (_, i) => ({ id: String(i + 1), name: `${i + 1} un.`, choice: { units: i + 1 } }));
    return [];
  }
  updateOffensiveDash(me: Fighter, op: Fighter) {
    const dash = this.rules(me, "offensiveDash"), dist = Math.hypot(op.x - me.x, op.y - me.y);
    if (me.dashAtk <= 0 || dist >= SIZE + dash.hitPadding) return;
    me.dashAtk = 0; const before = op.hp, ang = Math.atan2(op.y - me.y, op.x - me.x);
    this.punch(me, op, me.def.taijutsu.damage * dash.damageMult * this.dm(me), "Dash Ofensivo", { knockback: dash.knockback, stunMs: dash.stunMs });
    this.fx.push({ kind: "ring", x: op.x, y: op.y, r: 22, color: "#fde68a", life: 260, max: 260 });
  }
  playerDash() {
    if (this.player === null || this.playerBlocked()) return false;
    const me = this.f[this.player], op = this.f[this.player === 0 ? 1 : 0];
    if ((me.cd['dash'] ?? 0) > 0) return false;
    const movement = this.rules(me, "movement");
    const angle = this.input.x || this.input.y ? Math.atan2(this.input.y, this.input.x) : Math.atan2(me.y - op.y, me.x - op.x);
    const speed = me.def.speed * (me.buff?.speed ?? 1) * (this.amberMult(me)?.speed ?? 1) * flightMult(me) * movement.dashSpeedMult;
    me.dodgeX = Math.cos(angle) * speed; me.dodgeY = Math.sin(angle) * speed;
    me.dodgeT = this.rules(me, "defense").dodgeDurationMs; me.cd['dash'] = movement.dashCooldown;
    return true;
  }
  playerBlocked() {
    if (this.player === null) return true;
    const me = this.f[this.player];
    return !!this.winner || !!this.blackHole || me.hp <= 0 || this.f[1 - this.player]?.hp === 0 || me.stun > 0 || me.windup > 0 || me.recovery > 0 || !!me.casting || !!me.beam;
  }
  abilityUnavailable(a: Ability, choice: AbilityChoice = {}): string | null {
    if (this.player === null) return "IA";
    const me = this.f[this.player], op = this.f[this.player === 0 ? 1 : 0];
    const dist = Math.hypot(op.x - me.x, op.y - me.y);
    if (a.type === "beam" && me.beam?.ab.id === a.id && me.stun <= 0) return null;
    if (this.playerBlocked()) return me.stun > 0 ? "Atordoado" : "Ocupado";
    if (a.type === "electricEnergy") return "Passiva";
    { const yz = yorozuUnavailable(this, me, op, a); if (yz !== undefined) return yz; }
    { const mg = megumiUnavailable(this, me, op, a); if (mg !== undefined) return mg; }
    if (me.sealed > 0 && a.type !== "gavelGrow" && a.type !== "gavelExtend" && a.type !== "gavelThrow") return "Técnica confiscada";
    if (a.type === "invertedSpear" && dist > (a.hitRadius ?? 72)) return "Fora de alcance";
    if (a.type === "garudaMass" && (!me.garuda || me.garuda.hp <= 0)) return "Garuda destruído";
    if (a.type === "perfectSphere" && me.sphere) return null;
    if (a.once && me.used.has(a.id)) return "Usada";
    if ((me.cd[a.id] ?? 0) > 0) return `${((me.cd[a.id] ?? 0) / TIME_SCALE / 1000).toFixed(1)}s`;
    if (choice.units !== undefined && (!Number.isInteger(choice.units) || choice.units < 1 || choice.units > (a.maxUnits ?? 1))) return "Quantidade inválida";
    if (choice.grade !== undefined && (!Number.isInteger(choice.grade) || (me.arsenal[choice.grade] ?? 0) <= 0)) return "Grau esgotado";
    const cost = a.cost ?? a.costPerUnit ?? (a.costPerTick ?? 0) * 3;
    if (!this.ready(me, a, choice.units !== undefined ? (a.costPerUnit ?? 0) * choice.units : cost)) return "Sem EA";
    if (a.type === "purple" && (!this.blues.some((b) => b.owner === this.player) || !this.projs.some((p) => p.owner === this.player && p.kind === "red"))) return "Requer Azul e Vermelho";
    if ((a.type === "electromagnetic" || a.type === "soundwave") && me.amber <= 0) return "Requer Âmbar";
    if (a.type === "staffElectric" && me.weaponHp <= 0) return "Bastão quebrado";
    if (a.type === "discharge" && me.charges < (a.maxUnits ?? 3)) return "Sem cargas";
    if (a.requiresSphere && !me.sphere) return "Requer esfera";
    if ((a.type === "domain" || a.type === "pachinko") && (this.domains.length || dist > DOMAIN_R - SIZE)) return this.domains.length ? "Barreira ativa" : "Fora de alcance";
    if (a.type === "fist" && dist >= (a.hitRange ?? SIZE + this.rules(me, "movement").meleePadding)) return "Fora de alcance";
    if (a.type === "doors" && dist > (a.hitRange ?? 320)) return "Fora de alcance";
    if (a.type === "blackHole" && me.en <= 0) return "Sem EA";
    if (a.type === "curseSpirits" && (!me.arsenal.some((n) => n > 0) || this.spirits.filter((s) => s.owner === this.player).length >= (a.maxActive ?? 4))) return "Sem espaço";
    return null;
  }
  playerAbility(id: string, choice: AbilityChoice = {}) {
    const before = new Set(this.projs);
    try { return this.playerAbilityInner(id, choice); } finally {
      this.closeWin();
      // mira pelo analógico: técnicas lançadas seguem a direção do direcional
      if (this.player !== null && (this.input.x || this.input.y)) {
        const ang = Math.atan2(this.input.y, this.input.x), me = this.f[this.player];
        for (const p of this.projs) if (!before.has(p) && p.owner === this.player) { const sp = Math.hypot(p.vx, p.vy); p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.home = 0; }
        if (me.beam) me.beam.ang = ang;
      }
    }
  }
  playerAbilityInner(id: string, choice: AbilityChoice = {}) {
    if (this.player === null) return false;
    const idx = this.player, me = this.f[idx], op = this.f[idx === 0 ? 1 : 0];
    const a = me.def.abilities.find((a) => a.id === id);
    if (!a || this.abilityUnavailable(a, choice)) return false;
    if (a.type === "beam" && me.beam?.ab.id === a.id) { me.beam = null; this.say(`${me.def.name.split(" ")[0]}: soltou o ${a.name}`); return true; }
    if (a.type === "dismantleNet" || a.type === "cleave" || a.type === "fuga" || a.type === "worldSlash") return this.sukunaAbility(me, op, idx, a);
    if (YZ_TYPES.has(a.type)) return castYorozu(this, me, op, idx, a, choice);
    if (MG_TYPES.has(a.type)) return castMegumi(this, me, op, idx, a);
    if (a.type === "gavelGrow") { if (!this.ready(me, a)) return false; this.use(me, a, a.cost ?? 0); me.gavelBig = a.durationMs ?? 6000; this.say(`${me.def.name.split(" ")[0]}: Aumentar Martelo`); return true; }
    if (a.type === "gavelExtend") return this.gavelStrike(me, op, a);
    if (a.type === "gavelThrow") return this.throwGavel(me, op, idx, a);
    if (a.type === "collapse") return this.nanamiCollapse(me, op, a);
    if (a.type === "ratio" && Math.hypot(op.x - me.x, op.y - me.y) > this.meleeReach(me) + 12) return false;
    const ang = Math.atan2(op.y - me.y, op.x - me.x);
    if (["tojiChain", "chainSpear"].includes(a.type)) return this.tojiAbility(me, op, idx, a);
    if (a.type === "garudaMass") return this.empowerGaruda(me);
    if (a.type === "blackHole") return this.activateBlackHole(idx);
    if (a.type === "amber") return this.activateAmber(me);
    if (a.type === "discharge") return this.discharge(me, op);
    if (["soundwave", "electromagnetic", "staffElectric"].includes(a.type)) return this.fireKashimoWave(me, op, idx, a);
    if (a.type === "domain" || a.type === "pachinko") return this.beginDomain(me, op, idx, a);
    if (a.type === "starRage") {
      me.starT = me.starT > 0 ? 0 : a.durationMs ?? 8000; me.cd[a.id] = 400;
      this.say(me.starT > 0 ? `${me.def.name.split(" ")[0]}: Fúria Estelar · massa dos golpes aumentada` : `${me.def.name.split(" ")[0]} desativou a Fúria Estelar`); return true;
    }
    if (a.type === "doors") return this.castDoor(me, op, idx, (choice.mode ?? "impacto") as Door["mode"]);
    if (a.type === "perfectSphere" && me.sphere) {
      me.sphere = false;
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(ang) * (a.speed ?? 4.5), vy: Math.sin(ang) * (a.speed ?? 4.5), dmg: 0, owner: idx, kind: "sphere", life: a.projectileLifeMs ?? 3500, ab: a, name: a.name });
      return true;
    }
    const units = a.costPerUnit ? choice.units ?? Math.min(a.maxUnits ?? 1, Math.floor(me.en / (a.costPerUnit * (me.def.costMult ?? 1)))) : 1;
    this.use(me, a, a.cost ?? units * (a.costPerUnit ?? 0));
    switch (a.type) {
      case "purple": case "uzumaki": case "perfectSphere": me.casting = { ab: a, t: a.castMs ?? 0 }; break;
      case "infinity": me.inf = a.durationMs ?? 1; break;
      case "simpleDomain": case "hollowWicker": me.wicker = a.type === "hollowWicker"; me.simple = Math.max(a.durationMs ?? 1, op.casting?.ab.type === "domain" ? op.casting.t + 800 : 0); me.simpleHp = a.capacity ?? 1000; break;
      case "buff": case "buffPlus": me.buff = a.mult ?? null; if (a.id === "overtime") this.nanamiOvertime(me); break;
      case "bloodBlade": me.blade = a.durationMs ?? 8000; break;
      case "plasmaJet": me.casting = { ab: a, t: a.castMs ?? 0 }; break;
      case "bloodMeteor": this.fireMeteor(me, op, idx, a); break;
      case "bloodSlash": this.fireBloodSlash(me, op, idx, a); break;
      case "insectArmor": me.buff = a.mult ?? null; me.armor = a.hp ?? 500; break;
      case "beam": me.beam = { ab: a, ang, t: a.id === "pierce" ? 8000 + (a.warmupMs ?? 450) : Infinity, tick: a.warmupMs ?? 450 }; break;
      case "fist": case "ratio":
        if (a.type === "ratio") this.fx.push({ kind: "ratio", x: op.x, y: op.y, r: 34, color: "", life: 750, max: 750, ang: ang + 0.5, seed: Math.random() });
        if (a.type === "fist") this.fx.push({ kind: "divergentFist", x: me.x + Math.cos(ang) * 24, y: me.y + Math.sin(ang) * 24, r: 50, color: "", life: 850, max: 850, ang });
        this.punch(me, op, (a.damage ?? 0) * this.dm(me), a.name, a); break;
      case "blue": this.blues.push({ x: me.x + Math.cos(ang) * 40, y: me.y + Math.sin(ang) * 40, owner: idx, dmg: (a.damage ?? 0) * this.dm(me), life: a.durationMs ?? 6000, ab: a }); break;
      case "gravity": {
        const life = a.durationMs ?? 2000;
        this.gravs.push({ x: op.x, y: op.y, owner: idx, ab: a, r: a.radius ?? 85, dps: (a.damage ?? 80) * this.dm(me) / (life / 1000), life, max: life });
        op.casting = null; op.beam = null; break;
      }
      case "curseSpirits": {
        this.summonSpirits(me, op, idx, a, choice.grade); break;
      }
      case "liquidMetal": this.castMetal(me, idx, a, ang, choice.mode === "shield"); break;
      case "construct": this.castConstruction(me, op, idx, a, ang, units); break;
      case "orbs":
        for (let k = 0; k < (a.count ?? 0); k++) {
          const angle = ang + Math.PI + k * Math.PI * 2 / (a.count ?? 1);
          this.orbs.push({ x: Math.max(20, Math.min(W - 20, op.x + Math.cos(angle) * 80)), y: Math.max(20, Math.min(H - 20, op.y + Math.sin(angle) * 80)), owner: idx, dmg: (a.damage ?? 0) * this.dm(me), stun: a.stunMs ?? 0, life: a.durationMs ?? 9000, ab: a, name: a.name });
        } break;
      default: {
        const kind: Proj["kind"] = a.type === "plasmaJet" ? "plasma" : a.type === "reserveBall" ? "ball" : a.type === "bloodShot" ? "blood" : a.type === "shockwave" ? "electric" : a.type === "liquidMetal" ? "metal" : a.type === "electromagnetic" ? "electromagnetic" : a.type === "red" ? "red" : a.type === "construct" ? "construct" : "slash";
        const count = a.type === "liquidMetal" ? a.count ?? 3 : a.type === "red" || a.type === "construct" ? 1 : units;
        for (let k = 0; k < count; k++) {
          const angle = ang + (k - (count - 1) / 2) * 0.1;
          const dmg = a.damagePerUnit ? a.damagePerUnit * (a.type === "construct" ? units : 1) : (a.damage ?? 0) / (a.type === "liquidMetal" ? count : 1);
          this.projs.push({ x: me.x, y: me.y, vx: Math.cos(angle) * (a.speed ?? 8), vy: Math.sin(angle) * (a.speed ?? 8), dmg: dmg * this.dm(me), owner: idx, kind, life: a.projectileLifeMs ?? 1800, ab: a, name: a.name });
        }
      }
    }
    this.say(`${me.def.name.split(" ")[0]}: ${a.name}`);
    return true;
  }
  /** Martelo do Higuruma: golpe de alcance estendido; com Pena de Morte vira a Espada do Carrasco (fatal) */
  /** Colapso (Nanami): pique ultrarrápido em caminho de ondas até o alvo; o golpe rompe estruturas (armadura, metal, domínio simples, arma, parede) */
  nanamiDashes: { me: Fighter; op: Fighter; a: Ability; t: number; bx: number; by: number; tx: number; ty: number; flip: number }[] = [];
  nanamiCollapse(me: Fighter, op: Fighter, a: Ability) {
    if (!this.ready(me, a) || this.nanamiDashes.some((d) => d.me === me)) return false;
    if (Math.hypot(op.x - me.x, op.y - me.y) > (a.maxRange ?? 400)) return false;
    this.use(me, a, a.cost ?? 0);
    this.nanamiDashes.push({ me, op, a, t: 0, bx: me.x, by: me.y, tx: op.x, ty: op.y, flip: Math.random() < 0.5 ? 1 : -1 });
    this.say(`${me.def.name.split(" ")[0]}: ${a.name}`);
    return true;
  }
  updateNanami(dt: number) {
    for (const d of this.nanamiDashes) {
      const { me, op } = d;
      if (me.hp <= 0 || op.hp <= 0 || me.stun > 0) { d.t = 9999; continue; }
      d.t += dt;
      // mira travada no ponto inicial do alvo: quem se move/esquiva sai da rota
      const ang = Math.atan2(d.ty - d.by, d.tx - d.bx), dist = Math.hypot(d.tx - d.bx, d.ty - d.by), step = Math.min(dist, 1.7 * dt);
      d.bx += Math.cos(ang) * step; d.by += Math.sin(ang) * step;
      const wave = Math.sin(d.t / 38) * 22 * d.flip * Math.min(1, dist / 60);
      me.x = d.bx - Math.sin(ang) * wave; me.y = d.by + Math.cos(ang) * wave; me.vx = 0; me.vy = 0;
      this.fx.push({ kind: "nwave", x: me.x, y: me.y, r: 9, color: "", life: 380, max: 380, ang: ang + Math.cos(d.t / 38) * 0.8 });
      if (Math.hypot(op.x - me.x, op.y - me.y) < SIZE + 8) { d.t = 9999; this.nanamiCollapseHit(me, op, d.a, ang); }
      else if (dist < 2 || d.t > 700) { d.t = 9999; this.fx.push({ kind: "txt", x: me.x, y: me.y - SIZE, r: 0, color: "#e5e7eb", life: 700, max: 700, text: "Errou" }); }
    }
    this.nanamiDashes = this.nanamiDashes.filter((d) => d.t < 9999);
  }
  nanamiCollapseHit(me: Fighter, op: Fighter, a: Ability, ang: number) {
    const first = me.def.name.split(" ")[0];
    let dmg = (a.damage ?? 270) * this.dm(me);
    const broke: string[] = [];
    if (op.armor > 0) { op.armor = 0; if (op.def.id === "yorozu") op.buff = null; broke.push("armadura"); }
    if (op.metal > 0) { op.metal = 0; broke.push("metal"); }
    if (op.simple > 0) { op.simple = 0; op.simpleHp = 0; broke.push("Domínio Simples"); }
    if (op.weaponHp > 0) { op.weaponHp *= 0.5; broke.push(op.def.weapon?.name ?? "arma"); }
    if (op.x < 70 || op.x > W - 70 || op.y < 70 || op.y > H - 70) {
      dmg *= 1.35; broke.push("parede");
      for (let k = 0; k < 6; k++) this.fx.push({ kind: "smoke", x: op.x + (Math.random() - 0.5) * 50, y: op.y + (Math.random() - 0.5) * 30, r: 10 + Math.random() * 8, color: "", life: 1100, max: 1100, seed: Math.random() });
    }
    this.fx.push({ kind: "crater", x: op.x, y: op.y, r: 58, color: "", life: 1100, max: 1100 });
    this.fx.push({ kind: "collapse", x: op.x, y: op.y, r: 46, color: "", life: 750, max: 750, ang, seed: Math.random() });
    this.punch(me, op, dmg, a.name, a);
    if (broke.length) this.say(`${first}: Colapso rompeu ${broke.join(", ")}`);
  }
  /** Horas Extras: fim do expediente, a restrição sai e a energia disponível aumenta */
  nanamiOvertime(me: Fighter) {
    me.en = this.maxEn(me);
    if (me.def.weapon) me.weaponHp = me.def.weapon.durability;
    this.fx.push({ kind: "ring", x: me.x, y: me.y, r: 46, color: "#22d3ee", life: 700, max: 700 });
    this.fx.push({ kind: "txt", x: me.x, y: me.y - SIZE, r: 0, color: "#22d3ee", life: 1200, max: 1200, text: "Fim do expediente" });
  }
  /** Arremesso de Martelo: o martelo voa girando até o oponente */
  throwGavel(me: Fighter, op: Fighter, idx: number, a: Ability) {
    if (!this.ready(me, a)) return false;
    this.use(me, a, a.cost ?? 0);
    if (this.projs.some((p) => p.kind === "gavel" && this.f[p.owner] === me)) return false;
    const speed = a.speed ?? 12, ang = this.leadAngle(me, op, speed), hand = Math.atan2(op.y - me.y, op.x - me.x);
    this.projs.push({ x: me.x + Math.cos(hand) * 22, y: me.y + Math.sin(hand) * 22, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: (a.damage ?? 70) * this.dm(me), owner: idx, kind: "gavel", life: a.projectileLifeMs ?? 1100, ab: a, name: a.name });
    this.say(`${me.def.name.split(" ")[0]}: ${a.name}`); return true;
  }
  drawThrownGavel(c: CanvasRenderingContext2D, p: Proj) {
    const t = styleTokens; c.save(); c.translate(p.x, p.y); c.rotate(this.time / 35);
    c.fillStyle = t.getPropertyValue("--gavel-handle").trim(); c.fillRect(-2, -2, 22, 4);
    c.fillStyle = t.getPropertyValue("--gavel-head").trim(); c.fillRect(-10, -8, 12, 16);
    c.restore();
  }
  gavelStrike(me: Fighter, op: Fighter, a: Ability) {
    if (!this.ready(me, a)) return false;
    const dist = Math.hypot(op.x - me.x, op.y - me.y), ang = Math.atan2(op.y - me.y, op.x - me.x);
    if (dist > (a.hitRadius ?? 70) + SIZE / 2) return false;
    this.use(me, a, a.cost ?? 0);
    const lethal = me.executioner > 0;
    me.gavelExt = 420; me.gavelReach = dist; // animação: o cabo se alonga até o alvo e volta
    if (this.damage(op, lethal ? op.hp + op.armor + 1 : (a.damage ?? 70) * this.dm(me), lethal ? "Espada do Carrasco" : a.name) > 0) {
      op.vx += Math.cos(ang) * (a.knockback ?? 8); op.vy += Math.sin(ang) * (a.knockback ?? 8);
      op.stun = Math.max(op.stun, a.stunMs ?? 200);
    }
    if (lethal) me.executioner = 0;
    return true;
  }
  /** Alcance do ataque normal: corpo + comprimento da arma que o lutador segura. */
  meleeReach(me: Fighter) {
    const base = me.def.taijutsu.hitRange ?? SIZE + this.rules(me, "movement").meleePadding;
    if (me.def.id === "higuruma") return base + (me.executioner > 0 ? 50 : me.gavelBig > 0 ? 55 : 38);
    if (me.def.weapon && me.weaponHp > 0) return base + 42 * (me.def.weapon.visualScale ?? 1);
    if (me.yz && me.yz.weapon > 0) return base + 24; // arma construída da Yorozu
    return base;
  }
  melee(me: Fighter, op: Fighter) {
    if (megumiHidden(me)) return;
    if (Math.hypot(op.x - me.x, op.y - me.y) >= this.meleeReach(me) || me.meleeCd > 0) return;
    const t = me.def.taijutsu.timing, pre = (t?.prepMs ?? 0) + (t?.launchMs ?? 0);
    if (pre > 0) me.windup = Math.max(me.windup, pre);
    me.recovery = Math.max(me.recovery, t?.recoveryMs ?? 0);
    this.openWin(this.f.indexOf(me), pre + (t?.impactMs ?? 0));
    try { this.meleeInner(me, op); } finally { this.closeWin(); }
  }
  meleeInner(me: Fighter, op: Fighter) {
    const movement = this.rules(me, "movement"), dist = Math.hypot(op.x - me.x, op.y - me.y);
    if (dist >= this.meleeReach(me) || me.meleeCd > 0) return;
    const ang = Math.atan2(op.y - me.y, op.x - me.x);
    me.meleeCd = me.def.taijutsu.cooldown / ((me.buff?.speed ?? 1) * (this.amberMult(me)?.speed ?? 1) * flightMult(me));
    if (me.executioner > 0) { // Espada do Carrasco: um golpe que acerta é fatal
      me.executioner = 0;
      this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 40, color: "#fde047", life: 320, max: 320, ang: ang + 1.1 });
      this.damage(op, op.hp + op.armor + 1, "Espada do Carrasco");
      op.beam = null;
      return;
    }
    const before = op.hp;
    if (me.def.id === "higuruma") { // Martelo é a arma dele; grande = mais dano, mais lento
      const g = me.def.abilities.find((x) => x.type === "gavelGrow"), big = me.gavelBig > 0;
      if (big) me.meleeCd *= g?.slowMult ?? 1.7;
      me.gavelExt = 0;
      this.punch(me, op, me.def.taijutsu.damage * (big ? g?.damageMult ?? 1.9 : 1) * this.dm(me), big ? "Martelo Gigante" : "Martelo");
      if (op.hp < before) op.beam = null;
      return;
    }
    if (me.yz && yorozuMelee(this, me, op)) { if (op.hp < before) op.beam = null; return; }
    if (me.def.abilities.some((a) => a.type === "starRage") && !this.isPlayer(me) && me.starT <= 0 && me.en > me.def.energy * 0.25) { me.starT = 8000; this.say(`${me.def.name.split(" ")[0]}: Fúria Estelar`); }
    if (me.starT > 0) this.stellarPunch(me, op);
    else if (me.blade > 0) { const bl = me.def.abilities.find((x) => x.type === "bloodBlade"); this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 22, color: "#fff", life: 200, max: 200, ang: ang + 1.2 }); const b4 = op.hp; this.punch(me, op, (bl?.damage ?? 45) * this.dm(me), bl?.name ?? "Lâmina de Sangue"); this.applyPoison(op, bl, b4 - op.hp); }
    else if (me.mg && me.mg.weapon > 0) { const ar = me.def.abilities.find((x) => x.type === "mgArmory"); this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 22, color: "#fff", life: 200, max: 200, ang: ang + 1.2 }); this.punch(me, op, (ar?.damage ?? 55) * this.dm(me), "Espada das Sombras"); }
    else this.punch(me, op, (me.def.weapon && me.weaponHp > 0 ? me.def.weapon.damage ?? me.def.taijutsu.damage : me.def.taijutsu.damage) * this.dm(me), me.def.id === "toji" ? "Lança Invertida do Céu" : me.def.id === "nanami" && me.weaponHp > 0 ? "Cutelo" : "Taijutsu", {}, me.def.id === "toji");
    if (op.hp < before) op.beam = null;
  }

  step(dt: number) {
    dt *= TIME_SCALE;
    if (this.winner) { this.fx = this.fx.filter((e) => (e.life -= dt) > 0); return; }
    this.time += dt; this.voidT -= dt;
    if (this.fx.length > 240) this.fx.splice(0, this.fx.length - 240); // limita efeitos acumulados
    this.updateAmber(dt); if (this.winner) return;
    this.updateDomains(dt);
    if (this.blackHole) {
      const hole = this.blackHole; hole.t -= dt;
      for (const f of this.f) {
        f.x += (hole.x - f.x) * Math.min(1, dt / 320);
        f.y += (hole.y - f.y) * Math.min(1, dt / 320);
        if (f.garuda) { f.garuda.x += (hole.x - f.garuda.x) * Math.min(1, dt / 250); f.garuda.y += (hole.y - f.garuda.y) * Math.min(1, dt / 250); }
      }
      for (const p of this.projs) { p.x += (hole.x - p.x) * Math.min(1, dt / 220); p.y += (hole.y - p.y) * Math.min(1, dt / 220); }
      this.orbs = []; this.blues = [];
      if (hole.t <= 0) {
        const caster = this.f[hole.owner], a = caster?.def.abilities.find((a) => a.type === "blackHole");
        this.blackHole = null;
        for (const f of this.f) { this.damage(f, this.abilityDamage(f, a?.damage ?? 0, a), a?.name ?? "BURACO NEGRO", false); if (f.garuda) f.garuda.hp = Math.max(0, f.garuda.hp - (a?.hitkill ? f.garuda.hp : a?.damage ?? 0)); this.winner = null; }
        this.projs = []; const alive = this.f.filter((f) => f.hp > 0); this.winner = alive.length === 0 ? "Empate" : alive.length === 1 ? (alive[0]?.def.name ?? "Empate") : null;
        this.say(`BURACO NEGRO: ${this.winner ?? "explosão encerrada"}`);
      }
      return;
    }
    this.f.forEach((me, i) => { const op = this.f[i === 0 ? 1 : 0]; if (!this.winner && !this.blackHole) this.updateFighter(me, op, i, dt); });
    if (this.winner || this.blackHole) return;
    this.updatePoison(dt); if (this.winner) return;
    this.updateDoors(dt);
    this.updatePending(dt); if (this.winner) return;
    updateYorozu(this, dt); if (this.winner) return;
    this.updateKenjaku(dt); if (this.winner) return;
    updateMegumi(this, dt); if (this.winner) return;
    this.f.forEach((me, i) => this.updateGaruda(me, this.f[i === 0 ? 1 : 0], dt));
    // projectiles
    for (const p of this.projs) {
      if (p.hold === undefined) {
        p.hold = this.f[p.owner]?.windup ?? 0;
        const sm = p.ab?.timing?.speedMult ?? 1; if (sm !== 1) { p.vx *= sm; p.vy *= sm; }
        if (p.originX === undefined) { p.originX = p.x; p.originY = p.y; }
      }
      if (p.hold > 0) { p.hold -= dt; continue; } // técnica ainda em preparação
      p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.life -= dt;
      if (p.ab?.maxRange !== undefined && p.originX !== undefined && p.originY !== undefined && Math.hypot(p.x - p.originX, p.y - p.originY) > p.ab.maxRange) p.life = 0;
      if (p.life <= 0) continue;
      const t = this.f[1 - p.owner];
      if (!t || p.hit) continue;
      const hr = p.kind === "gavel" ? p.ab?.hitRadius ?? 14 : p.kind === "yzBlade" || p.kind === "yzLance" ? p.ab?.hitRadius ?? 10 : p.kind === "yzChain" ? p.ab?.hitRadius ?? 9 : p.kind === "sound" || p.kind === "electromagnetic" ? p.ab?.hitRadius ?? 10 : p.kind === "net" || p.kind === "fuga" || p.kind === "world" ? p.ab?.hitRadius ?? 12 : p.kind === "tojiChain" ? p.ab?.hitRadius ?? 12 : p.kind === "meteor" || p.kind === "disc" || p.kind === "chain" ? p.ab?.hitRadius ?? 6 : p.kind === "plasma" ? p.ab?.hitRadius ?? 34 : p.kind === "ball" ? 6 : p.kind === "purple" ? 34 : p.kind === "uzumaki" ? 30 : p.kind === "sphere" ? 26 : p.kind === "red" ? 12 : p.kind === "construct" ? 9 : 5;
      if (t.inf > 0 && !p.sure && p.ab?.type !== "chainSpear" && p.kind !== "purple" && p.kind !== "sphere" && p.kind !== "world" && Math.hypot(p.x - t.x, p.y - t.y) < 46) { p.vx *= 0.75; p.vy *= 0.75; if (Math.hypot(p.vx, p.vy) < 0.3) p.life = 0; continue; }
      if (!megumiHidden(t) && Math.abs(p.x - t.x) < SIZE / 2 + hr && Math.abs(p.y - t.y) < SIZE / 2 + hr) {
        const delay = p.ab?.timing?.impactMs ?? 0;
        if (delay > 0) this.openWin(p.owner, delay);
        try {
        const nm = p.name;
        if (p.ab?.type === "chainSpear") this.cancelTechnique(t);
        if (p.kind === "sphere") { yorozuSphereHit(this, p, t); continue; }
        if (p.kind === "red") { this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 110, color: "rgba(239,68,68,0.55)", life: 600, max: 600 }); const a = Math.atan2(p.vy, p.vx); t.vx += Math.cos(a) * (p.ab?.knockback ?? 14); t.vy += Math.sin(a) * (p.ab?.knockback ?? 14); t.stun = Math.max(t.stun, p.ab?.stunMs ?? 450); }
        if (p.kind === "uzumaki") { this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 130, color: "rgba(0,0,0,0.85)", life: 800, max: 800 }); const a = Math.atan2(p.vy, p.vx); t.vx += Math.cos(a) * (p.ab?.knockback ?? 12); t.vy += Math.sin(a) * (p.ab?.knockback ?? 12); t.stun = Math.max(t.stun, p.stun ?? 400); }
        if (p.kind === "fuga") { this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 150, color: "rgba(249,115,22,0.6)", life: 900, max: 900 }); this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 80, color: "rgba(254,240,138,0.7)", life: 600, max: 600 }); }
        if (p.kind === "world") this.fx.push({ kind: "slash", x: t.x, y: t.y, r: 120, color: "", life: 700, max: 700, ang: Math.atan2(p.vy, p.vx) + Math.PI / 2 });
        if ((p.kind === "slash" || p.kind === "net" || p.kind === "fuga") && p.ab?.knockback) { const a = Math.atan2(p.vy, p.vx), k = p.ab.knockback * (p.kind === "slash" ? Math.min(2, p.dmg / 60) : 1); t.vx += Math.cos(a) * k; t.vy += Math.sin(a) * k; }
        if (p.kind === "purple") this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 140, color: "rgba(168,85,247,0.6)", life: 800, max: 800 });
        if (p.kind === "plasma") { this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 90, color: "rgba(185,18,38,0.6)", life: 600, max: 600 }); const a = Math.atan2(p.vy, p.vx); t.vx += Math.cos(a) * (p.ab?.knockback ?? 8); t.vy += Math.sin(a) * (p.ab?.knockback ?? 8); }
        if ((p.kind === "sound" || p.kind === "electromagnetic") && t.inf <= 0) {
          // Resonance disrupts material defenses; radiation also reaches the body.
          t.armor = Math.max(0, t.armor - (p.ab?.materialDamage ?? 0) / (p.kind === "electromagnetic" ? p.ab?.count ?? 1 : 1));
          if (t.armor === 0 && t.def.id === "yorozu") t.buff = null;
          t.metal = 0;
        }
        const raw = this.abilityDamage(t, p.dmg, p.ab), sureDmg = p.sure ? this.absorbSure(t, raw, true) : raw;
        const lost = p.sure && sureDmg <= 0 ? 0 : this.damage(t, sureDmg, p.sure ? `${nm} (acerto garantido)` : nm, !p.sure && p.kind !== "electric" && p.kind !== "world", p.sure || p.kind === "purple" || p.kind === "world" || p.ab?.type === "chainSpear");
        if (p.kind === "yzChain") yorozuChainHit(this, p, t, lost);
        if (p.kind === "tojiChain" && lost > 0) { const owner = this.f[p.owner]; if (owner) this.applyPhysicalImpact(owner, t, p.dmg); }
        this.applyPoison(t, p.ab, lost);
        if (p.kind === "sound" && lost > 0) {
          const a = Math.atan2(p.vy, p.vx); t.vx += Math.cos(a) * (p.ab?.knockback ?? 8); t.vy += Math.sin(a) * (p.ab?.knockback ?? 8);
          t.stun = Math.max(t.stun, p.ab?.stunMs ?? 240);
          this.fx.push({ kind: "crater", x: t.x, y: t.y, r: 22, color: "", life: 1800, max: 1800 });
        }
        if (p.kind === "electric" || p.kind === "electromagnetic") { t.stun = Math.max(t.stun, p.ab?.stunMs ?? 350); this.fx.push({ kind: "electric", x: t.x, y: t.y, r: 50, color: "", life: 550, max: 550 }); }
        if (PASS_THROUGH.has(p.kind)) p.hit = true; else p.life = 0;
        if (p.kind === "disc" || p.kind === "chain") this.fx.push({ kind: "slash", x: t.x, y: t.y, r: 24, color: "#fff", life: 220, max: 220, ang: Math.atan2(p.vy, p.vx) + 1.2 });
        if (p.kind === "gavel") { t.stun = Math.max(t.stun, p.ab?.stunMs ?? 0); const ga = Math.atan2(p.vy, p.vx); t.vx += Math.cos(ga) * (p.ab?.knockback ?? 5); t.vy += Math.sin(ga) * (p.ab?.knockback ?? 5); }
        if (p.kind === "meteor") { t.stun = Math.max(t.stun, p.ab?.stunMs ?? 0); this.fx.push({ kind: "boom", x: t.x, y: t.y, r: 26, color: "rgba(127,29,29,0.6)", life: 300, max: 300 }); }
        if (p.kind === "slash") this.fx.push({ kind: "slash", x: t.x, y: t.y, r: 26, color: "#fff", life: 220, max: 220, ang: Math.atan2(p.vy, p.vx) + 1.2 });
        } finally { if (delay > 0) this.closeWin(); }
      }
    }
    const DESTRUCTIVE: Record<string, [number, string]> = { red: [70, "rgba(239,68,68,0.7)"], purple: [110, "rgba(168,85,247,0.7)"], fuga: [120, "rgba(249,115,22,0.75)"], sphere: [80, "rgba(30,30,30,0.85)"], uzumaki: [90, "rgba(40,40,40,0.8)"], plasma: [60, "rgba(185,18,38,0.7)"], meteor: [30, "rgba(127,29,29,0.7)"], world: [60, "rgba(255,255,255,0.6)"], net: [50, "rgba(255,255,255,0.5)"] };
    for (const p of this.projs) {
      const gone = p.life <= 0 || p.x <= -20 || p.x >= W + 20 || p.y <= -20 || p.y >= H + 20;
      const d = DESTRUCTIVE[p.kind];
      if (gone && d) this.impact(Math.max(6, Math.min(W - 6, p.x)), Math.max(6, Math.min(H - 6, p.y)), d[0], d[1], p.kind === "plasma" ? "rgba(220,38,38,0.6)" : undefined);
    }
    this.projs = this.projs.filter((p) => p.life > 0 && p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20);
    for (const o of this.orbs) {
      o.life -= dt; const t = this.f[1 - o.owner];
      if (!t) continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) < (o.ab.hitRadius ?? 32)) {
        o.life = 0;
        this.withImpact(o.owner, o.ab, () => {
          t.stun = Math.max(t.stun, o.stun); t.beam = null;
          this.fx.push({ kind: "boom", x: o.x, y: o.y, r: 40, color: "#e11d2e", life: 350, max: 350 });
          this.applyPoison(t, o.ab, this.damage(t, this.abilityDamage(t, o.dmg, o.ab), `${o.name} (atordoado)`));
        });
      }
    }
    this.orbs = this.orbs.filter((o) => o.life > 0);
    // Azul: atração manipulada pelo Gojo
    for (const b of this.blues) {
      b.life -= dt; const t = this.f[1 - b.owner], g = this.f[b.owner];
      if (!t || !g) continue;
      if (g.casting?.ab.type === "purple") { b.x += (g.x + 30 - b.x) * 0.06; b.y += (g.y - b.y) * 0.06; continue; }
      const rx = t.x - b.x, ry = t.y - b.y, r = Math.hypot(rx, ry) || 1;
      const bs = (b.ab.speed ?? 1.6) * (b.ab.timing?.speedMult ?? 1);
      b.x += (rx / r) * bs * dt / 16; b.y += (ry / r) * bs * dt / 16;
      if (r < (b.ab.pullRadius ?? 200)) { t.vx -= (rx / r) * (b.ab.pullForce ?? 0.22); t.vy -= (ry / r) * (b.ab.pullForce ?? 0.22); }
      if (r < (b.ab.hitRadius ?? 26)) { b.life = 0; this.withImpact(b.owner, b.ab, () => { this.fx.push({ kind: "boom", x: b.x, y: b.y, r: 50, color: "rgba(59,130,246,0.6)", life: 450, max: 450 }); t.stun = Math.max(t.stun, b.ab.stunMs ?? 500); this.damage(t, this.abilityDamage(t, b.dmg, b.ab), "Azul (compressão)"); }); }
    }
    this.blues = this.blues.filter((b) => b.life > 0);
    this.updateNanami(dt);
    for (const f of this.f) this.confine(f);
    this.fx = this.fx.filter((e) => (e.life -= dt) > 0);
  }

  updateFighter(me: Fighter, op: Fighter, idx: number, dt: number) {
    this.closeWin();
    try { this.updateFighterInner(me, op, idx, dt); } finally { this.closeWin(); }
  }
  updateFighterInner(me: Fighter, op: Fighter, idx: number, dt: number) {
    const d = me.def, movement = this.rules(me, "movement"), ai = this.rules(me, "ai");
    if (me.hp <= 0 || op.hp <= 0) return;
    const manual = idx === this.player;
    if (!manual && this.shouldUseBlackHole(me, op) && this.activateBlackHole(idx)) return;
    this.closeWin();
    if (me.jackpot > 0 && (me.jackpot -= dt) <= 0) { me.jackpot = 0; me.en = Math.min(me.en, d.energy); this.say(`${d.name}: bônus do jackpot acabou`); }
    me.en = Math.min(this.maxEn(me), me.en + d.energyRegen * dt / 1000);
    for (const k in me.cd) me.cd[k] = (me.cd[k] ?? 0) - dt;
    me.retreatT = Math.max(0, me.retreatT - dt); me.exchangeLoss = Math.max(0, me.exchangeLoss - dt * 0.018);
    me.metal -= dt; me.blade -= dt; me.meleeCd -= dt; me.inf -= dt; me.simple -= dt; me.dashAtk -= dt; me.flash -= dt; me.strafeCd -= dt; me.sealed = Math.max(0, me.sealed - dt); me.executioner = Math.max(0, me.executioner - dt); me.gavelBig = Math.max(0, me.gavelBig - dt); me.starT = Math.max(0, me.starT - dt); me.gavelExt = Math.max(0, me.gavelExt - dt);
    if (me.jackpot > 0) this.heal(me, dt); // no jackpot o corpo cura sozinho, mesmo em movimento
    else if ((!manual || (this.input.heal && !this.input.x && !this.input.y && !this.input.attack)) && this.wantsHeal(me) && this.healFree(me, op)) {
      // Técnica Reversa: só livre e parado
      const healing = this.rules(me, "healing");
      me.vx *= healing.stopDamping; me.vy *= healing.stopDamping; me.dodgeT = 0; this.move(me, dt);
      if (Math.hypot(me.vx, me.vy) < healing.stationarySpeed) this.heal(me, dt);
      return;
    } else me.healing = false;
    if (me.stun > 0) { me.stun -= dt; me.windup = 0; me.recovery = 0; me.casting = null; me.beam = null; this.move(me, dt); return; }
    // demora de execução: o lutador prepara a técnica parado antes dela sair
    if (me.windup > 0) { me.windup -= dt; me.vx *= 0.7; me.vy *= 0.7; this.move(me, dt); return; }
    // tribunal em sessão: ninguém ataca, só se move
    if (this.trialActive()) { me.casting = null; me.beam = null; this.move(me, dt); return; }
    // recuperação: depois que o ataque sai, o lutador demora para agir de novo
    if (me.recovery > 0 && !me.casting && !me.beam) { me.recovery -= dt; me.vx *= 0.85; me.vy *= 0.85; this.move(me, dt); return; }
    const dx = op.x - me.x, dy = op.y - me.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);

    // domain cast
    if (me.casting) {
      me.casting.t -= dt;
      if (me.casting.t <= 0) {
        const a = me.casting.ab; me.casting = null;
        const impact = a.timing?.impactMs ?? 0;
        if (impact > 0) this.openWin(idx, impact);
        if (a.type === "pachinko") {
          if (!this.captureDomain(me, op, idx, a)) this.say("Pachinko cancelado: inimigo fora da barreira");
          return;
        }
        if (a.type === "perfectSphere") { yorozuSphereReady(this, me, op, idx, a); return; }
        if (a.type === "uzumaki") { this.fireUzumaki(me, op, idx, a); return; }
        if (a.type === "plasmaJet") { this.firePlasma(me, op, idx, a); return; }
        if (a.type === "fuga" || a.type === "worldSlash") { this.fireSukuna(me, op, idx, a); return; }
        if (a.type === "purple") {
          this.blues = this.blues.filter((b) => b.owner !== idx);
          this.projs = this.projs.filter((p) => !(p.owner === idx && p.kind === "red"));
          const pa = Math.atan2(op.y - me.y, op.x - me.x);
          this.projs.push({ x: me.x, y: me.y, vx: Math.cos(pa) * (a.speed ?? 14), vy: Math.sin(pa) * (a.speed ?? 14), dmg: (a.damage ?? 0) * this.dm(me), owner: idx, kind: "purple", life: a.projectileLifeMs ?? 2500, ab: a, name: a.name });
          this.say(`${me.def.name.split(" ")[0]}: ${a.name.toUpperCase()}`); return;
        }
        const domain = this.captureDomain(me, op, idx, a);
        if (!domain) this.say(`${op.def.name.split(" ")[0]} escapou do alcance do domínio`);
        else if (a.trial) {
          // Sentença Mortal: o Judgeman apresenta a acusação e começa o julgamento
          domain.trialT = 2600;
          domain.accusation = ACCUSATIONS[Math.floor(Math.random() * ACCUSATIONS.length)]!;
          this.say(`Judgeman: o réu é acusado de ${domain.accusation}`);
        }
        else if (a.shrine) { this.say("Santuário Malevolente: cortes incessantes em toda a área"); }
        else if (a.yorozuDomain) yorozuDomainOpen(this, me, op, idx, domain, a);
        else if (a.chimera) megumiDomainOpen(this, me, op, idx, domain, a);
        else if (this.domainImmune(op, a)) { this.say(`${op.def.name}: Restrição Celestial · acerto garantido não encontra alvo`); }
        else if (a.requiresSphere) { me.sphere = false; this.fx.push({ kind: "boom", x: op.x, y: op.y, r: 120, color: "rgba(0,0,0,0.9)", life: 800, max: 800 }); this.say("Esfera Perfeita garantida pelo domínio"); this.damage(op, op.hp + 1, "Esfera Perfeita (domínio)", false); }
        else if (a.overloadMs) { this.voidT = a.overloadMs; this.voidX = domain.x; this.voidY = domain.y; op.stun = a.overloadMs; op.vx = 0; op.vy = 0; op.beam = null; op.casting = null; op.simple = 0; op.inf = 0; this.say(`${op.def.name.split(" ")[0]} sobrecarregado no Vazio Ilimitado`); }
        else {
          this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 60, color: "#fff", life: 600, max: 600, ang: -0.8 });
          let sure = (a.damage ?? 0) * this.dm(me);
          // Domínio Simples: só neutraliza o acerto garantido, absorvendo até 1000 de dano
          if (!a.ignoresSimple) sure = this.absorbSure(op, sure);
          if (sure > 0) this.damage(op, sure, a.gravity ? `${a.name} (gravidade)` : `${a.name} · Golpe na Alma`, false);
          if (a.gravity && sure > 0 && op.hp > 0) {
            const gv = combatDefaults.domainGravity; op.stun = Math.max(op.stun, gv.stunMs); op.vx = 0; op.vy = 0;
            this.gravs.push({ x: op.x, y: op.y, owner: idx, r: gv.radius, dps: 0, life: gv.stunMs, max: gv.stunMs });
            this.say(`${op.def.name.split(" ")[0]} esmagado contra o chão pela gravidade`);
          }
        }
      }
      return;
    }
    // beam channel (must stand still)
    if (me.beam) {
      const b = me.beam; b.t -= dt; b.tick -= dt;
      const target = Math.atan2(dy, dx);
      // na Onda Sonora o jogador mira com o direcional; a IA mira no oponente
      const aim = manual && (this.input.x || this.input.y) ? Math.atan2(this.input.y, this.input.x) : target;
      let diff = aim - b.ang;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); b.ang += Math.max(-(b.ab.turnSpeed ?? 0.006), Math.min(b.ab.turnSpeed ?? 0.006, diff)) * dt / 16;
      me.vx *= 0.7; me.vy *= 0.7;
      if (b.tick <= 0) {
        b.tick = (b.ab.tickMs ?? 1);
        if (me.en < (b.ab.costPerTick ?? 0) * (me.def.costMult ?? 1) * ENERGY.costMult) { me.beam = null; return; }
        me.en -= (b.ab.costPerTick ?? 0) * (me.def.costMult ?? 1) * ENERGY.costMult;
        const perp = Math.abs(Math.sin(target - b.ang) * dist);
        if (dist <= (b.ab.maxRange ?? 1200) && perp < SIZE / 2 + (b.ab.hitRadius ?? 4) && Math.cos(target - b.ang) > 0) {
          const perTick = b.ab.damagePerTick ?? (b.ab.damage ?? 0) / ((b.ab.durationMs ?? 1) / (b.ab.tickMs ?? 1));
          this.withImpact(idx, b.ab, () => {
          const lost = this.damage(op, this.abilityDamage(op, perTick * this.dm(me), b.ab), b.ab.name);
          this.applyPoison(op, b.ab, lost);
          if (b.ab.type === "soundwave" && op.inf <= 0) {
            op.armor = Math.max(0, op.armor - (b.ab.materialDamage ?? 0)); if (op.armor === 0 && op.def.id === "yorozu") op.buff = null; op.metal = 0;
            if (lost > 0) { op.vx += Math.cos(b.ang) * (b.ab.knockback ?? 3); op.vy += Math.sin(b.ang) * (b.ab.knockback ?? 3); op.stun = Math.max(op.stun, b.ab.stunMs ?? 150); }
          }
          });
        }
      }
      if (b.t <= 0) me.beam = null;
      this.move(me, dt); return;
    }

    if (manual) {
      const length = Math.max(1, Math.hypot(this.input.x, this.input.y));
      const speed = d.speed * (me.buff?.speed ?? 1) * (this.amberMult(me)?.speed ?? 1) * flightMult(me);
      if (me.dodgeT > 0) {
        me.dodgeT -= dt; me.vx += (me.dodgeX - me.vx) * movement.dodgeAcceleration; me.vy += (me.dodgeY - me.vy) * movement.dodgeAcceleration;
      } else if (me.dashAtk <= 0) {
        me.vx += (this.input.x / length * speed - me.vx) * movement.acceleration;
        me.vy += (this.input.y / length * speed - me.vy) * movement.acceleration;
      }
      this.updateOffensiveDash(me, op);
      if (this.input.attack && me.dashAtk <= 0) this.melee(me, op);
      this.move(me, dt);
      return;
    }
    // leitura de ameaças: projéteis, orbes e feixes
    const reflex = d.reflex * (me.buff?.reflex ?? 1) * (this.amberMult(me)?.reflex ?? 1);
    const brain = 0.7 + (d.intelligence ?? 0.7) * 0.6; // inteligência de combate: leitura e reação
    const spd = d.speed * (me.buff?.speed ?? 1) * (this.amberMult(me)?.speed ?? 1) * flightMult(me);
    let dodge = false; let threat = 0;
    for (const p of this.projs) if (p.owner !== idx) {
      const pv = Math.hypot(p.vx, p.vy) || 1;
      const rx = me.x - p.x, ry = me.y - p.y; const along = (rx * p.vx + ry * p.vy) / pv;
      if (along > -10 && along < ai.threatDistance) {
        const cross = (rx * p.vy - ry * p.vx) / pv;
        const hr = p.kind === "purple" || p.kind === "plasma" ? 34 : p.kind === "red" ? 12 : 5;
        if (Math.abs(cross) < SIZE / 2 + hr + 14) {
          threat++;
          const nx = -p.vy / pv, ny = p.vx / pv;
          if (me.dodgeT > 0) { me.dodgeT = Math.max(me.dodgeT, 140); } // continua no mesmo lado até sair da linha
          else if (Math.random() < Math.min(1, reflex * brain * (along < 200 ? ai.dodgeNearReflexMult : ai.dodgeFarReflexMult))) {
            // sai pelo lado em que já está (afasta da linha), troca só se for bater na parede
            let s = cross >= 0 ? -1 : 1;
            if (Math.abs(cross) < 2) s = Math.random() < 0.5 ? 1 : -1;
            const ex = me.x + nx * s * 70, ey = me.y + ny * s * 70;
            if (ex < 30 || ex > W - 30 || ey < 30 || ey > H - 30) s = -s;
            const v = Math.max(ai.dodgeSpeedMin, spd * ai.dodgeSpeedMult);
            me.dodgeX = nx * s * v; me.dodgeY = ny * s * v; me.dodgeT = ai.dodgeDurationMs;
          }
        }
      }
    }
    // esquiva comprometida: escolhe um lado e vai até o fim (sem tremer)
    if (me.dodgeT > 0) { me.dodgeT -= dt; me.vx += (me.dodgeX - me.vx) * movement.dodgeAcceleration; me.vy += (me.dodgeY - me.vy) * movement.dodgeAcceleration; dodge = true; }
    // orbes: repulsão (nunca anda para dentro de uma armadilha)
    let ox = 0, oy = 0;
    for (const o of this.orbs) if (o.owner !== idx) {
      const rx = me.x - o.x, ry = me.y - o.y, r = Math.hypot(rx, ry) || 1;
      if (r < 110) { const k = (110 - r) / 110; ox += (rx / r) * k * 2.4; oy += (ry / r) * k * 2.4; }
    }
    for (const b of this.blues) if (b.owner !== idx) {
      const rx = me.x - b.x, ry = me.y - b.y, r = Math.hypot(rx, ry) || 1;
      if (r < 150) { const k = (150 - r) / 150; ox += (rx / r) * k * 2.8; oy += (ry / r) * k * 2.8; if (r < 80) threat++; }
    }
    if (op.beam) { // sai da linha do feixe (inclusive durante a carga)
      const toMe = Math.atan2(me.y - op.y, me.x - op.x); const diff = Math.atan2(Math.sin(toMe - op.beam.ang), Math.cos(toMe - op.beam.ang));
      if (Math.abs(diff) < 0.6) {
        threat++;
        const side = diff >= 0 ? 1 : -1; const pa = op.beam.ang + Math.PI / 2 * side;
        if (me.dodgeT <= 0 && Math.random() < Math.min(1, reflex * brain * 0.85)) { me.dodgeX = Math.cos(pa) * 2.6; me.dodgeY = Math.sin(pa) * 2.6; me.dodgeT = 380; }
      }
    }
    // brecha: oponente comprometido (canalizando, conjurando, atordoado, em recarga de golpe)
    const opening = op.stun > 200 || !!op.casting || (!!op.beam && op.beam.t < 400) || op.meleeCd > 300;

    // movement: keep preferred distance + strafe
    const hpR = me.hp / d.hp, enR = d.energy > 0 ? me.en / d.energy : 1, opHpR = op.hp / op.def.hp;
    let want = d.preferredDistance;
    if (d.range === "variada") { // Gojo: alterna curta, média e longa
      me.modeT -= dt;
      const rm = d.rangeModes ?? { distances: [22, 200, 360], weights: [0.35, 0.35, 0.3], minSwitchMs: 2500, switchJitterMs: 3000 };
      if (me.modeT <= 0) { me.modeT = rm.minSwitchMs + Math.random() * rm.switchJitterMs; let r = Math.random() * rm.weights.reduce((s, w) => s + w, 0); const i = rm.weights.findIndex((w) => (r -= w) < 0); me.want = rm.distances[i < 0 ? rm.distances.length - 1 : i] ?? d.preferredDistance; }
      want = op.stun > 300 ? Math.min(...rm.distances) : me.want;
      if (hpR < 0.3 && want < 100) want = 200;
    } else if (d.range !== "curta") {
      if (hpR < 0.4) want += 80; // ferido: mais cauteloso
      if (opHpR < 0.25 && enR > 0.3) want -= 60; // fareja a vitória
    } else {
      if (enR < 0.15 && hpR < 0.35) want = 160; // recua para recuperar
      if (op.beam) want = op.beam.t < 400 ? 30 : 140; // espera o fim do feixe para punir
      if (threat > 0) want += 60;
      else if (dist < 140 && !op.beam && !op.casting) want = 20; // já colado: entra no corpo a corpo
    }
    if (d.range !== "variada") {
      me.modeT -= dt;
      if (me.modeT <= 0) { me.modeT = 1600 + Math.random() * 1800; me.want = Math.floor(Math.random() * 3); }
      want = tacticalDistance(want, me.want, me.retreatT > 0, opening, Math.hypot(op.vx, op.vy) < 0.4);
    }
    const losingMelee = dist < 100 && (me.retreatT > 0 || (hpR < 0.45 && opHpR > hpR + 0.12 && op.def.taijutsu.damage * this.dm(op) / op.def.taijutsu.cooldown > d.taijutsu.damage * this.dm(me) / d.taijutsu.cooldown));
    if (losingMelee) { me.retreatT = Math.max(me.retreatT, 1000); want = Math.max(165, want); }
    if (me.retreatT <= 0) want /= me.aggr > 1 ? me.aggr : 1;
    if (op.casting?.ab.type === "domain" && !op.casting.ab.shrine && !this.domainImmune(me, op.casting.ab) && !this.domains.length) want = DOMAIN_R + 80; // foge do domínio
    const dz = want < 80 ? 6 : 30;
    let radial = dist > want + dz ? 1 : dist < want - dz ? -1 : 0;
    if (threat > 0 && radial > 0) radial = 0; // nunca avança contra um ataque
    // evita cantos: força em direção ao centro perto das paredes
    const M = 90;
    const wx = me.x < M ? (M - me.x) / M : me.x > W - M ? -(me.x - (W - M)) / M : 0;
    const wy = me.y < M ? (M - me.y) / M : me.y > H - M ? -(me.y - (H - M)) / M : 0;
    const cornered = Math.abs(wx) > 0.4 && Math.abs(wy) > 0.4;
    if (cornered && radial < 0) radial = 0; // não recua mais para o canto
    const sf = !cornered && (opening || Math.hypot(op.vx, op.vy) < 0.4) && radial > 0 ? 0.12 : cornered ? 1.2 : d.range === "curta" ? (dist > 120 ? 0.9 : 0.35) : 0.8;
    if (d.range === "curta" && dist > 120 && me.strafeCd <= 0 && Math.random() < 0.04) { me.strafe *= -1; me.strafeCd = 500; }
    // escolhe o lado do strafe que leva ao centro
    if ((Math.abs(wx) > 0.3 || Math.abs(wy) > 0.3) && me.strafeCd <= 0) {
      const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
      me.strafe = px * (W / 2 - me.x) + py * (H / 2 - me.y) >= 0 ? 1 : -1; me.strafeCd = 900;
    }
    const tx = Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * me.strafe * sf + wx * 1.6 + ox;
    const ty = Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * me.strafe * sf + wy * 1.6 + oy;
    if (!dodge) { me.vx += (tx * spd - me.vx) * movement.acceleration; me.vy += (ty * spd - me.vy) * movement.acceleration; }
    if (me.strafeCd <= 0 && Math.random() < 0.01) { me.strafe *= -1; me.strafeCd = 700; }

    // dash único (sem custo de EA): fecha a distância em explosões
    const pathBlocked = this.orbs.some((o) => o.owner !== idx && Math.hypot(o.x - (me.x + op.x) / 2, o.y - (me.y + op.y) / 2) < 70);
    if (me.retreatT <= 0 && (d.range === "curta" || want < 60) && dist > movement.dashMinRange && dist < movement.dashMaxRange && (me.cd['dash'] ?? 0) <= 0 && !op.beam && threat === 0 && !pathBlocked && (opening || Math.random() < movement.dashChance)) {
      const zig = opening || Math.hypot(op.vx, op.vy) < 0.4 ? 0 : (Math.random() < 0.5 ? -1 : 1) * 0.25; // entra em ângulo, nunca reto
      me.vx = Math.cos(ang + zig) * spd * movement.dashSpeedMult; me.vy = Math.sin(ang + zig) * spd * movement.dashSpeedMult; me.cd['dash'] = movement.dashCooldown + Math.random() * movement.dashJitterMs;
    }
    this.updateOffensiveDash(me, op);
    // think
    me.think -= dt;
    if (me.think <= 0) { me.think = ai.thinkMs / Math.max(0.01, reflex * brain); this.decide(me, op, idx, dist, ang); this.closeWin(); }
    if (this.winner || this.blackHole) return;
    // taijutsu
    this.melee(me, op);
    this.move(me, dt);
  }

  decideHiguruma(me: Fighter, op: Fighter, idx: number, dist: number) {
    const get = (id: string) => me.def.abilities.find((a) => a.id === id);
    const dom = get("domain"), grow = get("gavelGrow"), ext = get("gavelExtend"), thr = get("gavelThrow");
    if (dom && this.ready(me, dom) && dist < DOMAIN_R * 0.6 && (op.hp / op.def.hp < 0.75 || Math.random() < 0.25)) { this.beginDomain(me, op, idx, dom); return; }
    if (thr && dist > 150 && dist < 420 && this.ready(me, thr) && Math.random() < 0.5) { this.throwGavel(me, op, idx, thr); return; }
    if (ext && dist > 90 && dist < 270 && this.ready(me, ext) && Math.random() < 0.7) { this.gavelStrike(me, op, ext); return; }
    if (grow && me.gavelBig <= 0 && dist < 140 && this.ready(me, grow) && Math.random() < 0.5) { this.use(me, grow, grow.cost ?? 0); me.gavelBig = grow.durationMs ?? 6000; this.say(`${me.def.name.split(" ")[0]}: Aumentar Martelo`); }
  }
  decide(me: Fighter, op: Fighter, idx: number, dist: number, ang: number) {
    if (me.def.id === "higuruma") { this.decideHiguruma(me, op, idx, dist); return; }
    if (me.sealed > 0) return; // técnica confiscada: só resta o corpo a corpo
    if (me.mg && decideMegumi(this, me, op, idx, dist)) return;
    const ab = (t: string) => me.def.abilities.find((a) => a.type === t);
    if (this.shouldUseBlackHole(me, op)) {
      if (this.activateBlackHole(idx)) return;
    }
    if (me.def.id === "toji") {
      const chain = ab(op.inf > 0 || op.casting || op.beam ? "chainSpear" : "tojiChain");
      if (chain && dist > 65 && dist < 750 && this.tojiAbility(me, op, idx, chain)) return;
      return;
    }
    if (me.garuda && me.garuda.massT <= 0 && dist < 400 && me.en > 100 && this.empowerGaruda(me)) return;
    if (this.decideKashimo(me, op, idx, dist, ang)) return;
    if (this.decideDoors(me, op, idx, dist, ang)) return;
    if (this.decideKenjaku(me, op, idx, dist, ang)) return;
    const pach = ab("pachinko");
    if (pach && me.jackpot <= 0 && this.ready(me, pach) && this.beginDomain(me, op, idx, pach)) { this.say(`${me.def.name}: ${pach.name}`); return;
    }
    const inf0 = ab("infinity");
    const simple = [ab("simpleDomain"), ab("hollowWicker")].find((a) => a && this.ready(me, a));
    const inShrine = this.domains.some((d) => d.owner !== idx && d.ab.shrine && Math.hypot(me.x - d.x, me.y - d.y) < d.r);
    if (simple && me.simple <= 0 && inShrine) {
      this.use(me, simple, simple.cost ?? 0); me.wicker = simple.type === "hollowWicker"; me.simple = simple.durationMs ?? 2500; me.simpleHp = simple.capacity ?? 1000;
      this.say(`${me.def.name.split(" ")[0]}: ${simple.name}`); return;
    }
    const sureHitIncoming = !!op.casting && op.casting.ab.type === "domain" && !op.casting.ab.ignoresSimple && !op.casting.ab.overloadMs;
    const danger = this.projs.some((p) => p.owner !== idx && p.dmg >= 40 && Math.hypot(p.x - me.x, p.y - me.y) < 130) || (dist < 50 && op.meleeCd <= 0 && op.def.range !== "media-longa") || op.casting?.ab.type === "purple";
    if (simple && me.simple <= 0 && sureHitIncoming && this.ready(me, simple)) {
      this.use(me, simple, (simple.cost ?? 0)); me.wicker = simple.type === "hollowWicker"; me.simple = Math.max(simple.durationMs ?? 1, (op.casting?.t ?? 0) + (op.casting?.ab.shrine ? (op.casting.ab.durationMs ?? 5000) * TIME_SCALE : 800)); me.simpleHp = simple.capacity ?? 1000;
      this.say(`${me.def.name.split(" ")[0]}: ${simple.name}`); return;
    }
    const buff = ab("buff");
    if (buff && me.def.id !== "nanami" && this.ready(me, buff) && (me.hp < me.def.hp * 0.75 || this.time > 6000)) {
      this.use(me, buff, (buff.cost ?? 0)); me.buff = buff.mult ?? null;
      this.fx.push({ kind: "ring", x: me.x, y: me.y, r: 40, color: "#e11d2e", life: 500, max: 500 });
      this.say(`${me.def.name.split(" ")[0]}: ${buff.name}`); return;
    }
    if (me.def.id === "nanami") {
      const col = ab("collapse"), rat = ab("ratio"), ot = ab("overtime");
      if (ot && this.ready(me, ot) && (me.hp < me.def.hp * 0.55 || this.time > 45000)) {
        this.use(me, ot, 0); me.buff = ot.mult ?? null; this.nanamiOvertime(me);
        this.say(`${me.def.name.split(" ")[0]}: ${ot.name}`); return;
      }
      if (this.nanamiDashes.some((d) => d.me === me)) return;
      if (col && dist > 90 && dist < (col.maxRange ?? 380) && Math.random() < 0.08 && this.nanamiCollapse(me, op, col)) return;
      if (rat && dist < (rat.hitRange ?? 46) && this.ready(me, rat) && Math.random() < 0.3) {
        this.use(me, rat, rat.cost ?? 0);
        this.fx.push({ kind: "ratio", x: op.x, y: op.y, r: 34, color: "", life: 750, max: 750, ang: ang + 0.5, seed: Math.random() });
        this.punch(me, op, (rat.damage ?? 0) * this.dm(me), rat.name, rat);
        this.say(`${me.def.name.split(" ")[0]}: ${rat.name}`); return;
      }
    }
    if (me.yz && yorozuDecide(this, me, op, idx, dist, ang, danger)) return;
    if (this.decideSukunaFinisher(me, op, idx, dist)) return;
    const inf = ab("infinity");
    const incoming = this.projs.some((p) => p.owner !== idx && Math.hypot(p.x - me.x, p.y - me.y) < 220) || dist < 70 || !!op.beam;
    if (inf && me.inf <= 0 && incoming && this.ready(me, inf)) {
      this.use(me, inf, (inf.cost ?? 0)); me.inf = (inf.durationMs ?? 1); this.say(`${me.def.name.split(" ")[0]}: ${inf.name}`); return;
    }
    const dom = ab("domain");
    const domainFinisher = dom?.overloadMs ? (op.hp / op.def.hp < 0.6 || Math.random() < 0.15) : op.hp <= (dom?.damage ?? 0) * this.dm(me) * 1.05;
    if (dom && !dom.requiresSphere && !dom.yorozuDomain && !dom.chimera && !dom.shrine && this.ready(me, dom) && dist < DOMAIN_R * 0.6 && (domainFinisher || (me.hp / me.def.hp < 0.45 && Math.random() < 0.4))) {
      if (!this.beginDomain(me, op, idx, dom)) return;
      this.say(`${me.def.name.split(" ")[0]}: ${dom.name.toUpperCase()}`); return;
    }
    const blue = ab("blue"), red = ab("red"), purple = ab("purple");
    const myBlue = this.blues.find((b) => b.owner === idx);
    const myRed = this.projs.some((p) => p.owner === idx && p.kind === "red");
    if (purple && myBlue && myRed && dist > 160 && this.ready(me, purple) && (op.stun > 300 || Math.random() < 0.3)) {
      this.use(me, purple, (purple.cost ?? 0)); me.casting = { ab: purple, t: (purple.castMs ?? 0) };
      this.say(`${me.def.name.split(" ")[0]} junta Azul e Vermelho...`); return;
    }
    if (red && !this.projs.some((p) => p.owner === idx && p.kind === "red") && dist < 520 && this.ready(me, red) && (op.stun > 0 || !!myBlue || Math.random() < 0.3)) {
      this.use(me, red, (red.cost ?? 0));
      const a = this.leadAngle(me, op, red.speed ?? 7);
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(a) * (red.speed ?? 7), vy: Math.sin(a) * (red.speed ?? 7), dmg: (red.damage ?? 0) * this.dm(me), owner: idx, kind: "red", life: red.projectileLifeMs ?? 2200, ab: red, name: red.name });
      this.say(`${me.def.name.split(" ")[0]}: ${red.name}`); return;
    }
    if (blue && !myBlue && this.ready(me, blue) && dist > 80) {
      this.use(me, blue, (blue.cost ?? 0));
      this.blues.push({ x: me.x + Math.cos(ang) * 40, y: me.y + Math.sin(ang) * 40, owner: idx, dmg: (blue.damage ?? 0) * this.dm(me), life: blue.durationMs ?? 6000, ab: blue });
      this.say(`${me.def.name.split(" ")[0]}: ${blue.name}`); return;
    }
    if (this.decideSukuna(me, op, idx, dist)) return;
    const fist = ab("fist");
    if (fist && dist < (fist.hitRange ?? SIZE + 14) && this.ready(me, fist) && (op.beam || Math.random() < 0.45 * me.aggr)) {
      this.use(me, fist, (fist.cost ?? 0));
      this.fx.push({ kind: "divergentFist", x: me.x + Math.cos(ang) * 24, y: me.y + Math.sin(ang) * 24, r: 50, color: "", life: 850, max: 850, ang });
      this.punch(me, op, this.abilityDamage(op, (fist.damage ?? 0) * this.dm(me), fist), fist.name, fist); return;
    }
    const beam = ab("beam");
    const beamFree = op.stun > 300 || (this.time > 3000 && me.def.range !== "curta" && dist > 200 && Math.random() < 0.25);
    if (beam && dist <= (beam.maxRange ?? 1200) && this.ready(me, beam, (beam.costPerTick ?? 0) * 3) && dist > 90 && beamFree) {
      this.use(me, beam, 0); me.beam = { t: (beam.durationMs ?? 1) + (beam.warmupMs ?? 450), tick: beam.warmupMs ?? 450, ab: beam, ang };
      this.say(`${me.def.name.split(" ")[0]}: ${beam.name}`); return;
    }
    const plasma = ab("plasmaJet");
    if (plasma && dist > 110 && dist < 600 && this.ready(me, plasma) && me.en - (plasma.cost ?? 0) * (me.def.costMult ?? 1) >= 75 && (op.stun > (plasma.castMs ?? 0) * 0.6 || !!op.casting || Math.random() < 0.18)) {
      this.use(me, plasma, plasma.cost ?? 0); me.casting = { ab: plasma, t: plasma.castMs ?? 0 };
      this.say(`${me.def.name.split(" ")[0]} concentra sangue para o ${plasma.name}`); return;
    }
    const stack = ab("buffPlus");
    if (stack && this.ready(me, stack) && (me.hp < me.def.hp * 0.5 || this.time > 18000)) {
      this.use(me, stack, stack.cost ?? 0); me.buff = stack.mult ?? null;
      this.say(`${me.def.name.split(" ")[0]}: ${stack.name}`); return;
    }
    const blade = ab("bloodBlade");
    if (blade && me.blade <= 0 && dist < 120 && this.ready(me, blade) && Math.random() < 0.5) {
      this.use(me, blade, blade.cost ?? 0); me.blade = blade.durationMs ?? 8000;
      this.say(`${me.def.name.split(" ")[0]}: ${blade.name}`); return;
    }
    const cut = ab("bloodSlash");
    if (cut && dist > 80 && dist < 450 && this.ready(me, cut) && (op.stun > 0 || Math.random() < 0.3)) {
      this.use(me, cut, cut.cost ?? 0); this.fireBloodSlash(me, op, idx, cut); this.say(`${me.def.name.split(" ")[0]}: ${cut.name}`); return;
    }
    const meteor = ab("bloodMeteor");
    if (meteor && dist > 60 && dist < 500 && this.ready(me, meteor) && Math.random() < 0.35) {
      this.use(me, meteor, meteor.cost ?? 0); this.fireMeteor(me, op, idx, meteor); this.say(`${me.def.name.split(" ")[0]}: ${meteor.name}`); return;
    }
    const orbs = ab("orbs");
    if (orbs && this.ready(me, orbs) && (dist > 120 || me.def.range !== "curta")) {
      this.use(me, orbs, (orbs.cost ?? 0));
      for (let i = 0; i < (orbs.count ?? 0); i++) {
        const a = ang + Math.PI + (i - 2) * 0.7, r = 70 + Math.random() * 40; // around enemy, cutting off approach
        const x = Math.max(20, Math.min(W - 20, op.x + Math.cos(a) * r * (i % 2 ? 1 : -1)));
        const y = Math.max(20, Math.min(H - 20, op.y + Math.sin(a) * r));
        this.orbs.push({ x, y, owner: idx, dmg: (orbs.damage ?? 0) * this.dm(me), stun: (orbs.stunMs ?? 0), life: orbs.durationMs ?? 9000, ab: orbs, name: orbs.name });
      }
      this.say(`${me.def.name.split(" ")[0]}: ${orbs.name}`); return;
    }
    const slash = ab("slash");
    if (slash && dist > 70 && dist < 380 && this.ready(me, slash, (slash.costPerUnit ?? 0)) && (op.stun > 0 || op.beam || Math.random() < 0.35)) {
      const reserve = dom && !me.used.has(dom.id) ? (dom.cost ?? 0) : 0;
      const want = op.stun > 0 || op.beam ? (slash.maxUnits ?? 1) : 1 + Math.floor(Math.random() * 2);
      const units = Math.min(want, Math.floor((me.en - reserve) / (slash.costPerUnit ?? 0)));
      if (units >= 1) {
        this.use(me, slash, units * (slash.costPerUnit ?? 0));
        for (let i = 0; i < units; i++) {
          const a = this.leadAngle(me, op, slash.speed ?? 9) + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.08);
          this.projs.push({ x: me.x, y: me.y, vx: Math.cos(a) * (slash.speed ?? 9), vy: Math.sin(a) * (slash.speed ?? 9), dmg: (slash.damagePerUnit ?? 0) * this.dm(me), owner: idx, kind: "slash", life: slash.projectileLifeMs ?? 1500, ab: slash, name: slash.name });
        }
        this.say(`${me.def.name.split(" ")[0]}: ${slash.name} x${units}`); return;
      }
    }
    const ball = ab("reserveBall");
    if (ball && dist > 70 && dist < 460 && this.ready(me, ball) && Math.random() < 0.45) {
      this.use(me, ball, ball.cost ?? 0);
      const a = this.leadAngle(me, op, ball.speed ?? 11);
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(a) * (ball.speed ?? 11), vy: Math.sin(a) * (ball.speed ?? 11), dmg: (ball.damage ?? 0) * this.dm(me), owner: idx, kind: "ball", life: ball.projectileLifeMs ?? 1400, ab: ball, name: ball.name });
      this.say(`${me.def.name.split(" ")[0]}: ${ball.name}`); return;
    }
    const blood = ab("bloodShot");
    const keep = me.def.abilities.reduce((m, a) => (a.type === "domain" && !me.used.has(a.id) ? (a.cost ?? 0) : a.type === "orbs" ? Math.max(m, (a.cost ?? 0)) : m), 0);
    if (blood && dist > 40 && this.ready(me, blood, (blood.costPerUnit ?? 0)) && (me.en - (blood.costPerUnit ?? 0) >= keep || op.hp / op.def.hp < 0.2) && Math.random() < 0.5 + me.aggr * 0.3) {
      const units = Math.min((blood.maxUnits ?? 1), Math.floor(me.en / (blood.costPerUnit ?? 0)));
      this.use(me, blood, units * (blood.costPerUnit ?? 0));
      // lead the target
      const a = this.leadAngle(me, op, blood.speed ?? 8);
      for (let i = 0; i < units; i++) this.projs.push({ x: me.x, y: me.y, vx: Math.cos(a + i * 0.08) * (blood.speed ?? 8), vy: Math.sin(a + i * 0.08) * (blood.speed ?? 8), dmg: (blood.damagePerUnit ?? 0) * this.dm(me), owner: idx, kind: "blood", life: blood.projectileLifeMs ?? 1800, ab: blood, name: blood.name });
    }
  }

  // ===== Sukuna =====
  inOwnShrine(me: Fighter) { const i = this.f.indexOf(me); return this.domains.some((d) => d.owner === i && d.ab.shrine && d.active); }
  sukunaAbility(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const dist = Math.hypot(op.x - me.x, op.y - me.y), ang = Math.atan2(op.y - me.y, op.x - me.x);
    if (!this.ready(me, a)) return false;
    if (a.type === "cleave" && dist > (a.hitRadius ?? 90)) return false;
    this.use(me, a, a.cost ?? 0);
    if (a.type === "fuga" || a.type === "worldSlash") { me.casting = { ab: a, t: a.castMs ?? 0 }; this.say(a.type === "fuga" ? "Sukuna prepara a Chama Divina..." : "Sukuna se concentra · o espaço começa a se dividir..."); return true; }
    if (a.type === "dismantleNet") {
      const sp = a.speed ?? 7, la = this.leadAngle(me, op, sp);
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(la) * sp, vy: Math.sin(la) * sp, dmg: (a.damage ?? 200) * this.dm(me), owner: idx, kind: "net", life: a.projectileLifeMs ?? 1800, ab: a, name: a.name });
      this.say(`Sukuna: ${a.name}`); return true;
    }
    // Clivar: potência ajustada à resistência e energia do alvo
    const dmg = ((a.damage ?? 120) + op.def.hp * 0.08 + op.def.energy * 0.06) * this.dm(me);
    this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 34, color: "", life: 300, max: 300, ang: ang + 0.8 });
    this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 34, color: "", life: 300, max: 300, ang: ang - 0.8 });
    if (this.damage(op, dmg, a.name) > 0) { op.vx += Math.cos(ang) * (a.knockback ?? 12); op.vy += Math.sin(ang) * (a.knockback ?? 12); op.stun = Math.max(op.stun, a.stunMs ?? 300); op.beam = null; }
    this.say(`Sukuna: ${a.name}`); return true;
  }
  fireSukuna(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const sp = a.speed ?? 10, la = this.leadAngle(me, op, sp), boost = a.type === "fuga" && this.inOwnShrine(me) ? 1.3 : 1;
    this.projs.push({ x: me.x, y: me.y, vx: Math.cos(la) * sp, vy: Math.sin(la) * sp, dmg: (a.damage ?? 0) * this.dm(me) * boost, owner: idx, kind: a.type === "fuga" ? "fuga" : "world", life: a.projectileLifeMs ?? 2000, ab: a, name: a.name });
    this.say(a.type === "fuga" ? `Sukuna: ABRIR · ${a.name.toUpperCase()}${boost > 1 ? " (+30% no Santuário)" : ""}` : `Sukuna: ${a.name.toUpperCase()}`);
  }
  decideSukunaFinisher(me: Fighter, op: Fighter, idx: number, dist: number) {
    const ab = (t: string) => me.def.abilities.find((a) => a.type === t);
    const world = ab("worldSlash"), dom = me.def.abilities.find((a) => a.shrine), fuga = ab("fuga");
    if (world && dist < 650 && this.ready(me, world) && (op.stun > 900 || (op.casting?.t ?? 0) > 1200 || Math.random() < 0.03)) return this.sukunaAbility(me, op, idx, world);
    if (dom && this.ready(me, dom) && !this.domains.length && dist < this.domainR(dom) * 0.8 && (op.hp / op.def.hp < 0.75 || Math.random() < 0.25)) { if (this.beginDomain(me, op, idx, dom)) { this.say(`Sukuna: ${dom.name.toUpperCase()}`); return true; } }
    if (fuga && dist > 100 && dist < 600 && this.ready(me, fuga) && (this.inOwnShrine(me) || op.stun > 600 || Math.random() < 0.12)) return this.sukunaAbility(me, op, idx, fuga);
    return false;
  }
  decideSukuna(me: Fighter, op: Fighter, idx: number, dist: number) {
    const ab = (t: string) => me.def.abilities.find((a) => a.type === t);
    const cleave = ab("cleave"), net = ab("dismantleNet");
    if (cleave && dist < (cleave.hitRadius ?? 90) && this.ready(me, cleave) && Math.random() < 0.55) return this.sukunaAbility(me, op, idx, cleave);
    if (net && dist > 110 && dist < 460 && this.ready(me, net) && Math.random() < 0.3) return this.sukunaAbility(me, op, idx, net);
    return false;
  }
  /** Mira à frente do alvo levando em conta a velocidade do projétil */
  leadAngle(me: Fighter, op: Fighter, speed: number) {
    return interceptAngle(me, op, speed);
  }
  firePlasma(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const ang = Math.atan2(op.y - me.y, op.x - me.x);
    me.beam = { ab: a, ang, t: a.durationMs ?? 2200, tick: 0 };
    this.say(`${me.def.name.split(" ")[0]}: ${a.name.toUpperCase()}`);
  }
  fireMeteor(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const sp = a.speed ?? 13, ang = this.leadAngle(me, op, sp);
    this.projs.push({ x: me.x, y: me.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: (a.damage ?? 0) * this.dm(me), owner: idx, kind: "meteor", life: a.projectileLifeMs ?? 1600, ab: a, name: a.name, shape: Math.random() * 6 });
  }
  /** Exorcismo Cortante: disco giratório ou corrente de lâminas de sangue */
  fireBloodSlash(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const sp = a.speed ?? 8, ang = this.leadAngle(me, op, sp);
    if (Math.random() < 0.5) {
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: (a.damage ?? 0) * this.dm(me), owner: idx, kind: "disc", life: a.projectileLifeMs ?? 1800, ab: a, name: `${a.name} (disco)` });
    } else {
      const n = a.count ?? 4;
      for (let k = 0; k < n; k++) this.projs.push({ x: me.x - Math.cos(ang) * k * 16, y: me.y - Math.sin(ang) * k * 16, vx: Math.cos(ang) * sp * 1.25, vy: Math.sin(ang) * sp * 1.25, dmg: ((a.damage ?? 0) / n) * this.dm(me), owner: idx, kind: "chain", life: a.projectileLifeMs ?? 1800, ab: a, name: `${a.name} (corrente)` });
    }
  }
  activateAmber(me: Fighter) {
    const ab = me.def.abilities.find((a) => a.type === "amber");
    if (!ab || me.hp <= 0 || this.winner || this.blackHole || !this.ready(me, ab)) return false;
    this.use(me, ab, ab.cost ?? 0); me.amber = (ab.durationMs ?? 20000) * TIME_SCALE;
    this.say("Kashimo: Besta Mítica Âmbar · transformação irreversível"); return true;
  }
  discharge(me: Fighter, op: Fighter) {
    const ab = me.def.abilities.find((a) => a.type === "discharge");
    if (!ab || me.hp <= 0 || op.hp <= 0 || this.winner || this.blackHole || me.charges < (ab.maxUnits ?? 3) || !this.ready(me, ab)) return false;
    this.use(me, ab, ab.cost ?? 0); me.charges = 0;
    this.fx.push({ kind: "electric", x: me.x, y: me.y, r: Math.hypot(op.x - me.x, op.y - me.y), ang: Math.atan2(op.y - me.y, op.x - me.x), color: "", life: 650, max: 650 });
    this.damage(op, (ab.damage ?? 240) * this.dm(me), "Descarga Elétrica (acerto garantido)", false);
    op.stun = Math.max(op.stun, ab.stunMs ?? 550); return true;
  }
  // Portas do Hakari: bloqueio, impacto, empurrão e combinação
  decideDoors(me: Fighter, op: Fighter, idx: number, dist: number, ang: number) {
    const door = me.def.abilities.find((a) => a.type === "doors");
    if (!door || !this.ready(me, door) || dist > 320) return false;
    const name = me.def.name.split(" ")[0], opName = op.def.name.split(" ")[0];
    let mode: Door["mode"] | null = null;
    if (op.casting || op.beam || (dist < 60 && op.meleeCd <= 0 && Math.random() < 0.5)) mode = "impacto";
    else if (dist < 70 && me.hp < me.def.hp * 0.5 && Math.random() < 0.5) mode = "empurrao";
    else if (dist > 90 && dist < 260 && Math.random() < 0.35) mode = "combinacao";
    else if (dist > 140 && Math.hypot(op.vx, op.vy) > 1 && Math.random() < 0.3) mode = "bloqueio";
    if (!mode) return false;
    return this.castDoor(me, op, idx, mode);
  }
  castDoor(me: Fighter, op: Fighter, idx: number, mode: Door["mode"]) {
    const door = me.def.abilities.find((a) => a.type === "doors");
    if (!door || !this.ready(me, door) || !["impacto", "bloqueio", "empurrao", "combinacao"].includes(mode)) return false;
    const ang = Math.atan2(op.y - me.y, op.x - me.x);
    const name = me.def.name.split(" ")[0], opName = op.def.name.split(" ")[0];
    this.use(me, door, door.cost ?? 0);
    const life = mode === "bloqueio" ? (door.blockDurationMs ?? 2600) : (door.durationMs ?? 650);
    if (mode === "bloqueio") {
      const sp = Math.hypot(op.vx, op.vy) || 1;
      const x = Math.max(25, Math.min(W - 25, op.x + (op.vx / sp) * 42)), y = Math.max(25, Math.min(H - 25, op.y + (op.vy / sp) * 42));
      this.doors.push({ x, y, owner: idx, ang: Math.atan2(op.vy, op.vx), mode, life, max: life });
      this.say(`${name}: Porta de Bloqueio no caminho de ${opName}`);
      return true;
    }
    this.doors.push({ x: op.x, y: op.y, owner: idx, ang, mode, life, max: life });
    if (mode === "impacto") {
      op.casting = null; op.beam = null; op.stun = Math.max(op.stun, door.impactStunMs ?? 350);
      this.say(`${name}: Porta de Impacto fechou contra ${opName}`);
      this.damage(op, (door.impactDamage ?? 70) * this.dm(me), `${door.name} · Impacto`);
    } else if (mode === "empurrao") {
      op.vx += Math.cos(ang) * (door.knockback ?? 13); op.vy += Math.sin(ang) * (door.knockback ?? 13); op.stun = Math.max(op.stun, door.pushStunMs ?? 380);
      this.say(`${name}: Porta de Empurrão afastou ${opName}`);
      this.damage(op, (door.pushDamage ?? 35) * this.dm(me), `${door.name} · Empurrão`);
    } else {
      op.stun = Math.max(op.stun, door.comboStunMs ?? 450);
      const spd = me.def.speed * (me.buff?.speed ?? 1) * (this.amberMult(me)?.speed ?? 1) * flightMult(me);
      me.vx = Math.cos(ang) * spd * (door.comboSpeedMult ?? 4); me.vy = Math.sin(ang) * spd * (door.comboSpeedMult ?? 4); me.dashAtk = door.comboDurationMs ?? 500;
      this.say(`${name}: portas distraíram ${opName} · abertura para golpe`);
    }
    return true;
  }
  updateDoors(dt: number) {
    for (const d of this.doors) {
      d.life -= dt;
      if (d.mode !== "bloqueio") continue;
      const t = this.f[1 - d.owner]; if (!t) continue;
      // porta orientada: espessura ao longo de d.ang, largura perpendicular
      const ax = Math.cos(d.ang), ay = Math.sin(d.ang), rx = t.x - d.x, ry = t.y - d.y;
      const along = rx * ax + ry * ay, side = -rx * ay + ry * ax;
      const ht = 4 + SIZE / 2, hw = 22 + SIZE / 2;
      if (Math.abs(along) < ht && Math.abs(side) < hw) {
        const push = Math.sign(along || -1) * ht - along;
        t.x += ax * push; t.y += ay * push;
        const vn = t.vx * ax + t.vy * ay; t.vx -= vn * ax * 1.3; t.vy -= vn * ay * 1.3;
      }
    }
    this.doors = this.doors.filter((d) => d.life > 0);
  }
  drawDoor(c: CanvasRenderingContext2D, d: Door) {
    const k = d.life / d.max, w = 44, h = 36;
    c.save(); c.translate(d.x, d.y); c.rotate(d.ang + Math.PI / 2);
    c.transform(1, 0, 0, 0.55, 0, 0); // leve perspectiva: a porta encara a direção do ataque
    c.globalAlpha = Math.min(1, k * 4);
    // impacto/empurrão: as folhas batem fechando; combinação: abrem e fecham rápido
    const open = d.mode === "bloqueio" ? 0 : d.mode === "combinacao" ? Math.abs(Math.sin((1 - k) * Math.PI * 2)) * 0.5 : Math.max(0, (k - 0.6) / 0.4);
    if (d.mode === "empurrao") c.scale(1 + (1 - k) * 0.25, 1 + (1 - k) * 0.25);
    for (const side of [-1, 1]) {
      const px = side < 0 ? -w / 2 - open * w / 2 : open * w / 2, pw = w / 2;
      c.fillStyle = "#d4d4d8"; c.fillRect(px, -h / 2, pw, h);
      c.fillStyle = "#1f9d62"; c.fillRect(px, h / 2 - 12, pw, 9);
      c.strokeStyle = "#1f6f47"; c.beginPath(); c.moveTo(px, h / 2 - 14); c.lineTo(px + pw, h / 2 - 14); c.stroke();
      c.fillStyle = "#c7cce0"; c.fillRect(px + 5, -h / 2 + 5, pw - 10, 12);
      c.strokeStyle = "#2e2e40"; c.lineWidth = 1.2; c.strokeRect(px + 5, -h / 2 + 5, pw - 10, 12);
      c.strokeStyle = "rgba(255,255,255,0.6)"; c.beginPath(); c.moveTo(px + 7, -h / 2 + 14); c.lineTo(px + 12, -h / 2 + 7); c.stroke();
      c.strokeStyle = "#2e2e40"; c.lineWidth = 2; c.strokeRect(px, -h / 2, pw, h); c.lineWidth = 1;
    }
    c.restore();
  }

  // ===== Kenjaku: espíritos amaldiçoados, Uzumaki e Sistema Antigravidade =====
  summonSpirits(me: Fighter, op: Fighter, idx: number, sp: Ability, selectedGrade?: number) {
    const mine = this.spirits.filter((s) => s.owner === idx).length;
    const big = selectedGrade !== undefined ? selectedGrade >= 3 : op.hp / op.def.hp < 0.5 || me.hp / me.def.hp < 0.5;
    const order = selectedGrade !== undefined ? [selectedGrade] : big ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
    const n = Math.min((sp.maxActive ?? 4) - mine, big ? (sp.criticalSummonCount ?? 1) : (sp.summonCount ?? 2));
    const ang = Math.atan2(op.y - me.y, op.x - me.x), names: string[] = [];
    for (let k = 0; k < n; k++) {
      const grade = order.find((i) => (me.arsenal[i] ?? 0) > 0); if (grade === undefined) break;
      me.arsenal[grade] = (me.arsenal[grade] ?? 0) - 1; const G = this.spiritGrade(me, grade);
      const angle = ang + (Math.random() - 0.5) * 2;
      this.spirits.push({ x: me.x + Math.cos(angle) * 30, y: me.y + Math.sin(angle) * 30, owner: idx, grade, hp: G.hp, cd: sp.initialCooldownMs ?? 500, life: sp.durationMs ?? 14000, seed: Math.random() * 10 });
      names.push(G.name);
    }
    this.fx.push({ kind: "ring", x: me.x, y: me.y, r: 36, color: "#4b5563", life: 450, max: 450 });
    this.say(`${me.def.name.split(" ")[0]}: Manipulação de Espíritos · ${names.join(" + ")}`);
  }
  decideKenjaku(me: Fighter, op: Fighter, idx: number, dist: number, ang: number) {
    if (!me.arsenal.length) return false;
    const ab = (t: string) => me.def.abilities.find((a) => a.type === t);
    const name = "Kenjaku", left = me.arsenal.reduce((s, n) => s + n, 0);
    const dom = ab("domain");
    const reserve = dom && this.ready(me, dom, dom.cost ?? 0) ? (dom.cost ?? 0) : 0;
    const uz = ab("uzumaki");
    if (uz && left >= 6 && dist < 520 && this.ready(me, uz) && me.en - (uz.cost ?? 0) >= reserve * 0.5 && (op.stun > 300 || op.hp < this.uzumakiPower(me) * 1.1 || Math.random() < 0.05)) {
      this.use(me, uz, uz.cost ?? 0); me.casting = { ab: uz, t: uz.castMs ?? 600 };
      this.say(`${name} comprime espíritos amaldiçoados...`); return true;
    }
    const grav = ab("gravity");
    if (grav && dist < 320 && !this.gravs.some((g) => g.owner === idx) && this.ready(me, grav) && me.en - (grav.cost ?? 0) >= reserve && (op.casting || op.beam || Math.random() < 0.3)) {
      this.use(me, grav, grav.cost ?? 0);
      const life = grav.durationMs ?? 2000;
      this.gravs.push({ x: op.x, y: op.y, owner: idx, ab: grav, r: grav.radius ?? 85, dps: (grav.damage ?? 120) * this.dm(me) / (life / 1000), life, max: life });
      op.casting = null; op.beam = null;
      this.say(`${name}: gravidade intensificada · ${op.def.name.split(" ")[0]} pressionado contra o chão`); return true;
    }
    const sp = ab("curseSpirits");
    const mine = this.spirits.filter((s) => s.owner === idx).length;
    if (sp && left > 0 && mine < (sp.maxActive ?? 4) && this.ready(me, sp)) {
      this.use(me, sp, sp.cost ?? 0);
      this.summonSpirits(me, op, idx, sp); return true;
    }
    return false;
  }
  uzumakiPower(me: Fighter) {
    const a = me.def.abilities.find((a) => a.type === "uzumaki");
    const take = me.arsenal.map((n) => Math.ceil(n * Math.min(1, Math.max(0, a?.consumeFraction ?? 0.5))));
    return ((a?.damage ?? 100) + take.reduce((s, n, i) => s + n * this.spiritGrade(me, i).power, 0)) * this.dm(me);
  }
  fireUzumaki(me: Fighter, op: Fighter, idx: number, a: Ability) {
    const dmg = this.uzumakiPower(me), special = (me.arsenal[4] ?? 0) > 0;
    me.arsenal = me.arsenal.map((n) => n - Math.ceil(n * Math.min(1, Math.max(0, a.consumeFraction ?? 0.5))));
    // também comprime os espíritos que estão em campo
    const field = a.consumeFieldSpirits === false ? [] : this.spirits.filter((s) => s.owner === idx); if (a.consumeFieldSpirits !== false) this.spirits = this.spirits.filter((s) => s.owner !== idx);
    const bonus = field.reduce((s, x) => s + this.spiritGrade(me, x.grade).power, 0) * this.dm(me);
    const pa = Math.atan2(op.y - me.y, op.x - me.x);
    this.projs.push({ x: me.x, y: me.y, vx: Math.cos(pa) * (a.speed ?? 8.5), vy: Math.sin(pa) * (a.speed ?? 8.5), dmg: dmg + bonus, owner: idx, kind: "uzumaki", life: a.projectileLifeMs ?? 2400, ab: a, stun: special ? (a.specialStunMs ?? 900) : (a.stunMs ?? 400), name: a.name.toUpperCase() });
    this.say(`Kenjaku: UZUMAKI · ${Math.round(dmg + bonus)} de poder${special ? " · técnica do espírito de grau especial extraída" : ""}`);
  }
  updateKenjaku(dt: number) {
    for (const g of this.gravs) {
      g.life -= dt; const t = this.f[1 - g.owner]; if (!t || t.hp <= 0) continue;
      if (Math.hypot(t.x - g.x, t.y - g.y) < g.r + SIZE / 2) {
        t.vx *= g.ab?.slowMult ?? 0.55; t.vy *= g.ab?.slowMult ?? 0.55; t.dodgeT = 0; t.stun = Math.max(t.stun, g.ab?.stunMs ?? 120);
        if (g.dps > 0) { this.damage(t, this.abilityDamage(t, g.dps * dt / 1000, g.ab), g.ab?.name ?? "Gravidade", false, false, true); t.flash = 60; }
      }
    }
    this.gravs = this.gravs.filter((g) => g.life > 0);
    for (const s of this.spirits) {
      s.life -= dt; s.cd -= dt;
      const t = this.f[1 - s.owner], owner = this.f[s.owner]; if (!t || !owner) continue;
      const G = this.spiritGrade(owner, s.grade);
      const rx = t.x - s.x, ry = t.y - s.y, r = Math.hypot(rx, ry) || 1;
      const wob = Math.sin(this.time / 200 + s.seed) * 0.8;
      if (r > SIZE / 2 + G.r) { s.x += (rx / r * G.spd - ry / r * wob) * dt / 16; s.y += (ry / r * G.spd + rx / r * wob) * dt / 16; }
      else if (s.cd <= 0) { s.cd = G.cooldown; this.damage(t, G.dmg * (this.f[s.owner] ? this.dm(this.f[s.owner] as Fighter) : 1), `Espírito ${G.name}`); }
      // o oponente se defende: golpeia espíritos colados e projéteis os atingem
      if (r < SIZE + G.r) s.hp -= t.def.taijutsu.damage * dt / Math.max(250, t.def.taijutsu.cooldown);
      for (const p of this.projs) if (p.owner !== s.owner && p.life > 0 && Math.hypot(p.x - s.x, p.y - s.y) < G.r + 6) { s.hp -= p.dmg; if (p.kind !== "purple" && p.kind !== "uzumaki" && p.kind !== "plasma") p.life = 0; }
      if (s.hp <= 0) this.fx.push({ kind: "boom", x: s.x, y: s.y, r: 16 + G.r, color: "rgba(75,85,99,0.6)", life: 300, max: 300 });
    }
    this.spirits = this.spirits.filter((s) => s.hp > 0 && s.life > 0);
  }
  drawKenjaku(c: CanvasRenderingContext2D) {
    for (const g of this.gravs) {
      const k = g.life / g.max; c.save(); c.globalAlpha = Math.min(1, k * 3) * 0.8;
      c.fillStyle = "rgba(10,10,10,0.45)"; c.beginPath(); c.arc(g.x, g.y, g.r, 0, 7); c.fill();
      c.strokeStyle = "#71717a";
      for (let i = 0; i < 3; i++) { const rr = g.r * (1 - ((this.time / 600 + i / 3) % 1)); c.beginPath(); c.arc(g.x, g.y, rr, 0, 7); c.stroke(); }
      c.restore();
    }
    for (const s of this.spirits) {
      const G = sg(s.grade);
      c.save(); c.translate(s.x, s.y); c.rotate(Math.sin(this.time / 300 + s.seed) * 0.3);
      c.fillStyle = s.grade === 4 ? "#3f0d12" : "#27272a"; c.strokeStyle = s.grade >= 3 ? "#a1a1aa" : "#52525b";
      c.beginPath();
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, rr = G.r * (i % 2 ? 0.7 : 1.1); if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#e5e7eb"; c.beginPath(); c.arc(-G.r * 0.3, -G.r * 0.2, 1.5, 0, 7); c.arc(G.r * 0.3, -G.r * 0.2, 1.5, 0, 7); c.fill();
      c.restore();
    }
  }
  drawUzumaki(c: CanvasRenderingContext2D, p: Proj) {
    const a = Math.atan2(p.vy, p.vx), L = 150;
    c.save(); c.translate(p.x, p.y); c.rotate(a);
    const grad = c.createLinearGradient(-L, 0, 0, 0); grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.95)");
    c.fillStyle = grad; c.beginPath(); c.moveTo(-L, -10); c.lineTo(0, -26); c.lineTo(0, 26); c.lineTo(-L, 10); c.closePath(); c.fill();
    c.strokeStyle = "rgba(212,212,216,0.55)"; c.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { const x = -((this.time / 4 + i * 30) % L); const h = 10 + 16 * (1 + x / L); c.beginPath(); c.ellipse(x, 0, 5, h, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = "#000"; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.fill();
    c.strokeStyle = "#a1a1aa"; c.beginPath();
    for (let t = 0; t < 18; t += 0.3) { const r = t * 1.4, aa = t + this.time / 60; if (t) c.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); else c.moveTo(0, 0); }
    c.stroke(); c.restore(); c.lineWidth = 1;
  }

  fireKashimoWave(me: Fighter, op: Fighter, idx: number, a: Ability) {
    if (!this.ready(me, a) || me.hp <= 0 || op.hp <= 0) return false;
    if ((a.type === "soundwave" || a.type === "electromagnetic") && me.amber <= 0) return false;
    if (a.type === "staffElectric" && me.weaponHp <= 0) return false;
    this.use(me, a, a.cost ?? 0);
    // Onda Sonora: rajada contínua que sai do Kashimo e ele mesmo direciona
    if (a.type === "soundwave") { me.beam = { ab: a, ang: Math.atan2(op.y - me.y, op.x - me.x), t: a.durationMs ?? 1500, tick: 0 }; this.say(`Kashimo: ${a.name}`); return true; }
    const ang = Math.atan2(op.y - me.y, op.x - me.x), count = a.type === "electromagnetic" ? a.count ?? 9 : 1;
    const kind = a.type === "soundwave" ? "sound" : a.type === "electromagnetic" ? "electromagnetic" : "electric";
    const origin = a.type === "staffElectric" ? this.kashimoStaffTip(me, op) : { x: me.x + Math.cos(ang) * (a.type === "soundwave" ? 18 : 0), y: me.y + Math.sin(ang) * (a.type === "soundwave" ? 18 : 0) };
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 0.065;
      const x = origin.x - Math.sin(ang) * offset * 55, y = origin.y + Math.cos(ang) * offset * 55;
      this.projs.push({ x, y, originX: x, originY: y, vx: Math.cos(ang + offset) * (a.speed ?? 10), vy: Math.sin(ang + offset) * (a.speed ?? 10), dmg: (a.damage ?? 0) * this.dm(me) / count, owner: idx, kind, life: a.projectileLifeMs ?? 1000, ab: a, name: a.name, shape: i });
    }
    if (a.type === "staffElectric") this.fx.push({ kind: "electric", x: origin.x, y: origin.y, r: 24, color: "", life: 300, max: 300 });
    this.say(`Kashimo: ${a.name}`); return true;
  }
  kashimoStaffTip(me: Fighter, op: Fighter) {
    const a = Math.atan2(op.y - me.y, op.x - me.x) + Math.PI / 2 + (me.meleeCd > 250 ? 0.7 : 0);
    const reach = 45 * (me.def.weapon?.visualScale ?? 1);
    return { x: me.x + 19 + Math.sin(a) * reach, y: me.y - Math.cos(a) * reach };
  }
  decideKashimo(me: Fighter, op: Fighter, idx: number, dist: number, ang: number) {
    if (!me.def.abilities.some((a) => a.type === "electricEnergy") || me.hp <= 0 || op.hp <= 0) return false;
    if (this.discharge(me, op)) return true;
    if (me.amber <= 0 && me.hp / me.def.hp < 0.45 && op.hp / op.def.hp > 0.3 && this.activateAmber(me)) return true;
    const waves = me.def.abilities.filter((a) => me.amber > 0 ? ["soundwave", "electromagnetic", "staffElectric"].includes(a.type) : a.type === "staffElectric");
    for (const wave of waves) if (dist > 60 && dist < (wave.maxRange ?? 400) && this.fireKashimoWave(me, op, idx, wave)) return true;
    return false;
  }

  decideYorozu(me: Fighter, op: Fighter, idx: number, dist: number, ang: number, danger: boolean) {
    const ab = (t: string) => me.def.abilities.find((a) => a.type === t);
    const name = me.def.name.split(" ")[0];
    const armor = ab("insectArmor");
    if (armor && me.armor <= 0 && this.ready(me, armor) && (dist < 160 || me.hp < me.def.hp * 0.7)) {
      this.use(me, armor, armor.cost ?? 0); me.armor = armor.hp ?? 500; me.buff = armor.mult ?? null;
      this.fx.push({ kind: "ring", x: me.x, y: me.y, r: 36, color: "#65a30d", life: 500, max: 500 });
      this.say(`${name}: ${armor.name}`); return true;
    }
    const sphere = ab("perfectSphere"), dom = me.def.abilities.find((a) => a.type === "domain" && a.requiresSphere);
    if (me.sphere) {
      if (dom && this.ready(me, dom) && dist < DOMAIN_R * 0.75) {
        if (!this.beginDomain(me, op, idx, dom)) return false;
        this.say(`${name}: ${dom.name.toUpperCase()}`); return true;
      }
      if (dist < 450 && (!dom || !this.ready(me, dom) || op.stun > 0) && Math.random() < 0.4) {
        me.sphere = false; const a = this.leadAngle(me, op, sphere?.speed ?? 4.5);
        this.projs.push({ x: me.x, y: me.y, vx: Math.cos(a) * (sphere?.speed ?? 4.5), vy: Math.sin(a) * (sphere?.speed ?? 4.5), dmg: 0, owner: idx, kind: "sphere", life: sphere?.projectileLifeMs ?? 3500, ...(sphere ? { ab: sphere } : {}), name: sphere?.name ?? "" });
        this.say(`${name} arremessa a Esfera Perfeita`); return true;
      }
    } else if (sphere && !me.casting && this.ready(me, sphere) && (dist > 170 || op.stun > 400) && Math.random() < 0.35) {
      this.use(me, sphere, sphere.cost ?? 0); me.casting = { ab: sphere, t: sphere.castMs ?? 0 };
      this.say(`${name} começa a criar a Esfera Perfeita...`); return true;
    }
    const metal = ab("liquidMetal");
    if (metal && this.ready(me, metal)) {
      if (danger && me.metal <= 0) { this.use(me, metal, metal.cost ?? 0); this.castMetal(me, idx, metal, ang, true); return true; }
      if (dist > 50 && dist < 320 && Math.random() < 0.35) {
        this.use(me, metal, metal.cost ?? 0);
        this.castMetal(me, idx, metal, ang, false);
        this.say(`${name}: ${metal.name}`); return true;
      }
    }
    const cons = ab("construct");
    const cpu = cons?.costPerUnit ?? 0;
    if (cons && this.ready(me, cons, cpu) && Math.random() < 0.55) {
      const reserve = sphere && !me.sphere && (me.cd[sphere.id] ?? 0) <= 0 ? (sphere.cost ?? 0) : 0;
      const want = op.stun > 0 ? (cons.maxUnits ?? 1) : 1 + Math.floor(Math.random() * (cons.maxUnits ?? 1));
      const units = Math.min(want, Math.floor((me.en - reserve) / cpu));
      if (units < 1) return false;
      this.use(me, cons, units * cpu);
      this.castConstruction(me, op, idx, cons, ang, units);
      return true;
    }
    return false;
  }

  castMetal(me: Fighter, idx: number, a: Ability, ang: number, shield: boolean) {
    if (shield) { me.metal = a.durationMs ?? 1; this.say(`${me.def.name.split(" ")[0]}: escudo de ${a.name}`); return; }
    const count = a.count ?? 3;
    for (let j = 0; j < count; j++) {
      const angle = ang + (j - (count - 1) / 2) * 0.1;
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(angle) * (a.speed ?? 10), vy: Math.sin(angle) * (a.speed ?? 10), dmg: ((a.damage ?? 0) / Math.max(1, count)) * this.dm(me), owner: idx, kind: "metal", life: a.projectileLifeMs ?? 900, ab: a, name: a.name });
    }
  }
  castConstruction(me: Fighter, op: Fighter, idx: number, a: Ability, ang: number, units: number) {
    const dmg = units * (a.damagePerUnit ?? 0) * this.dm(me);
    if (Math.hypot(op.x - me.x, op.y - me.y) < SIZE + 22) {
      this.fx.push({ kind: "slash", x: op.x, y: op.y, r: 20 + units * 5, color: "#d4d4d8", life: 260, max: 260, ang: ang + 1.2 });
      this.punch(me, op, dmg, `Construção: arma x${units}`);
    } else {
      this.projs.push({ x: me.x, y: me.y, vx: Math.cos(ang) * (a.speed ?? 8), vy: Math.sin(ang) * (a.speed ?? 8), dmg, owner: idx, kind: "construct", life: a.projectileLifeMs ?? 1600, ab: a, shape: 3 + Math.floor(Math.random() * 4), name: a.name });
      this.say(`${me.def.name.split(" ")[0]}: Construção x${units}`);
    }
  }
  stellarPunch(me: Fighter, op: Fighter, requestedUnits?: number) {
    const a = me.def.abilities.find((a) => a.type === "starRage");
    if (!a || this.winner || this.blackHole) return;
    const unitCost = (a.costPerUnit ?? 13) * (me.def.costMult ?? 1), bonus = a.damagePerUnit ?? 5;
    const affordable = Math.floor(me.en / unitCost);
    const desired = requestedUnits ?? Math.max(1, Math.ceil((Math.min(op.hp, a.targetDamage ?? 160) - me.def.taijutsu.damage) / bonus));
    const units = Math.min(affordable, Math.max(0, Math.floor(desired)));
    me.en -= units * unitCost;
    me.starForce = me.def.taijutsu.damage + units * bonus;
    this.say(`Fúria Estelar: soco ${me.starForce} · -${units * unitCost} EA`);
    this.punch(me, op, me.starForce * this.dm(me), "Fúria Estelar");
  }

  shouldUseBlackHole(me: Fighter, op: Fighter) {
    // Rage builds from actual damage; sacrifice only when defeat is close, not in an even fight.
    return me.def.abilities.some((a) => a.type === "blackHole") && me.hp > 0 &&
      me.anger >= 1 && me.hp / me.def.hp <= combatDefaults.blackHoleTrigger.maxHpRatio && op.hp / op.def.hp > (me.hp / me.def.hp) * combatDefaults.blackHoleTrigger.opponentHpRatioMult;
  }

  activateBlackHole(idx: number) {
    const me = this.f[idx];
    if (!me || this.winner || this.blackHole || me.hp <= 0) return false;
    const a = me.def.abilities.find((a) => a.type === "blackHole");
    if (!a || me.en <= 0 || !this.ready(me, a)) return false;
    const spent = a.consumeAllEnergy !== false ? me.en : (a.cost ?? 0) * (me.def.costMult ?? 1);
    this.use(me, a, spent / (me.def.costMult ?? 1));
    this.blackHole = { x: me.x, y: me.y, t: a.durationMs ?? 1500, owner: idx };
    for (const f of this.f) { f.casting = null; f.beam = null; }
    this.say(`Yuki enfurecida: BURACO NEGRO! Sacrifício · -${Math.round(spent)} EA · toda a arena`);
    return true;
  }

  garudaGuard(me: Fighter, damage: number, src: string) {
    const g = me.garuda;
    if (!g || g.hp <= 0 || g.mode !== "guard") return false;
    const absorbed = Math.min(g.hp, Math.round(damage));
    g.hp = Math.max(0, g.hp - absorbed);
    this.say(`Garuda protegeu Yuki de ${src} · -${absorbed} vida`);
    this.fx.push({ kind: "ring", x: g.x, y: g.y, r: 28, color: me.def.color, life: 300, max: 300 });
    if (g.hp <= 0) { this.say("Garuda foi destruído"); if (damage > absorbed) this.damage(me, damage - absorbed, src, false); }
    return true;
  }

  updateGaruda(me: Fighter, op: Fighter, dt: number) {
    const g = me.garuda, companion = me.def.companion;
    if (!g || !companion || !op || g.hp <= 0 || me.hp <= 0 || this.winner) return;
    g.cd -= dt; g.t -= dt; g.massT = Math.max(0, g.massT - dt);
    const dist = Math.hypot(op.x - me.x, op.y - me.y);
    if (g.mode === "ball") {
      g.x += g.vx * dt / 16; g.y += g.vy * dt / 16;
      if (Math.hypot(g.x - op.x, g.y - op.y) < (companion.hitRadius ?? 28)) {
        this.garudaHit(me, op, companion.projectileDamage ?? 65, "Garuda (projétil)"); g.mode = "return";
      } else if (g.t <= 0 || g.x < 0 || g.x > W || g.y < 0 || g.y > H) g.mode = "return";
      return;
    }
    const danger = !!op.beam || this.projs.some((p) => this.f[p.owner] !== me && Math.hypot(p.x - me.x, p.y - me.y) < 180) || (dist < 65 && op.meleeCd <= 0);
    if (g.mode === "return") {
      g.x += (me.x + 38 - g.x) * Math.min(1, dt / 140); g.y += (me.y - 25 - g.y) * Math.min(1, dt / 140);
      if (Math.hypot(g.x - me.x - 38, g.y - me.y + 25) < 10) g.mode = "follow";
      return;
    }
    if (g.mode === "whip" && g.t > 0) return;
    g.mode = danger ? "guard" : "follow";
    const ang = Math.atan2(op.y - me.y, op.x - me.x);
    g.x = Math.max(15, Math.min(W - 15, me.x + (danger ? Math.cos(ang) * 30 : 38)));
    g.y = Math.max(15, Math.min(H - 15, me.y + (danger ? Math.sin(ang) * 30 : -25)));
    if (danger || g.cd > 0 || me.stun > 0) return;
    g.cd = companion.cooldown ?? 1800;
    if (dist < (companion.meleeRange ?? 65)) this.garudaHit(me, op, companion.damage ?? 30, "Garuda (ataque)");
    else if (dist < (companion.whipRange ?? 180)) {
      g.mode = "whip"; g.t = companion.whipDurationMs ?? 350; g.x = op.x; g.y = op.y;
      this.garudaHit(me, op, companion.whipDamage ?? 45, "Garuda (chicote)");
    } else {
      g.mode = "ball"; g.t = companion.projectileDurationMs ?? 1400; g.vx = Math.cos(ang) * (companion.speed ?? 8); g.vy = Math.sin(ang) * (companion.speed ?? 8);
      this.say("Garuda: projétil em forma de bola");
    }
  }

  move(f: Fighter, dt: number) {
    const movement = this.rules(f, "movement");
    f.x += f.vx * dt / 16; f.y += f.vy * dt / 16; f.vx *= movement.friction; f.vy *= movement.friction;
    const m = SIZE / 2;
    const hit = f.x < m || f.x > W - m || f.y < m || f.y > H - m;
    if (hit && f.stun > 0 && !f.wallHit && Math.hypot(f.vx, f.vy) > movement.wallMinSpeed) { f.wallHit = true; this.damage(f, movement.wallDamage, "Impacto na parede", false); }
    if (!hit) f.wallHit = false;
    if (f.x < m || f.x > W - m) { f.x = Math.max(m, Math.min(W - m, f.x)); f.vx *= -movement.wallBounce; }
    if (f.y < m || f.y > H - m) { f.y = Math.max(m, Math.min(H - m, f.y)); f.vy *= -movement.wallBounce; }
    this.confine(f);
  }

  // Vazio Ilimitado: barreira desenhada em código (esfera cósmica infinita)
  drawVoid(c: CanvasRenderingContext2D) {
    const a = Math.min(1, this.voidT / 350), R = DOMAIN_R, x = this.voidX, y = this.voidY, t = this.time;
    c.save(); c.globalAlpha = a;
    
    c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = "#03040c"; c.fill(); c.clip();
    for (let i = 0; i < 6; i++) { c.strokeStyle = `rgba(147,197,253,${0.07 + i * 0.02})`; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y, R * (0.25 + i * 0.13), R * (0.08 + i * 0.05), t / 3000 + i * 0.5, 0, 7); c.stroke(); }
    c.fillStyle = "#e0f2fe";
    for (let i = 0; i < 90; i++) { const s = Math.sin(i * 12.9898) * 43758.5453, fr = s - Math.floor(s); const ang = i * 2.399 + t / (4000 + i * 40), dd = Math.sqrt(fr) * R; const sz = i % 9 === 0 ? 2 : 1; c.fillRect(x + Math.cos(ang) * dd, y + Math.sin(ang) * dd, sz, sz); }
    const pulse = 18 + Math.sin(t / 150) * 4;
    c.fillStyle = "rgba(255,255,255,0.12)"; c.beginPath(); c.arc(x, y, pulse * 2.2, 0, 7); c.fill();
    c.fillStyle = "rgba(255,255,255,0.85)"; c.beginPath(); c.arc(x, y, pulse * 0.5, 0, 7); c.fill();
    c.restore(); c.save(); c.globalAlpha = a;
    c.strokeStyle = "rgba(125,211,252,0.3)"; c.lineWidth = 8; c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke();
    c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke();
    c.font = "9px monospace"; c.textAlign = "center"; c.fillStyle = "rgba(255,255,255,0.7)"; c.fillText("Vazio Ilimitado", x, y - R - 6);
    c.restore();
  }

  drawDivergentFist(c: CanvasRenderingContext2D, e: Fx) {
    const tokens = styleTokens;
    const blue = tokens.getPropertyValue("--divergent-blue").trim();
    const cyan = tokens.getPropertyValue("--divergent-cyan").trim();
    const light = tokens.getPropertyValue("--divergent-light").trim();
    const progress = 1 - e.life / e.max;
    c.save(); c.translate(e.x, e.y); c.rotate(e.ang ?? 0);
    c.scale(0.4, 0.4);
    c.lineJoin = "round"; c.lineCap = "round";
    // Only the energy: layered, irregular flame tongues like the reference, no hand.
    for (let layer = 0; layer < 3; layer++) {
      c.save(); c.scale(1 - layer * 0.14, 1 - layer * 0.11);
      c.globalAlpha *= layer === 0 ? 0.55 : 0.85;
      c.fillStyle = layer === 1 ? blue : cyan;
      c.beginPath(); c.moveTo(-17, 16);
      c.bezierCurveTo(-40, 4, -31, -25, -23, -43);
      c.lineTo(-28, -35); c.bezierCurveTo(-22, -62, -34, -81, -16, -111);
      c.bezierCurveTo(-24, -82, -9, -71, -10, -60);
      c.lineTo(-1, -83); c.bezierCurveTo(5, -57, -4, -44, 7, -32);
      c.lineTo(15, -52); c.bezierCurveTo(11, -24, 35, -11, 27, 12);
      c.bezierCurveTo(18, 28, -4, 30, -17, 16); c.closePath(); c.fill();
      c.restore();
    }
    c.strokeStyle = light; c.lineWidth = 2; c.globalAlpha *= 0.85;
    for (let i = 0; i < 4; i++) {
      const sway = Math.sin(progress * 16 + i * 2) * 4;
      c.beginPath(); c.moveTo(-22 + i * 12, 7);
      c.bezierCurveTo(-30 + i * 11, -18, -15 + i * 7 + sway, -34, -15 + i * 6, -57 - i * 9); c.stroke();
    }
    c.restore();
  }

  drawDomains(c: CanvasRenderingContext2D) {
    const tokens = styleTokens;
    const energy = tokens.getPropertyValue("--jackpot-energy").trim(), light = tokens.getPropertyValue("--jackpot-light").trim();
    for (const d of this.domains) {
      c.save(); c.strokeStyle = d.ab.shrine ? "rgba(220,38,38,0.6)" : d.ab.type === "pachinko" ? energy : tokens.getPropertyValue("--foreground").trim();
      c.lineWidth = 3; c.beginPath(); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.09; c.fillStyle = c.strokeStyle; c.fill(); c.globalAlpha = 1;
      c.clip();
      if (d.ab.shrine) {
        c.fillStyle = "rgba(120,6,12,0.42)"; c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        c.strokeStyle = "rgba(10,0,0,0.85)"; c.lineWidth = 2;
        for (let i = 0; i < 26; i++) { const r1 = Math.sin(i * 91.7 + Math.floor(this.time / 90)) * 0.5 + 0.5, r2 = Math.sin(i * 37.3 + Math.floor(this.time / 90)) * 0.5 + 0.5, a = r1 * Math.PI, x = d.x + (r2 - 0.5) * d.r * 1.6, y = d.y + (r1 - 0.5) * d.r * 1.6, L = 14 + r2 * 22; c.beginPath(); c.moveTo(x - Math.cos(a) * L, y - Math.sin(a) * L); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); }
        c.fillStyle = "rgba(255,220,220,0.9)"; c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillText("SANTUÁRIO MALEVOLENTE", d.x, d.y - 60);
      }
      if (d.ab.yorozuDomain) drawTripleAffliction(this, c, d);
      if (d.ab.chimera) drawChimeraGarden(this, c, d);
      if (d.ab.gravity) {
        // Profusão do Útero: interior orgânico escuro com anéis gravitacionais
        c.fillStyle = "rgba(40,8,14,0.55)"; c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        c.strokeStyle = "rgba(161,161,170,0.35)";
        for (let i = 0; i < 6; i++) { const rr = d.r * (1 - ((this.time / 900 + i / 6) % 1)); c.beginPath(); c.arc(d.x, d.y, rr, 0, 7); c.stroke(); }
        c.strokeStyle = "rgba(120,20,30,0.6)";
        for (let i = 0; i < 10; i++) { const a = i * 0.63 + this.time / 4000; c.beginPath(); c.moveTo(d.x, d.y); c.quadraticCurveTo(d.x + Math.cos(a + 0.5) * d.r * 0.5, d.y + Math.sin(a + 0.5) * d.r * 0.5, d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r); c.stroke(); }
      }
      if (d.ab.trial) {
        // Sentença Mortal: tribunal sombrio — penumbra vermelha, Judgeman gigante pairando, réu enjaulado
        c.fillStyle = "rgba(26,8,6,0.85)"; c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        // feixes de luz vermelha caindo do teto
        c.fillStyle = "rgba(153,27,27,0.15)";
        for (let i = 0; i < 5; i++) { const bx = d.x - d.r + (i + 0.5) * d.r * 0.4; c.beginPath(); c.moveTo(bx - 22, d.y - d.r); c.lineTo(bx + 22, d.y - d.r); c.lineTo(bx + 56, d.y + d.r); c.lineTo(bx - 56, d.y + d.r); c.closePath(); c.fill(); }
        // Judgeman gigante no topo do tribunal
        c.save(); c.translate(d.x, d.y - d.r * 0.5); c.scale(2.6, 2.6); c.globalAlpha = 0.95;
        this.drawJudgemanShape(c);
        c.restore(); c.globalAlpha = 1;
        // balaustrada de madeira curva na base do tribunal
        c.strokeStyle = "rgba(146,90,43,0.9)"; c.lineWidth = 5;
        c.beginPath(); c.arc(d.x, d.y + d.r * 0.95, d.r * 0.75, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        c.lineWidth = 2;
        for (let i = 0; i <= 8; i++) { const ba = Math.PI * (1.15 + i * 0.0875); const bx = d.x + Math.cos(ba) * d.r * 0.75, by = d.y + d.r * 0.95 + Math.sin(ba) * d.r * 0.75; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + 14); c.stroke(); }
        // jaula do réu
        const reu = this.f[1 - d.owner];
        if (reu) {
          c.strokeStyle = "rgba(113,63,18,0.95)"; c.lineWidth = 2.5;
          for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(reu.x + i * 9, reu.y - 26); c.lineTo(reu.x + i * 9, reu.y + 26); c.stroke(); }
          c.beginPath(); c.moveTo(reu.x - 22, reu.y - 26); c.lineTo(reu.x + 22, reu.y - 26); c.moveTo(reu.x - 22, reu.y + 26); c.lineTo(reu.x + 22, reu.y + 26); c.stroke();
        }
        c.font = "bold 12px monospace"; c.textAlign = "center"; c.fillStyle = "rgba(253,224,71,0.95)";
        c.fillText("SENTENÇA MORTAL", d.x, d.y - d.r + 20);
        c.font = "10px monospace"; c.fillStyle = "rgba(254,240,138,0.9)";
        c.fillText(d.trialT !== undefined && d.trialT > 0 ? `ACUSAÇÃO: ${(d.accusation ?? "").toUpperCase()}` : `VEREDITO: ${d.verdict ?? "—"}`, d.x, d.y - d.r + 36);
      }
      if (d.ab.type === "pachinko") {
        const surface = tokens.getPropertyValue("--pachinko-background").trim(), ink = tokens.getPropertyValue("--pachinko-ink").trim();
        c.fillStyle = surface; c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        const elapsed = (d.duration - d.remaining) / TIME_SCALE, roundTime = elapsed - d.round * 3000;
        // Two opposing banks leave the central combat aisle unobstructed.
        for (const side of [-1, 1]) for (let machine = 0; machine < 5; machine++) {
          const x = d.x + side * 150, y = d.y - 160 + machine * 78;
          c.fillStyle = tokens.getPropertyValue("--pachinko-cabinet").trim(); c.fillRect(x - 39, y - 34, 78, 68);
          c.strokeStyle = energy; c.lineWidth = 2; c.strokeRect(x - 39, y - 34, 78, 68);
          c.fillStyle = ink; c.font = "bold 7px monospace"; c.textAlign = "center"; c.fillText(d.won ? "★ JACKPOT ★" : "PACHINKO", x, y - 22);
          for (let reel = 0; reel < 3; reel++) {
            const rx = x - 32 + reel * 22, locked = d.revealed || roundTime >= 2400 + reel * 700;
            c.save(); c.beginPath(); c.rect(rx, y - 16, 20, 30); c.clip(); c.fillStyle = surface; c.fillRect(rx, y - 16, 20, 30);
            c.fillStyle = d.won ? energy : ink; c.font = "bold 18px monospace";
            if (locked) c.fillText(String(d.symbols[reel]), rx + 10, y + 6);
            else { const speed = 160 + reel * 40 + machine * 9, scroll = (elapsed / speed) % 1; for (let row = -1; row <= 1; row++) c.fillText(String(1 + (Math.floor(elapsed / speed) + row + machine + 70) % 7), rx + 10, y + 6 + (row + scroll) * 26); }
            c.restore(); c.strokeStyle = ink; c.lineWidth = 0.6; c.strokeRect(rx, y - 16, 20, 30);
          }
          c.fillStyle = ink; c.font = "7px monospace"; c.fillText(d.won ? "777" : d.mode, x, y + 26);
          for (let i = 0; i < 6; i++) { c.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(this.time / 250 + i + machine)); c.fillStyle = energy; c.fillRect(x - 30 + i * 12, y - 32, 3, 3); }
          c.globalAlpha = 1;
        }
        c.fillStyle = ink; c.textAlign = "center"; c.font = "bold 11px monospace";
        c.fillText(d.won ? "★ JACKPOT ★" : "APOSTA DA MORTE PRIVADA", d.x, d.y - 204);
        if (!d.won && this.f[d.owner]?.def.passives?.some((p) => p.id === "jackpotIndicator")) {
          const bw = 150, bx = d.x - bw / 2, by = d.y + 182;
          c.fillStyle = tokens.getPropertyValue("--pachinko-cabinet").trim(); c.fillRect(bx, by, bw, 7);
          c.fillStyle = energy; c.fillRect(bx, by, bw * d.indicator, 7);
          c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(bx, by, bw, 7);
          c.fillStyle = ink; c.font = "7px monospace"; c.fillText("🎰 INDICADOR DE JACKPOT", d.x, by - 3);
        }
        c.font = "10px monospace"; c.fillText(`${d.mode} · ${d.round + 1}/3 · ${Math.max(0, d.remaining / TIME_SCALE / 1000).toFixed(1)}s`, d.x, d.y + 205);
      }
      c.restore();
    }
  }
  drawElectric(c: CanvasRenderingContext2D, x: number, y: number, radius: number, amber = false, angle?: number) {
    const tokens = styleTokens;
    c.save(); c.strokeStyle = tokens.getPropertyValue(amber ? "--kashimo-amber" : "--kashimo-electric").trim(); c.lineWidth = amber ? 3 : 1.8;
    c.beginPath();
    if (angle !== undefined) {
      c.moveTo(x, y); for (let i = 1; i <= 12; i++) { const r = radius * i / 12, off = i === 12 ? 0 : Math.sin(i * 7 + this.time / 60) * 12; c.lineTo(x + Math.cos(angle) * r - Math.sin(angle) * off, y + Math.sin(angle) * r + Math.cos(angle) * off); }
    } else for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5 + this.time / 450; c.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      for (let i = 1; i < 5; i++) { const r = radius * i / 4, aa = a + Math.sin(i * 3 + this.time / 70) * 0.25; c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); }
    }
    c.stroke(); c.restore();
  }
  drawKashimoStaff(c: CanvasRenderingContext2D, f: Fighter) {
    const tokens = styleTokens, op = this.f.find((q) => q !== f);
    c.save(); c.translate(f.x + 19, f.y); c.rotate(op ? Math.atan2(op.y - f.y, op.x - f.x) + Math.PI / 2 + (f.meleeCd > 250 ? 0.7 : 0) : 0);
    c.scale(f.def.weapon?.visualScale ?? 1, f.def.weapon?.visualScale ?? 1);
    c.fillStyle = tokens.getPropertyValue("--kashimo-staff").trim(); c.fillRect(-2.5, -43, 5, 86);
    for (const side of [-1, 1]) {
      c.save(); c.scale(1, side); c.fillStyle = tokens.getPropertyValue("--kashimo-grip").trim(); c.fillRect(-4, 29, 8, 13);
      c.strokeStyle = tokens.getPropertyValue("--kashimo-gold").trim(); c.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(i % 2 ? -1 : 1, 31 + i * 4, 2, 0, 5); c.stroke(); }
      c.fillStyle = c.strokeStyle; c.fillRect(-4.5, 28, 9, 2); c.fillRect(-4.5, 41, 9, 2); c.beginPath(); c.arc(0, 45, 4, 0, 7); c.fill(); c.restore();
    }
    c.restore();
  }
  drawJackpotAura(c: CanvasRenderingContext2D, f: Fighter) {
    const tokens = styleTokens;
    const energy = tokens.getPropertyValue("--jackpot-energy").trim(), cyan = tokens.getPropertyValue("--jackpot-cyan").trim(), light = tokens.getPropertyValue("--jackpot-light").trim();
    c.save(); c.translate(f.x, f.y); c.lineCap = "round";
    // Upward streams and ragged luminous flames, not Black Flash lightning.
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = layer === 0 ? energy : layer === 1 ? cyan : light; c.globalAlpha = layer === 0 ? 0.22 : 0.35;
      c.beginPath(); c.moveTo(-31 + layer * 5, 24);
      for (let i = 0; i <= 12; i++) { const x = -34 + i * 5.6, wave = Math.sin(this.time / 200 + i * 1.7 + layer); c.lineTo(x * (1 - layer * 0.15), -22 - (i % 2 ? 31 : 6) - wave * 11); }
      c.lineTo(30 - layer * 5, 25); c.quadraticCurveTo(0, 39, -31 + layer * 5, 24); c.fill();
    }
    c.globalAlpha = 0.8;
    for (let i = 0; i < 11; i++) {
      const phase = (this.time / (900 + i * 47) + i * 0.19) % 1, x = Math.sin(i * 2.4) * 31, y = 29 - phase * 104;
      c.strokeStyle = i % 3 ? cyan : light; c.lineWidth = i % 3 ? 1.5 : 2.5;
      c.beginPath(); c.moveTo(x, y + 15); c.bezierCurveTo(x - 8, y + 7, x + 9, y - 2, x + Math.sin(this.time / 220 + i) * 7, y - 15); c.stroke();
    }
    c.restore();
  }

  // BURACO NEGRO da Yuki: esfera de mangá com núcleo estrelado, halo branco, raios convergentes e borda espinhosa
  drawBlackHole(c: CanvasRenderingContext2D) {
    const h = this.blackHole; if (!h) return;
    const tokens = styleTokens;
    const ink = tokens.getPropertyValue("--blackhole-ink").trim(), light = tokens.getPropertyValue("--blackhole-light").trim(), haze = tokens.getPropertyValue("--blackhole-haze").trim();
    const p = Math.min(1, Math.max(0, 1 - h.t / 1500)), grow = 1 - (1 - p) ** 3;
    const R = 46 + grow * 190, core = R * 0.3, t = this.time;
    const rnd = (i: number) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
    c.save(); c.translate(h.x, h.y);
    // destroços da arena sendo arrancados e puxados para dentro
    for (let i = 0; i < 48; i++) {
      const a = rnd(i) * Math.PI * 2 + t / (1500 + rnd(i + 3) * 900), dd = R * (1.08 + rnd(i + 7) * 0.85) * (1 - p * 0.3), sz = 3 + rnd(i + 11) * 9;
      c.save(); c.translate(Math.cos(a) * dd, Math.sin(a) * dd); c.rotate(rnd(i + 5) * 3 + t / 400);
      c.fillStyle = light; c.strokeStyle = ink; c.lineWidth = 1; c.fillRect(-sz / 2, -sz / 2, sz, sz * 0.7); c.strokeRect(-sz / 2, -sz / 2, sz, sz * 0.7);
      c.beginPath(); c.moveTo(-sz / 2, sz * 0.2); c.lineTo(-sz / 2, sz * 0.2 + 4 + rnd(i + 9) * 8); c.stroke();
      c.restore();
    }
    // borda: espinhos negros irregulares saindo da esfera
    c.fillStyle = ink;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + rnd(i + 21) * 0.04 + t / 5000, len = R * (0.06 + rnd(i + 31) ** 2 * 0.42) * (0.85 + 0.15 * Math.sin(t / 90 + i)), w = 0.012 + rnd(i + 41) * 0.022;
      c.beginPath(); c.moveTo(Math.cos(a - w) * R * 0.93, Math.sin(a - w) * R * 0.93); c.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); c.lineTo(Math.cos(a + w) * R * 0.93, Math.sin(a + w) * R * 0.93); c.closePath(); c.fill();
    }
    // corpo da esfera: núcleo negro, halo branco, sombreado escuro na borda
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, ink); g.addColorStop(0.26, ink); g.addColorStop(0.4, light); g.addColorStop(0.62, light); g.addColorStop(0.86, haze); g.addColorStop(1, ink);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
    // linhas de velocidade convergindo para o centro (grossas fora, finas dentro)
    for (let i = 0; i < 240; i++) {
      const a = rnd(i + 101) * Math.PI * 2 + t / 6000, inner = R * (0.36 + rnd(i + 151) * 0.4), w = 0.004 + rnd(i + 201) * 0.016;
      c.globalAlpha = 0.35 + rnd(i + 251) * 0.6; c.fillStyle = ink;
      c.beginPath(); c.moveTo(Math.cos(a - w) * R, Math.sin(a - w) * R); c.lineTo(Math.cos(a) * inner, Math.sin(a) * inner); c.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R); c.closePath(); c.fill();
    }
    // pontilhado de retícula
    for (let i = 0; i < 260; i++) {
      const a = rnd(i + 401) * Math.PI * 2, dd = core * 1.1 + rnd(i + 451) * R * 0.75;
      c.globalAlpha = 0.25 + rnd(i + 501) * 0.35; c.fillStyle = ink; c.fillRect(Math.cos(a) * dd, Math.sin(a) * dd, 1.2, 1.2);
    }
    c.restore(); c.globalAlpha = 1;
    // núcleo estrelado: explosão negra de pontas irregulares
    c.save(); c.rotate(-t / 1800); c.fillStyle = ink; c.beginPath();
    const n = 44;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? core * (0.72 + rnd(i + 601) * 0.12) : core * (1.05 + rnd(i + 651) * 0.55);
      if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill(); c.restore();
    c.restore();
  }
  // Jato de Plasma do Choso: onda gigante de sangue, somente em tons de vermelho
  drawPlasmaBeam(c: CanvasRenderingContext2D, f: Fighter) {
    const tokens = styleTokens;
    const deep = tokens.getPropertyValue("--blood-deep").trim(), bright = tokens.getPropertyValue("--blood-bright").trim();
    const ang = f.beam?.ang ?? 0, L = 1200, t = this.time / 70, R = f.beam?.ab.hitRadius ?? 48;
    c.save(); c.translate(f.x, f.y); c.rotate(ang);
    // corpo da onda: abre a partir do Choso e ondula nas bordas
    const edge = (d: number, side: number) => side * Math.min(R, 8 + d * 0.25) * (1 + Math.sin(d / 38 - t + side) * 0.18);
    for (const [k, col, alpha] of [[1.15, deep, 0.55], [1, deep, 0.95], [0.55, bright, 0.9]] as const) {
      c.globalAlpha = alpha; c.fillStyle = col; c.beginPath(); c.moveTo(0, 0);
      for (let d = 0; d <= L; d += 18) c.lineTo(d, edge(d, -1) * k);
      for (let d = L; d >= 0; d -= 18) c.lineTo(d, edge(d, 1) * k);
      c.closePath(); c.fill();
    }
    // cristas da onda
    c.globalAlpha = 0.8; c.strokeStyle = bright; c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const d0 = ((this.time / 3 + i * 200) % L); c.beginPath();
      for (let s = -1; s <= 1.01; s += 0.2) { const y = edge(d0, 1) * 0.9 * s; const x = d0 - Math.cos(s * 1.4) * 22; if (s === -1) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
    }
    c.restore(); c.lineWidth = 1; c.globalAlpha = 1;
  }
  /** Desmantelar: núcleo escuro com borda branca, para Sukuna e Yuji. */
  drawCut(c: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number) {
    const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    c.save(); c.lineCap = "round";
    const css = styleTokens;
    c.strokeStyle = css.getPropertyValue("--cut-edge").trim(); c.lineWidth = w + 2.5; c.beginPath(); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); c.stroke();
    c.strokeStyle = css.getPropertyValue("--cut-void").trim(); c.lineWidth = w; c.beginPath(); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); c.stroke();
    c.restore();
  }
  /** Desmantelar · Rede: grade de cortes em área ampla */
  drawNet(c: CanvasRenderingContext2D, p: Proj) {
    const r = p.ab?.hitRadius ?? 48;
    c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 4);
    c.lineCap = "round";
    const css = styleTokens;
    for (const [col, w] of [[css.getPropertyValue("--cut-edge").trim(), 4], [css.getPropertyValue("--cut-void").trim(), 1.5]] as const) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath();
      for (let i = -2; i <= 2; i++) { const o = i * r / 2.5; c.moveTo(-r, o); c.lineTo(r, o); c.moveTo(o, -r); c.lineTo(o, r); }
      c.stroke();
    }
    c.restore();
  }
  /** Chama Divina: flecha de fogo */
  drawFuga(c: CanvasRenderingContext2D, p: Proj) {
    const a = Math.atan2(p.vy, p.vx);
    c.save(); c.translate(p.x, p.y); c.rotate(a);
    const g = c.createLinearGradient(-60, 0, 18, 0); g.addColorStop(0, "rgba(234,88,12,0)"); g.addColorStop(0.6, "rgba(249,115,22,0.85)"); g.addColorStop(1, "#fef3c7");
    c.fillStyle = g; c.beginPath(); c.moveTo(22, 0);
    for (let i = 0; i <= 8; i++) { const x = 10 - i * 9, f = Math.sin(this.time / 40 + i * 1.7) * 4; c.lineTo(x, -6 - i * 1.4 - f); }
    for (let i = 8; i >= 0; i--) { const x = 10 - i * 9, f = Math.sin(this.time / 45 + i * 2.1) * 4; c.lineTo(x, 6 + i * 1.4 + f); }
    c.closePath(); c.fill();
    c.fillStyle = "#fffbeb"; c.beginPath(); c.moveTo(24, 0); c.lineTo(6, -4); c.lineTo(6, 4); c.closePath(); c.fill();
    c.restore();
  }
  /** Domínio Simples: círculo ciano luminoso no chão com borda branca ondulada */
  drawSimple(c: CanvasRenderingContext2D, f: Fighter) {
    c.save(); c.translate(f.x, f.y + SIZE / 2 - 2); c.scale(1, 0.42);
    const R = 44;
    c.fillStyle = "rgba(255,255,255,0.9)"; c.beginPath();
    for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2, r = R + 6 + Math.sin(a * 7 + this.time / 120) * 4; if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.fill();
    c.fillStyle = "rgba(8,145,178,0.85)"; c.beginPath(); c.arc(0, 0, R - 4, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  /** Cesta Vime Oca: esfera rosa em grade envolvendo o lutador */
  drawWicker(c: CanvasRenderingContext2D, f: Fighter) {
    const R = 32;
    c.save(); c.translate(f.x, f.y);
    const g = c.createRadialGradient(-8, -8, 4, 0, 0, R); g.addColorStop(0, "rgba(251,207,232,0.55)"); g.addColorStop(1, "rgba(219,39,119,0.35)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
    c.strokeStyle = "rgba(236,72,153,0.95)"; c.lineWidth = 2.2; const rot = this.time / 1500;
    for (let i = -3; i <= 3; i++) {
      const o = Math.sin(i / 3.5 * Math.PI / 2) * R;
      c.beginPath(); c.ellipse(o * Math.cos(rot), 0, Math.max(1, Math.sqrt(R * R - o * o) * 0.35 + Math.abs(Math.sin(rot)) * 4), R, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(-R, o); c.lineTo(R, o); c.stroke();
    }
    c.restore();
    c.save(); c.strokeStyle = "rgba(244,114,182,0.9)"; c.lineWidth = 1.5; c.beginPath(); c.arc(f.x, f.y, R, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  drawCharge(c: CanvasRenderingContext2D, f: Fighter) {
    const color = styleTokens.getPropertyValue("--blood-bright").trim();
    const total = f.casting?.ab.castMs ?? 1, k = 1 - (f.casting?.t ?? 0) / total;
    c.save(); c.strokeStyle = color; c.lineWidth = 2; c.globalAlpha = 0.8;
    c.beginPath(); c.arc(f.x, f.y, 40 - k * 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = color; c.beginPath(); c.arc(f.x, f.y, 3 + k * 9, 0, Math.PI * 2); c.fill(); c.restore();
  }
  drawBloodBlade(c: CanvasRenderingContext2D, f: Fighter, op: Fighter) {
    const tokens = styleTokens;
    const a = Math.atan2(op.y - f.y, op.x - f.x), hx = f.x + Math.cos(a + 0.6) * SIZE * 0.55, hy = f.y + Math.sin(a + 0.6) * SIZE * 0.55;
    c.save(); c.translate(hx, hy); c.rotate(a);
    c.fillStyle = tokens.getPropertyValue("--blood-deep").trim(); c.fillRect(-5, -2, 6, 4);
    c.fillStyle = tokens.getPropertyValue("--blood-bright").trim(); c.beginPath(); c.moveTo(1, -3); c.lineTo(24, 0); c.lineTo(1, 3); c.closePath(); c.fill();
    c.restore();
  }
  // Bola de Reserva do Hakari: pequena esfera metálica
  drawReserveBall(c: CanvasRenderingContext2D, p: Proj) {
    const tokens = styleTokens;
    const g = c.createRadialGradient(p.x - 2, p.y - 2, 0.5, p.x, p.y, 6);
    g.addColorStop(0, tokens.getPropertyValue("--metal-light").trim()); g.addColorStop(1, tokens.getPropertyValue("--metal-dark").trim());
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 5, 0, Math.PI * 2); c.fill();
  }
  /** Ataque destrutivo atinge o campo: explosão, cratera e fumaça subindo */
  impact(x: number, y: number, r: number, color: string, core = "rgba(254,240,138,0.6)") {
    this.fx.push({ kind: "boom", x, y, r, color, life: 650, max: 650 });
    this.fx.push({ kind: "boom", x, y, r: r * 0.5, color: core, life: 400, max: 400 });
    this.fx.push({ kind: "crater", x, y, r: r * 0.45, color: "", life: 3200, max: 3200 });
    const n = 4 + Math.round(r / 25);
    for (let i = 0; i < n; i++) this.fx.push({ kind: "smoke", x: x + (Math.random() - 0.5) * r * 0.8, y: y + (Math.random() - 0.5) * r * 0.4, r: 8 + Math.random() * r * 0.25, color: "", life: 1600 + Math.random() * 1200, max: 2800, seed: Math.random() });
  }
  /** Silhueta do Judgeman (referência: mortalha negra larga em forma de sino, máscara pálida, braços abertos segurando a balança) */
  drawJudgemanShape(c: CanvasRenderingContext2D) {
    const t = Math.sin(this.time / 900) * 2.5;
    // braço/travessão da balança
    c.strokeStyle = "#d4d4d8"; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(-30, -9 - t); c.lineTo(30, -9 + t); c.stroke();
    for (const s of [-1, 1]) {
      const bx = s * 29, by = -9 + s * t;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 6, by + 15); c.moveTo(bx, by); c.lineTo(bx + 6, by + 15); c.moveTo(bx, by); c.lineTo(bx, by + 15); c.stroke();
      c.fillStyle = "#e4e4e7"; c.beginPath(); c.ellipse(bx, by + 16, 8, 2.2, 0, 0, Math.PI); c.fill(); c.stroke();
    }
    // mortalha negra: topo arredondado, pontas laterais longas, ponta central
    c.fillStyle = "#050505";
    c.beginPath(); c.moveTo(-28, -10);
    c.quadraticCurveTo(-14, -20, 0, -20); c.quadraticCurveTo(14, -20, 28, -10);
    c.quadraticCurveTo(14, -2, 9, 14); c.quadraticCurveTo(4, 20, 0, 22); c.quadraticCurveTo(-4, 20, -9, 14);
    c.quadraticCurveTo(-14, -2, -28, -10); c.closePath(); c.fill();
    c.strokeStyle = "rgba(120,120,130,0.5)"; c.lineWidth = 0.5;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 3, -19); c.quadraticCurveTo(i * 4, -17, i * 5, -15); c.stroke(); }
    // pingente/cauda
    c.strokeStyle = "#050505"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 22); c.lineTo(0, 27); c.stroke();
    c.fillStyle = "#050505"; c.beginPath(); c.moveTo(-2, 27); c.lineTo(2, 27); c.lineTo(0, 30); c.closePath(); c.fill();
    // máscara pálida com olhos fechados e boca escura
    c.fillStyle = "#f4f4f5"; c.beginPath(); c.ellipse(0, -13, 3.6, 4.6, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#18181b"; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(-2.4, -13.5); c.lineTo(-0.8, -13); c.moveTo(0.8, -13); c.lineTo(2.4, -13.5); c.stroke();
    c.fillStyle = "#18181b"; c.beginPath(); c.ellipse(0, -10.6, 1.2, 0.6, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1;
  }
  /** Judgeman: shikigami juiz que flutua ao lado do Higuruma — mortalha escura, máscara branca e balança */
  drawJudgeman(c: CanvasRenderingContext2D, f: Fighter) {
    const jx = f.x - 46, jy = f.y - 60 + Math.sin(this.time / 600) * 4;
    c.save(); c.translate(jx, jy); c.scale(1.1, 1.1); this.drawJudgemanShape(c); c.restore();
  }
  /** Martelo do Higuruma; com Pena de Morte vira a Espada do Carrasco */
  drawGavel(c: CanvasRenderingContext2D, f: Fighter) {
    const op = this.f.find((q) => q !== f);
    const a = op ? Math.atan2(op.y - f.y, op.x - f.x) : 0;
    c.save(); c.translate(f.x + Math.cos(a) * 22, f.y + Math.sin(a) * 22); c.rotate(a + (f.meleeCd > 200 ? -0.9 : 0.25));
    if (f.executioner > 0) {
      // Espada do Carrasco: lâmina de luz dourada com guarda em cruz que irradia clarão
      const pulse = 0.75 + Math.sin(this.time / 120) * 0.25;
      const glow = c.createLinearGradient(0, -10, 0, 10);
      glow.addColorStop(0, "rgba(254,240,138,0)"); glow.addColorStop(0.5, `rgba(254,240,138,${0.55 * pulse})`); glow.addColorStop(1, "rgba(254,240,138,0)");
      c.fillStyle = glow; c.fillRect(6, -10, 62, 20);
      c.fillStyle = "#fffbeb"; c.beginPath(); c.moveTo(6, -2); c.lineTo(66, 0); c.lineTo(6, 2); c.closePath(); c.fill();
      // guarda em cruz: clarão longo perpendicular
      const flare = c.createRadialGradient(6, 0, 0, 6, 0, 26);
      flare.addColorStop(0, "rgba(255,255,255,0.95)"); flare.addColorStop(0.4, `rgba(253,224,71,${0.7 * pulse})`); flare.addColorStop(1, "rgba(253,224,71,0)");
      c.fillStyle = flare; c.beginPath(); c.moveTo(6, -28); c.lineTo(8.5, 0); c.lineTo(6, 28); c.lineTo(3.5, 0); c.closePath(); c.fill();
      c.beginPath(); c.arc(6, 0, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fef9c3"; c.fillRect(-6, -1.5, 12, 3);
    } else {
      // Martelo: o cabo se alonga até o alvo (Martelo Alongado) e a cabeça cresce (Aumentar Martelo)
      const ext = f.gavelExt > 0 ? Math.sin((1 - f.gavelExt / 420) * Math.PI) : 0;
      const len = 22 + ext * Math.max(0, f.gavelReach - 30);
      const k = f.gavelBig > 0 ? 1.8 : 1, hw = 20 * k, hh = 22 * k;
      if (f.gavelBig > 0) { c.fillStyle = "rgba(234,179,8,0.18)"; c.beginPath(); c.arc(len + hw / 2, 0, hh * 0.9, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = "#713f12"; c.lineWidth = 4 * Math.sqrt(k); c.beginPath(); c.moveTo(-4, 0); c.lineTo(len, 0); c.stroke();
      c.fillStyle = "#eab308"; c.fillRect(len - 4, -hh / 2, hw, hh);
      c.fillStyle = "#b91c1c"; c.fillRect(len - 4, -hh / 2, 5 * k, hh); c.fillRect(len - 4 + hw - 5 * k, -hh / 2, 5 * k, hh);
      c.strokeStyle = "#713f12"; c.lineWidth = 1.4; c.strokeRect(len - 4, -hh / 2, hw, hh);
    }
    c.restore(); c.lineWidth = 1;
  }
  drawPoison(c: CanvasRenderingContext2D, f: Fighter) {
    const color = styleTokens.getPropertyValue("--blood-poison").trim();
    c.save(); c.fillStyle = color;
    for (let i = 0; i < 3; i++) { const ph = ((this.time / 700) + i / 3) % 1, x = f.x - 9 + i * 9, y = f.y - SIZE / 2 + ph * SIZE; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; c.font = "10px monospace"; c.textAlign = "center"; c.fillText("☠", f.x + SIZE / 2 + 7, f.y - SIZE / 2 + 2); c.restore();
  }

  draw(c: CanvasRenderingContext2D) {
    c.clearRect(0, 0, W, H);
    if (!Battle.grid) {
      const g = document.createElement("canvas"); g.width = W; g.height = H; const gc = g.getContext("2d"); if (!gc) return;
      gc.strokeStyle = "rgba(255,255,255,0.05)"; gc.beginPath();
      for (let x = 0; x < W; x += 40) { gc.moveTo(x + 0.5, 0); gc.lineTo(x + 0.5, H); }
      for (let y = 0; y < H; y += 40) { gc.moveTo(0, y + 0.5); gc.lineTo(W, y + 0.5); }
      gc.stroke(); Battle.grid = g;
    }
    c.drawImage(Battle.grid, 0, 0);
    this.drawDomains(c);
    if (this.voidT > 0) this.drawVoid(c);
    if (this.blackHole) this.drawBlackHole(c);
    for (const f of this.f) {
      const g = f.garuda; if (!g || g.hp <= 0) continue;
      const tokens = styleTokens;
      const bone = tokens.getPropertyValue("--garuda-bone").trim(), shade = tokens.getPropertyValue("--garuda-shade").trim();
      const edge = tokens.getPropertyValue("--garuda-edge").trim(), spike = tokens.getPropertyValue("--garuda-spike").trim();
      const eye = tokens.getPropertyValue("--garuda-eye").trim();
      c.save(); c.translate(g.x, g.y);
      c.rotate(g.mode === "ball" ? Math.atan2(g.vy, g.vx) : (f.x < W / 2 ? 0 : Math.PI));
      c.scale(0.5, 0.5);
      c.lineJoin = "round"; c.lineWidth = 1;
      // Articulated bone plates and paired blue-gray spines, following the supplied reference.
      const length = g.mode === "whip" ? Math.min(150, Math.hypot(g.x - f.x, g.y - f.y)) : 69;
      for (let i = 10; i >= 0; i--) {
        const t = i / 10, a = i * 0.57;
        const x = g.mode === "ball" ? Math.cos(a) * 13 : -t * length;
        const y = g.mode === "ball" ? Math.sin(a) * 13 : -Math.sin(t * Math.PI * 0.95) * 24 + Math.sin(this.time / 280 + t * 4) * t * 3;
        c.save(); c.translate(x, y);
        c.rotate(g.mode === "ball" ? a + Math.PI / 2 : Math.cos(t * Math.PI) * 0.6);
        c.scale(1 - t * 0.48, 1 - t * 0.48);
        for (const side of [-1, 1]) {
          c.fillStyle = spike; c.strokeStyle = edge;
          c.beginPath(); c.moveTo(-3, side * 3); c.lineTo(-12, side * (i % 2 ? 24 : 18));
          c.lineTo(3, side * 5); c.closePath(); c.fill(); c.stroke();
        }
        c.fillStyle = shade; c.strokeStyle = edge;
        c.beginPath(); c.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = bone; c.beginPath(); c.moveTo(-7, -3); c.lineTo(-2, -6);
        c.lineTo(5, -4); c.lineTo(8, 0); c.lineTo(3, 4); c.lineTo(-5, 3); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-2, -4); c.lineTo(1, 0); c.lineTo(-3, 3); c.stroke(); c.restore();
      }
      // Skull with red eye socket and long, split mandibles.
      c.strokeStyle = edge; c.fillStyle = bone;
      for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(7, side * 3); c.lineTo(37, side * 7);
        c.lineTo(35, side * 3); c.lineTo(10, side); c.closePath(); c.fill(); c.stroke();
      }
      c.fillStyle = shade; c.beginPath(); c.ellipse(1, 0, 12, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = bone; c.beginPath(); c.moveTo(-11, -3); c.lineTo(-6, -9); c.lineTo(4, -8);
      c.lineTo(13, -2); c.lineTo(9, 5); c.lineTo(1, 8); c.lineTo(-8, 5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-7, -4); c.lineTo(1, -6); c.lineTo(8, -2); c.stroke();
      c.fillStyle = edge; c.beginPath(); c.ellipse(2, 0, 4.5, 3.5, -0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = eye; c.beginPath(); c.arc(2.5, 0, 1.7, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.font = "10px monospace"; c.textAlign = "center";
      c.fillStyle = tokens.getPropertyValue("--foreground").trim();
      c.fillText(`Garuda ${Math.ceil(g.hp)}${g.massT > 0 ? " · MASSA" : ""}`, g.x, Math.max(12, g.y - 29)); c.restore();
    }
    for (const dr of this.doors) this.drawDoor(c, dr);
    drawYorozuWorld(this, c);
    this.drawKenjaku(c);
    for (const b of this.blues) { const r = 11 + Math.sin(this.time / 90) * 2; c.fillStyle = "rgba(59,130,246,0.25)"; c.beginPath(); c.arc(b.x, b.y, r + 9, 0, 7); c.fill(); c.fillStyle = "#60a5fa"; c.beginPath(); c.arc(b.x, b.y, r, 0, 7); c.fill(); c.strokeStyle = "rgba(96,165,250,0.35)"; c.beginPath(); c.arc(b.x, b.y, 30 + (this.time / 8) % 30, 0, 7); c.stroke(); c.font = "9px monospace"; c.textAlign = "center"; c.fillStyle = "rgba(191,219,254,0.7)"; c.fillText("Azul", b.x, b.y + 26); c.textAlign = "left"; }
    for (const f of this.f) if (f.casting?.ab.type === "purple") { c.fillStyle = "rgba(239,68,68,0.3)"; c.beginPath(); c.arc(f.x - 30, f.y, 18, 0, 7); c.fill(); c.fillStyle = "#ef4444"; c.beginPath(); c.arc(f.x - 30, f.y, 10, 0, 7); c.fill(); }
    for (const o of this.orbs) { c.fillStyle = "#e11d2e"; c.beginPath(); c.arc(o.x, o.y, 6 + Math.sin(this.time / 120) * 1.5, 0, 7); c.fill(); }
    for (const f of this.f) if (f.beam) {
      if (f.beam.ab.type === "plasmaJet") this.drawPlasmaBeam(c, f);
      else if (f.beam.ab.type === "soundwave") {
        // feixe contínuo: segmentos da onda sonora ao longo da linha, presos ao Kashimo
        const reach = f.beam.ab.maxRange ?? 420, ca = Math.cos(f.beam.ang), sa = Math.sin(f.beam.ang);
        // rajada roxa simples: duas linhas, leve de desenhar
        const w = 14 + Math.sin(this.time / 40) * 2, ex = f.x + ca * reach, ey = f.y + sa * reach;
        c.lineCap = "round"; c.globalAlpha = 0.8; c.strokeStyle = styleTokens.getPropertyValue("--kashimo-sound").trim(); c.lineWidth = w;
        c.beginPath(); c.moveTo(f.x + ca * 16, f.y + sa * 16); c.lineTo(ex, ey); c.stroke();
        c.globalAlpha = 1; c.strokeStyle = styleTokens.getPropertyValue("--kashimo-sound-light").trim(); c.lineWidth = w * 0.35;
        c.beginPath(); c.moveTo(f.x + ca * 16, f.y + sa * 16); c.lineTo(ex, ey); c.stroke(); c.lineCap = "butt";
      }
      else {
        c.strokeStyle = "#ff2a3a"; c.lineWidth = 4; c.beginPath(); c.moveTo(f.x, f.y);
        const reach = f.beam.ab.maxRange ?? 1200;
        const ca = Math.cos(f.beam.ang), sa = Math.sin(f.beam.ang), tx = f.x + ca * reach, ty = f.y + sa * reach;
        c.lineTo(tx - ca * 10, ty - sa * 10); c.stroke(); c.lineWidth = 1;
        // ponta afiada do Sangue Perfurante
        c.fillStyle = "#ff2a3a"; c.beginPath(); c.moveTo(tx + ca * 8, ty + sa * 8);
        c.lineTo(tx - ca * 12 - sa * 6, ty - sa * 12 + ca * 6); c.lineTo(tx - ca * 12 + sa * 6, ty - sa * 12 - ca * 6); c.closePath(); c.fill();
      }
    }
    for (const p of this.projs) {
      if (p.kind === "tojiChain") { const source = this.f[p.owner]; if (source) drawTojiChain(c, source, p, this.time); }
      else if (p.kind === "uzumaki") this.drawUzumaki(c, p);
      else if (p.kind === "meteor") { const r = 5, rot = (p.shape ?? 0) + this.time / 60; c.fillStyle = "#7f1d1d"; c.strokeStyle = "#e11d2e"; c.beginPath(); for (let i = 0; i < 6; i++) { const aa = rot + (i / 6) * Math.PI * 2, rr = r * (i % 2 ? 0.75 : 1.1); if (i) c.lineTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr); else c.moveTo(p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr); } c.closePath(); c.fill(); c.stroke(); }
      else if (p.kind === "disc") { const r = p.ab?.hitRadius ?? 12, rot = this.time / 25; c.save(); c.translate(p.x, p.y); c.rotate(rot); c.fillStyle = "#e11d2e"; c.beginPath(); for (let i = 0; i < 16; i++) { const aa = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.7 : r; if (i) c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); else c.moveTo(rr, 0); } c.closePath(); c.fill(); c.fillStyle = "#450a0a"; c.beginPath(); c.arc(0, 0, r * 0.3, 0, 7); c.fill(); c.restore(); }
      else if (p.kind === "chain") { const a = Math.atan2(p.vy, p.vx); c.save(); c.translate(p.x, p.y); c.rotate(a); c.fillStyle = "#e11d2e"; c.beginPath(); c.moveTo(8, 0); c.lineTo(-6, -4); c.lineTo(-3, 0); c.lineTo(-6, 4); c.closePath(); c.fill(); c.restore(); }
      else if (p.kind === "gavel") this.drawThrownGavel(c, p);
      else if (p.kind === "ball") this.drawReserveBall(c, p);
      else if (p.kind === "red" || p.kind === "purple") { const pr = p.kind === "red", r = pr ? 10 : 34; c.fillStyle = pr ? "rgba(239,68,68,0.3)" : "rgba(168,85,247,0.3)"; c.beginPath(); c.arc(p.x, p.y, r * 1.7, 0, 7); c.fill(); c.fillStyle = pr ? "#ef4444" : "#a855f7"; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); }
      else if (p.kind === "sphere" || p.kind === "construct" || p.kind === "metal" || p.kind === "yzBlade" || p.kind === "yzChain" || p.kind === "yzLance") drawYorozuProj(this, c, p);
      else if (p.kind === "sound" || p.kind === "electromagnetic") drawKashimoWave(c, p, this.time);
      else if (p.kind === "electric") this.drawElectric(c, p.x, p.y, 22, false, Math.atan2(p.vy, p.vx) + Math.PI);
      else if (p.kind === "blood") { c.fillStyle = "#e11d2e"; c.beginPath(); c.arc(p.x, p.y, 4, 0, 7); c.fill(); }
      else if (p.kind === "net") this.drawNet(c, p);
      else if (p.kind === "fuga") this.drawFuga(c, p);
      else if (p.kind === "world") drawWorldCut(c, p);
      else if (p.kind === "slash") this.drawCut(c, p.x, p.y, Math.atan2(p.vy, p.vx) + Math.PI / 2 + 0.35, 10 + Math.min(14, p.dmg / 8), 2);
      else { const a = Math.atan2(p.vy, p.vx) + Math.PI / 2; c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - Math.cos(a) * 12, p.y - Math.sin(a) * 12); c.lineTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12); c.stroke(); c.lineWidth = 1; }
    }
    for (const e of this.fx) {
      const k = e.life / e.max; c.globalAlpha = Math.min(1, k * 1.5);
      if (e.kind === "divergentFist") { c.globalAlpha = 1; continue; }
      else if (e.kind === "electric") { this.drawElectric(c, e.x, e.y, e.r, false, e.ang); }
      else if (e.kind === "ring") { c.strokeStyle = e.color; c.lineWidth = 2; c.beginPath(); const f = this.f.find((q) => Math.hypot(q.x - e.x, q.y - e.y) < 200); c.arc(e.color === "#22d3ee" && f ? f.x : e.x, e.color === "#22d3ee" && f ? f.y : e.y, e.color === "#22d3ee" ? e.r : e.r * (1.2 - k), 0, 7); c.stroke(); }
      else if (e.kind === "smoke") { const age = 1 - k; c.globalAlpha = Math.min(0.55, k * 0.8); c.fillStyle = "rgba(120,113,108,1)"; c.beginPath(); c.arc(e.x + Math.sin(age * 6 + (e.seed ?? 0) * 9) * 6, e.y - age * 70, e.r * (0.6 + age * 1.4), 0, 7); c.fill(); }
      else if (e.kind === "crater") { c.globalAlpha = Math.min(0.6, k); c.fillStyle = "rgba(10,10,10,1)"; c.beginPath(); c.ellipse(e.x, e.y, e.r, e.r * 0.6, 0, 0, 7); c.fill(); c.strokeStyle = "rgba(87,83,78,1)"; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; }
      else if (e.kind === "boom") { c.fillStyle = e.color; c.beginPath(); c.arc(e.x, e.y, e.r * (1 - k) + 4, 0, 7); c.fill(); }
      else if (e.kind === "jackpot") {
        const palette = styleTokens;
        c.save(); c.strokeStyle = palette.getPropertyValue("--jackpot-energy").trim(); c.lineWidth = 3;
        for (let i = 0; i < 16; i++) { const ang = i * Math.PI / 8, r = 30 + (1 - k) * 55; c.beginPath(); c.moveTo(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r); c.lineTo(e.x + Math.cos(ang) * (r + 16), e.y + Math.sin(ang) * (r + 16)); c.stroke(); }
        c.restore();
      }
      else if (e.kind === "bf") {
        const R = e.r * (1.5 - k), bolts = 8, segs = 5;
        c.save();
        for (let i = 0; i < bolts; i++) {
          const a = (i / bolts) * Math.PI * 2 + (i % 2 ? 0.35 : -0.2);
          for (const [col, w] of [["rgba(255,17,48,0.3)", 11], ["#000", 7], ["#ff1130", 2.5]] as const) {
            c.strokeStyle = col; c.lineWidth = w; c.beginPath();
            let px = e.x, py = e.y; c.moveTo(px, py);
            for (let s = 1; s <= segs; s++) {
              const rr = (R / segs) * s, off = (Math.random() - 0.5) * 30;
              px = e.x + Math.cos(a) * rr - Math.sin(a) * off;
              py = e.y + Math.sin(a) * rr + Math.cos(a) * off;
              c.lineTo(px, py);
            }
            c.stroke();
          }
        }
        c.restore();
      }
      else if (e.kind === "txt") { c.font = "9px monospace"; c.textAlign = "center"; c.fillStyle = this.domains.some((d) => d.ab.type === "pachinko" && Math.hypot(e.x - d.x, e.y - d.y) < d.r) ? styleTokens.getPropertyValue("--pachinko-ink").trim() : e.color; c.fillText(e.text ?? "", e.x, e.y - (1 - k) * 12); c.textAlign = "left"; }
      
      else if (e.kind === "ratio" || e.kind === "nwave" || e.kind === "collapse") drawNanamiFx(c, e, k);
      else if (e.kind === "shadow" || e.kind === "mgzap") drawMegumiFx(c, e, k);
      else if (e.kind === "slash") this.drawCut(c, e.x, e.y, e.ang ?? 0, e.r, e.r > 40 ? 3 : 1.6);
      else { c.fillStyle = e.color; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); }
      c.globalAlpha = 1; c.lineWidth = 1;
    }
    for (const f of this.f) {
      if (f.hp <= 0) continue;
      if (f.mg && drawMegumiFighter(this, c, f)) continue;
      if (f.casting?.ab.type === "plasmaJet" || f.casting?.ab.type === "fuga") this.drawCharge(c, f);
      if (f.blade > 0) this.drawBloodBlade(c, f, this.f[1 - this.f.indexOf(f)] as Fighter);
      if (f.def.id === "kashimo" && f.weaponHp > 0) this.drawKashimoStaff(c, f);
      if (f.def.id === "higuruma") { this.drawJudgeman(c, f); if (!this.projs.some((p) => p.kind === "gavel" && this.f[p.owner] === f)) this.drawGavel(c, f); }
      if (f.def.id === "kashimo" && f.amber <= 0 && f.charges > 0) this.drawElectric(c, f.x, f.y, 25);
      if (f.jackpot > 0) this.drawJackpotAura(c, f);
      if (f.simple > 0) { if (f.wicker) this.drawWicker(c, f); else this.drawSimple(c, f); }
      c.fillStyle = f.flash > 0 ? "#ffffff" : f.def.color;
      c.fillRect(f.x - SIZE / 2, f.y - SIZE / 2, SIZE, SIZE);
      c.strokeStyle = f.armor > 0 ? "#84cc16" : f.buff ? "#e11d2e" : f.def.outline ?? "rgba(255,255,255,0.35)"; c.lineWidth = f.def.outline || f.armor > 0 ? 2 : 1; c.strokeRect(f.x - SIZE / 2, f.y - SIZE / 2, SIZE, SIZE); c.lineWidth = 1;
      if (f.def.id === "kashimo" && f.amber > 0) drawAmberFlow(c, f, this.time);
      if (f.def.id === "toji") { const op = this.f.find((other) => other !== f); if (op) drawToji(c, f, op); }
      if (f.def.id === "nanami") { const op = this.f.find((other) => other !== f); if (op) drawNanami(c, f, op, this.time); }
      if (f.mg) drawMegumiGear(this, c, f);
      if (f.yz) drawYorozuFighter(this, c, f);
      else if (f.armor > 0) { c.strokeStyle = "#65a30d"; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(f.x - SIZE / 2, f.y - SIZE / 2 + i * 10); c.lineTo(f.x + SIZE / 2, f.y - SIZE / 2 + i * 10); } c.stroke(); }
      if (f.metal > 0) { c.strokeStyle = "#cbd5e1"; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, 26, 0, 7); c.stroke(); c.lineWidth = 1; }
      const sr = f.yz ? 0 : f.casting?.ab.type === "perfectSphere" ? 3 + (1 - f.casting.t / (f.casting.ab.castMs ?? 1)) * 23 : f.sphere ? 26 : 0;
      if (sr > 0) { const sy = f.y - SIZE / 2 - sr - 6; c.fillStyle = "#000"; c.beginPath(); c.arc(f.x, sy, sr, 0, 7); c.fill(); c.strokeStyle = "#e4e4e7"; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; }
      if (f.inf > 0) { c.strokeStyle = "rgba(191,219,254,0.5)"; c.setLineDash([3, 4]); c.strokeRect(f.x - SIZE / 2 - 8, f.y - SIZE / 2 - 8, SIZE + 16, SIZE + 16); c.setLineDash([]); }
      if (f.poison) this.drawPoison(c, f);
      if (f.stun > 0) { c.fillStyle = "#facc15"; c.font = "11px monospace"; c.fillText("✶", f.x - 4, f.y - SIZE / 2 - 4); }
      if (f.casting) { c.strokeStyle = "#fff"; c.beginPath(); c.arc(f.x, f.y, 24 + (1 - f.casting.t / (f.casting.ab.castMs ?? 700)) * 30, 0, 7); c.stroke(); }
    }
    drawMegumiWorld(this, c);
    // Keep the energy burst visible above the square fighters at the point of contact.
    for (const e of this.fx) if (e.kind === "divergentFist") {
      c.globalAlpha = Math.min(1, e.life / e.max * 1.5);
      this.drawDivergentFist(c, e); c.globalAlpha = 1;
    }
  }
}
