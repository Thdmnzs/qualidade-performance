import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  atingiuMeta,
  formatarValor,
  QUALIDADE_MINIMA,
  textoDaMeta,
  textoDaSituacao,
  type ChaveIndicador,
} from "@/lib/indicadores";
import {
  acertoPorQuinzena,
  comDesconto,
  errosPorTipo,
  evolucaoIndividual,
  mediaPorQuinzena,
  notaPorPessoa,
  quinzenas,
  resumoDaQualidade,
  resumoDasMetricas,
  rotuloDaQuinzena,
  TIPO_DE_ERRO,
  type AvaliacaoDoPainel,
  type ItemDoPainel,
  type MetricaDoPainel,
} from "@/lib/painel";
import { fetchMetas } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/painel")({
  head: () => ({ meta: [{ title: "Painel · QualityHUB" }] }),
  component: Painel,
});

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ORDENS = Array.from({ length: 14 }, (_, k) => k + 1);
const CORES = [
  "#7C5C4A",
  "#9FB35A",
  "#FF6B6B",
  "#3FB4CC",
  "#9E86B4",
  "#D9B930",
  "#C0566E",
  "#1F5FAE",
  "#E8962E",
  "#5CB89A",
  "#6E6E6E",
  "#E85C5C",
  "#4F9E44",
  "#4E9BD8",
];
const dec = (v: number, n = 1) => v.toFixed(n).replace(".", ",");
const POR_PAGINA = 12;

function Painel() {
  const hoje = new Date();
  const [aba, setAba] = useState<"metricas" | "avaliacoes">("metricas");
  const [de, setDe] = useState(() => iso(new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)));
  const [ate, setAte] = useState(() => iso(hoje));
  const [fQuinzena, setFQuinzena] = useState("todas");
  const [fTurno, setFTurno] = useState("todos");
  const [fPessoa, setFPessoa] = useState("todos");
  const [criterio, setCriterio] = useState(1);
  const [pagina, setPagina] = useState(0);
  const erroPeriodo =
    !de || !ate ? "Escolha as duas datas." : de > ate ? "A data inicial é depois da final." : null;

  const { data: metas = {} } = useQuery({ queryKey: ["metas-indicadores"], queryFn: fetchMetas });
  const { data: avsBrutas = [], isLoading: carregandoA } = useQuery({
    queryKey: ["painel-avaliacoes", de, ate],
    enabled: !erroPeriodo,
    queryFn: async (): Promise<AvaliacaoDoPainel[]> => {
      const { data, error } = await supabase.rpc("painel_avaliacoes", { _de: de, _ate: ate });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        ...l,
        nota: Number(l.nota),
        itens: (l.itens ?? []) as unknown as ItemDoPainel[],
      }));
    },
  });
  const { data: metsBrutas = [], isLoading: carregandoM } = useQuery({
    queryKey: ["painel-metricas", de, ate],
    enabled: !erroPeriodo,
    queryFn: async (): Promise<MetricaDoPainel[]> => {
      const { data, error } = await supabase.rpc("painel_metricas", { _de: de, _ate: ate });
      if (error) throw error;
      const n = (v: number | null) => (v === null ? null : Number(v));
      return (data ?? []).map((l) => ({
        ...l,
        produtividade: n(l.produtividade),
        qualidade: n(l.qualidade),
        sla_chat: n(l.sla_chat),
        sla_email: n(l.sla_email),
        csat: n(l.csat),
        horas_semanais: n(l.horas_semanais),
        premio: n(l.premio),
      }));
    },
  });

  // Turno e nome valem para tudo; a quinzena, para tudo menos os gráficos de evolução.
  const passa = (x: { turno: string | null; employee_id: string }) =>
    (fTurno === "todos" || (x.turno ?? "sem turno") === fTurno) &&
    (fPessoa === "todos" || x.employee_id === fPessoa);
  const avsSemQ = useMemo(() => avsBrutas.filter(passa), [avsBrutas, fTurno, fPessoa]); // eslint-disable-line react-hooks/exhaustive-deps
  const metsSemQ = useMemo(() => metsBrutas.filter(passa), [metsBrutas, fTurno, fPessoa]); // eslint-disable-line react-hooks/exhaustive-deps
  const naQuinzena = <T extends { quinzena_inicio: string }>(l: T[]) =>
    fQuinzena === "todas" ? l : l.filter((x) => x.quinzena_inicio === fQuinzena);
  const avs = naQuinzena(avsSemQ);
  const mets = naQuinzena(metsSemQ);

  const opcoesQuinzena = quinzenas([...avsBrutas, ...metsBrutas]);
  const pessoas = [
    ...new Map([...avsBrutas, ...metsBrutas].map((x) => [x.employee_id, x.nome])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const carregando = carregandoA || carregandoM;

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Painel"
        descricao="Os resultados do time de CX, calculados a partir das avaliações e dos indicadores do QualityHUB."
      />
      <div
        className="inline-flex rounded-lg bg-secondary p-1"
        role="tablist"
        aria-label="Abas do Painel"
      >
        {(
          [
            ["metricas", "Métricas"],
            ["avaliacoes", "Avaliações"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`rounded-md px-4 py-1.5 text-sm ${aba === valor ? "bg-card font-bold" : ""}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <Filtro id="p-quinzena" rotulo="Quinzena" valor={fQuinzena} aoMudar={setFQuinzena}>
          <option value="todas">Todas</option>
          {opcoesQuinzena.map((q) => (
            <option key={q.inicio} value={q.inicio}>
              {q.rotulo}
            </option>
          ))}
        </Filtro>
        <Filtro id="p-turno" rotulo="Turno" valor={fTurno} aoMudar={setFTurno}>
          <option value="todos">Todos</option>
          <option>Manhã</option>
          <option>Tarde</option>
          <option>Noite</option>
          <option value="sem turno">Sem turno</option>
        </Filtro>
        <Filtro id="p-nome" rotulo="Nome" valor={fPessoa} aoMudar={setFPessoa}>
          <option value="todos">Todos</option>
          {pessoas.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </Filtro>
        <div className="space-y-1">
          <Label htmlFor="p-de" className="text-xs">
            Período: de
          </Label>
          <Input id="p-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-ate" className="text-xs">
            até
          </Label>
          <Input id="p-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <p className={`self-center text-xs ${erroPeriodo ? "font-bold text-destructive" : ""}`}>
          {erroPeriodo ??
            "Entram as quinzenas que começam dentro do período. A quinzena ainda aberta aparece como parcial."}
        </p>
      </div>

      {carregando ? (
        <p className="text-sm">Carregando...</p>
      ) : aba === "metricas" ? (
        <AbaMetricas
          mets={mets}
          metsSemQ={metsSemQ}
          metas={metas}
          pagina={pagina}
          setPagina={setPagina}
        />
      ) : (
        <AbaAvaliacoes avs={avs} avsSemQ={avsSemQ} criterio={criterio} setCriterio={setCriterio} />
      )}
    </div>
  );
}

function Filtro({
  id,
  rotulo,
  valor,
  aoMudar,
  children,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {rotulo}
      </Label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="block h-10 rounded-md border border-input bg-background px-3 text-sm font-bold"
      >
        {children}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- Métricas
function AbaMetricas({
  mets,
  metsSemQ,
  metas,
  pagina,
  setPagina,
}: {
  mets: MetricaDoPainel[];
  metsSemQ: MetricaDoPainel[];
  metas: Awaited<ReturnType<typeof fetchMetas>>;
  pagina: number;
  setPagina: (p: number) => void;
}) {
  if (!metsSemQ.length)
    return (
      <EmptyState
        titulo="Sem dados no período"
        texto="Nenhuma quinzena com resultados neste período."
      />
    );
  const r = resumoDasMetricas(mets);
  const cartao = (chave: ChaveIndicador | "qualidade", rotulo: string, valor: number | null) => {
    const meta = chave === "qualidade" ? null : metas[chave];
    const naMeta =
      valor === null
        ? null
        : chave === "qualidade"
          ? valor >= QUALIDADE_MINIMA
          : meta
            ? atingiuMeta(meta, valor)
            : null;
    return (
      <CartaoIndicador
        key={chave}
        rotulo={rotulo}
        etiqueta="do time"
        valor={valor === null ? null : formatarValor(chave, valor)}
        situacao={naMeta === null ? "aguardando" : naMeta ? "ok" : "fora"}
        textoDaSituacao={textoDaSituacao(
          naMeta,
          chave === "qualidade" ? "minimo" : (meta?.sentido ?? "minimo"),
        )}
        meta={chave === "qualidade" ? `mínimo ${QUALIDADE_MINIMA}` : meta ? textoDaMeta(meta) : ""}
      />
    );
  };
  const total = mets.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const p = Math.min(pagina, paginas - 1);
  const fmt = (chave: ChaveIndicador | "qualidade") => (v: number) => formatarValor(chave, v);
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">Principais métricas</h2>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {cartao("produtividade", "Produtividade", r.produtividade)}
        {cartao("qualidade", "Qualidade", r.qualidade)}
        {cartao("sla_chat", "SLA (chat)", r.sla_chat)}
        {cartao("sla_email", "SLA (e-mail)", r.sla_email)}
        {cartao("csat", "CSAT", r.csat)}
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">Detalhamento por pessoa</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase">
            <tr>
              {[
                "Quinzena",
                "Nome",
                "Turno",
                "Produtividade",
                "SLA chat",
                "SLA e-mail",
                "CSAT",
                "Quiz",
                "Média de horas",
                "Qualidade",
                "Elegibilidade",
                "Prêmio",
              ].map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mets.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA).map((m) => (
              <tr key={`${m.quinzena_inicio}-${m.employee_id}`} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2">
                  {rotuloDaQuinzena(m.quinzena_inicio, m.quinzena_status)}
                </td>
                <td className="px-3 py-2 font-bold">{m.nome}</td>
                <td className="px-3 py-2">{m.turno ?? "—"}</td>
                <td className="px-3 py-2">
                  {m.produtividade === null ? "—" : dec(m.produtividade)}
                </td>
                <td className="px-3 py-2">
                  {m.sla_chat === null ? "—" : formatarValor("sla_chat", m.sla_chat)}
                </td>
                <td className="px-3 py-2">
                  {m.sla_email === null ? "—" : formatarValor("sla_email", m.sla_email)}
                </td>
                <td className="px-3 py-2">{m.csat === null ? "—" : `${dec(m.csat)}%`}</td>
                <td className="px-3 py-2">
                  {m.quiz_entregue === null ? "—" : m.quiz_entregue ? "entregue" : "não entregue"}
                </td>
                <td className="px-3 py-2">
                  {m.horas_semanais === null
                    ? "—"
                    : formatarValor("horas_online", m.horas_semanais)}
                </td>
                <td className="px-3 py-2">{m.qualidade === null ? "—" : dec(m.qualidade)}</td>
                <td
                  className={`px-3 py-2 font-bold ${m.elegivel ? "text-primary" : "text-destructive"}`}
                >
                  {m.elegivel === null ? "—" : m.elegivel ? "Elegível" : "Não elegível"}
                </td>
                <td className="px-3 py-2">{m.premio ? `R$ ${dec(m.premio, 2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <span>
            {total
              ? `${p * POR_PAGINA + 1} a ${Math.min(total, (p + 1) * POR_PAGINA)} de ${total}`
              : "nenhum resultado"}
          </span>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1"
            disabled={p === 0}
            onClick={() => setPagina(p - 1)}
            aria-label="Página anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1"
            disabled={p >= paginas - 1}
            onClick={() => setPagina(p + 1)}
            aria-label="Próxima página"
          >
            ›
          </button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Evolucao
          titulo="Evolução da produtividade"
          dados={mediaPorQuinzena(metsSemQ, "produtividade")}
          meta={metas.produtividade?.meta}
          rotuloMeta={`esperado (${metas.produtividade?.meta ?? "—"})`}
          formatar={(v) => dec(v, 2)}
        />
        <Evolucao
          titulo="Evolução da qualidade"
          dados={mediaPorQuinzena(metsSemQ, "qualidade")}
          meta={QUALIDADE_MINIMA}
          rotuloMeta={`esperado (${QUALIDADE_MINIMA})`}
          formatar={(v) => dec(v, 2)}
          dominio={[0, 100]}
        />
        <Evolucao
          titulo="Evolução do SLA (chat)"
          dados={mediaPorQuinzena(metsSemQ, "sla_chat")}
          meta={metas.sla_chat?.meta}
          rotuloMeta={metas.sla_chat ? `meta (${textoDaMeta(metas.sla_chat)})` : "meta"}
          formatar={fmt("sla_chat")}
        />
        <Evolucao
          titulo="Evolução do SLA (e-mail)"
          dados={mediaPorQuinzena(metsSemQ, "sla_email")}
          meta={metas.sla_email?.meta}
          rotuloMeta={metas.sla_email ? `meta (${textoDaMeta(metas.sla_email)})` : "meta"}
          formatar={fmt("sla_email")}
        />
        <div className="lg:col-span-2">
          <Evolucao
            titulo="Evolução do CSAT"
            dados={mediaPorQuinzena(metsSemQ, "csat")}
            meta={metas.csat?.meta}
            rotuloMeta={`meta (${metas.csat?.meta ?? "—"}%)`}
            formatar={(v) => `${dec(v, 2)}%`}
            dominio={[0, 100]}
          />
        </div>
      </div>
    </section>
  );
}

function Evolucao({
  titulo,
  dados,
  meta,
  rotuloMeta,
  formatar,
  dominio,
}: {
  titulo: string;
  dados: { quinzena: string; valor: number | null }[];
  meta: number | undefined;
  rotuloMeta: string;
  formatar: (v: number) => string;
  dominio?: [number, number];
}) {
  const vazio = dados.every((d) => d.valor === null);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-bold">{titulo}</h2>
      {vazio ? (
        <p className="mt-3 text-sm">Aguardando os dados (a importação dos indicadores).</p>
      ) : (
        <div className="mt-3 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="quinzena" tick={{ fontSize: 11 }} />
              <YAxis
                domain={dominio ?? [0, "auto"]}
                tickFormatter={(v: number) => formatar(v)}
                tick={{ fontSize: 11 }}
                width={72}
              />
              <Tooltip formatter={(v) => formatar(Number(v))} />
              {meta !== undefined && (
                <ReferenceLine
                  y={meta}
                  stroke="#00700A"
                  strokeWidth={2}
                  label={{
                    value: rotuloMeta,
                    position: "insideTopLeft",
                    fill: "#00700A",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
              )}
              <Area
                dataKey="valor"
                stroke="#2B5FC9"
                fill="#2B5FC9"
                fillOpacity={0.1}
                connectNulls
                dot
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="valor"
                  position="top"
                  formatter={(v: unknown) => (v == null ? "" : formatar(Number(v)))}
                  style={{ fontSize: 11, fill: "#2B5FC9", fontWeight: 600 }}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Avaliações
function AbaAvaliacoes({
  avs,
  avsSemQ,
  criterio,
  setCriterio,
}: {
  avs: AvaliacaoDoPainel[];
  avsSemQ: AvaliacaoDoPainel[];
  criterio: number;
  setCriterio: (c: number) => void;
}) {
  if (!avsSemQ.length)
    return (
      <EmptyState
        titulo="Sem avaliações no período"
        texto="Nenhuma avaliação registrada nas quinzenas deste período."
      />
    );
  const r = resumoDaQualidade(avs);
  const acertos = acertoPorQuinzena(avsSemQ, ORDENS);
  const individual = evolucaoIndividual(avsSemQ, criterio);
  const porPessoa = notaPorPessoa(avs);
  const erros = errosPorTipo(avs);
  const descontos = comDesconto(avs);
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">
        Diagnóstico de qualidade{" "}
        <span className="text-sm font-medium">· pontos fortes e gaps dos critérios avaliados</span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador
          rotulo="Nota média"
          etiqueta="do time"
          valor={r.media === null ? null : dec(r.media)}
          situacao={r.media === null ? "aguardando" : r.media >= QUALIDADE_MINIMA ? "ok" : "fora"}
          textoDaSituacao={`${r.total} avaliações`}
          meta={`mínimo ${QUALIDADE_MINIMA}`}
        />
        <CartaoIndicador
          rotulo="Avaliações com 100"
          etiqueta="do time"
          valor={r.total ? `${Math.round((r.com100 / r.total) * 100)}%` : null}
          situacao={r.total ? "ok" : "aguardando"}
          textoDaSituacao={`${r.com100} de ${r.total}`}
        />
        <CartaoIndicador
          rotulo={`Abaixo do mínimo (${QUALIDADE_MINIMA})`}
          etiqueta="do time"
          valor={String(r.abaixoDoMinimo)}
          situacao={r.abaixoDoMinimo ? "fora" : "ok"}
          textoDaSituacao="avaliações"
        />
        <CartaoIndicador
          rotulo="Erro mais comum"
          etiqueta="do time"
          valor={r.maisComum?.tipo ?? "—"}
          situacao="ok"
          textoDaSituacao={r.maisComum ? `${r.maisComum.vezes} vezes` : "nenhum erro"}
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">Índice de acerto dos critérios avaliados, por quinzena</h2>
        <p className="text-xs">Só o "Sim" é acerto.</p>
        <div className="mt-3 h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={acertos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="quinzena" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={44}
              />
              <Tooltip formatter={(v) => `${dec(Number(v))}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ORDENS.map((o) => (
                <Bar
                  key={o}
                  dataKey={`c${o}`}
                  name={`${o}. ${TIPO_DE_ERRO[o]}`}
                  fill={CORES[o - 1]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-bold">Evolução individual por critério avaliado</h2>
          <div className="space-y-1">
            <Label htmlFor="p-criterio" className="text-xs">
              Critério
            </Label>
            <select
              id="p-criterio"
              value={criterio}
              onChange={(e) => setCriterio(Number(e.target.value))}
              className="block h-10 rounded-md border border-input bg-background px-3 text-sm font-bold"
            >
              {ORDENS.map((o) => (
                <option key={o} value={o}>
                  {o}. {TIPO_DE_ERRO[o]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={individual.dados} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="quinzena" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={44}
              />
              <Tooltip formatter={(v) => `${dec(Number(v), 0)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {individual.pessoas.map((p, i) => (
                <Line
                  key={p}
                  dataKey={p}
                  stroke={CORES[i % CORES.length]}
                  strokeWidth={2}
                  connectNulls
                  dot
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold">Nota média por colaborador</h2>
          <div className="mt-3" style={{ height: Math.max(200, porPessoa.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porPessoa}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => dec(Number(v))} />
                <Bar dataKey="media" isAnimationActive={false} radius={[0, 6, 6, 0]}>
                  {porPessoa.map((p) => (
                    <Cell key={p.nome} fill={p.media >= QUALIDADE_MINIMA ? "#00700A" : "#B42318"} />
                  ))}
                  <LabelList
                    dataKey="media"
                    position="right"
                    formatter={(v: unknown) => dec(Number(v))}
                    style={{ fontSize: 11, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold">Erros por tipo</h2>
          <p className="text-xs">
            Cada critério que não foi "Sim" conta uma vez; o Médio aparece como parcial.
          </p>
          {erros.length === 0 ? (
            <p className="mt-3 text-sm">Nenhum erro no recorte escolhido.</p>
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={erros} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="tipo"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="nao"
                    name="Não"
                    stackId="e"
                    fill="#111311"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="parcial"
                    name="Médio (parcial)"
                    stackId="e"
                    fill="#C98A1B"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">Avaliações com desconto</h2>
        <p className="text-xs">As mais recentes, com todos os erros e o feedback do avaliador.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Erros</th>
              <th className="px-3 py-2">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {descontos.map((a) => (
              <tr key={a.evaluation_id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  {a.data_contato ? a.data_contato.split("-").reverse().join("/") : "—"}
                </td>
                <td className="px-3 py-2 font-bold">{a.nome}</td>
                <td className="px-3 py-2 font-bold">{dec(a.nota, 0)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {a.erros.map((e) => (
                      <span
                        key={e.tipo}
                        className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive"
                      >
                        {e.tipo}
                        {e.parcial ? " (parcial)" : ""}
                      </span>
                    ))}
                  </div>
                </td>
                {/* Texto puro: as observações são escritas pelos avaliadores. */}
                <td className="px-3 py-2 text-xs">
                  {[...a.erros.map((e) => e.observacao), a.comentarios].filter(Boolean).join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
