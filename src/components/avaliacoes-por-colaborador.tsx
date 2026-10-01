import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { supabase } from "@/integrations/supabase/client";
import {
  AVALIACOES_PREVISTAS,
  agruparPorColaborador,
  avaliadoresDe,
  contarPorTipo,
  MOTIVO_MINIMO,
  motivoValido,
  ROTULO_TIPO,
  type AvaliacaoDaGestao,
  type BlocoDoColaborador,
} from "@/lib/avaliacao";
import { dataHoraBR, nomeQuinzena, numeroBR } from "@/lib/format";

type Quinzena = { id: string; ano: number; mes: number; tipo: string };

const TODAS = "todas";

/**
 * Avaliações agrupadas por colaborador. Cada bloco tem o próprio filtro de
 * quinzena. A etiqueta "Avaliado por" só existe aqui, na área de avaliação:
 * o colaborador nunca recebe essa informação (o banco esconde a coluna).
 */
export function AvaliacoesPorColaborador({
  avaliacoes,
  quinzenas,
  quinzenaPadrao,
}: {
  avaliacoes: AvaliacaoDaGestao[];
  quinzenas: Quinzena[];
  /** Quinzena que os blocos mostram ao abrir (a escolhida no formulário, ou a mais recente). */
  quinzenaPadrao: string | undefined;
}) {
  const [excluindo, setExcluindo] = useState<AvaliacaoDaGestao | null>(null);
  const blocos = useMemo(() => agruparPorColaborador(avaliacoes), [avaliacoes]);

  if (blocos.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma avaliação"
        texto="As avaliações registradas aparecem aqui, agrupadas por colaborador."
      />
    );
  }

  return (
    <div className="space-y-3">
      {blocos.map((bloco) => (
        <BlocoColaborador
          key={bloco.employeeId}
          bloco={bloco}
          quinzenas={quinzenas}
          quinzenaPadrao={quinzenaPadrao}
          onExcluir={setExcluindo}
        />
      ))}
      <ExcluirAvaliacaoDialog avaliacao={excluindo} onFechar={() => setExcluindo(null)} />
    </div>
  );
}

function BlocoColaborador({
  bloco,
  quinzenas,
  quinzenaPadrao,
  onExcluir,
}: {
  bloco: BlocoDoColaborador;
  quinzenas: Quinzena[];
  quinzenaPadrao: string | undefined;
  onExcluir: (a: AvaliacaoDaGestao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<string>(quinzenaPadrao ?? TODAS);
  const [expandida, setExpandida] = useState<string | null>(null);

  const visiveis =
    filtro === TODAS ? bloco.avaliacoes : bloco.avaliacoes.filter((a) => a.fortnight_id === filtro);
  const totais = contarPorTipo(visiveis);
  const nomeDaQuinzena = (id: string) => {
    const q = quinzenas.find((x) => x.id === id);
    return q ? nomeQuinzena(q) : "—";
  };

  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      className="rounded-2xl border border-border bg-card"
    >
      <CollapsibleTrigger className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left">
        <div>
          <p className="font-display font-semibold">Avaliações · {bloco.colaborador}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(Object.keys(AVALIACOES_PREVISTAS) as Array<keyof typeof AVALIACOES_PREVISTAS>).map(
              (t, i) => (
                <span
                  key={t}
                  className={totais[t] >= AVALIACOES_PREVISTAS[t] ? "text-warning" : undefined}
                >
                  {i > 0 && " · "}
                  {ROTULO_TIPO[t]} {totais[t]}/{AVALIACOES_PREVISTAS[t]}
                </span>
              ),
            )}
            {filtro === TODAS && " (todas as quinzenas)"}
          </p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border px-5 py-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Label htmlFor={`filtro-${bloco.employeeId}`} className="text-xs text-muted-foreground">
            Quinzena
          </Label>
          <select
            id={`filtro-${bloco.employeeId}`}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value={TODAS}>Todas as quinzenas</option>
            {quinzenas.map((q) => (
              <option key={q.id} value={q.id}>
                {nomeQuinzena(q)}
              </option>
            ))}
          </select>
          {visiveis.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Avaliado por: {avaliadoresDe(visiveis).join(", ")}
            </span>
          )}
        </div>

        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma avaliação nesta quinzena.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Só esta área expande; o botão Excluir fica fora dela. */}
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
                        {ROTULO_TIPO[a.tipo]} · {a.ticket ?? "sem ticket"}
                        <span className="ml-2 font-display text-primary">
                          {numeroBR(Number(a.nota))}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {dataHoraBR(a.created_at)}
                        {filtro === TODAS && ` · ${nomeDaQuinzena(a.fortnight_id)}`}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                      Avaliado por: {a.avaliado_por}
                    </span>
                    {a.pode_excluir && (
                      <Button size="sm" variant="outline" onClick={() => onExcluir(a)}>
                        <Trash2 className="size-3.5" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
                {/* Montado só quando aberto: os detalhes são buscados sob demanda. */}
                {expandida === a.id && <DetalheDaAvaliacao avaliacao={a} />}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

const ESTILO_RESPOSTA = {
  sim: { rotulo: "Sim", classe: "bg-primary/15 text-primary" },
  medio: { rotulo: "Médio", classe: "bg-warning/15 text-warning" },
  nao: { rotulo: "Não", classe: "bg-destructive/15 text-destructive" },
} as const;

/**
 * Apontamentos de uma avaliação: os 14 critérios, com resposta, desconto e
 * justificativa, mais comentários e link. Buscado só quando a avaliação é
 * aberta (carregamento sob demanda) e guardado em cache pelo React Query.
 * O RLS garante que só chega aqui o que o usuário pode ver.
 */
function DetalheDaAvaliacao({ avaliacao }: { avaliacao: AvaliacaoDaGestao }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["avaliacao-detalhe", avaliacao.id],
    queryFn: async () => {
      const [itens, extra] = await Promise.all([
        supabase
          .from("evaluation_items")
          .select(
            "resposta, desconto, observacao, evaluation_criteria(ordem, descricao, gravidade)",
          )
          .eq("evaluation_id", avaliacao.id),
        supabase
          .from("evaluations")
          .select("comentarios, link_conversa")
          .eq("id", avaliacao.id)
          .maybeSingle(),
      ]);
      if (itens.error) throw itens.error;
      if (extra.error) throw extra.error;
      const ordenados = [...(itens.data ?? [])].sort(
        (x, y) => (x.evaluation_criteria?.ordem ?? 0) - (y.evaluation_criteria?.ordem ?? 0),
      );
      return {
        itens: ordenados,
        comentarios: extra.data?.comentarios,
        link: extra.data?.link_conversa,
      };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading)
    return <p className="mt-3 pl-6 text-xs text-muted-foreground">Carregando apontamentos...</p>;
  if (error || !data) {
    return (
      <p className="mt-3 pl-6 text-xs text-destructive">
        Não foi possível carregar os apontamentos.
      </p>
    );
  }

  const comDesconto = data.itens.filter((i) => i.resposta !== "sim").length;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-background/40 p-4 sm:ml-6">
      <p className="text-xs text-muted-foreground">
        {comDesconto === 0
          ? "Nenhum apontamento: todos os critérios foram atendidos."
          : `${comDesconto} ${comDesconto === 1 ? "critério com desconto" : "critérios com desconto"}.`}
      </p>
      <ol className="space-y-2">
        {data.itens.map((item) => {
          const c = item.evaluation_criteria;
          const estilo =
            ESTILO_RESPOSTA[item.resposta as keyof typeof ESTILO_RESPOSTA] ?? ESTILO_RESPOSTA.sim;
          return (
            <li key={c?.ordem} className="text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className={item.resposta === "sim" ? "text-muted-foreground" : "font-medium"}>
                  {c?.ordem}. {c?.descricao}
                  {c?.gravidade === "gravissimo" && (
                    <span className="ml-2 text-xs text-destructive">gravíssimo</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {Number(item.desconto) > 0 && (
                    <span className="text-xs text-destructive">
                      −{numeroBR(Number(item.desconto))}
                    </span>
                  )}
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${estilo.classe}`}>
                    {estilo.rotulo}
                  </span>
                </span>
              </div>
              {item.observacao && (
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-xs">
                  {item.observacao}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {(data.comentarios || data.link) && (
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          {data.comentarios && (
            <p className="whitespace-pre-wrap">
              <span className="font-medium">Comentários: </span>
              {data.comentarios}
            </p>
          )}
          {data.link && (
            <a
              href={data.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Abrir a conversa <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ExcluirAvaliacaoDialog({
  avaliacao,
  onFechar,
}: {
  avaliacao: AvaliacaoDaGestao | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  function fechar() {
    setMotivo("");
    onFechar();
  }

  const excluir = useMutation({
    mutationFn: async () => {
      if (!avaliacao) return;
      const { error } = await supabase.rpc("excluir_avaliacao", {
        _evaluation_id: avaliacao.id,
        _motivo: motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Avaliação excluída.");
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-totais"] });
      qc.removeQueries({ queryKey: ["avaliacao-detalhe", avaliacao?.id] });
      fechar();
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`),
  });

  return (
    <Dialog open={!!avaliacao} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir avaliação</DialogTitle>
          <DialogDescription>
            {avaliacao && (
              <>
                {ROTULO_TIPO[avaliacao.tipo]} de {avaliacao.colaborador}
                {avaliacao.ticket ? ` (ticket ${avaliacao.ticket})` : ""}, nota{" "}
                {numeroBR(Number(avaliacao.nota))}.
              </>
            )}{" "}
            Ela sai das telas, das notas e dos totais, e fica registrada no histórico com o motivo
            informado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo-exclusao">Motivo da exclusão</Label>
          <Textarea
            id="motivo-exclusao"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: ticket errado, colaborador errado"
            aria-describedby="motivo-ajuda"
          />
          <p id="motivo-ajuda" className="text-xs text-muted-foreground">
            Obrigatório, com pelo menos {MOTIVO_MINIMO} caracteres.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!motivoValido(motivo) || excluir.isPending}
            onClick={() => excluir.mutate()}
          >
            {excluir.isPending ? "Excluindo..." : "Excluir avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
