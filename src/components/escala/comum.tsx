import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { corDoTexto, type Sigla } from "@/lib/escala";

/** Uma célula colorida, com a sigla (a cor vem do cadastro da sigla). */
export function Chip({
  sigla,
  longo = false,
  destaque = false,
}: {
  sigla: Sigla;
  longo?: boolean;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex h-8 items-center justify-center overflow-hidden whitespace-nowrap rounded-[7px] px-0.5 font-bold ${longo ? "text-[10px] tracking-tight" : "text-[11px]"} ${destaque ? "shadow-[inset_0_0_0_2px] shadow-primary" : ""}`}
      style={{ background: sigla.cor, color: corDoTexto(sigla.cor) }}
    >
      {sigla.sigla}
    </div>
  );
}

export function Legenda({ siglas, titulo = "Neste dia:" }: { siglas: Sigla[]; titulo?: string }) {
  if (!siglas.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold">{titulo}</span>
      {siglas.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3"
        >
          <span
            className="rounded-full px-2 py-0.5 font-bold"
            style={{ background: s.cor, color: corDoTexto(s.cor) }}
          >
            {s.sigla}
          </span>
          {s.significado}
        </span>
      ))}
      <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
        vazio: fora do horário
      </span>
    </div>
  );
}

export function AvisoDeFeriado({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      {children}
    </div>
  );
}

/**
 * A lista flutuante, ao lado do que foi clicado. Fecha ao clicar fora, com o Esc, ou
 * quando a PÁGINA rola (a rolagem da própria lista não conta). O clique que o navegador
 * dispara junto com o soltar do mouse (o que abriu a lista) é ignorado.
 */
export function Flutuante({
  ancora,
  aoFechar,
  largura = 260,
  children,
}: {
  ancora: DOMRect;
  aoFechar: () => void;
  largura?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ left: number; top: number }>({
    left: ancora.left,
    top: ancora.bottom + 4,
  });
  useLayoutEffect(() => {
    const alto = Math.min(360, ref.current?.scrollHeight ?? 300);
    setPosicao({
      left: Math.min(window.innerWidth - largura - 8, Math.max(8, ancora.left)),
      top:
        ancora.bottom + alto + 8 > window.innerHeight
          ? Math.max(8, ancora.top - alto - 4)
          : ancora.bottom + 4,
    });
  }, [ancora, largura]);
  useEffect(() => {
    const aberturaEm = Date.now();
    const clique = (e: MouseEvent) => {
      if (Date.now() - aberturaEm < 50) return; // o clique do mesmo gesto que abriu a lista
      if (ref.current && !ref.current.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    const rolagem = (e: Event) =>
      ref.current && !ref.current.contains(e.target as Node) && aoFechar();
    document.addEventListener("click", clique);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolagem, true);
    return () => {
      document.removeEventListener("click", clique);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolagem, true);
    };
  }, [aoFechar]);
  return (
    <div
      ref={ref}
      role="dialog"
      className="fixed z-50 max-h-[360px] overflow-auto rounded-xl border border-border bg-card p-2 shadow-xl"
      style={{ left: posicao.left, top: posicao.top, width: largura }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
