import type { Ability, CharDef } from "@/lib/engine";

/**
 * Tempos de qualquer ataque, editados no campo `timing` de cada técnica em src/data/abilities.json
 * (ou src/data/characters.json para o golpe básico e técnicas sem estatísticas separadas).
 * Valores em ms do tempo de jogo, exceto `speedMult` (multiplicador da velocidade do projétil).
 */
export type AbilityTiming = {
  /** Preparação: quanto o personagem demora para começar o ataque */
  prepMs: number;
  /** Lançamento: quanto leva para o ataque efetivamente sair */
  launchMs: number;
  /** Velocidade do projétil (multiplicador) */
  speedMult: number;
  /** Impacto: atraso entre alcançar o alvo e o dano/efeito acontecer */
  impactMs: number;
  /** Recuperação: tempo parado antes de poder agir de novo */
  recoveryMs: number;
  /** Intervalo entre utilizações (recarga) */
  cooldownMs: number;
  /** Alcance (px), quando a técnica tem alcance */
  rangePx?: number;
  /** Duração (ms), quando a técnica dura um tempo */
  durationMs?: number;
};
export type TimingField = keyof AbilityTiming;
export type TimingOverride = Partial<AbilityTiming> & { forms?: Record<string, Partial<AbilityTiming>> };
/** Usado só por testes: os tempos de verdade ficam nos arquivos de dados (campo `timing`). */
export type TimingOverrides = Record<string, Record<string, TimingOverride>>;

/** Id reservado para o ataque básico (taijutsu automático) de cada personagem */
export const MELEE_ID = "__melee";

/** Técnicas que entram em conjuração: o lançamento é o tempo de conjuração (castMs). */
const CAST_TYPES = new Set(["purple", "uzumaki", "perfectSphere", "plasmaJet", "fuga", "worldSlash", "domain", "pachinko"]);
export const isCastAbility = (a: Pick<Ability, "type">) => CAST_TYPES.has(a.type);

export const FIELD_LABELS: Record<TimingField, string> = {
  prepMs: "Preparação (ms)",
  launchMs: "Lançamento (ms)",
  speedMult: "Velocidade do projétil (×)",
  impactMs: "Impacto (ms)",
  recoveryMs: "Recuperação (ms)",
  cooldownMs: "Intervalo entre usos (ms)",
  rangePx: "Alcance (px)",
  durationMs: "Duração (ms)",
};

/** Tempos padrão de uma técnica, lidos dos dados (campo `timing` opcional nos dados tem prioridade). */
export function baseTiming(a: Ability): AbilityTiming {
  const cast = isCastAbility(a);
  return {
    prepMs: a.delayMs ?? 0,
    launchMs: cast ? a.castMs ?? 0 : 0,
    speedMult: 1,
    impactMs: 0,
    recoveryMs: 0,
    cooldownMs: a.cooldown ?? 0,
    ...(a.maxRange !== undefined ? { rangePx: a.maxRange } : {}),
    ...(a.durationMs !== undefined ? { durationMs: a.durationMs } : {}),
    ...a.timing,
  };
}
export function baseMeleeTiming(def: CharDef): AbilityTiming {
  return { prepMs: 0, launchMs: 0, speedMult: 1, impactMs: 0, recoveryMs: 0, cooldownMs: def.taijutsu.cooldown ?? 0, ...def.taijutsu.timing };
}

const num = (v: unknown, min = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, v) : undefined);
function clean(o: Partial<AbilityTiming> | undefined): Partial<AbilityTiming> {
  const out: Partial<AbilityTiming> = {};
  if (!o) return out;
  for (const k of Object.keys(FIELD_LABELS) as TimingField[]) {
    const v = num(o[k], k === "speedMult" ? 0.05 : 0);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Aplica os tempos resolvidos aos campos que o motor usa. */
export function applyAbilityTiming(a: Ability, o?: TimingOverride): Ability {
  const t = { ...baseTiming(a), ...clean(o) };
  const out: Ability = { ...a, timing: t, cooldown: t.cooldownMs };
  if (isCastAbility(a)) { out.delayMs = t.prepMs; out.castMs = t.launchMs; }
  else out.delayMs = t.prepMs + t.launchMs;
  if (t.rangePx !== undefined) out.maxRange = t.rangePx;
  if (t.durationMs !== undefined) out.durationMs = t.durationMs;
  // formas internas (ex.: moldes do Metal Líquido, Investida da Armadura): cada uma tem seus próprios tempos
  if (a.forms) out.forms = Object.fromEntries(Object.entries(a.forms).map(([k, f]) => [k, applyAbilityTiming({ ...f, id: `${a.id}.${k}` }, o?.forms?.[k])]));
  return out;
}

/** Copia os personagens com todos os tempos editados aplicados (nada fica travado). */
export function applyTimings(chars: CharDef[], overrides: TimingOverrides = {}): CharDef[] {
  return chars.map((c) => {
    const o = overrides[c.id] ?? {};
    const melee = { ...baseMeleeTiming(c), ...clean(o[MELEE_ID]) };
    return {
      ...c,
      taijutsu: { ...c.taijutsu, cooldown: melee.cooldownMs, timing: melee },
      abilities: c.abilities.map((a) => applyAbilityTiming(a, o[a.id])),
    };
  });
}
