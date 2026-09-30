import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";
import { fetchQuinzenaAtual, fetchRanking } from "@/lib/queries";
import { nomeQuinzena } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking da quinzena · Qualidade & Performance" },
      { name: "description", content: "Ranking e pódio do time de CX na quinzena." },
    ],
  }),
  component: RankingPage,
});

function RankingPage() {
  const { isAdmin } = usePermissoes();
  const { data: quinzena } = useQuery({ queryKey: ["quinzena-atual"], queryFn: fetchQuinzenaAtual });
  const { data: ranking = [] } = useQuery({
    queryKey: ["ranking", quinzena?.id],
    queryFn: () => fetchRanking(quinzena!.id),
    enabled: !!quinzena?.id,
  });
  const podio = ranking.slice(0, 3);

  if (!isAdmin) return <EmptyState titulo="Acesso restrito" texto="O ranking é exclusivo dos administradores." />;

  return (
    <div>
      <PageHeader titulo="Ranking" descricao={nomeQuinzena(quinzena)} />

      {ranking.length === 0 ? (
        <EmptyState
          titulo="Ranking ainda não gerado"
          texto="O ranking fica disponível após o fechamento da quinzena."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {podio.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-primary/30 bg-card p-5 shadow-glow"
              >
                <div className="flex items-center gap-2 text-primary">
                  <Crown className="size-5" />
                  <span className="font-display text-xl font-bold">{r.posicao}º lugar</span>
                </div>
                <p className="mt-3 font-medium">{r.employees?.nome ?? "—"}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Posição</th>
                  <th className="px-4 py-3">Colaborador</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{r.posicao}º</td>
                    <td className="px-4 py-3">{r.employees?.nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
