import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FotoDePerfil } from "@/components/foto-de-perfil";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentEmployee, usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dataBR, nomeQuinzena } from "@/lib/format";
import {
  CENTRAIS,
  DESCRICAO_DA_FLUKER,
  DIMENSOES,
  ESTAGIOS_DA_QUALIDADE,
  FLUKER,
  MOTIVO_EM_BREVE,
  nivelDe,
  progressoDaCentral,
  raridade,
  subiuDeNivel,
  textoDoBonus,
  XP_POR_NIVEL,
  type Dimensao,
} from "@/lib/gamificacao";
import {
  atingiuMeta,
  formatarValor,
  QUALIDADE_MINIMA,
  textoDaMeta,
  type ChaveIndicador,
} from "@/lib/indicadores";
import { fetchMetas, fetchQuinzenas, fetchResultados } from "@/lib/queries";
import { quinzenasPublicadas } from "@/lib/quinzena";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil · QualityHUB" },
      { name: "description", content: "Seu nível, seu XP, suas missões e suas conquistas." },
    ],
  }),
  component: Perfil,
});

const LIMITE = 5;
type Situacao = "todas" | "ganhas" | "bloqueadas" | "embreve";
const DIMS = Object.keys(DIMENSOES) as Dimensao[];

function Perfil() {
  const qc = useQueryClient();
  const { data: employee, isLoading } = useCurrentEmployee();
  const { temAreaDeColaborador } = usePermissoes();
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [dimensao, setDimensao] = useState<Dimensao | "todas">("todas");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [aviso, setAviso] = useState<{ de: number; para: number } | null>(null);

  // A FLUKER só vem do banco para quem já a ganhou (para os outros, ela nem existe aqui).
  const { data: catalogo = [] } = useQuery({
    queryKey: ["conquistas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conquistas").select("*").order("numero");
      if (error) throw error;
      return data;
    },
  });
  const { data: ganhas = [], isSuccess: ganhasCarregadas } = useQuery({
    queryKey: ["conquistas-ganhas", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conquistas_ganhas")
        .select("conquista, xp, sequencia, ganha_em, fortnight_id, fortnights(ano, mes, tipo)")
        .eq("employee_id", employee!.id)
        .order("ganha_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: destaques = [] } = useQuery({
    queryKey: ["destaques", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis_colaborador")
        .select("destaques")
        .maybeSingle();
      if (error) throw error;
      return data?.destaques ?? [];
    },
  });
  const { data: quinzenasCom100 = 0 } = useQuery({
    queryKey: ["progresso-conquistas", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meu_progresso_de_conquistas");
      if (error) throw error;
      return data?.[0]?.quinzenas_com_100 ?? 0;
    },
  });

  // As missões: as mesmas fontes da Visão geral (a última quinzena publicada).
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const quinzena = quinzenasPublicadas(quinzenas)[0];
  const { data: metas = {} } = useQuery({ queryKey: ["metas-indicadores"], queryFn: fetchMetas });
  const { data: resultados = [] } = useQuery({
    queryKey: ["resultados", quinzena?.id, employee?.id],
    enabled: !!quinzena && !!employee?.id,
    queryFn: () => fetchResultados(quinzena!.id, employee!.id),
  });
  const { data: qualidade } = useQuery({
    queryKey: ["qualidade", quinzena?.id, employee?.id],
    enabled: !!quinzena && !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("qualidade_da_quinzena", {
        _fortnight_id: quinzena!.id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: quiz } = useQuery({
    queryKey: ["meu-quiz", quinzena?.id, employee?.id],
    enabled: !!quinzena && !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_results")
        .select("entregue")
        .eq("employee_id", employee!.id)
        .eq("fortnight_id", quinzena!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const salvarDestaques = useMutation({
    mutationFn: async (lista: number[]) => {
      const { error } = await supabase.rpc("definir_destaques", { _conquistas: lista });
      if (error) throw new Error(error.message);
    },
    onMutate: async (lista) => {
      // Atualiza a tela na hora; se o banco recusar, volta ao que era.
      const anterior = qc.getQueryData<number[]>(["destaques", employee?.id]);
      qc.setQueryData(["destaques", employee?.id], lista);
      return { anterior };
    },
    onError: (e: Error, _l, ctx) => {
      qc.setQueryData(["destaques", employee?.id], ctx?.anterior ?? []);
      toast.error(e.message);
    },
  });

  const porConquista = useMemo(() => {
    const m = new Map<number, { vezes: number; xp: number; primeira: string }>();
    for (const g of ganhas) {
      const atual = m.get(g.conquista);
      m.set(g.conquista, {
        vezes: (atual?.vezes ?? 0) + 1,
        xp: (atual?.xp ?? 0) + g.xp,
        primeira: atual && atual.primeira < g.ganha_em ? atual.primeira : g.ganha_em,
      });
    }
    return m;
  }, [ganhas]);

  const xpTotal = ganhas.reduce((s, g) => s + g.xp, 0);
  const nv = nivelDe(xpTotal);

  // O aviso de subida de nível: ao abrir o perfil, se o nível passou do último visto neste navegador.
  useEffect(() => {
    if (!employee?.id || !ganhasCarregadas) return;
    const chave = `qh:nivel-visto:${employee.id}`;
    let visto: number | null = null;
    try {
      const v = window.localStorage.getItem(chave);
      visto = v === null ? null : Number(v);
    } catch {
      return; // sem acesso ao armazenamento do navegador: sem aviso, e nada quebra
    }
    if (visto !== null && subiuDeNivel(nv.nivel, visto)) setAviso({ de: visto, para: nv.nivel });
    try {
      window.localStorage.setItem(chave, String(nv.nivel));
    } catch {
      // ignorado
    }
  }, [employee?.id, ganhasCarregadas, nv.nivel]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador || !employee) {
    return (
      <EmptyState
        titulo="Perfil do colaborador"
        texto="O perfil existe para quem tem cadastro de colaborador."
      />
    );
  }

  const pct = Math.round(nv.progresso * 100);
  const nomeDe = (n: number) => catalogo.find((c) => c.numero === n)?.nome ?? `Conquista ${n}`;
  const titulo = destaques[0] ? catalogo.find((c) => c.numero === destaques[0])?.nome : null;
  const ultimaQuinzena = ganhas[0]?.fortnight_id;
  const maiorSequencia = Math.max(
    1,
    ...ganhas.filter((g) => g.fortnight_id === ultimaQuinzena).map((g) => g.sequencia),
  );
  const temFluker = porConquista.has(FLUKER);
  const totalDeConquistas = catalogo.filter((c) => c.numero !== FLUKER).length + 1; // a FLUKER conta, mesmo oculta

  const xpPorDimensao = DIMS.map((d) => ({
    d,
    xp: ganhas
      .filter((g) => catalogo.find((c) => c.numero === g.conquista)?.dimensao === d)
      .reduce((s, g) => s + g.xp, 0),
  }));
  const maiorAtributo = Math.max(1, ...xpPorDimensao.map((a) => a.xp));

  const melhores = [...porConquista.keys()]
    .map((n) => catalogo.find((c) => c.numero === n))
    .filter((c): c is NonNullable<typeof c> => !!c && c.numero !== FLUKER)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5);

  function alternar(numero: number) {
    if (!porConquista.has(numero)) return;
    if (destaques.includes(numero)) salvarDestaques.mutate(destaques.filter((x) => x !== numero));
    else if (destaques.length >= LIMITE)
      toast.info(`Você pode destacar até ${LIMITE} badges. Tire um antes de colocar outro.`);
    else salvarDestaques.mutate([...destaques, numero]);
  }

  const situacaoDe = (c: { numero: number; ativa: boolean }): Exclude<Situacao, "todas"> =>
    porConquista.has(c.numero) ? "ganhas" : c.ativa ? "bloqueadas" : "embreve";
  const visiveis = catalogo.filter(
    (c) =>
      c.numero !== FLUKER &&
      (dimensao === "todas" || c.dimensao === dimensao) &&
      (situacao === "todas" || situacaoDe(c) === situacao),
  );
  const conta = (s: Situacao) =>
    s === "todas"
      ? catalogo.filter((c) => c.numero !== FLUKER).length
      : catalogo.filter((c) => c.numero !== FLUKER && situacaoDe(c) === s).length;

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Meu perfil"
        descricao="Seu nível e seu XP são só seus. Os badges em destaque vão aparecer no Ranking."
      />

      {/* ---------- A janela de status ---------- */}
      <section className="rounded-2xl border border-primary/50 bg-card p-5 shadow-[0_0_28px_-8px_rgba(14,245,0,0.35)] dark:bg-gradient-to-b dark:from-[#0e260e] dark:to-card sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Janela de status
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <FotoDePerfil employeeId={employee.id} nome={employee.nome} editavel />
          <div className="min-w-[220px] flex-1">
            <p className="font-display text-2xl font-semibold">{employee.nome}</p>
            {titulo && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Título: <b className="text-primary">{titulo}</b>
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <b className="text-lg">Nível {nv.nivel}</b>
              <span className="text-muted-foreground">
                <b className="text-foreground">{xpTotal.toLocaleString("pt-BR")}</b> /{" "}
                {nv.proximo.toLocaleString("pt-BR")} XP
              </span>
            </div>
            <div
              className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso até o próximo nível"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#13a403] to-primary transition-all duration-700 dark:shadow-[0_0_12px_rgba(14,245,0,0.55)]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Faltam{" "}
              <b className="text-foreground">{(nv.proximo - xpTotal).toLocaleString("pt-BR")} XP</b>{" "}
              para o nível {nv.nivel + 1} · cada nível, {XP_POR_NIVEL.toLocaleString("pt-BR")} XP. O
              XP é contado no fechamento de cada quinzena.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          {maiorSequencia >= 2 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
              🔥 {textoDoBonus(maiorSequencia)}
            </span>
          )}
          <span className="rounded-full bg-secondary px-3 py-1">
            🏆 {porConquista.size} de {totalDeConquistas} conquistas
          </span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* ---------- Os atributos ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Atributos
          </p>
          <p className="mt-1 text-xs text-muted-foreground">O XP conquistado em cada dimensão.</p>
          <div className="mt-4 space-y-3">
            {xpPorDimensao.map(({ d, xp }) => (
              <div key={d}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    {DIMENSOES[d].icone} <b>{DIMENSOES[d].nome}</b>{" "}
                    <span className="text-xs text-muted-foreground">{DIMENSOES[d].tema}</span>
                  </span>
                  <b>{xp.toLocaleString("pt-BR")}</b>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#13a403] to-primary"
                    style={{ width: `${Math.round((xp / maiorAtributo) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- As missões da quinzena ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Missões da quinzena
            </p>
            {quinzena && (
              <span className="text-xs text-muted-foreground">{nomeQuinzena(quinzena)}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            As metas da quinzena. Cumprindo todas, você concorre ao pódio.
          </p>
          {!quinzena ? (
            <p className="mt-4 text-sm text-muted-foreground">
              As missões aparecem quando a primeira quinzena for publicada.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              <Missao
                rotulo="Qualidade"
                meta={`mínimo ${QUALIDADE_MINIMA}`}
                valor={
                  qualidade?.minha_nota != null
                    ? formatarValor("qualidade", Number(qualidade.minha_nota))
                    : null
                }
                ok={
                  qualidade?.minha_nota != null
                    ? Number(qualidade.minha_nota) >= QUALIDADE_MINIMA
                    : null
                }
                pct={
                  qualidade?.minha_nota != null
                    ? Math.min(100, (Number(qualidade.minha_nota) / QUALIDADE_MINIMA) * 100)
                    : 0
                }
              />
              {(["produtividade", "sla_chat", "sla_email", "horas_online"] as ChaveIndicador[]).map(
                (chave) => {
                  const m = metas[chave];
                  const r = resultados.find((x) => x.indicador === chave);
                  const v = r?.valor != null ? Number(r.valor) : null;
                  const rotulo = {
                    produtividade: "Produtividade",
                    sla_chat: "SLA (chat)",
                    sla_email: "SLA (e-mail)",
                    horas_online: "Média de horas",
                    csat: "CSAT",
                  }[chave];
                  if (!m) return null;
                  const pctMissao =
                    v === null
                      ? 0
                      : m.sentido === "maximo"
                        ? v <= m.meta
                          ? 100
                          : (m.meta / v) * 100
                        : Math.min(100, (v / m.meta) * 100);
                  return (
                    <Missao
                      key={chave}
                      rotulo={rotulo}
                      meta={textoDaMeta(m)}
                      valor={v === null ? null : formatarValor(chave, v)}
                      ok={v === null ? null : atingiuMeta(m, v)}
                      pct={pctMissao}
                    />
                  );
                },
              )}
              <Missao
                rotulo="Quiz"
                meta="entregue"
                valor={quiz ? (quiz.entregue ? "entregue" : "não entregue") : null}
                ok={quiz ? quiz.entregue : null}
                pct={quiz?.entregue ? 100 : 0}
              />
            </ul>
          )}
        </section>
      </div>

      {/* ---------- Os badges em destaque (vão para o Ranking) ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Badges em destaque</h2>
          <p className="text-xs text-muted-foreground">
            Vão aparecer no Ranking · {destaques.length} de {LIMITE}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: LIMITE }, (_, i) => {
            const c = catalogo.find((x) => x.numero === destaques[i]);
            return c ? (
              <div
                key={i}
                className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center"
                style={{
                  borderColor: `${raridade(c.xp).cor}80`,
                  background: `${raridade(c.xp).cor}1f`,
                }}
              >
                <IconeDaConquista c={c} />
                <span className="text-xs font-semibold">{c.nome}</span>
              </div>
            ) : (
              <div
                key={i}
                className="flex min-h-[86px] items-center justify-center rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground"
              >
                Espaço livre
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Em "Ver todas as conquistas", clique numa desbloqueada para colocar ou tirar do destaque.
        </p>
      </section>

      {/* ---------- As conquistas ---------- */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Conquistas</h2>
          <p className="text-xs text-muted-foreground">
            Comum · Rara · Épica · Lendária · Mítica · Ultra épica · Suprema
          </p>
        </div>
        <CartaoDaFluker ganha={temFluker} quando={porConquista.get(FLUKER)?.primeira ?? null} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {melhores.map((c) => (
            <div
              key={c.numero}
              className="rounded-xl border p-3 text-center"
              style={{ borderColor: `${raridade(c.xp).cor}88` }}
            >
              <IconeDaConquista c={c} />
              <p className="mt-1.5 text-xs font-bold">{c.nome}</p>
              <p
                className="raridade-texto text-[10px] font-bold"
                style={
                  {
                    "--rt": raridade(c.xp).texto,
                    "--rc": raridade(c.xp).cor,
                  } as React.CSSProperties
                }
              >
                {raridade(c.xp).nome}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCatalogoAberto(true)}
            className="flex min-h-[104px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-3 text-center hover:border-primary"
          >
            <BookOpen className="size-6" aria-hidden="true" />
            <span className="mt-1 text-xs font-bold">Ver todas as conquistas</span>
            <span className="text-[10px] text-muted-foreground">
              {totalDeConquistas - 1} e uma oculta
            </span>
          </button>
        </div>
      </section>

      {/* ---------- De onde veio o XP ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">De onde veio o seu XP</h2>
        {ganhas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Seu XP aparece aqui depois do fechamento da primeira quinzena com avaliações suas.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {ganhas.slice(0, 15).map((g, i) => {
              const bonus = textoDoBonus(g.sequencia);
              const q = g.fortnights as { ano: number; mes: number; tipo: string } | null;
              return (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {nomeDe(g.conquista)}
                    <span className="text-muted-foreground">
                      {q ? ` · ${nomeQuinzena(q)}` : ""}
                      {bonus ? ` · ${bonus}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-primary">+{g.xp} XP</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- O catálogo de todas as conquistas ---------- */}
      <Dialog open={catalogoAberto} onOpenChange={setCatalogoAberto}>
        <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>Todas as conquistas</DialogTitle>
            <DialogDescription>
              {conta("ganhas")} desbloqueadas · {conta("bloqueadas")} ainda bloqueadas ·{" "}
              {conta("embreve")} em breve. Clique numa desbloqueada para colocar ou tirar do
              destaque.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1"
            role="group"
            aria-label="Dimensão"
          >
            {(["todas", ...DIMS] as (Dimensao | "todas")[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dimensao === d}
                onClick={() => setDimensao(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${dimensao === d ? "bg-card text-foreground" : "text-muted-foreground"}`}
              >
                {d === "todas" ? "Todas" : `${DIMENSOES[d].icone} ${DIMENSOES[d].nome}`}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1"
            role="group"
            aria-label="Situação"
          >
            {(
              [
                ["todas", "Todas"],
                ["ganhas", "Desbloqueadas"],
                ["bloqueadas", "Bloqueadas"],
                ["embreve", "Em breve"],
              ] as [Situacao, string][]
            ).map(([s, rotulo]) => (
              <button
                key={s}
                type="button"
                aria-pressed={situacao === s}
                onClick={() => setSituacao(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${situacao === s ? "bg-card text-foreground" : "text-muted-foreground"}`}
              >
                {rotulo} ({conta(s)})
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {visiveis.map((c) => {
              const meu = porConquista.get(c.numero);
              const r = raridade(c.xp);
              const emDestaque = destaques.includes(c.numero);
              const estagio = ESTAGIOS_DA_QUALIDADE[c.numero];
              const central = CENTRAIS.includes(c.numero)
                ? progressoDaCentral(c, catalogo, new Set(porConquista.keys()))
                : null;
              return (
                <button
                  key={c.numero}
                  type="button"
                  onClick={() => alternar(c.numero)}
                  aria-pressed={emDestaque}
                  disabled={!meu}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left ${meu ? "" : "cursor-default border-dashed border-border bg-secondary"} ${emDestaque ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}
                  style={meu ? { borderColor: `${r.cor}80`, background: `${r.cor}1f` } : undefined}
                >
                  <span className={meu ? "" : "opacity-30 grayscale"}>
                    <IconeDaConquista c={c} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {meu ? "" : "🔒 "}
                        {c.nome}
                      </span>
                      <span
                        className="raridade-texto shrink-0 text-[11px] font-semibold"
                        style={{ "--rt": r.texto, "--rc": r.cor } as React.CSSProperties}
                      >
                        {r.nome} · {c.xp} XP
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{c.condicao}</span>
                    <span
                      className={`mt-1 block text-[11px] font-medium ${meu ? "text-primary" : "text-warning"}`}
                    >
                      {meu
                        ? `${c.unica ? "Conquistada" : `Conquistada ×${meu.vezes} · ${meu.xp} XP no total`}${emDestaque ? " · em destaque" : ""}`
                        : c.ativa
                          ? c.unica
                            ? "Única: vale uma vez"
                            : "Repetível"
                          : central
                            ? `Em breve: disponível quando as ${central.total} conquistas da dimensão estiverem ativas (hoje, ${central.ativas})`
                            : MOTIVO_EM_BREVE[c.dimensao as Dimensao]}
                    </span>
                    {(estagio || central) && (
                      <span className="mt-1.5 block">
                        <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {estagio ? estagio.estagio : "a central da dimensão"}
                        </span>
                        {!meu && (
                          <Progresso
                            atual={
                              estagio
                                ? Math.min(quinzenasCom100, estagio.quinzenas)
                                : central!.ganhas
                            }
                            total={estagio ? estagio.quinzenas : central!.total}
                            rotulo={estagio ? "quinzenas com 100%" : "conquistas"}
                          />
                        )}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!temFluker &&
              (situacao === "todas" || situacao === "bloqueadas") &&
              dimensao === "todas" && (
                <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary p-3 sm:col-span-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-card">
                    <Lock className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold tracking-[0.3em] text-muted-foreground">
                      ???
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {DESCRICAO_DA_FLUKER}
                    </span>
                  </span>
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- O aviso de subida de nível ---------- */}
      <Dialog open={!!aviso} onOpenChange={(a) => !a && setAviso(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Aviso
            </p>
            <DialogTitle className="text-center font-display text-3xl text-primary">
              Você subiu de nível!
            </DialogTitle>
            <DialogDescription className="text-center">
              O XP da última quinzena levou você ao nível {aviso?.para}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex items-center justify-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-bold text-muted-foreground">
              {aviso?.de}
            </span>
            <span className="text-2xl text-primary">→</span>
            <span className="flex size-20 items-center justify-center rounded-2xl bg-primary text-4xl font-bold text-primary-foreground shadow-[0_6px_18px_rgba(14,245,0,0.35)]">
              {aviso?.para}
            </span>
          </div>
          <Button className="mt-4 w-full" onClick={() => setAviso(null)}>
            Continuar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconeDaConquista({ c }: { c: { numero: number; dimensao: string } }) {
  if (c.numero === FLUKER) return <img src="/fluke-pill.svg" alt="" className="mx-auto h-7" />;
  return (
    <span className="text-2xl" aria-hidden="true">
      {DIMENSOES[c.dimensao as Dimensao]?.icone ?? "🏅"}
    </span>
  );
}

function Progresso({ atual, total, rotulo }: { atual: number; total: number; rotulo: string }) {
  return (
    <span className="mt-1 block">
      <span className="block text-[10px] text-muted-foreground">
        {atual} de {total} {rotulo}
      </span>
      <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-card">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${total ? Math.round((atual / total) * 100) : 0}%` }}
        />
      </span>
    </span>
  );
}

function Missao({
  rotulo,
  meta,
  valor,
  ok,
  pct,
}: {
  rotulo: string;
  meta: string;
  valor: string | null;
  ok: boolean | null;
  pct: number;
}) {
  return (
    <li className="rounded-xl border border-border bg-secondary/50 p-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          <span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "✓" : "○"}</span>{" "}
          <b>{rotulo}</b> <span className="text-xs text-muted-foreground">· {meta}</span>
        </span>
        <b className={ok ? "text-primary" : ""}>{valor ?? "aguardando"}</b>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${ok ? "bg-gradient-to-r from-[#13a403] to-primary" : "bg-warning"}`}
          style={{ width: `${valor === null ? 0 : Math.round(pct)}%` }}
        />
      </div>
    </li>
  );
}

/** A FLUKER: revelada para quem a ganhou; para os outros, só o campo e a descrição. */
function CartaoDaFluker({ ganha, quando }: { ganha: boolean; quando: string | null }) {
  if (!ganha) {
    return (
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-dashed border-border p-5">
        <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-dashed border-border bg-secondary">
          <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="font-display text-3xl font-bold tracking-[0.3em] text-muted-foreground">
            ???
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{DESCRICAO_DA_FLUKER}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="moldura-suprema">
      <div className="flex flex-wrap items-center gap-5 rounded-[0.9rem] bg-card p-5">
        <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-primary bg-[#071407] shadow-[0_0_34px_rgba(14,245,0,0.45)]">
          <img src="/fluke-pill.svg" alt="Logotipo da Fluke" className="w-16" />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b8962e]">
            Conquista suprema
          </p>
          <p className="mt-1 font-display text-3xl font-bold tracking-wide">FLUKER</p>
          <p className="mt-1 text-sm text-muted-foreground">{DESCRICAO_DA_FLUKER}</p>
          <p className="mt-2 text-sm font-bold text-primary">
            ✓ Desbloqueada{quando ? ` em ${dataBR(quando)}` : ""} · +1.500 XP
          </p>
        </div>
      </div>
    </div>
  );
}
