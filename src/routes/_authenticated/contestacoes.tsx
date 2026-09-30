import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePermissoes } from "@/hooks/useAuth";
import { fetchContestacoes, fetchQuinzenaAtual } from "@/lib/queries";
import { dataHoraBR, rotuloStatusContestacao } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contestacoes")({
  head: () => ({
    meta: [
      { title: "Minhas contestações · Qualidade & Performance" },
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

  const { data: quinzena } = useQuery({
    queryKey: ["quinzena-atual"],
    queryFn: fetchQuinzenaAtual,
  });
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

      {contestacoes.length === 0 ? (
        <EmptyState titulo="Nenhuma contestação" texto="Você ainda não abriu contestações." />
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
