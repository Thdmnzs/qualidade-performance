import { ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";

import { linkSeguroDoNotion } from "@/lib/notion";
import {
  agrupar,
  casaComABusca,
  daBase,
  FLUKEPEDIAS,
  trechoDaBusca,
  type ProcessoDaLista,
} from "@/lib/processos";

/**
 * Os processos em duas colunas (14/10/2026): a Flukepédia | B2C e a Flukepédia | B2B, cada uma
 * recolhível, do tamanho da janela, com a rolagem por dentro e a categoria fixa no topo; e as outras
 * referências (o Guia e o Dicionário de Tags) embaixo. A busca filtra todas ao mesmo tempo.
 */
export function ColunasDosProcessos({ processos }: { processos: ProcessoDaLista[] }) {
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Record<string, boolean>>({
    B2C: true,
    B2B: true,
    Guia: false,
  });
  const alternar = (base: string) => setAbertas((a) => ({ ...a, [base]: !a[base] }));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          Processos{" "}
          <span className="text-sm font-normal text-muted-foreground">({processos.length})</span>
        </h2>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar um processo ou um código…"
          aria-label="Buscar um processo"
          className="h-10 w-full rounded-full border border-input bg-background px-4 text-sm sm:w-80"
        />
      </div>
      <div className="mt-3 grid items-start gap-4 lg:grid-cols-2">
        {(["B2C", "B2B"] as const).map((base) => (
          <Coluna
            key={base}
            rotulo={`Flukepédia | ${base}`}
            base={base}
            lista={daBase(processos, base)}
            busca={busca}
            aberta={abertas[base]! || !!busca.trim()}
            aoAlternar={() => alternar(base)}
            linkDaColuna={FLUKEPEDIAS[base]}
          />
        ))}
      </div>
      <div className="mt-4">
        <Coluna
          rotulo="Outras referências"
          base="Guia"
          lista={daBase(processos, "Guia")}
          busca={busca}
          aberta={abertas["Guia"]! || !!busca.trim()}
          aoAlternar={() => alternar("Guia")}
          linkDaColuna={null}
        />
      </div>
    </div>
  );
}

function Destacado({ texto, busca }: { texto: string; busca: string }) {
  const t = trechoDaBusca(texto, busca);
  if (!t) return <>{texto}</>;
  return (
    <>
      {t[0]}
      <mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40">
        {t[1]}
      </mark>
      {t[2]}
    </>
  );
}

function BotaoDoNotion({ url, rotulo }: { url: string | null; rotulo: string }) {
  const seguro = linkSeguroDoNotion(url);
  if (!seguro) return null;
  return (
    <a
      href={seguro}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${rotulo} no Notion (numa aba nova)`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold hover:border-primary hover:text-primary"
    >
      Abrir no Notion <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function Coluna(p: {
  rotulo: string;
  base: string;
  lista: ProcessoDaLista[];
  busca: string;
  aberta: boolean;
  aoAlternar: () => void;
  linkDaColuna: string | null;
}) {
  const visiveis = p.lista.filter((x) => casaComABusca(x, p.busca));
  const revisados = p.lista.filter((x) => x.revisado).length;
  const ehReferencia = p.base === "Guia";
  const andamento = p.lista.length ? Math.round((revisados / p.lista.length) * 100) : 0;
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card"
      aria-label={`Processos: ${p.rotulo}`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 ${p.aberta ? "border-b border-border" : ""}`}
      >
        <button
          type="button"
          onClick={p.aoAlternar}
          aria-expanded={p.aberta}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${p.aberta ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <b className="block">{p.rotulo}</b>
            <span className="block text-xs text-muted-foreground">
              {p.busca.trim() ? `${visiveis.length} de ${p.lista.length}` : p.lista.length}{" "}
              {p.lista.length === 1 ? "processo" : "processos"}
              {!ehReferencia && ` · ${revisados} revisados`}
            </span>
          </span>
          {!ehReferencia && p.lista.length > 0 && (
            <span
              className="hidden h-2 w-24 overflow-hidden rounded-full bg-secondary sm:block"
              title={`${revisados} de ${p.lista.length} revisados`}
            >
              <span className="block h-full bg-primary" style={{ width: `${andamento}%` }} />
            </span>
          )}
        </button>
        {p.linkDaColuna && <BotaoDoNotion url={p.linkDaColuna} rotulo={p.rotulo} />}
      </div>
      {p.aberta && (
        // Do tamanho da janela, com a rolagem por dentro (como na tela de Avaliações).
        <div className="max-h-[calc(100vh-13rem)] min-h-48 overflow-y-auto overscroll-contain">
          {visiveis.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {p.busca.trim()
                ? `Nenhum processo com “${p.busca.trim()}”.`
                : "Nenhum processo ainda. Sincronize para trazê-los do Notion."}
            </p>
          ) : (
            agrupar(visiveis).map((g, gi) => (
              <div key={`${g.categoria ?? "—"}-${gi}`}>
                <div className="sticky top-0 z-10 border-b border-border bg-secondary px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {g.categoria ?? (ehReferencia ? "Referências" : "Sem categoria")}
                </div>
                {g.subgrupos.map((s, si) => (
                  <div key={`${s.subcategoria ?? "—"}-${si}`}>
                    {s.subcategoria && (
                      <p className="px-4 pb-0.5 pt-2 text-[11px] font-bold text-primary">
                        {s.subcategoria}
                      </p>
                    )}
                    <ul>
                      {s.processos.map((x) => (
                        <li
                          key={x.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate" title={x.titulo}>
                              <Destacado texto={x.titulo} busca={p.busca} />
                            </p>
                            {x.codigo && (
                              <p className="font-mono text-[10.5px] text-muted-foreground">
                                <Destacado texto={x.codigo} busca={p.busca} />
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!ehReferencia &&
                              (x.revisado ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                                  Revisado
                                </span>
                              ) : (
                                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10.5px] font-bold">
                                  Pendente
                                </span>
                              ))}
                            <span className="text-[11px] text-muted-foreground" title="A versão">
                              v{x.versao_atual}
                            </span>
                            {ehReferencia && <BotaoDoNotion url={x.url} rotulo={x.titulo} />}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
