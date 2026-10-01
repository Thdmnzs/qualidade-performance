import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { dataHoraBR, nomeQuinzena } from "@/lib/format";
import {
  contestacaoAtrasada,
  prazoDeContestacaoAberto,
  ROTULO_STATUS_QUINZENA,
  situacaoDoFechamento,
  type StatusQuinzena,
} from "@/lib/quinzena";

type Quinzena = {
  id: string;
  ano: number;
  mes: number;
  tipo: string;
  status: string;
  publicado_em: string | null;
  prazo_contestacao_ate: string | null;
  fechado_em: string | null;
};
type ContestacaoResumo = { fortnight_id: string; status: string; responder_ate: string | null };
type Acao = "publicar" | "fechar" | "reabrir";

const COR: Record<string, string> = {
  aberta: "bg-primary/15 text-primary",
  em_analise: "bg-primary/15 text-primary",
  em_contestacao: "bg-warning/15 text-warning",
  pronta_para_fechamento: "bg-warning/15 text-warning",
  fechada: "bg-secondary text-muted-foreground",
};

/**
 * Ciclo da quinzena (só ADM): aberta -> em contestação -> fechada.
 * O banco valida cada passo e registra na auditoria; aqui só se explica.
 */
export function CicloDaQuinzena({
  quinzena,
  contestacoes,
}: {
  quinzena: Quinzena;
  contestacoes: ContestacaoResumo[];
}) {
  const qc = useQueryClient();
  const [reabrindo, setReabrindo] = useState(false);
  const [motivo, setMotivo] = useState("");

  const daQuinzena = contestacoes.filter((c) => c.fortnight_id === quinzena.id);
  const pendentes = daQuinzena.filter(
    (c) => c.status === "aberta" || c.status === "em_analise",
  ).length;
  const atrasadas = daQuinzena.filter((c) => contestacaoAtrasada(c)).length;
  const fechamento = situacaoDoFechamento(quinzena, pendentes);
  const prazoAberto = prazoDeContestacaoAberto(quinzena);

  const alterar = useMutation({
    mutationFn: async ({ acao, motivo }: { acao: Acao; motivo?: string }) => {
      const { error } = await supabase.rpc("alterar_ciclo_quinzena", {
        _fortnight_id: quinzena.id,
        _acao: acao,
        ...(motivo ? { _motivo: motivo } : {}),
      });
      if (error) throw new Error(error.message);
      return acao;
    },
    onSuccess: (acao) => {
      toast.success(
        acao === "publicar"
          ? "Quinzena publicada para contestação."
          : acao === "fechar"
            ? "Quinzena fechada. Os resultados agora são oficiais."
            : "Quinzena reaberta.",
      );
      setReabrindo(false);
      setMotivo("");
      // O status muda o que várias telas mostram.
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = quinzena.status as StatusQuinzena;

  function publicar() {
    if (
      confirm(
        `Publicar a ${nomeQuinzena(quinzena)} para contestação?\n\n` +
          "Os colaboradores passam a ver as próprias avaliações e têm 2 dias úteis (contando hoje) para contestar, até as 23h59. " +
          "Avaliações não poderão mais ser registradas nem excluídas.",
      )
    ) {
      alterar.mutate({ acao: "publicar" });
    }
  }

  function fechar() {
    if (confirm(`Fechar a ${nomeQuinzena(quinzena)}?\n\nOs resultados passam a ser oficiais.`)) {
      alterar.mutate({ acao: "fechar" });
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ciclo da quinzena</p>
          <p className="mt-1 font-display text-lg font-semibold">{nomeQuinzena(quinzena)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${COR[status] ?? "bg-secondary"}`}
        >
          {ROTULO_STATUS_QUINZENA[status] ?? status}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Publicada em</dt>
          <dd>{quinzena.publicado_em ? dataHoraBR(quinzena.publicado_em) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prazo para contestar</dt>
          <dd>
            {quinzena.prazo_contestacao_ate ? dataHoraBR(quinzena.prazo_contestacao_ate) : "—"}
            {status === "em_contestacao" && (
              <span
                className={`ml-2 text-xs ${prazoAberto ? "text-primary" : "text-muted-foreground"}`}
              >
                {prazoAberto ? "(aberto)" : "(encerrado)"}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contestações pendentes</dt>
          <dd>
            {pendentes}
            {atrasadas > 0 && (
              <span className="ml-2 text-xs text-destructive">({atrasadas} atrasada(s))</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {(status === "aberta" || status === "em_analise") && (
          <Button onClick={publicar} disabled={alterar.isPending}>
            <Send className="size-4" /> Publicar para contestação
          </Button>
        )}
        {status === "em_contestacao" && (
          <>
            {!fechamento.podeFechar && (
              <p className="text-xs text-muted-foreground">{fechamento.motivo}</p>
            )}
            <Button onClick={fechar} disabled={!fechamento.podeFechar || alterar.isPending}>
              <Lock className="size-4" /> Fechar quinzena
            </Button>
          </>
        )}
        {status !== "aberta" && status !== "em_analise" && (
          <Button
            variant="outline"
            onClick={() => setReabrindo(true)}
            disabled={alterar.isPending || pendentes > 0}
          >
            <LockOpen className="size-4" /> Reabrir
          </Button>
        )}
      </div>

      <Dialog open={reabrindo} onOpenChange={(aberto) => !aberto && setReabrindo(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir a {nomeQuinzena(quinzena)}</DialogTitle>
            <DialogDescription>
              A quinzena volta a ficar aberta: os colaboradores deixam de ver as avaliações até a
              próxima publicação, e avaliações voltam a poder ser registradas. A reabertura fica
              registrada na auditoria com o motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-reabertura">Motivo</Label>
            <Textarea
              id="motivo-reabertura"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: a importação de CSAT veio com erro."
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório, com pelo menos 10 caracteres.
            </p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReabrindo(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 10 || alterar.isPending}
              onClick={() => alterar.mutate({ acao: "reabrir", motivo })}
            >
              Reabrir quinzena
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
