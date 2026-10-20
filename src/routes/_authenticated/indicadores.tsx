import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { EvolucaoDoDia } from "@/components/indicadores/evolucao-do-dia";
import { FiltroDoDia } from "@/components/indicadores/filtro-do-dia";
import { ResultadoDaQuinzena } from "@/components/indicadores/resultado-da-quinzena";
import { EmptyState, PageHeader } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { hojeEmFortaleza } from "@/lib/format";
import {
  formatarValor,
  textoDaMeta,
  textoDaSituacao,
  type ChaveIndicador,
  type Metas,
} from "@/lib/indicadores";
import { diasQueFaltam, emMinutos, naMeta, ontemDe, quinzenaDoDia } from "@/lib/indicadores-do-dia";
import { fetchMetas } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Minhas métricas · CX Hub" },
      {
        name: "description",
        content: "Seus indicadores, atualizados todo dia com o dia anterior.",
      },
    ],
  }),
  component: MeusIndicadores,
});

type Dia = {
  dia: string;
  conversas_atribuidas: number | null;
  autoatribuicoes: number | null;
  tempo_ativo_min: number | null;
  sla_chat_s: number | null;
  sla_email_s: number | null;
  sla_b2c_chat_1_s: number | null;
  sla_b2c_email_1_s: number | null;
  sla_b2c_chat_g_s: number | null;
  sla_b2c_email_g_s: number | null;
  sla_b2b_chat_1_s: number | null;
  sla_b2b_email_1_s: number | null;
  sla_b2b_chat_g_s: number | null;
  sla_b2b_email_g_s: number | null;
};
type Consolidado = {
  qualidade: number | null;
  avaliacoes: number | null;
  produtividade: number | null;
  csat_time: number | null;
  horas_semanais: number | null;
};
const ABAS = [
  ["produtividade", "Produtividade"],
  ["sla", "SLA"],
  ["csat", "CSAT"],
] as const;
type Aba = (typeof ABAS)[number][0];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}`;
const diaDaSemana = (s: string) => SEMANA[new Date(`${s}T12:00:00Z`).getUTCDay()];
const dec = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// As contas da quinzena, a partir dos dias (as somas; e o SLA, a média dos dias).
const soma = (ds: Dia[], f: (d: Dia) => number | null) => ds.reduce((a, d) => a + (f(d) ?? 0), 0);
const horasDe = (ds: Dia[]) => soma(ds, (d) => d.tempo_ativo_min) / 60;
const porHora = (ds: Dia[], f: (d: Dia) => number | null) => {
  const validos = ds.filter((d) => d.conversas_atribuidas != null && d.tempo_ativo_min);
  const h = horasDe(validos);
  return h ? soma(validos, f) / h : null;
};
const mediaDosDias = (ds: Dia[], k: keyof Dia) => {
  const v = ds.map((d) => d[k] as number | null).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const ajustada = (d: Dia) => (d.conversas_atribuidas ?? 0) - (d.autoatribuicoes ?? 0);

/**
 * Minhas métricas (20/10/2026; antes "Meus indicadores"): em abas (a Produtividade, o SLA e o CSAT), atualizadas todo
 * dia às 8h com o dia anterior. O valor grande é a quinzena até ontem (parcial: o oficial sai no fechamento);
 * a linha "Ontem", o D-1. Os cartões sem meta são informativos (a borda tracejada, a pílula azul).
 */
function MeusIndicadores() {
  const { employee, isLoading } = usePermissoes();
  const [aba, setAba] = useState<Aba>("produtividade");
  const hoje = hojeEmFortaleza();
  const ontem = ontemDe(hoje);
  // O dia escolhido no filtro (o padrão é ontem): os cartões mostram o número DESSE dia (16/10/2026).
  const [dia, setDia] = useState(ontem);
  const q = quinzenaDoDia(ontem); // a quinzena atual
  const qDoDia = quinzenaDoDia(dia); // a quinzena do dia escolhido (a da média e do gráfico)
  const anterior = quinzenaDoDia(ontemDe(q.de));
  const { data: metas = {} as Metas } = useQuery({
    queryKey: ["metas-indicadores"],
    queryFn: fetchMetas,
  });
  const { data: todosOsDias = [] } = useQuery({
    queryKey: ["meus-dias", employee?.id, qDoDia.de, ontem],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indicadores_diarios")
        .select(
          "dia, conversas_atribuidas, autoatribuicoes, tempo_ativo_min, sla_chat_s, sla_email_s, sla_b2c_chat_1_s, sla_b2c_email_1_s, sla_b2c_chat_g_s, sla_b2c_email_g_s, sla_b2b_chat_1_s, sla_b2b_email_1_s, sla_b2b_chat_g_s, sla_b2b_email_g_s",
        )
        .eq("employee_id", employee!.id)
        .gte("dia", qDoDia.de < q.de ? qDoDia.de : q.de)
        .lte("dia", ontem)
        .order("dia");
      if (error) throw error;
      return (data ?? []) as Dia[];
    },
  });
  const { data: csatDoDia = null } = useQuery({
    queryKey: ["csat-do-dia", dia],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meus_indicadores", { _de: dia, _ate: dia });
      if (error) throw error;
      return ((data?.[0] as Consolidado | undefined)?.csat_time ?? null) as number | null;
    },
  });

  if (isLoading) return null;
  if (!employee)
    return (
      <EmptyState
        titulo="Cadastro não encontrado"
        texto="Seu acesso não está ligado a um colaborador."
      />
    );
  // A quinzena do dia escolhido, ATÉ ele (para a média, na linha de baixo); e o próprio dia (o número grande).
  const dias = todosOsDias.filter((d) => d.dia >= qDoDia.de && d.dia <= dia);
  const diasAnt: Dia[] = [];
  const diasDoGrafico = todosOsDias.filter((d) => d.dia >= qDoDia.de && d.dia <= qDoDia.ate);
  const d1 = todosOsDias.find((d) => d.dia === dia) ?? null;
  const rotuloDoDia = `em ${diaDaSemana(dia)} ${ddmm(dia)}`;
  const fmt = (chave: ChaveIndicador | "qualidade", v: number | null | undefined) =>
    v == null ? null : formatarValor(chave, v);
  const situacaoDe = (ok: boolean | null) =>
    (ok === null ? "aguardando" : ok ? "ok" : "fora") as "ok" | "fora" | "aguardando";

  /**
   * Um cartão com meta (16/10/2026): o número grande é o do DIA escolhido (e a pílula diz se ele bateu a
   * meta). A média da quinzena não aparece aqui: o resultado da quinzena só sai na Visão geral, na
   * publicação.
   */
  const comMeta = (p: {
    chave: ChaveIndicador;
    rotulo: string;
    etiqueta?: "individual" | "do time";
    valor: number | null; // a média da quinzena, até o dia
    ontem?: number | null; // o número do dia
    anterior?: number | null;
    descricao: string;
    formato?: (v: number) => string;
  }) => {
    const f = p.formato ?? ((v: number) => formatarValor(p.chave, v));
    const doDia = p.ontem ?? null;
    const ok = naMeta(metas, p.chave, doDia);
    const m = metas[p.chave];
    return (
      <CartaoIndicador
        rotulo={p.rotulo}
        etiqueta={p.etiqueta ?? "individual"}
        valor={doDia == null ? null : f(doDia)}
        semValor="sem dados neste dia"
        situacao={situacaoDe(ok)}
        textoDaSituacao={doDia == null ? "sem dados" : textoDaSituacao(ok, m?.sentido ?? "minimo")}
        {...(m ? { meta: textoDaMeta(m) } : {})}
        descricao={p.descricao}
        legenda={rotuloDoDia}
      />
    );
  };
  /** Um cartão informativo (sem meta): o número do dia. */
  const informativo = (p: {
    rotulo: string;
    valor: string | null;
    ontem: string | null;
    anterior?: string | null;
    descricao: string;
  }) => (
    <CartaoIndicador
      rotulo={p.rotulo}
      etiqueta="sem meta"
      valor={p.ontem}
      semValor="sem dados neste dia"
      situacao="info"
      textoDaSituacao="informativo"
      descricao={p.descricao}
      legenda={rotuloDoDia}
    />
  );

  const segundos = (k: keyof Dia, ds = dias) => mediaDosDias(ds, k);
  const tempo = (s: number | null) => (s == null ? null : formatarValor("sla_chat", s / 60));

  return (
    <div>
      <PageHeader
        titulo="Minhas métricas"
        descricao={`📥 Atualizados todo dia às 8h, com o dia anterior. A quinzena vai de ${ddmm(q.de)} a ${ddmm(q.ate)}.`}
      />

      {/* O resultado da quinzena (20/10/2026), com a conta da planilha. */}
      <ResultadoDaQuinzena hoje={hoje} metas={metas} />
      {/* O filtro do dia (a peça compartilhada com a supervisão). */}
      <div className="mt-5">
        <FiltroDoDia dia={dia} ontem={ontem} aoMudar={setDia} semDados={!d1} />
      </div>
      <div
        className="mt-5 flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Os indicadores"
      >
        {ABAS.map(([k, nome]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={`whitespace-nowrap border-b-[3px] px-4 py-2.5 text-sm font-bold ${aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {nome}
          </button>
        ))}
      </div>

      <section className="mt-4" role="tabpanel">
        {aba === "produtividade" && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {informativo({
                rotulo: "Por hora ativa: total",
                valor:
                  porHora(dias, (d) => d.conversas_atribuidas) == null
                    ? null
                    : dec(porHora(dias, (d) => d.conversas_atribuidas)!),
                ontem: d1?.tempo_ativo_min
                  ? dec((d1.conversas_atribuidas ?? 0) / (d1.tempo_ativo_min / 60))
                  : null,
                anterior:
                  porHora(diasAnt, (d) => d.conversas_atribuidas) == null
                    ? null
                    : dec(porHora(diasAnt, (d) => d.conversas_atribuidas)!),
                descricao:
                  "Todas as conversas atribuídas a você ÷ as suas horas ativas (inclusive as que você mesmo se atribuiu).",
              })}
              {informativo({
                rotulo: "Por hora ativa: membro da equipe",
                valor:
                  porHora(dias, (d) => d.autoatribuicoes) == null
                    ? null
                    : dec(porHora(dias, (d) => d.autoatribuicoes)!),
                ontem: d1?.tempo_ativo_min
                  ? dec((d1.autoatribuicoes ?? 0) / (d1.tempo_ativo_min / 60))
                  : null,
                anterior:
                  porHora(diasAnt, (d) => d.autoatribuicoes) == null
                    ? null
                    : dec(porHora(diasAnt, (d) => d.autoatribuicoes)!),
                descricao:
                  "As conversas que você mesmo se atribuiu (como membro da equipe) ÷ as suas horas ativas.",
              })}
              {comMeta({
                chave: "produtividade",
                rotulo: "Por hora ativa: ajustada",
                valor: porHora(dias, ajustada),
                ontem: d1?.tempo_ativo_min ? ajustada(d1) / (d1.tempo_ativo_min / 60) : null,
                descricao:
                  "As conversas atribuídas, sem as que você mesmo se atribuiu, ÷ as suas horas ativas. É a sua produtividade: a que entra para o bônus e o ranking.",
                formato: dec,
              })}
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <p className="font-bold">Dia a dia na quinzena</p>
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                <EvolucaoDoDia
                  destaque={dia}
                  titulo="Por hora ativa: ajustada"
                  pontos={diasDoGrafico.map((d) => ({
                    dia: d.dia,
                    valor: d.tempo_ativo_min ? ajustada(d) / (d.tempo_ativo_min / 60) : null,
                  }))}
                  meta={metas.produtividade?.meta ?? null}
                  menorMelhor={false}
                  formatar={dec}
                />
              </div>
            </div>
          </>
        )}

        {aba === "sla" && (
          <>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              O SLA geral (o do Intercom, com o B2C e o B2B juntos)
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {comMeta({
                chave: "sla_chat",
                rotulo: "SLA geral do chat",
                valor: emMinutos(segundos("sla_chat_s")),
                ontem: emMinutos(d1?.sla_chat_s),
                anterior: emMinutos(segundos("sla_chat_s", diasAnt)),
                descricao:
                  "Quanto tempo o cliente espera pela sua resposta no chat, com o B2C e o B2B juntos, como o Intercom mede. É o que vale para a meta.",
              })}
              {comMeta({
                chave: "sla_email",
                rotulo: "SLA geral do e-mail",
                valor: emMinutos(segundos("sla_email_s")),
                ontem: emMinutos(d1?.sla_email_s),
                anterior: emMinutos(segundos("sla_email_s", diasAnt)),
                descricao:
                  "Quanto tempo o cliente espera pela sua resposta por e-mail, com o B2C e o B2B juntos, como o Intercom mede. É o que vale para a meta.",
              })}
            </div>
            {(["b2c", "b2b"] as const).map((seg) => (
              <div key={seg}>
                <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {seg.toUpperCase()}
                </p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {(["chat", "email"] as const).map((canal) => {
                    const k1 = `sla_${seg}_${canal}_1_s` as keyof Dia;
                    const kg = `sla_${seg}_${canal}_g_s` as keyof Dia;
                    const nomeCanal = canal === "chat" ? "chat" : "e-mail";
                    return (
                      <div key={canal}>
                        <p className="mb-2 text-sm font-bold">
                          {canal === "chat" ? "💬 Chat" : "✉️ E-mail"}
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {informativo({
                            rotulo: "1ª resposta",
                            valor: tempo(segundos(k1)),
                            ontem: tempo((d1?.[k1] as number | null) ?? null),
                            anterior: tempo(segundos(k1, diasAnt)),
                            descricao: `Quanto tempo, em média, o cliente ${seg.toUpperCase()} espera pela primeira resposta no ${nomeCanal}.`,
                          })}
                          {comMeta({
                            chave: canal === "chat" ? "sla_chat" : "sla_email",
                            rotulo: "Geral",
                            valor: emMinutos(segundos(kg)),
                            ontem: emMinutos((d1?.[kg] as number | null) ?? null),
                            anterior: emMinutos(segundos(kg, diasAnt)),
                            descricao: `Quanto tempo, em média, o cliente ${seg.toUpperCase()} espera por cada resposta no ${nomeCanal} (e não só a primeira).`,
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
              <p className="font-bold">Dia a dia na quinzena</p>
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                <EvolucaoDoDia
                  destaque={dia}
                  titulo="SLA geral do chat"
                  pontos={diasDoGrafico.map((d) => ({
                    dia: d.dia,
                    valor: emMinutos(d.sla_chat_s),
                  }))}
                  meta={metas.sla_chat?.meta ?? null}
                  menorMelhor
                  formatar={(v) => formatarValor("sla_chat", v)}
                />
                <EvolucaoDoDia
                  destaque={dia}
                  titulo="SLA geral do e-mail"
                  pontos={diasDoGrafico.map((d) => ({
                    dia: d.dia,
                    valor: emMinutos(d.sla_email_s),
                  }))}
                  meta={metas.sla_email?.meta ?? null}
                  menorMelhor
                  formatar={(v) => formatarValor("sla_email", v)}
                />
              </div>
            </div>
          </>
        )}

        {aba === "csat" && (
          <div className="grid gap-4 md:grid-cols-2">
            {comMeta({
              chave: "csat",
              rotulo: "CSAT do time",
              etiqueta: "do time",
              valor: null,
              ontem: csatDoDia,
              descricao:
                "A satisfação dos clientes com o atendimento do time: as avaliações positivas ÷ todas as avaliações. É o que vale para a meta.",
            })}
          </div>
        )}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Os números da quinzena são parciais (até ontem): o resultado oficial sai no fechamento,
        depois das contestações.
      </p>
    </div>
  );
}
