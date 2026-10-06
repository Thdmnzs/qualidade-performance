import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState, PageHeader } from "@/components/page-header";
import { CartaoIndicador } from "@/components/cartao-indicador";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissoes } from "@/hooks/useAuth";
import { dataBR, nomeQuinzena } from "@/lib/format";
import {
  diasDaQuinzena,
  horasEMinutos,
  horasExigidas,
  INDICADORES,
  textoDaMeta,
} from "@/lib/indicadores";
import { fetchMetas, fetchQuinzenas } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores · QualityHUB" },
      {
        name: "description",
        content: "Indicadores do time, enviados em arquivo e revisados pelo ADM.",
      },
    ],
  }),
  component: Indicadores,
});

function Indicadores() {
  const { isAdmin, isLoading } = usePermissoes();
  const [fortnightId, setFortnightId] = useState("");

  const { data: quinzenas = [] } = useQuery({
    queryKey: ["quinzenas"],
    queryFn: fetchQuinzenas,
    enabled: isAdmin,
  });
  useEffect(() => {
    if (!fortnightId && quinzenas[0]) setFortnightId(quinzenas[0].id);
  }, [quinzenas, fortnightId]);
  const quinzena = quinzenas.find((q) => q.id === fortnightId);

  // Metas: fonte única no banco (regra de negócio "metas_indicadores").
  // Metas: fonte única no banco (regra de negócio "metas_indicadores").
  const { data: metas, isLoading: carregandoMetas } = useQuery({
    queryKey: ["metas-indicadores"],
    queryFn: fetchMetas,
    enabled: isAdmin,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />
    );

  return (
    <div>
      <PageHeader
        titulo="Indicadores"
        descricao="Os relatórios são enviados em arquivo (Excel ou CSV) e só vão para os colaboradores depois da revisão do ADM."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ind-quinzena" className="text-xs text-muted-foreground">
            Quinzena
          </Label>
          <select
            id="ind-quinzena"
            value={fortnightId}
            onChange={(e) => setFortnightId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {quinzenas.map((q) => (
              <option key={q.id} value={q.id}>
                {nomeQuinzena(q)}
              </option>
            ))}
          </select>
        </div>
        {quinzena && (
          <p className="pb-2 text-sm text-muted-foreground">
            {dataBR(quinzena.data_inicio)} a {dataBR(quinzena.data_fim)} ·{" "}
            {diasDaQuinzena(quinzena)} dias
          </p>
        )}
      </div>

      {carregandoMetas ? (
        <p className="text-sm text-muted-foreground">Carregando metas...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {INDICADORES.map((ind) => {
            const meta = metas?.[ind.chave];
            return (
              // Formato dos cartões de indicador; aqui o valor grande é a META.
              <CartaoIndicador
                key={ind.chave}
                rotulo={ind.titulo}
                etiqueta={meta?.escopo === "time" ? "do time" : "individual"}
                valor={meta ? textoDaMeta(meta) : null}
                situacao={meta ? "ok" : "aguardando"}
                textoDaSituacao={meta ? "meta vigente" : "meta não configurada"}
              >
                {ind.chave === "horas_online" && meta && quinzena && (
                  <p className="text-sm">
                    Nesta quinzena:{" "}
                    <strong>{horasEMinutos(horasExigidas(quinzena, meta.meta))}</strong> em{" "}
                    {diasDaQuinzena(quinzena)} dias
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{ind.explicacao}</p>
                {/* O envio depende do formato de cada relatório, que está sendo levantado com os gestores. */}
                <Button variant="outline" className="mt-2 w-full font-bold" disabled>
                  <FileUp className="size-4" /> Enviar relatório
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Disponível assim que o modelo do arquivo for definido.
                </p>
              </CartaoIndicador>
            );
          })}
        </div>
      )}
    </div>
  );
}
