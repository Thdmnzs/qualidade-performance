import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetalheDaAvaliacao } from "@/components/detalhe-da-avaliacao";
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
import { dataBR, dataHoraBR, nomeQuinzena, numeroBR } from "@/lib/format";

type Quinzena = { id: string; ano: number; mes: number; tipo: string };

const TODAS = "todas";

/** Separador visual entre os campos da linha: "Interação | Assunto: … | …". */
const Separador = () => (
  <span className="mx-2 text-border" aria-hidden="true">
    |
  </span>
);

/**
 * Avaliações agrupadas por colaborador. Cada bloco tem o próprio filtro de
 * quinzena. A etiqueta "Avaliado por" só existe aqui, na área de avaliação:
 * o colaborador nunca recebe essa informação (o banco esconde a coluna).
 */
export function AvaliacoesPorColaborador({
  avaliacoes,
  quinzenas,
  quinzenaPadrao,
  onEditar,
}: {
  avaliacoes: AvaliacaoDaGestao[];
  quinzenas: Quinzena[];
  /** Quinzena que os blocos mostram ao abrir (a escolhida no formulário, ou a mais recente). */
  quinzenaPadrao: string | undefined;
  /** Editar (as mesmas regras do Excluir). Sem ele (no Histórico), não há botão. */
  onEditar?: (a: AvaliacaoDaGestao) => void;
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
          {...(onEditar ? { onEditar } : {})}
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
  onEditar,
}: {
  bloco: BlocoDoColaborador;
  quinzenas: Quinzena[];
  quinzenaPadrao: string | undefined;
  onExcluir: (a: AvaliacaoDaGestao) => void;
  onEditar?: (a: AvaliacaoDaGestao) => void;
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
                        {ROTULO_TIPO[a.tipo]}
                        <Separador />
                        <span className="font-normal text-muted-foreground">Assunto:</span>{" "}
                        {a.assunto ?? "—"}
                        <Separador />
                        <span className="font-normal text-muted-foreground">
                          Data do contato:
                        </span>{" "}
                        {a.data_contato ? dataBR(a.data_contato) : "—"}
                        <Separador />
                        <span className="font-normal text-muted-foreground">Nota:</span>{" "}
                        <span className="font-display text-primary">
                          {numeroBR(Number(a.nota))}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Registrada em {dataHoraBR(a.created_at)}
                        {filtro === TODAS && ` · ${nomeDaQuinzena(a.fortnight_id)}`}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {a.nota_original != null && Number(a.nota_original) !== Number(a.nota) && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        Contestação aceita ({numeroBR(Number(a.nota_original))} →{" "}
                        {numeroBR(Number(a.nota))})
                      </span>
                    )}
                    {a.processo_codigo && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        Processo {a.processo_codigo} (v{a.processo_versao})
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                      Avaliado por: {a.avaliado_por}
                    </span>
                    {a.pode_excluir && onEditar && (
                      <Button size="sm" variant="outline" onClick={() => onEditar(a)}>
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                    )}
                    {a.pode_excluir && (
                      <Button size="sm" variant="outline" onClick={() => onExcluir(a)}>
                        <Trash2 className="size-3.5" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
                {/* Montado só quando aberto: os detalhes são buscados sob demanda. */}
                {expandida === a.id && <DetalheDaAvaliacao avaliacaoId={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
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
                {avaliacao.assunto ? ` (${avaliacao.assunto})` : ""}, nota{" "}
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
            maxLength={1000}
            id="motivo-exclusao"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: conversa errada, colaborador errado"
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
