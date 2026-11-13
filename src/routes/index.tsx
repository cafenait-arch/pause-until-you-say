import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CHARS } from "@/data/roster";
import { Battle, W, H, TIME_SCALE } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { BattleControls } from "@/components/battle-controls";
import { Pause, Play, RotateCcw, X } from "lucide-react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Square Jujutsu — Simulador de Luta" },
      { name: "description", content: "Simulador minimalista de lutas de Jujutsu Kaisen com quadrados e IA estratégica." },
      { property: "og:title", content: "Square Jujutsu — Simulador de Luta" },
      { property: "og:description", content: "Lutas de Jujutsu Kaisen com quadrados e IA estratégica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Bar({ v, max, kind }: { v: number; max: number; kind: "hp" | "en" }) {
  return (
    <div className="h-1.5 w-full bg-muted">
      <div className={kind === "hp" ? "h-full bg-primary transition-all" : "h-full bg-accent-foreground transition-all"} style={{ width: `${max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0}%` }} />
    </div>
  );
}

function Index() {
  const [a, setA] = useState("choso");
  const [b, setB] = useState("yuji");
  const [battle, setBattle] = useState<Battle | null>(null);
  const [control, setControl] = useState<"0" | "1" | "ai">("0");
  const [paused, setPaused] = useState(false);
  const [, tick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  const start = () => {
    const first = CHARS.find((c) => c.id === a), second = CHARS.find((c) => c.id === b);
    if (first && second) { battle?.resetInput(); setPaused(false); setBattle(new Battle(first, second, control === "ai" ? null : control === "0" ? 0 : 1)); }
  };

  useEffect(() => {
    if (!battle || paused) return;
    let raf = 0, last = performance.now(), ui = 0;
    const loop = (t: number) => {
      const dt = Math.min(50, t - last); last = t;
      if (document.hidden) { battle.resetInput(); raf = requestAnimationFrame(loop); return; }
      battle.step(dt);
      const c = canvas.current?.getContext("2d"); if (c) battle.draw(c);
      if ((ui += dt) > 100) { ui = 0; tick((n) => n + 1); }
      if (!battle.winner) raf = requestAnimationFrame(loop);
      else tick((n) => n + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [battle, paused]);

  return (
    <main className={`battle-page min-h-screen bg-background px-3 py-5 font-mono text-foreground sm:px-4 sm:py-8 ${battle ? "battle-active" : ""} ${battle?.player !== null ? "battle-manual" : ""}`}>
      <div className="battle-layout mx-auto max-w-[940px] space-y-4 sm:space-y-5">
        <header className="battle-setup space-y-3">
          <div>
            <h1 className="text-xl sm:text-2xl">⬛ SQUARE JUJUTSU</h1>
            <p className="text-xs text-muted-foreground">combate · Jujutsu Kaisen</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
            {[[a, setA], [b, setB]].map(([v, set], i) => (
              <select key={i} aria-label={`Lutador ${i + 1}`} value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="w-full min-w-0 truncate border border-border bg-card px-2 py-2">
                {CHARS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ))}
            <Button onClick={start} className="shrink-0">
              {battle ? <RotateCcw /> : <Play />}{battle?.winner ? "Revanche" : battle ? "Reiniciar" : "Lutar"}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="control" className="shrink-0 text-muted-foreground">Controle</label>
            <select id="control" aria-label="Controle" value={control} onChange={(e) => setControl(e.target.value as "0" | "1" | "ai")} className="h-11 min-w-0 flex-1 border border-border bg-card px-2">
              <option value="0">Você · Lutador 1</option><option value="1">Você · Lutador 2</option><option value="ai">IA × IA</option>
            </select>
            {battle && !battle.winner && <Button aria-label={paused ? "Continuar" : "Pausar"} title={paused ? "Continuar" : "Pausar"} className="size-11 shrink-0" size="icon" onClick={() => { battle.resetInput(); setPaused((p) => !p); }}>{paused ? <Play /> : <Pause />}</Button>}
          </div>
        </header>

        {battle && <nav aria-label="Opções da luta" className="landscape-toolbar">
          <Button size="icon" variant="outline" aria-label="Voltar aos lutadores" title="Voltar aos lutadores" onClick={() => { battle.resetInput(); setBattle(null); setPaused(false); }}><X /></Button>
          <Button size="icon" variant="outline" aria-label="Reiniciar luta" title="Reiniciar luta" onClick={start}><RotateCcw /></Button>
          {!battle.winner && <Button size="icon" aria-label={paused ? "Continuar luta" : "Pausar luta"} title={paused ? "Continuar luta" : "Pausar luta"} onClick={() => { battle.resetInput(); setPaused((p) => !p); }}>{paused ? <Play /> : <Pause />}</Button>}
        </nav>}

        {battle && (
          <div className="battle-hud grid grid-cols-2 gap-3 text-xs sm:gap-6">
            {battle.f.map((f, i) => (
              <div key={i} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`fighter-swatch fighter-${f.def.id}`} />
                  <span className="truncate">{f.def.name}</span>
                </div>
                <p className="text-muted-foreground">Vida {Math.ceil(f.hp)} · EA {Math.floor(f.en)}</p>
                <Bar v={f.hp} max={f.def.hp} kind="hp" />
                <Bar v={f.en} max={battle.maxEn(f)} kind="en" />
                {f.jackpot > 0 && <p className="text-foreground">🎰 JACKPOT · {(f.jackpot / 1000).toFixed(1)}s</p>}
                {f.healing && <p className="text-muted-foreground">curando…</p>}
                {f.def.weapon && <p className="text-muted-foreground">{f.def.weapon.name} · {f.weaponHp > 0 ? `${Math.ceil(f.weaponHp)}/${f.def.weapon.durability}` : "quebrado"}</p>}
                {f.poison && <p className="text-foreground">☠ envenenado · {f.poison.left}s</p>}
                {f.sealed > 0 && <p className="text-foreground">⚖ técnica confiscada · {(f.sealed / 1000).toFixed(0)}s</p>}
                {f.executioner > 0 && <p className="text-foreground">⚖ Espada do Carrasco · {(f.executioner / 1000).toFixed(0)}s</p>}
                {battle.domains.filter((d) => d.owner === i && d.ab.type === "pachinko" && !d.won).map((d) => (
                  <p key="ind" className="text-foreground">🎰 Indicador · {Math.round(d.indicator * 100)}% · {d.mode}</p>
                ))}
                {f.yz && f.yz.pool && <p className="text-foreground">Metal Líquido ativo{f.metal > 0 ? " · casulo" : ""}</p>}
                {f.yz && f.yz.wings > 0 && <p className="text-foreground">Asas de Inseto · {(f.yz.wings / TIME_SCALE / 1000).toFixed(1)}s</p>}
                {f.yz && f.yz.plates > 0 && <p className="text-muted-foreground">Placas Metálicas · {f.yz.plates}</p>}
                {f.yz && f.armor > 0 && <p className="text-muted-foreground">Armadura de Inseto · {Math.ceil(f.armor)}</p>}
                {f.yz && f.sphere && <p className="text-foreground">● Esfera Verdadeira pronta</p>}
                {f.def.id === "kashimo" && <p className="text-muted-foreground">Cargas no oponente · {f.charges}</p>}
                {f.mg && f.mg.hide > 0 && <p className="text-foreground">Nas sombras</p>}
                {f.mg && battle.shiki.some((s) => s.owner === i) && <p className="text-muted-foreground">Shikigamis · {[...new Set(battle.shiki.filter((s) => s.owner === i && s.kind !== "copy").map((s) => ({ dog: "Cão Divino", frog: `Sapo ×${battle.shiki.filter((x) => x.owner === i && x.kind === "frog").length}`, nue: "Nue", rabbit: "Coelhos", elephant: "Elefante Máximo", mahoraga: "Mahoraga", copy: "" })[s.kind]))].join(" · ")}</p>}
                {f.arsenal.length > 0 && <p className="text-muted-foreground">Espíritos · G4 {f.arsenal[0]} · G3 {f.arsenal[1]} · G2 {f.arsenal[2]} · G1 {f.arsenal[3]} · Esp {f.arsenal[4]}</p>}
                {f.amber > 0 && <p className="text-foreground">Besta Mítica Âmbar · {(f.amber / TIME_SCALE / 1000).toFixed(1)}s</p>}
                {f.garuda && <>
                  <p className="text-muted-foreground">{f.def.companion?.name} · {Math.ceil(f.garuda.hp)} / {f.def.companion?.hp}</p>
                  <Bar v={f.garuda.hp} max={f.def.companion?.hp ?? 1} kind="hp" />
                  <p className="text-muted-foreground">Soco · {f.starForce}</p>
                  {f.garuda.massT > 0 && <p className="text-foreground">Garuda · Massa Virtual</p>}
                </>}
              </div>
            ))}
          </div>
        )}

        <div className="battle-arena relative border border-border bg-card">
          <canvas aria-label="Arena de combate" ref={canvas} width={W} height={H} className="block h-auto w-full" />
          {!battle && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">selecione os lutadores e aperte Lutar</div>}
          {battle?.winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70">
              <p className="px-3 text-center text-xl">{battle.winner === "Empate" ? "Empate · destruição mútua" : `${battle.winner} venceu`}</p>
              <Button onClick={start}><RotateCcw />Revanche</Button>
            </div>
          )}
        </div>

        {battle && battle.player !== null && !battle.winner && <BattleControls battle={battle} paused={paused} refresh={() => tick((n) => n + 1)} />}

        {battle && (
          <ul className="battle-log max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground sm:max-h-none">
            {battle.log.map((l, i) => <li key={i} className={i === 0 ? "text-foreground" : ""}>{l}</li>)}
          </ul>
        )}
      </div>
    </main>
  );
}
