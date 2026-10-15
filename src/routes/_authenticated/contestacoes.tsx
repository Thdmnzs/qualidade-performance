import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { AntesDepoisDaContestacao } from "@/components/antes-depois-da-contestacao";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissoes } from "@/hooks/useAuth";
import { filtrarContestacoes, type SituacaoDoFiltro } from "@/lib/filtro-de-contestacoes";
import { dataHoraBR, numeroBR, rotuloStatusContestacao } from "@/lib/format";
import { fetchContestacoes } from "@/lib/queries";

const COR_STATUS: Record<string, string> = {
  aberta: "bg-warning/15 text-warning",
  em_analise: "bg-warning/15 text-warning",
  deferida: "bg-primary/15 text-primary",
  indeferida: "bg-destructive/15 text-destructive",
};

export const Route = createFileRoute("/_authenticated/contestacoes")({
  head: () => ({
    meta: [
      { title: "Minhas contestações · CX Hub" },
      { name: "description", content: "Acompanhamento das contestações das suas avaliações." },
    ],
  }),
  component: Contestacoes,
});

/**
 * Minhas contestações (07/10/2026): só o acompanhamento. A contestação é aberta
 * por avaliação, em "Minhas avaliações" (o formulário de contestação avulsa saiu).
 * As avulsas antigas continuam na lista, para o histórico não sumir.
 */
function Contestacoes() {
  const { employee, temAreaDeColaborador, isLoading } = usePermissoes();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoDoFiltro>("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const { data: contestacoes = [] } = useQuery({
    // Só as próprias, inclusive para avaliadores (as dos outros ficam em /admin/contestacoes).
    queryKey: ["contestacoes", "minhas", employee?.id],
    queryFn: () => fetchContestacoes(employee!.id),
    enabled: !!employee && temAreaDeColaborador,
  });
  const filtradas = filtrarContestacoes(contestacoes, busca, situacao);

  const alternar = (id: string) =>
    setAbertos((a) => {
      const novo = new Set(a);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador) {
    return (
      <EmptyState
        titulo="Área do colaborador"
        texto="O perfil ADM não abre contestações. As contestações do time ficam em Contestações, na gestão."
      />
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Minhas contestações"
        descricao="Acompanhe as contestações das suas avaliações: o que você pediu, a resposta e o que mudou na nota."
      />

      <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Para contestar uma avaliação, abra-a em <b className="text-foreground">Minhas avaliações</b>{" "}
        e use o botão <b className="text-foreground">Contestar</b>. Contestações são aceitas quando
        a quinzena é publicada, por 2 dias úteis (até as 23h59 do último dia).
      </p>

      {contestacoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma contestação"
          texto="Você ainda não contestou nenhuma avaliação."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="busca-contestacao" className="text-xs">
                Buscar
              </Label>
              <Input
                id="busca-contestacao"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Assunto, o que você pediu ou a resposta"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="situacao-contestacao" className="text-xs">
                Situação
              </Label>
              <select
                id="situacao-contestacao"
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as SituacaoDoFiltro)}
                className="block h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas</option>
                <option value="em_analise">Em análise</option>
                <option value="deferida">Aceitas</option>
                <option value="indeferida">Recusadas</option>
              </select>
            </div>
          </div>
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
            {filtradas.length} de {contestacoes.length} contestações
          </p>

          {filtradas.length === 0 ? (
            <EmptyState titulo="Nada encontrado" texto="Nenhuma contestação com esse filtro." />
          ) : (
            <div className="space-y-3">
              {filtradas.map((c) => {
                const aberto = abertos.has(c.id);
                const mudouNota = c.nota_anterior !== null && c.nota_nova !== null;
                return (
                  <div key={c.id} className="rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => alternar(c.id)}
                      aria-expanded={aberto}
                      className="flex w-full flex-wrap items-center justify-between gap-2 p-5 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ChevronRight
                          className={`size-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        />
                        <span className="font-medium">{c.assunto}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {mudouNota && (
                          <span>
                            Nota: <s>{numeroBR(Number(c.nota_anterior))}</s> →{" "}
                            <b className="text-primary">{numeroBR(Number(c.nota_nova))}</b>
                          </span>
                        )}
                        <span>Aberta em {dataHoraBR(c.created_at)}</span>
                        <span
                          className={`rounded-full px-3 py-1 ${COR_STATUS[c.status] ?? "bg-secondary"}`}
                        >
                          {rotuloStatusContestacao[c.status]}
                        </span>
                      </span>
                    </button>
                    {aberto && (
                      <div className="space-y-3 px-5 pb-5">
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {c.descricao}
                        </p>
                        {c.resolucao ? (
                          <div className="rounded-lg bg-secondary p-3 text-sm">
                            <p className="font-medium">
                              {c.status === "deferida"
                                ? "Contestação aceita"
                                : "Contestação recusada"}
                              {c.respondida_em && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  em {dataHoraBR(c.respondida_em)}
                                </span>
                              )}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap">{c.resolucao}</p>
                          </div>
                        ) : (
                          <p className="rounded-lg bg-warning/10 p-3 text-sm">
                            Aguardando a resposta.
                          </p>
                        )}
                        {/* Antes e depois dos apontamentos e da nota, quando a avaliação foi ajustada. */}
                        <AntesDepoisDaContestacao
                          notaAnterior={c.nota_anterior}
                          notaNova={c.nota_nova}
                          alteracoes={c.alteracoes}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
