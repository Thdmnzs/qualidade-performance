import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AntesDepoisDaContestacao } from "@/components/antes-depois-da-contestacao";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePermissoes } from "@/hooks/useAuth";
import { fetchContestacoes, fetchQuinzenas } from "@/lib/queries";
import { prazoDeContestacaoAberto, quinzenaEmPrazo } from "@/lib/quinzena";
import { dataHoraBR, rotuloStatusContestacao } from "@/lib/format";

const COR_STATUS: Record<string, string> = {
  aberta: "bg-warning/15 text-warning",
  em_analise: "bg-warning/15 text-warning",
  deferida: "bg-primary/15 text-primary",
  indeferida: "bg-destructive/15 text-destructive",
};

export const Route = createFileRoute("/_authenticated/contestacoes")({
  head: () => ({
    meta: [
      { title: "Minhas contestações · QualityHUB" },
      { name: "description", content: "Abertura e acompanhamento de contestações da quinzena." },
    ],
  }),
  component: Contestacoes,
});

function Contestacoes() {
  const { employee, temAreaDeColaborador, isLoading } = usePermissoes();
  const queryClient = useQueryClient();
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");

  // A quinzena no prazo de contestação (não necessariamente a mais recente:
  // a próxima pode já estar aberta enquanto esta é contestada).
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const quinzena = quinzenaEmPrazo(quinzenas);
  const { data: contestacoes = [] } = useQuery({
    // Só as próprias, inclusive para avaliadores (as dos outros ficam em /admin/contestacoes).
    queryKey: ["contestacoes", "minhas", employee?.id],
    queryFn: () => fetchContestacoes(employee!.id),
    enabled: !!employee && temAreaDeColaborador,
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contestations").insert({
        assunto,
        descricao,
        employee_id: employee!.id,
        fortnight_id: quinzena!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contestação registrada.");
      setAssunto("");
      setDescricao("");
      queryClient.invalidateQueries({ queryKey: ["contestacoes"] });
    },
    onError: () => toast.error("Não foi possível registrar a contestação."),
  });

  const prazoEncerrado = quinzena?.prazo_contestacao_ate
    ? new Date(quinzena.prazo_contestacao_ate) < new Date()
    : false;

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
        descricao="Abra uma contestação sobre resultados ou avaliações da quinzena."
      />

      {quinzena && prazoDeContestacaoAberto(quinzena) ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!quinzena) {
              toast.error("Nenhuma quinzena disponível.");
              return;
            }
            criar.mutate();
          }}
          className="mb-8 space-y-4 rounded-2xl border border-border bg-card p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              required
              disabled={prazoEncerrado}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
              disabled={prazoEncerrado}
            />
          </div>
          <Button type="submit" disabled={criar.isPending || prazoEncerrado}>
            {prazoEncerrado ? "Prazo encerrado" : "Enviar contestação"}
          </Button>
        </form>
      ) : (
        <p className="mb-8 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Contestações são aceitas quando a quinzena é publicada, por 2 dias úteis (até as 23h59 do
          último dia). Para contestar uma avaliação específica, use "Minhas avaliações".
        </p>
      )}

      {contestacoes.length === 0 ? (
        <EmptyState titulo="Nenhuma contestação" texto="Você ainda não abriu contestações." />
      ) : (
        <div className="space-y-3">
          {contestacoes.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.assunto}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${COR_STATUS[c.status] ?? "bg-secondary"}`}
                >
                  {rotuloStatusContestacao[c.status]}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {c.descricao}
              </p>
              {c.resolucao && (
                <div className="mt-3 rounded-lg bg-secondary p-3 text-sm">
                  <p className="font-medium">
                    {c.status === "deferida" ? "Contestação aceita" : "Contestação recusada"}
                    {c.respondida_em && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        em {dataHoraBR(c.respondida_em)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{c.resolucao}</p>
                </div>
              )}
              {/* Antes e depois dos apontamentos e da nota, quando a avaliação foi ajustada. */}
              <AntesDepoisDaContestacao
                notaAnterior={c.nota_anterior}
                notaNova={c.nota_nova}
                alteracoes={c.alteracoes}
              />
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
