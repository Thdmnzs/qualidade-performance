import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, PageHeader } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";
import { dataHoraBR, rotuloStatusContestacao } from "@/lib/format";
import { fetchContestacoes } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/contestacoes")({
  head: () => ({
    meta: [
      { title: "Contestações do time · Qualidade & Performance" },
      { name: "description", content: "Contestações abertas pelos colaboradores." },
    ],
  }),
  component: ContestacoesDoTime,
});

function ContestacoesDoTime() {
  const { podeAvaliar, isAdmin, employee, isLoading } = usePermissoes();

  // O banco já filtra o que cada perfil pode ver: o ADM vê todas, e o
  // avaliador vê as de colaboradores (nunca as de outros avaliadores).
  const { data: todas = [], isLoading: carregando } = useQuery({
    queryKey: ["contestacoes", "do-time"],
    queryFn: () => fetchContestacoes(),
    enabled: podeAvaliar,
  });
  // O avaliador também enxerga as próprias (é colaborador), mas elas não
  // pertencem a esta área: são tratadas pelo ADM e ficam em "Minhas contestações".
  const contestacoes = todas.filter((c) => c.employee_id !== employee?.id);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!podeAvaliar) {
    return (
      <EmptyState
        titulo="Acesso restrito"
        texto="Área exclusiva de avaliadores e administradores."
      />
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Contestações"
        descricao={
          isAdmin
            ? "Contestações abertas por colaboradores e avaliadores."
            : "Contestações abertas pelos colaboradores."
        }
      />

      <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        A resposta às contestações será liberada na próxima etapa do sistema.
      </p>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : contestacoes.length === 0 ? (
        <EmptyState titulo="Nenhuma contestação" texto="Não há contestações do time registradas." />
      ) : (
        <div className="space-y-3">
          {contestacoes.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.assunto}</p>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                  {rotuloStatusContestacao[c.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.employees?.nome}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {c.descricao}
              </p>
              {c.resolucao && (
                <p className="mt-3 rounded-lg bg-secondary p-3 text-sm">
                  <span className="font-medium">Resposta: </span>
                  {c.resolucao}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Aberta em {dataHoraBR(c.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
