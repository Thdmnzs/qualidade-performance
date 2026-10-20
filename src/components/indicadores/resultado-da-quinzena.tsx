import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { formatarValor, textoDaMeta, type ChaveIndicador, type Metas } from "@/lib/indicadores";
import { emMinutos, naMeta, ontemDe, quinzenaDoDia } from "@/lib/indicadores-do-dia";

type Consolidado = {
  produtividade: number | null;
  sla_chat_s: number | null;
  sla_email_s: number | null;
  csat_time: number | null;
};
const ddmm = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}`;
/** Como na planilha: a produtividade com duas casas ("9,91"); o resto, como no CX Hub. */
const formatar = (chave: ChaveIndicador, v: number) =>
  chave === "produtividade"
    ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatarValor(chave, v);
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const nomeDa = (q: { de: string }) =>
  `${q.de.slice(8) === "01" ? "1ª" : "2ª"} quinzena · ${MESES[Number(q.de.slice(5, 7)) - 1]}/${q.de.slice(0, 4)}`;

/**
 * O resultado da quinzena (20/10/2026), nas Minhas métricas: a produtividade, o SLA e o CSAT do time na
 * quinzena, com a conta da aba Análise da planilha (as somas na produtividade e no CSAT; a média dos dias no
 * SLA). Na quinzena em andamento, é parcial (até ontem).
 */
export function ResultadoDaQuinzena({ hoje, metas }: { hoje: string; metas: Metas }) {
  const ontem = ontemDe(hoje);
  const atual = quinzenaDoDia(ontem);
  const anterior = quinzenaDoDia(ontemDe(atual.de));
  const opcoes = [anterior, atual];
  const [escolhida, setEscolhida] = useState(1);
  const q = opcoes[escolhida]!;
  const parcial = q.ate > ontem;
  const ate = parcial ? ontem : q.ate;
  const { data: r = null, isLoading } = useQuery({
    queryKey: ["resultado-da-quinzena", q.de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meus_indicadores", { _de: q.de, _ate: ate });
      if (error) throw error;
      return (data?.[0] ?? null) as Consolidado | null;
    },
  });
  const itens: { chave: ChaveIndicador; rotulo: string; valor: number | null }[] = [
    { chave: "produtividade", rotulo: "Produtividade (ajustada)", valor: r?.produtividade ?? null },
    { chave: "sla_chat", rotulo: "SLA geral do chat", valor: emMinutos(r?.sla_chat_s) },
    { chave: "sla_email", rotulo: "SLA geral do e-mail", valor: emMinutos(r?.sla_email_s) },
    { chave: "csat", rotulo: "CSAT do time", valor: r?.csat_time ?? null },
  ];
  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-card p-5"
      aria-label="O resultado da quinzena"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">🏁 O resultado da quinzena</p>
        <div
          className="inline-flex rounded-lg border border-border p-1 text-xs font-bold"
          role="tablist"
          aria-label="A quinzena"
        >
          {opcoes.map((o, i) => (
            <button
              key={o.de}
              type="button"
              role="tab"
              aria-selected={escolhida === i}
              onClick={() => setEscolhida(i)}
              className={`rounded-md px-2.5 py-1 ${escolhida === i ? "bg-primary text-primary-foreground" : ""}`}
            >
              {ddmm(o.de)} a {ddmm(o.ate)}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {nomeDa(q)} ·{" "}
        {parcial ? (
          <>
            <b className="text-[#B7791F]">parcial, até {ddmm(ontem)}</b> (o resultado final sai no
            fim da quinzena)
          </>
        ) : (
          "os dias da quinzena"
        )}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {itens.map((it) => {
          const ok = naMeta(metas, it.chave, it.valor);
          const m = metas[it.chave];
          return (
            <div
              key={it.chave}
              className={`rounded-xl border p-3 ${ok === null ? "border-border" : ok ? "border-[#B4DEC3] bg-[#E7F5EC] dark:border-[#2B6B44] dark:bg-[#12301F]" : "border-[#F4B4AE] bg-[#FDE4E2] dark:border-[#6B2D28] dark:bg-[#3A1C1A]"}`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {it.rotulo}
              </p>
              <p className="mt-1 text-2xl font-bold">
                {isLoading ? "…" : it.valor == null ? "—" : formatar(it.chave, it.valor)}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{m ? textoDaMeta(m) : ""}</span>
                {ok !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${ok ? "bg-[#157A3A]" : "bg-[#C62828]"}`}
                  >
                    {ok ? "✓ dentro" : "! fora"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-bold">Como a conta é feita</summary>
        <p className="mt-1">
          Como na aba Análise da planilha: a produtividade soma as conversas e as horas da quinzena
          (e divide uma pela outra); o CSAT soma as avaliações positivas e divide pelo total; o SLA
          é a média dos dias.
        </p>
      </details>
    </section>
  );
}
