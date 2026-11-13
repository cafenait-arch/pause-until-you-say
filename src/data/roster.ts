import characters from "./characters.json";
import abilities from "./abilities.json";
import type { CharDef, Ability } from "@/lib/engine";
import { applyTimings } from "@/lib/timing";

const stats = abilities as unknown as Record<string, Record<string, Partial<Ability>>>;

/**
 * Junta personagens + estatísticas das técnicas e aplica os tempos do campo `timing` de cada uma.
 * Passivas (ex.: Seis Olhos) definem costMult.
 */
export const CHARS: CharDef[] = applyTimings((characters as unknown as CharDef[]).map((c) => {
  const passiveMult = c.passives?.reduce((m, p) => m * (p.costMult ?? 1), 1);
  const costMult = c.passives?.some((p) => p.costMult !== undefined) ? passiveMult : c.costMult;
  return {
    ...c,
    ...(costMult !== undefined ? { costMult } : {}),
    abilities: c.abilities.map((a) => ({ ...stats[c.id]?.[a.id], ...a })),
  };
}));
