import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { useCurrentEmployee, usePermissoes } from "@/hooks/useAuth";
import {
  fetchElegibilidade,
  fetchMediasTime,
  fetchQuinzenaAtual,
  fetchResultados,
} from "@/lib/queries";
import {
  dataBR,
  nomeQuinzena,
  numeroBR,
  rotuloIndicador,
  rotuloStatusQuinzena,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Destaques de CX · Meu painel" },
      { name: "description", content: "Seus indicadores e elegibilidade na quinzena." },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { data: employee, isLoading: carregandoEmp } = useCurrentEmployee();
  const { temAreaDeColaborador, isLoading: carregandoPerfil } = usePermissoes();
  const { data: quinzena } = useQuery({
    queryKey: ["quinzena-atual"],
    queryFn: fetchQuinzenaAtual,
  });

  const fortnightId = quinzena?.id;
  const employeeId = employee?.id;

  const { data: resultados = [] } = useQuery({
    queryKey: ["resultados", fortnightId, employeeId],
    queryFn: () => fetchResultados(fortnightId!, employeeId!),
    enabled: !!fortnightId && !!employeeId,
  });
  const { data: medias = [] } = useQuery({
    queryKey: ["medias", fortnightId],
    queryFn: () => fetchMediasTime(fortnightId!),
    enabled: !!fortnightId,
  });
  const { data: elegibilidade } = useQuery({
    queryKey: ["elegibilidade", fortnightId, employeeId],
    queryFn: () => fetchElegibilidade(fortnightId!, employeeId!),
    enabled: !!fortnightId && !!employeeId,
  });
  const motivos = Array.isArray(elegibilidade?.motivos) ? (elegibilidade?.motivos as string[]) : [];

  if (carregandoEmp || carregandoPerfil)
    return <p className="text-sm text-muted-foreground">Carregando...</p>;

  if (!temAreaDeColaborador) {
    return (
      <EmptyState
        titulo="Área do colaborador"
        texto="O perfil ADM não tem indicadores próprios. Use a Visão geral para acompanhar o time."
      />
    );
  }

  if (!employee) {
    return (
      <EmptyState
        titulo="Cadastro não vinculado"
        texto="Seu acesso ainda não está vinculado a um colaborador. Procure a administração."
      />
    );
  }

  return (
    <div>
      <PageHeader
        titulo={`Olá, ${employee.nome.split(" ")[0]}`}
        descricao={
          quinzena
            ? `${nomeQuinzena(quinzena)} · ${rotuloStatusQuinzena[quinzena.status]} · ${dataBR(quinzena.data_inicio)} a ${dataBR(quinzena.data_fim)}`
            : "Nenhuma quinzena cadastrada ainda."
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 md:col-span-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Elegibilidade à premiação
          </p>
          {elegibilidade ? (
            <>
              <p
                className={`mt-2 inline-flex items-center gap-2 font-display text-xl font-bold ${
                  elegibilidade.elegivel ? "text-primary" : "text-destructive"
                }`}
              >
                {elegibilidade.elegivel ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <AlertTriangle className="size-5" />
                )}
                {elegibilidade.elegivel ? "Elegível" : "Não elegível"}
              </p>
              {motivos.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {motivos.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Ainda não calculada para esta quinzena.
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Meus indicadores</h2>
      {resultados.length === 0 ? (
        <EmptyState
          titulo="Sem resultados nesta quinzena"
          texto="Assim que os dados forem importados, seus indicadores aparecem aqui."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resultados.map((r) => {
            const media = medias.find((m) => m.indicador === r.indicador);
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">{rotuloIndicador[r.indicador]}</p>
                <p className="mt-2 font-display text-3xl font-bold">{numeroBR(r.valor)}</p>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>Média do time: {numeroBR(media?.media)}</span>
                  <span>Meta: {numeroBR(media?.meta)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
