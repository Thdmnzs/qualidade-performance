import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { FotoDePerfil } from "@/components/foto-de-perfil";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Podio } from "@/components/podio";
import { Label } from "@/components/ui/label";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { nomeQuinzena } from "@/lib/format";
import { DIMENSOES, type Dimensao } from "@/lib/gamificacao";
import { formatarValor, minutosESegundos } from "@/lib/indicadores";
import { fetchQuinzenas } from "@/lib/queries";
import { quinzenasPublicadas } from "@/lib/quinzena";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking · QualityHUB" },
      { name: "description", content: "Pódio e classificação da quinzena." },
    ],
  }),
  component: Ranking,
});

const MEDALHA: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Ranking() {
  const { isAdmin, perfil, isLoading } = usePermissoes();
  // ADM e avaliadores veem tudo (e antes da publicação); os demais, só o pódio publicado.
  const veTudo = isAdmin || perfil === "avaliador";
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const opcoes = useMemo(
    () => (veTudo ? quinzenas : quinzenasPublicadas(quinzenas)),
    [quinzenas, veTudo],
  );
  const [quinzenaId, setQuinzenaId] = useState("");
  useEffect(() => {
    if (!quinzenaId && opcoes[0]) setQuinzenaId(opcoes[0].id);
  }, [opcoes, quinzenaId]);
  const quinzena = opcoes.find((q) => q.id === quinzenaId);

  const { data: podio = [] } = useQuery({
    queryKey: ["podio", quinzenaId],
    enabled: !!quinzenaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("podio_da_quinzena", {
        _fortnight_id: quinzenaId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: classificacao = [] } = useQuery({
    queryKey: ["classificacao", quinzenaId],
    enabled: !!quinzenaId && veTudo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("classificacao_da_quinzena", {
        _fortnight_id: quinzenaId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["conquistas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conquistas").select("numero, nome, dimensao");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (opcoes.length === 0) {
    return (
      <div>
        <PageHeader
          titulo="Ranking"
          descricao="O pódio da quinzena aparece aqui a partir da publicação."
        />
        <EmptyState
          titulo="Nenhuma quinzena publicada"
          texto="O pódio aparece quando a quinzena for publicada."
        />
      </div>
    );
  }

  const oficial = quinzena?.status === "fechada";
  const classificados = classificacao.filter((c) => c.posicao !== null);
  const naoConcorrem = classificacao.filter((c) => c.posicao === null);
  const aguardandoIndicadores =
    classificados.length === 0 &&
    naoConcorrem.some((c) => c.motivos.some((m) => m.includes("ainda não importad")));
  const badges = (lista: number[]) =>
    lista
      .map((n) => catalogo.find((c) => c.numero === n))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ icone: DIMENSOES[c.dimensao as Dimensao]?.icone ?? "🏅", nome: c.nome }));
  const badgesDe = (employeeId: string) =>
    badges(podio.find((p) => p.employee_id === employeeId)?.destaques ?? []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          titulo="Ranking"
          descricao={
            veTudo
              ? "Classificação da quinzena, entre quem cumpre todos os requisitos."
              : "Os três primeiros da quinzena. Seus resultados e sua elegibilidade estão na sua Visão geral."
          }
        />
        <div className="space-y-1">
          <Label htmlFor="rank-quinzena" className="text-xs text-muted-foreground">
            Quinzena
          </Label>
          <select
            id="rank-quinzena"
            value={quinzenaId}
            onChange={(e) => setQuinzenaId(e.target.value)}
            className="block h-10 rounded-md border border-input bg-background px-3 text-sm font-bold"
          >
            {opcoes.map((q) => (
              <option key={q.id} value={q.id}>
                {nomeQuinzena(q)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {oficial ? (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
          <b>Ranking oficial.</b> Calculado no fechamento da quinzena.
        </p>
      ) : (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
          <b>Ranking provisório.</b> Até o fechamento, uma contestação aceita ou um indicador
          importado pode mudar as posições.
        </p>
      )}

      {podio.length === 0 ? (
        <EmptyState
          titulo={aguardandoIndicadores ? "Aguardando os indicadores" : "Ainda sem classificados"}
          texto={
            aguardandoIndicadores
              ? "O ranking usa produtividade, SLA e horas logadas, que ainda não foram importados para esta quinzena."
              : "O pódio aparece quando alguém cumprir todos os requisitos."
          }
        />
      ) : (
        <section aria-label="Pódio">
          <h2 className="mb-3 font-display text-lg font-bold">Pódio</h2>
          <Podio
            titulo={quinzena ? nomeQuinzena(quinzena) : ""}
            pessoas={podio}
            podeBaixar={veTudo}
          />
        </section>
      )}

      {veTudo && classificados.length > 0 && (
        <section
          className="overflow-x-auto rounded-2xl border border-border bg-card"
          aria-label="Classificação"
        >
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Posição</th>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Badges</th>
                <th className="px-4 py-3">Qualidade</th>
                <th className="px-4 py-3">Produtividade</th>
                <th className="px-4 py-3">SLA chat</th>
                <th className="px-4 py-3">SLA e-mail</th>
                <th className="px-4 py-3">Horas/semana</th>
              </tr>
            </thead>
            <tbody>
              {classificados.map((c) => (
                <tr key={c.employee_id} className="border-t border-border">
                  <td className="px-4 py-3 font-bold">
                    {c.posicao}º {MEDALHA[c.posicao!] ?? ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FotoDePerfil employeeId={c.employee_id} nome={c.nome} tamanho="pequena" />
                      <span className="font-bold">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {badgesDe(c.employee_id).map((b) => (
                      <span
                        key={b.nome}
                        title={b.nome}
                        aria-label={b.nome}
                        className="mr-1 text-base"
                      >
                        {b.icone}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {c.qualidade === null ? "—" : formatarValor("qualidade", Number(c.qualidade))}
                  </td>
                  <td className="px-4 py-3">
                    {c.produtividade === null
                      ? "—"
                      : formatarValor("produtividade", Number(c.produtividade))}
                  </td>
                  <td className="px-4 py-3">
                    {c.sla_chat === null ? "—" : minutosESegundos(Number(c.sla_chat))}
                  </td>
                  <td className="px-4 py-3">
                    {c.sla_email === null ? "—" : minutosESegundos(Number(c.sla_email))}
                  </td>
                  <td className="px-4 py-3">
                    {c.horas_semanais === null
                      ? "—"
                      : `${String(c.horas_semanais).replace(".", ",")} h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Ordem: maior qualidade; empatando, maior produtividade; depois, melhor SLA de chat;
            depois, melhor SLA de e-mail. Empate em tudo: dividem a posição.
          </p>
        </section>
      )}

      {veTudo && naoConcorrem.length > 0 && (
        <section
          className="rounded-2xl border border-border bg-card p-5"
          aria-label="Não concorrem"
        >
          <h2 className="font-display font-bold">Não concorrem nesta quinzena</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {naoConcorrem.map((c) => (
              <li key={c.employee_id} className="rounded-xl bg-secondary px-3 py-2">
                <b>{c.nome}</b>
                <span className="text-muted-foreground"> · {c.motivos.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
