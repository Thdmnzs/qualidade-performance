import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  atingiuMeta,
  formatarValor,
  O_QUE_MEDE,
  QUALIDADE_MINIMA,
  textoDaMeta,
  textoDaSituacao,
  type ChaveIndicador,
} from "@/lib/indicadores";
import { periodoPadrao, textoDoPeriodo, validarPeriodo, type Filtro } from "@/lib/periodo";
import { fetchMetas } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores · CX Hub" },
      { name: "description", content: "Seus indicadores no período que você escolher." },
    ],
  }),
  component: Indicadores,
});

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "5", rotulo: "5 dias" },
  { valor: "7", rotulo: "7 dias" },
  { valor: "personalizado", rotulo: "personalizado" },
];

function Indicadores() {
  const [filtro, setFiltro] = useState<Filtro>("5");
  const [periodo, setPeriodo] = useState(() => periodoPadrao(new Date()));
  const erro = filtro === "personalizado" ? validarPeriodo(periodo.de, periodo.ate) : null;

  const { data: metas = {} } = useQuery({ queryKey: ["metas-indicadores"], queryFn: fetchMetas });
  const { data: r, isLoading } = useQuery({
    queryKey: ["meus-indicadores", filtro, filtro === "personalizado" ? periodo : null],
    enabled: !erro,
    queryFn: async () => {
      const { data, error } =
        filtro === "personalizado"
          ? await supabase.rpc("meus_indicadores", { _de: periodo.de, _ate: periodo.ate })
          : await supabase.rpc("meus_indicadores_recentes", { _dias: Number(filtro) });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  // Cada cartão: o valor (já na unidade da meta) e a situação.
  const cartao = (
    chave: ChaveIndicador | "qualidade",
    valor: number | null,
    rotulo: string,
    doTime = false,
  ) => {
    const meta = chave === "qualidade" ? null : metas[chave];
    const naMeta =
      valor === null
        ? null
        : chave === "qualidade"
          ? valor >= QUALIDADE_MINIMA
          : meta
            ? atingiuMeta(meta, valor)
            : null;
    const sentido = chave === "qualidade" ? "minimo" : (meta?.sentido ?? "minimo");
    return (
      <CartaoIndicador
        key={chave}
        rotulo={rotulo}
        etiqueta={doTime ? "do time" : "individual"}
        valor={valor === null ? null : formatarValor(chave, valor)}
        descricao={O_QUE_MEDE[chave]}
        situacao={naMeta === null ? "aguardando" : naMeta ? "ok" : "fora"}
        textoDaSituacao={textoDaSituacao(naMeta, sentido)}
        {...(meta
          ? { meta: textoDaMeta(meta) }
          : chave === "qualidade"
            ? { meta: `mínimo ${QUALIDADE_MINIMA}` }
            : {})}
      />
    );
  };
  // O SLA vem do banco em segundos; as metas e a formatação usam minutos.
  const minutos = (s: number | null) => (s === null ? null : s / 60);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          titulo="Indicadores"
          descricao="Seus resultados no período que você escolher. Os dados vão até ontem."
        />
        <div className="flex flex-wrap items-center gap-3">
          {r && (
            <span className="text-xs font-bold">
              {textoDoPeriodo(r.de, r.ate, r.dias_com_dados)}
            </span>
          )}
          <div
            className="inline-flex rounded-lg bg-secondary p-1"
            role="tablist"
            aria-label="Período"
          >
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                role="tab"
                aria-selected={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={`rounded-md px-3 py-1.5 text-sm ${filtro === f.valor ? "bg-card font-bold" : ""}`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtro === "personalizado" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-1">
            <Label htmlFor="per-de">De</Label>
            <Input
              id="per-de"
              type="date"
              value={periodo.de}
              onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="per-ate">Até</Label>
            <Input
              id="per-ate"
              type="date"
              value={periodo.ate}
              onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
            />
          </div>
          <p className={`text-xs ${erro ? "font-bold text-destructive" : "text-muted-foreground"}`}>
            {erro ?? "Para um dia só, escolha a mesma data nos dois campos."}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !r || r.dias_com_dados === 0 ? (
        <EmptyState
          titulo="Nenhum dado ainda"
          texto={
            filtro === "personalizado"
              ? "Não há indicadores importados para os dias escolhidos."
              : "Seus indicadores aparecem aqui assim que os primeiros dias forem importados."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cartao("qualidade", n(r.qualidade), "Qualidade")}
          {cartao("produtividade", n(r.produtividade), "Produtividade")}
          {cartao("sla_chat", minutos(n(r.sla_chat_s)), "SLA Chat")}
          {cartao("sla_email", minutos(n(r.sla_email_s)), "SLA E-mail")}
          {cartao("csat", n(r.csat_time), "CSAT", true)}
          {cartao("horas_online", n(r.horas_semanais), "Horas logadas")}
        </div>
      )}
    </div>
  );
}
