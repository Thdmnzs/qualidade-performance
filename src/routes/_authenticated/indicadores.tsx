import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { EvolucaoDoDia } from "@/components/indicadores/evolucao-do-dia";
import { EmptyState, PageHeader } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { hojeEmFortaleza } from "@/lib/format";
import {
  formatarValor,
  nivelQualidade,
  QUALIDADE_MINIMA,
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
      { title: "Indicadores · CX Hub" },
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
  ["qualidade", "Qualidade"],
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
 * Meus indicadores (16/10/2026): em abas (a Produtividade, o SLA, a Qualidade e o CSAT), atualizados todo
 * dia às 8h com o dia anterior. O valor grande é a quinzena até ontem (parcial: o oficial sai no fechamento);
 * a linha "Ontem", o D-1. Os cartões sem meta são informativos (a borda tracejada, a pílula azul).
 */
function MeusIndicadores() {
  const { employee, isLoading } = usePermissoes();
  const [aba, setAba] = useState<Aba>("produtividade");
  const hoje = hojeEmFortaleza();
  const ontem = ontemDe(hoje);
  const q = quinzenaDoDia(ontem);
  const anterior = quinzenaDoDia(ontemDe(q.de));
  const { data: metas = {} as Metas } = useQuery({
    queryKey: ["metas-indicadores"],
    queryFn: fetchMetas,
  });
  const { data: c } = useQuery({
    queryKey: ["meus-indicadores", q.de, ontem],
    enabled: !!employee,
    queryFn: async () => {
      const [atual, ant] = await Promise.all([
        supabase.rpc("meus_indicadores", { _de: q.de, _ate: ontem }),
        supabase.rpc("meus_indicadores", { _de: anterior.de, _ate: anterior.ate }),
      ]);
      if (atual.error) throw atual.error;
      return {
        atual: (atual.data?.[0] ?? null) as Consolidado | null,
        anterior: (ant.data?.[0] ?? null) as Consolidado | null,
      };
    },
  });
  const { data: todosOsDias = [] } = useQuery({
    queryKey: ["meus-dias", employee?.id, anterior.de, ontem],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indicadores_diarios")
        .select(
          "dia, conversas_atribuidas, autoatribuicoes, tempo_ativo_min, sla_chat_s, sla_email_s, sla_b2c_chat_1_s, sla_b2c_email_1_s, sla_b2c_chat_g_s, sla_b2c_email_g_s, sla_b2b_chat_1_s, sla_b2b_email_1_s, sla_b2b_chat_g_s, sla_b2b_email_g_s",
        )
        .eq("employee_id", employee!.id)
        .gte("dia", anterior.de)
        .lte("dia", ontem)
        .order("dia");
      if (error) throw error;
      return (data ?? []) as Dia[];
    },
  });
  const { data: quiz = null } = useQuery({
    queryKey: ["meu-quiz", employee?.id, q.de],
    enabled: !!employee,
    queryFn: async () => {
      const { data: f } = await supabase
        .from("fortnights")
        .select("id")
        .eq("data_inicio", q.de)
        .maybeSingle();
      if (!f) return null;
      const { data } = await supabase
        .from("quiz_results")
        .select("entregue")
        .eq("employee_id", employee!.id)
        .eq("fortnight_id", f.id)
        .maybeSingle();
      return data?.entregue ?? false;
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
  const atual = c?.atual ?? null;
  const ant = c?.anterior ?? null;
  const dias = todosOsDias.filter((d) => d.dia >= q.de);
  const diasAnt = todosOsDias.filter((d) => d.dia >= anterior.de && d.dia <= anterior.ate);
  const d1 = dias.find((d) => d.dia === ontem) ?? null;
  const rotuloOntem = `Ontem (${diaDaSemana(ontem)} ${ddmm(ontem)})`;
  const fmt = (chave: ChaveIndicador | "qualidade", v: number | null | undefined) =>
    v == null ? null : formatarValor(chave, v);
  const situacaoDe = (ok: boolean | null) =>
    (ok === null ? "aguardando" : ok ? "ok" : "fora") as "ok" | "fora" | "aguardando";

  /** Um cartão com meta (o verde ou o vermelho claro, pela meta). */
  const comMeta = (p: {
    chave: ChaveIndicador;
    rotulo: string;
    etiqueta?: "individual" | "do time";
    valor: number | null;
    ontem?: number | null;
    anterior: number | null;
    descricao: string;
    formato?: (v: number) => string;
  }) => {
    const f = p.formato ?? ((v: number) => formatarValor(p.chave, v));
    const ok = naMeta(metas, p.chave, p.valor);
    const m = metas[p.chave];
    return (
      <CartaoIndicador
        rotulo={p.rotulo}
        etiqueta={p.etiqueta ?? "individual"}
        valor={p.valor == null ? null : f(p.valor)}
        anterior={p.anterior == null ? "—" : f(p.anterior)}
        situacao={situacaoDe(ok)}
        textoDaSituacao={textoDaSituacao(ok, m?.sentido ?? "minimo")}
        {...(m ? { meta: textoDaMeta(m) } : {})}
        descricao={p.descricao}
        legenda="na quinzena, até ontem"
        {...("ontem" in p
          ? {
              ontem: {
                rotulo: rotuloOntem,
                valor: d1 && p.ontem != null ? f(p.ontem) : d1 ? "—" : null,
                naMeta: naMeta(metas, p.chave, p.ontem),
              },
            }
          : {})}
      />
    );
  };
  /** Um cartão informativo (sem meta). */
  const informativo = (p: {
    rotulo: string;
    valor: string | null;
    ontem: string | null;
    anterior: string | null;
    descricao: string;
  }) => (
    <CartaoIndicador
      rotulo={p.rotulo}
      etiqueta="sem meta"
      valor={p.valor}
      anterior={p.anterior ?? "—"}
      situacao="info"
      textoDaSituacao="informativo"
      descricao={p.descricao}
      legenda="na quinzena, até ontem"
      ontem={{ rotulo: rotuloOntem, valor: d1 ? (p.ontem ?? "—") : null, naMeta: null }}
    />
  );

  const requisitos = [
    {
      nome: "Qualidade",
      ok: atual?.qualidade == null ? null : atual.qualidade >= QUALIDADE_MINIMA,
      alvo: `${QUALIDADE_MINIMA} ou mais`,
      pct: atual?.qualidade ?? 0,
      texto:
        atual?.qualidade == null ? "na publicação" : formatarValor("qualidade", atual.qualidade),
    },
    {
      nome: "Produtividade",
      ok: naMeta(metas, "produtividade", atual?.produtividade),
      alvo: metas.produtividade ? textoDaMeta(metas.produtividade) : "—",
      pct: ((atual?.produtividade ?? 0) / ((metas.produtividade?.meta ?? 1) * 1.25)) * 100,
      texto: fmt("produtividade", atual?.produtividade) ?? "—",
    },
    {
      nome: "Horas por semana",
      ok: naMeta(metas, "horas_online", atual?.horas_semanais),
      alvo: metas.horas_online ? textoDaMeta(metas.horas_online) : "—",
      pct: ((atual?.horas_semanais ?? 0) / ((metas.horas_online?.meta ?? 1) * 1.25)) * 100,
      texto: fmt("horas_online", atual?.horas_semanais) ?? "—",
    },
    {
      nome: "Quiz",
      ok: quiz,
      alvo: "entregue",
      pct: quiz ? 100 : 0,
      texto: quiz ? "entregue" : "pendente",
    },
  ];
  const faltam = diasQueFaltam(hoje, q.ate);
  const segundos = (k: keyof Dia, ds = dias) => mediaDosDias(ds, k);
  const tempo = (s: number | null) => (s == null ? null : formatarValor("sla_chat", s / 60));

  return (
    <div>
      <PageHeader
        titulo="Meus indicadores"
        descricao={`📥 Atualizados todo dia às 8h, com o dia anterior. A quinzena vai de ${ddmm(q.de)} a ${ddmm(q.ate)}.`}
      />
      <div
        className={`rounded-2xl border bg-card p-4 ${requisitos.some((r) => r.ok === false) ? "border-destructive/40" : "border-border"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">
            {requisitos.some((r) => r.ok === false)
              ? "⚠️ Para concorrer nesta quinzena, falta:"
              : "✅ Até agora, você está no caminho para concorrer"}
          </p>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">
            {faltam === 1 ? "falta 1 dia" : `faltam ${faltam} dias`}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {requisitos.map((r) => (
            <div key={r.nome}>
              <div className="flex justify-between text-xs">
                <span className="font-bold">{r.nome}</span>
                <span
                  className={`font-bold ${r.ok === null ? "text-muted-foreground" : r.ok ? "text-primary" : "text-destructive"}`}
                >
                  {r.texto}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <span
                  className={`block h-full ${r.ok === false ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, r.pct)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">a meta: {r.alvo}</p>
            </div>
          ))}
        </div>
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
                valor: atual?.produtividade ?? null,
                ontem: d1?.tempo_ativo_min ? ajustada(d1) / (d1.tempo_ativo_min / 60) : null,
                anterior: ant?.produtividade ?? null,
                descricao:
                  "As conversas atribuídas, sem as que você mesmo se atribuiu, ÷ as suas horas ativas. É a sua produtividade: a que entra para o bônus e o ranking.",
                formato: dec,
              })}
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <p className="font-bold">Dia a dia na quinzena</p>
              <div className="mt-2 grid gap-4 md:grid-cols-2">
                <EvolucaoDoDia
                  titulo="Por hora ativa: ajustada"
                  pontos={dias.map((d) => ({
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
              O SLA geral (a média do B2C e do B2B)
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {comMeta({
                chave: "sla_chat",
                rotulo: "SLA geral do chat",
                valor: emMinutos(segundos("sla_chat_s")),
                ontem: emMinutos(d1?.sla_chat_s),
                anterior: emMinutos(segundos("sla_chat_s", diasAnt)),
                descricao:
                  "Quanto tempo o cliente espera pela sua resposta no chat: a média do B2C e do B2B. É o que vale para a meta.",
              })}
              {comMeta({
                chave: "sla_email",
                rotulo: "SLA geral do e-mail",
                valor: emMinutos(segundos("sla_email_s")),
                ontem: emMinutos(d1?.sla_email_s),
                anterior: emMinutos(segundos("sla_email_s", diasAnt)),
                descricao:
                  "Quanto tempo o cliente espera pela sua resposta por e-mail: a média do B2C e do B2B. É o que vale para a meta.",
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
                  titulo="SLA geral do chat"
                  pontos={dias.map((d) => ({ dia: d.dia, valor: emMinutos(d.sla_chat_s) }))}
                  meta={metas.sla_chat?.meta ?? null}
                  menorMelhor
                  formatar={(v) => formatarValor("sla_chat", v)}
                />
                <EvolucaoDoDia
                  titulo="SLA geral do e-mail"
                  pontos={dias.map((d) => ({ dia: d.dia, valor: emMinutos(d.sla_email_s) }))}
                  meta={metas.sla_email?.meta ?? null}
                  menorMelhor
                  formatar={(v) => formatarValor("sla_email", v)}
                />
              </div>
            </div>
          </>
        )}

        {aba === "qualidade" && (
          <div className="grid gap-4 md:grid-cols-2">
            <CartaoIndicador
              rotulo="Qualidade"
              etiqueta="individual"
              valor={fmt("qualidade", atual?.qualidade)}
              anterior={fmt("qualidade", ant?.qualidade) ?? "—"}
              situacao={situacaoDe(
                atual?.qualidade == null ? null : atual.qualidade >= QUALIDADE_MINIMA,
              )}
              textoDaSituacao={textoDaSituacao(
                atual?.qualidade == null ? null : atual.qualidade >= QUALIDADE_MINIMA,
                "minimo",
              )}
              meta={`mínimo ${QUALIDADE_MINIMA} (nível 4G)`}
              descricao="A nota das suas avaliações de qualidade, pela ficha de atendimento."
              legenda={
                atual?.qualidade == null ? "aparece na publicação da quinzena" : "na quinzena"
              }
            />
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-bold">Por que a qualidade só aparece na publicação?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ela vem das avaliações dos seus atendimentos, que a supervisão faz ao longo da
                quinzena. A nota sai junto do resultado, quando a quinzena é publicada, e você pode
                contestar uma avaliação a partir daí.
              </p>
              {ant?.qualidade != null && (
                <p className="mt-3 text-sm">
                  <b>Na quinzena anterior:</b> {formatarValor("qualidade", ant.qualidade)} (nível{" "}
                  {nivelQualidade(ant.qualidade)}), em {ant.avaliacoes ?? 0}{" "}
                  {ant.avaliacoes === 1 ? "avaliação" : "avaliações"}.
                </p>
              )}
              <Link
                to="/minhas-avaliacoes"
                className="mt-3 inline-block text-sm font-bold text-primary hover:underline"
              >
                Ver minhas avaliações →
              </Link>
            </div>
          </div>
        )}

        {aba === "csat" && (
          <div className="grid gap-4 md:grid-cols-2">
            {comMeta({
              chave: "csat",
              rotulo: "CSAT do time",
              etiqueta: "do time",
              valor: atual?.csat_time ?? null,
              anterior: ant?.csat_time ?? null,
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
