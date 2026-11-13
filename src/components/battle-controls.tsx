import { useEffect, useRef, type PointerEvent } from "react";
import { HeartPulse, Move, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Battle } from "@/lib/engine";
import { megumiButton } from "@/lib/megumi";

export function BattleControls({ battle, paused, refresh }: { battle: Battle; paused: boolean; refresh: () => void }) {
  const stick = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const heldPointers = useRef({ attack: new Set<number>(), heal: new Set<number>() });
  const blocked = paused || !!battle.winner || !!battle.blackHole;
  const player = battle.player;

  useEffect(() => {
    const reset = () => {
      battle.resetInput(); pointer.current = null;
      heldPointers.current.attack.clear(); heldPointers.current.heal.clear();
      if (thumb.current) thumb.current.style.transform = "translate(0px, 0px)";
    };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => { reset(); window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", reset); };
  }, [battle, blocked]);

  if (player === null) return null;
  const fighter = battle.f[player];
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (blocked || pointer.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const radius = rect.width / 3;
    const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const scale = Math.max(1, Math.hypot(dx, dy) / radius);
    battle.input.x = dx / scale / radius; battle.input.y = dy / scale / radius;
    if (thumb.current) thumb.current.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null; battle.input.x = 0; battle.input.y = 0;
    if (thumb.current) thumb.current.style.transform = "translate(0px, 0px)";
  };
  const held = (key: "attack" | "heal") => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (blocked || battle.playerBlocked()) return;
      heldPointers.current[key].add(e.pointerId);
      e.currentTarget.setPointerCapture(e.pointerId); battle.input[key] = true;
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => releaseHeld(key, e.pointerId),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => releaseHeld(key, e.pointerId),
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => releaseHeld(key, e.pointerId),
  });
  const releaseHeld = (key: "attack" | "heal", id: number) => {
    heldPointers.current[key].delete(id);
    battle.input[key] = heldPointers.current[key].size > 0;
  };
  const command = (action: () => void) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!blocked) { action(); refresh(); }
    },
    // Keyboard and assistive activation still use click; touch runs immediately,
    // including non-primary fingers, without waiting for a synthesized click.
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0 && !blocked) { action(); refresh(); }
    },
  });

  return (
    <section aria-label="Controles do jogador" onContextMenu={(e) => e.preventDefault()} className="battle-controls touch-none select-none space-y-3 border-t border-border pt-3">
      <div className="controls-status flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2"><span className={`fighter-swatch fighter-${fighter.def.id}`} /><span className="truncate">Você · {fighter.def.name}</span></span>
        <span className="shrink-0 text-muted-foreground">{paused ? "Pausado" : fighter.stun > 0 ? "Atordoado" : fighter.casting ? "Conjurando" : fighter.beam ? "Canalizando" : ""}</span>
      </div>
      <div className="controls-movement flex items-center justify-between gap-4">
        <div ref={stick} role="group" aria-label="Mover personagem" className="battle-stick relative flex size-32 shrink-0 touch-none items-center justify-center rounded-full border border-border bg-muted/40"
          onPointerDown={(e) => { e.preventDefault(); if (blocked || pointer.current !== null) return; pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
          onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
          <Move className="size-20 text-muted-foreground/30" aria-hidden="true" />
          <span ref={thumb} className="absolute flex size-12 items-center justify-center rounded-full border border-border bg-muted text-foreground"><Move className="size-5" /></span>
        </div>
        <div className="battle-actions grid flex-1 grid-cols-2 gap-2">
          <Button disabled={blocked || battle.playerBlocked()} {...held("attack")} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") battle.input.attack = true; }} onKeyUp={() => { battle.input.attack = heldPointers.current.attack.size > 0; }} onBlur={() => { battle.input.attack = heldPointers.current.attack.size > 0; }} className="h-14 touch-none flex-col gap-1 px-2 text-xs"><Swords />Golpear</Button>
          <Button disabled={blocked || battle.playerBlocked() || (fighter.cd['dash'] ?? 0) > 0} {...command(() => { battle.playerDash(); })} className="h-14 touch-none flex-col gap-1 border border-border bg-muted px-2 text-xs text-foreground hover:bg-muted/80"><Zap />Dash</Button>
          {battle.healRate(fighter) && <Button disabled={blocked || battle.playerBlocked()} {...held("heal")} className="col-span-2 h-11 touch-none border border-border bg-muted text-xs text-foreground hover:bg-muted/80"><HeartPulse />Curar</Button>}
        </div>
      </div>
      <div className="battle-abilities grid grid-cols-3 gap-2">
        {fighter.def.abilities.filter((a) => a.type !== "electricEnergy").map((a) => {
          const reason = battle.abilityUnavailable(a);
          const thrown = a.type === "perfectSphere" && fighter.sphere, beaming = a.type === "beam" && fighter.beam?.ab.id === a.id;
          const pooled = a.type === "liquidMetal" && !!fighter.yz?.pool;
          const cost = thrown ? 0 : (a.cost ?? a.costPerUnit ?? a.costPerTick ?? 0) * (fighter.def.costMult ?? 1);
          const mg = megumiButton(battle, fighter, a);
          return <Button key={a.id} title={a.name} disabled={blocked || !!reason} {...command(() => { battle.playerAbility(a.id); })} className="h-[68px] min-w-0 touch-none flex-col gap-1 whitespace-normal border border-border bg-card px-1.5 text-center text-foreground hover:bg-muted">
            <span className="line-clamp-2 text-[10px] leading-tight sm:text-xs">{mg ? mg.label : thrown ? "Lançar Esfera" : beaming ? `Soltar ${a.name}` : pooled ? "Recolher Metal" : a.name}</span>
            <span className="text-[10px] font-normal text-muted-foreground">{reason ?? mg?.note ?? (beaming ? "toque p/ parar" : pooled ? "ativo" : `${Number(cost.toFixed(2))} EA${a.costPerUnit ? "/un." : a.costPerTick ? "/tick" : ""}`)}</span>
          </Button>;
        })}
      </div>
    </section>
  );
}