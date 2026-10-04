import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FotoDePerfil } from "@/components/foto-de-perfil";
import { EmptyState, PageHeader } from "@/components/page-header";
import { useCurrentEmployee, usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { nomeQuinzena } from "@/lib/format";
import {
  DIMENSOES,
  MOTIVO_EM_BREVE,
  nivelDe,
  raridade,
  textoDoBonus,
  type Dimensao,
} from "@/lib/gamificacao";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil · QualityHUB" },
      { name: "description", content: "Seu nível, seu XP e suas conquistas." },
    ],
  }),
  component: Perfil,
});

const LIMITE = 5;
type Situacao = "todas" | "ganhas" | "bloqueadas";

function Perfil() {
  const qc = useQueryClient();
  const { data: employee, isLoading } = useCurrentEmployee();
  const { temAreaDeColaborador } = usePermissoes();
  const [dimensao, setDimensao] = useState<Dimensao | "todas">("todas");
  const [situacao, setSituacao] = useState<Situacao>("todas");

  const { data: catalogo = [] } = useQuery({
    queryKey: ["conquistas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conquistas").select("*").order("numero");
      if (error) throw error;
      return data;
    },
  });
  // As próprias (o RLS só devolve as do colaborador logado).
  const { data: ganhas = [] } = useQuery({
    queryKey: ["conquistas-ganhas", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conquistas_ganhas")
        .select("conquista, xp, sequencia, ganha_em, fortnights(ano, mes, tipo)")
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
    const m = new Map<number, { vezes: number; xp: number }>();
    for (const g of ganhas) {
      const atual = m.get(g.conquista) ?? { vezes: 0, xp: 0 };
      m.set(g.conquista, { vezes: atual.vezes + 1, xp: atual.xp + g.xp });
    }
    return m;
  }, [ganhas]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador || !employee) {
    return (
      <EmptyState
        titulo="Perfil do colaborador"
        texto="O perfil existe para quem tem cadastro de colaborador."
      />
    );
  }

  const xpTotal = ganhas.reduce((s, g) => s + g.xp, 0);
  const nv = nivelDe(xpTotal);
  const pct = Math.round(nv.progresso * 100);
  const nomeDe = (n: number) => catalogo.find((c) => c.numero === n)?.nome ?? `Conquista ${n}`;

  function alternar(numero: number) {
    if (!porConquista.has(numero)) return;
    if (destaques.includes(numero)) {
      salvarDestaques.mutate(destaques.filter((x) => x !== numero));
    } else if (destaques.length >= LIMITE) {
      toast.info(`Você pode destacar até ${LIMITE} badges. Tire um antes de colocar outro.`);
    } else {
      salvarDestaques.mutate([...destaques, numero]);
    }
  }

  const visiveis = catalogo.filter((c) => {
    if (dimensao !== "todas" && c.dimensao !== dimensao) return false;
    const tem = porConquista.has(c.numero);
    return situacao === "todas" || (situacao === "ganhas" ? tem : !tem);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Meu perfil"
        descricao="Seu nível e seu XP são só seus. Os badges em destaque vão aparecer no Ranking."
      />

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <FotoDePerfil employeeId={employee.id} nome={employee.nome} editavel />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold">{employee.nome}</p>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
              ⭐ Nível {nv.nivel}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
            <p>
              <strong>{xpTotal.toLocaleString("pt-BR")}</strong>{" "}
              <span className="text-muted-foreground">XP acumulado</span>
            </p>
            <p className="text-muted-foreground">
              Próximo: nível {nv.nivel + 1} aos {nv.proximo.toLocaleString("pt-BR")} XP
            </p>
          </div>
          <div
            className="mt-2 h-3 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso até o próximo nível"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Faltam{" "}
            <strong className="text-primary">
              {(nv.proximo - xpTotal).toLocaleString("pt-BR")} XP
            </strong>{" "}
            para o nível {nv.nivel + 1}. Não há nível máximo. O XP é contado no fechamento de cada
            quinzena.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Badges em destaque</h2>
          <p className="text-xs text-muted-foreground">
            Vão aparecer no Ranking · {destaques.length} de {LIMITE}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: LIMITE }, (_, i) => {
            const n = destaques[i];
            const c = catalogo.find((x) => x.numero === n);
            return c ? (
              <div
                key={i}
                className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center"
                style={{
                  borderColor: `${raridade(c.xp).cor}80`,
                  background: `${raridade(c.xp).cor}1f`,
                }}
              >
                <span className="text-3xl" aria-hidden="true">
                  {DIMENSOES[c.dimensao as Dimensao].icone}
                </span>
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
          Clique numa conquista desbloqueada, abaixo, para colocar ou tirar do destaque.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Conquistas</h2>
          <p className="text-xs text-muted-foreground">
            {porConquista.size} de {catalogo.length} desbloqueadas
          </p>
        </div>
        <div
          className="mt-3 flex flex-wrap gap-1 rounded-lg bg-secondary p-1"
          role="group"
          aria-label="Dimensão"
        >
          {(["todas", ...Object.keys(DIMENSOES)] as (Dimensao | "todas")[]).map((d) => (
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
          className="mt-2 flex flex-wrap gap-1 rounded-lg bg-secondary p-1"
          role="group"
          aria-label="Situação"
        >
          {(
            [
              ["todas", "Todas"],
              ["ganhas", "Desbloqueadas"],
              ["bloqueadas", "Bloqueadas"],
            ] as [Situacao, string][]
          ).map(([s, rotulo]) => (
            <button
              key={s}
              type="button"
              aria-pressed={situacao === s}
              onClick={() => setSituacao(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${situacao === s ? "bg-card text-foreground" : "text-muted-foreground"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <ul
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-label="Raridades"
        >
          {[50, 100, 200, 350, 500].map((xp) => (
            <li key={xp} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: raridade(xp).cor }}
              />
              {raridade(xp).nome}
            </li>
          ))}
        </ul>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((c) => {
            const meu = porConquista.get(c.numero);
            const r = raridade(c.xp);
            const emDestaque = destaques.includes(c.numero);
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
                <span
                  className={`text-2xl ${meu ? "" : "opacity-30 grayscale"}`}
                  aria-hidden="true"
                >
                  {DIMENSOES[c.dimensao as Dimensao].icone}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {meu ? "" : "🔒 "}
                      {c.nome}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold" style={{ color: r.cor }}>
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
                        : MOTIVO_EM_BREVE[c.dimensao as Dimensao]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

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
    </div>
  );
}
