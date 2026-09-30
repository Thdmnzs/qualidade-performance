import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, EmptyState } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";
import {
  fetchColaboradores,
  fetchContestacoes,
  fetchMediasTime,
  fetchQuinzenas,
} from "@/lib/queries";
import { dataBR, nomeQuinzena, numeroBR, rotuloIndicador, rotuloStatusQuinzena } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Visão geral · Gestão de Qualidade" },
      { name: "description", content: "Acompanhamento das quinzenas, médias do time e pendências." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { isAdmin, isLoading } = usePermissoes();
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const { data: colaboradores = [] } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: fetchColaboradores,
  });
  const { data: contestacoes = [] } = useQuery({
    queryKey: ["contestacoes", "todas"],
    queryFn: () => fetchContestacoes(),
  });
  const atual = quinzenas[0];
  const { data: medias = [] } = useQuery({
    queryKey: ["medias", atual?.id],
    queryFn: () => fetchMediasTime(atual!.id),
    enabled: !!atual?.id,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin)
    return <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />;

  const abertas = contestacoes.filter((c) => c.status === "aberta" || c.status === "em_analise");

  return (
    <div>
      <PageHeader titulo="Visão geral" descricao={nomeQuinzena(atual)} />

      <div className="grid gap-4 md:grid-cols-3">
        <Indicador titulo="Colaboradores ativos" valor={colaboradores.filter((c) => c.status === "ativo").length} />
        <Indicador titulo="Contestações em aberto" valor={abertas.length} />
        <Indicador
          titulo="Status da quinzena"
          valor={(atual && rotuloStatusQuinzena[atual.status]) ?? "—"}
        />
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Médias do time</h2>
      {medias.length === 0 ? (
        <EmptyState titulo="Sem médias" texto="Nenhuma média calculada para esta quinzena." />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {medias.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{rotuloIndicador[m.indicador]}</p>
              <p className="mt-2 font-display text-2xl font-bold">{numeroBR(m.media)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Meta: {numeroBR(m.meta)}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Quinzenas</h2>
      {quinzenas.length === 0 ? (
        <EmptyState titulo="Nenhuma quinzena" texto="Cadastre a primeira quinzena para começar." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Datas</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {quinzenas.map((q) => (
                <tr key={q.id} className="border-t border-border">
                  <td className="px-4 py-3">{nomeQuinzena(q)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dataBR(q.data_inicio)} – {dataBR(q.data_fim)}
                  </td>
                  <td className="px-4 py-3">{rotuloStatusQuinzena[q.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-2 font-display text-2xl font-bold text-primary">{valor}</p>
    </div>
  );
}
