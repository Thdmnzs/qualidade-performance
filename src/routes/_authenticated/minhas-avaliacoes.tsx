import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageSquareWarning } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetalheDaAvaliacao } from "@/components/detalhe-da-avaliacao";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  avaliacaoApontada,
  contestacaoEmAndamento,
  filtrarMinhasAvaliacoes,
  MOTIVO_CONTESTACAO_MINIMO,
  motivoContestacaoValido,
  ROTULO_TIPO,
  type FiltroApontada,
  type TipoAvaliacao,
} from "@/lib/avaliacao";
import { dataBR, dataHoraBR, nomeQuinzena, numeroBR, rotuloStatusContestacao } from "@/lib/format";
import { fetchContestacoes, fetchQuinzenas } from "@/lib/queries";
import { prazoDeContestacaoAberto } from "@/lib/quinzena";

export const Route = createFileRoute("/_authenticated/minhas-avaliacoes")({
  head: () => ({
    meta: [
      { title: "Minhas avaliações · Qualidade & Performance" },
      { name: "description", content: "Suas avaliações de qualidade por quinzena." },
    ],
  }),
  component: MinhasAvaliacoes,
});

type MinhaAvaliacao = {
  id: string;
  fortnight_id: string;
  tipo: TipoAvaliacao;
  assunto: string | null;
  data_contato: string | null;
  nota: number | null;
  /** Nota do registro, antes de qualquer contestação aceita (null se nunca foi ajustada). */
  notaOriginal: number | null;
  apontada: boolean;
};

const select = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function MinhasAvaliacoes() {
  const { employee, temAreaDeColaborador, isLoading } = usePermissoes();
  const [quinzena, setQuinzena] = useState<string>("todas");
  const [apontada, setApontada] = useState<FiltroApontada>("todas");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [contestando, setContestando] = useState<MinhaAvaliacao | null>(null);

  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });

  const { data: avaliacoes = [], isLoading: carregando } = useQuery({
    queryKey: ["minhas-avaliacoes", employee?.id],
    enabled: !!employee && temAreaDeColaborador,
    queryFn: async (): Promise<MinhaAvaliacao[]> => {
      // Filtra pelo PRÓPRIO cadastro: um avaliador também lê avaliações de
      // colaboradores (para avaliar), e elas não pertencem a esta página.
      // O banco só devolve as próprias depois do fechamento da quinzena.
      const { data, error } = await supabase
        .from("evaluations")
        .select(
          "id, fortnight_id, tipo, assunto, data_contato, nota, nota_original, created_at, evaluation_items(resposta)",
        )
        .eq("employee_id", employee!.id)
        .eq("anulada", false)
        .order("data_contato", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id,
        fortnight_id: a.fortnight_id,
        tipo: a.tipo,
        assunto: a.assunto,
        data_contato: a.data_contato,
        nota: a.nota,
        notaOriginal: a.nota_original,
        apontada: avaliacaoApontada(a.evaluation_items ?? []),
      }));
    },
  });

  // Contestação mais recente de cada avaliação (a lista vem da mais nova para a mais antiga).
  const { data: contestacoes = [] } = useQuery({
    queryKey: ["contestacoes", "minhas", employee?.id],
    enabled: !!employee && temAreaDeColaborador,
    queryFn: () => fetchContestacoes(employee!.id),
  });
  const contestacaoDa = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of contestacoes) {
      if (c.evaluation_id && !mapa.has(c.evaluation_id)) mapa.set(c.evaluation_id, c.status);
    }
    return mapa;
  }, [contestacoes]);

  const visiveis = filtrarMinhasAvaliacoes(avaliacoes, { quinzena, apontada });
  const nomeDaQuinzena = (id: string) => nomeQuinzena(quinzenas.find((q) => q.id === id));
  const quinzenaDe = (id: string) => quinzenas.find((q) => q.id === id);
  const podeContestar = (fortnightId: string) => {
    const q = quinzenaDe(fortnightId);
    return !!q && prazoDeContestacaoAberto(q);
  };
  // Quinzenas com prazo aberto agora, para o aviso no topo.
  const emPrazo = quinzenas.filter((q) => prazoDeContestacaoAberto(q));

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador) {
    return (
      <EmptyState
        titulo="Área do colaborador"
        texto="O perfil ADM não recebe avaliações de qualidade."
      />
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Minhas avaliações"
        descricao="Suas avaliações de qualidade. Elas aparecem aqui quando a quinzena é publicada para contestação."
      />

      {emPrazo.map((q) => (
        <p
          key={q.id}
          className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm"
        >
          Você pode contestar as avaliações da <strong>{nomeQuinzena(q)}</strong> até{" "}
          <strong>{dataHoraBR(q.prazo_contestacao_ate!)}</strong>.
        </p>
      ))}

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="f-quinzena" className="text-xs text-muted-foreground">
            Quinzena
          </Label>
          <select
            id="f-quinzena"
            className={select}
            value={quinzena}
            onChange={(e) => setQuinzena(e.target.value)}
          >
            <option value="todas">Todas as quinzenas</option>
            {quinzenas.map((q) => (
              <option key={q.id} value={q.id}>
                {nomeQuinzena(q)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-apontada" className="text-xs text-muted-foreground">
            Apontada?
          </Label>
          <select
            id="f-apontada"
            className={select}
            value={apontada}
            onChange={(e) => setApontada(e.target.value as FiltroApontada)}
          >
            <option value="todas">Todas</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
        {avaliacoes.length > 0 && (
          <p className="pb-2 text-sm text-muted-foreground">
            {visiveis.length} de {avaliacoes.length} · {visiveis.filter((a) => a.apontada).length}{" "}
            apontada(s)
          </p>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : avaliacoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma avaliação disponível"
          texto="Suas avaliações aparecem aqui quando a quinzena é publicada para contestação."
        />
      ) : visiveis.length === 0 ? (
        <EmptyState
          titulo="Nenhuma avaliação com esses filtros"
          texto="Altere os filtros para ver outras avaliações."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {visiveis.map((a) => {
            const status = contestacaoDa.get(a.id);
            return (
              <li key={a.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandida(expandida === a.id ? null : a.id)}
                    aria-expanded={expandida === a.id}
                    className="flex min-w-0 items-start gap-2 text-left"
                  >
                    <ChevronRight
                      className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${expandida === a.id ? "rotate-90" : ""}`}
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {ROTULO_TIPO[a.tipo]}
                        <span className="mx-2 text-border" aria-hidden="true">
                          |
                        </span>
                        <span className="font-normal text-muted-foreground">Assunto:</span>{" "}
                        {a.assunto ?? "—"}
                        <span className="mx-2 text-border" aria-hidden="true">
                          |
                        </span>
                        <span className="font-normal text-muted-foreground">Data do contato:</span>{" "}
                        {a.data_contato ? dataBR(a.data_contato) : "—"}
                        <span className="mx-2 text-border" aria-hidden="true">
                          |
                        </span>
                        <span className="font-normal text-muted-foreground">Nota:</span>{" "}
                        {a.notaOriginal !== null && a.notaOriginal !== a.nota ? (
                          <>
                            <span className="font-display text-muted-foreground line-through">
                              {numeroBR(Number(a.notaOriginal))}
                            </span>
                            {" → "}
                            <span className="font-display text-primary">
                              {numeroBR(Number(a.nota))}
                            </span>
                          </>
                        ) : (
                          <span className="font-display text-primary">
                            {numeroBR(Number(a.nota))}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {nomeDaQuinzena(a.fortnight_id)}
                        {a.notaOriginal !== null && a.notaOriginal !== a.nota && (
                          <span className="text-primary">
                            {" · "}Nota anterior {numeroBR(Number(a.notaOriginal))}, nova nota{" "}
                            {numeroBR(Number(a.nota))} após contestação
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${a.apontada ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
                    >
                      {a.apontada ? "Apontada" : "Sem apontamentos"}
                    </span>
                    {contestacaoEmAndamento(status) ? (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        Contestação {rotuloStatusContestacao[status!]?.toLowerCase()}
                      </span>
                    ) : podeContestar(a.fortnight_id) ? (
                      <Button size="sm" variant="outline" onClick={() => setContestando(a)}>
                        <MessageSquareWarning className="size-3.5" /> Contestar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Prazo de contestação encerrado
                      </span>
                    )}
                  </div>
                </div>
                {status && !contestacaoEmAndamento(status) && (
                  <p className="mt-2 pl-6 text-xs text-muted-foreground">
                    Contestação anterior: {rotuloStatusContestacao[status]?.toLowerCase()}.
                  </p>
                )}
                {expandida === a.id && <DetalheDaAvaliacao avaliacaoId={a.id} />}
              </li>
            );
          })}
        </ul>
      )}

      <ContestarAvaliacaoDialog avaliacao={contestando} onFechar={() => setContestando(null)} />
    </div>
  );
}

function ContestarAvaliacaoDialog({
  avaliacao,
  onFechar,
}: {
  avaliacao: MinhaAvaliacao | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  function fechar() {
    setMotivo("");
    onFechar();
  }

  const contestar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("contestar_avaliacao", {
        _evaluation_id: avaliacao!.id,
        _descricao: motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contestação enviada. Ela aparece em Minhas contestações.");
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
      fechar();
    },
    onError: (e: Error) => toast.error(`Não foi possível enviar: ${e.message}`),
  });

  return (
    <Dialog open={!!avaliacao} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contestar avaliação</DialogTitle>
          <DialogDescription>
            {avaliacao && (
              <>
                {ROTULO_TIPO[avaliacao.tipo]} · {avaliacao.assunto ?? "sem assunto"} · nota{" "}
                {numeroBR(Number(avaliacao.nota))}.
              </>
            )}{" "}
            Explique o que você discorda. A contestação vai para a equipe de avaliação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo-contestacao">Motivo</Label>
          <Textarea
            id="motivo-contestacao"
            rows={5}
            maxLength={2000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: no critério 6, o histórico foi consultado; está registrado na nota interna do ticket."
            aria-describedby="motivo-contestacao-ajuda"
          />
          <p id="motivo-contestacao-ajuda" className="text-xs text-muted-foreground">
            Obrigatório, com pelo menos {MOTIVO_CONTESTACAO_MINIMO} caracteres.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!motivoContestacaoValido(motivo) || contestar.isPending}
            onClick={() => contestar.mutate()}
          >
            {contestar.isPending ? "Enviando..." : "Enviar contestação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
