import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { avisarContestacaoFn } from "@/lib/avisos-contestacao.functions";
import {
  calcularNota,
  criteriosAlterados,
  respostaDaContestacaoValida,
  ROTULO_RESPOSTA,
  type CriterioDaFicha,
  type Resposta,
} from "@/lib/avaliacao";
import { numeroBR } from "@/lib/format";

type CriterioComResposta = CriterioDaFicha & {
  descricao: string;
  grupo: string;
  gravidade: string;
  resposta: Resposta;
  observacao: string | null;
};

/**
 * Aceitar = ajustar no mesmo passo (decisão de 01/10/2026). A ficha abre com
 * as respostas atuais; o banco valida, recalcula a nota e guarda o antes/depois.
 */
export function AjusteDaAvaliacao({
  contestacaoId,
  avaliacaoId,
  onConcluir,
  onCancelar,
}: {
  contestacaoId: string;
  avaliacaoId: string;
  onConcluir: () => void;
  onCancelar: () => void;
}) {
  const qc = useQueryClient();
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [resposta, setResposta] = useState("");

  const { data: ficha = [], isLoading } = useQuery({
    queryKey: ["ajuste-ficha", avaliacaoId],
    queryFn: async (): Promise<CriterioComResposta[]> => {
      const { data, error } = await supabase
        .from("evaluation_items")
        .select(
          "resposta, observacao, evaluation_criteria(id, ordem, descricao, grupo, gravidade, peso, peso_medio, permite_medio)",
        )
        .eq("evaluation_id", avaliacaoId);
      if (error) throw error;
      return (data ?? [])
        .filter((i) => i.evaluation_criteria)
        .map((i) => ({
          ...i.evaluation_criteria!,
          peso: Number(i.evaluation_criteria!.peso),
          peso_medio:
            i.evaluation_criteria!.peso_medio === null
              ? null
              : Number(i.evaluation_criteria!.peso_medio),
          resposta: i.resposta as Resposta,
          observacao: i.observacao,
        }))
        .sort((a, b) => a.ordem - b.ordem);
    },
  });

  // As respostas atuais são o ponto de partida (e a referência do "o que mudou").
  const originais = useMemo(
    () => Object.fromEntries(ficha.map((c) => [c.id, c.resposta])),
    [ficha],
  );
  useEffect(() => {
    setRespostas(originais);
    setObservacoes(Object.fromEntries(ficha.map((c) => [c.id, c.observacao ?? ""])));
  }, [ficha, originais]);

  const alterados = criteriosAlterados(originais, respostas);
  const novaNota = calcularNota(ficha, respostas);
  const notaAtual = calcularNota(ficha, originais);
  const semJustificativa = ficha.find(
    (c) => respostas[c.id] === "nao" && !observacoes[c.id]?.trim(),
  );

  const aceitar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("responder_contestacao", {
        _contestation_id: contestacaoId,
        _aceitar: true,
        _resposta: resposta,
        _respostas: ficha.map((c) => ({
          criterio_id: c.id,
          resposta: respostas[c.id],
          // Qualquer resposta guarda a observação (no Sim, é uma dica); só o Não a exige.
          observacao: observacoes[c.id]?.trim() ? observacoes[c.id] : null,
        })),
      });
      if (error) throw new Error(error.message);
      // O aviso no Slack: sem esperar e sem mostrar erro (a tarefa da manhã repara o que faltar).
      void avisarContestacaoFn({ data: { contestationId: contestacaoId } }).catch(() => {});
      return data;
    },
    onSuccess: (nota) => {
      toast.success(`Contestação aceita. Nova nota: ${numeroBR(Number(nota))}.`);
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      qc.invalidateQueries({ queryKey: ["minhas-avaliacoes"] });
      qc.removeQueries({ queryKey: ["avaliacao-detalhe", avaliacaoId] });
      qc.removeQueries({ queryKey: ["ajuste-ficha", avaliacaoId] });
      onConcluir();
    },
    onError: (e: Error) => toast.error(`Não foi possível aceitar: ${e.message}`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a ficha...</p>;

  const podeSalvar =
    alterados.length > 0 && !semJustificativa && respostaDaContestacaoValida(resposta);

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Ajuste a avaliação</p>
        <p className="text-sm">
          <span className="text-muted-foreground">Nota: </span>
          {numeroBR(notaAtual)}
          {alterados.length > 0 && (
            <>
              {" → "}
              <span className="font-display font-semibold text-primary">{numeroBR(novaNota)}</span>
            </>
          )}
        </p>
      </div>

      <ol className="divide-y divide-border rounded-lg border border-border bg-card">
        {ficha.map((c) => {
          const opcoes: Resposta[] = c.permite_medio ? ["sim", "medio", "nao"] : ["sim", "nao"];
          const mudou = respostas[c.id] !== originais[c.id];
          return (
            <li key={c.id} className={`p-3 ${mudou ? "bg-primary/5" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  {c.ordem}. {c.descricao}
                  {c.gravidade === "gravissimo" && (
                    <span className="ml-2 text-xs text-destructive">gravíssimo</span>
                  )}
                  {mudou && <span className="ml-2 text-xs text-primary">alterado</span>}
                </p>
                <div className="flex gap-1">
                  {opcoes.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setRespostas((r) => ({ ...r, [c.id]: o }))}
                      aria-pressed={respostas[c.id] === o}
                      className={`rounded px-2.5 py-1 text-xs ${
                        respostas[c.id] === o
                          ? o === "nao"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {ROTULO_RESPOSTA[o]}
                    </button>
                  ))}
                </div>
              </div>
              {respostas[c.id] && (
                <Textarea
                  maxLength={2000}
                  rows={2}
                  className="mt-2 text-xs"
                  aria-label={`Observação do critério ${c.ordem}`}
                  placeholder={
                    respostas[c.id] === "nao"
                      ? "Justificativa do “Não” (obrigatória)"
                      : respostas[c.id] === "medio"
                        ? "O que faltou para ser “Sim” (opcional)"
                        : "Uma dica para o colaborador (opcional)"
                  }
                  value={observacoes[c.id] ?? ""}
                  onChange={(e) => setObservacoes((o) => ({ ...o, [c.id]: e.target.value }))}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <Label htmlFor={`resposta-aceite-${contestacaoId}`}>Resposta ao colaborador</Label>
        <Textarea
          id={`resposta-aceite-${contestacaoId}`}
          rows={3}
          maxLength={2000}
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="Ex.: conferimos a conversa e o histórico foi consultado; o critério 6 foi corrigido."
        />
        <p className="text-xs text-muted-foreground">
          Obrigatória, com pelo menos 10 caracteres.{" "}
          {alterados.length === 0 && "Altere pelo menos um critério para aceitar."}
          {semJustificativa && ` Justifique o critério ${semJustificativa.ordem}.`}
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar} disabled={aceitar.isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!podeSalvar || aceitar.isPending}
          onClick={() => aceitar.mutate()}
        >
          {aceitar.isPending ? "Salvando..." : "Salvar ajuste e aceitar"}
        </Button>
      </div>
    </div>
  );
}
