import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { excluirColaboradorFn } from "@/lib/acessos.functions";
import { confirmacaoConfere } from "@/lib/format";

export type ColaboradorParaExcluir = { id: string; nome: string };

const ITENS_DO_RESUMO = [
  ["avaliacoes", "avaliação recebida", "avaliações recebidas"],
  ["contestacoes", "contestação", "contestações"],
  ["resultados", "resultado de indicador", "resultados de indicadores"],
  ["quiz", "registro de quiz", "registros de quiz"],
  ["rankings", "posição em ranking", "posições em rankings"],
  ["elegibilidades", "cálculo de elegibilidade", "cálculos de elegibilidade"],
] as const;

/**
 * Exclusão definitiva. Mostra ANTES o que será apagado (contagem do próprio
 * banco) e só libera o botão depois de digitar o nome completo.
 */
export function ExcluirColaboradorDialog({
  colaborador,
  onFechar,
}: {
  colaborador: ColaboradorParaExcluir | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const excluirNoServidor = useServerFn(excluirColaboradorFn);
  const [confirmacao, setConfirmacao] = useState("");

  const { data: resumo, isLoading } = useQuery({
    queryKey: ["resumo-exclusao", colaborador?.id],
    enabled: !!colaborador,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resumo_exclusao_colaborador", {
        _employee_id: colaborador!.id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  function fechar() {
    setConfirmacao("");
    onFechar();
  }

  const excluir = useMutation({
    mutationFn: () => excluirNoServidor({ data: { employeeId: colaborador!.id, confirmacao } }),
    onSuccess: () => {
      toast.success(`${colaborador?.nome} foi excluído(a) definitivamente.`);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      fechar();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const confere = !!colaborador && confirmacaoConfere(confirmacao, colaborador.nome);

  return (
    <Dialog open={!!colaborador} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" /> Excluir {colaborador?.nome} definitivamente
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O cadastro, o acesso e tudo o que é desta pessoa serão
            apagados do sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {isLoading || !resumo ? (
            <p className="text-muted-foreground">Calculando o que será apagado...</p>
          ) : (
            <>
              <p className="font-medium">Serão apagados:</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {ITENS_DO_RESUMO.filter(([chave]) => resumo[chave] > 0).map(
                  ([chave, um, varios]) => (
                    <li key={chave}>
                      {resumo[chave]} {resumo[chave] === 1 ? um : varios}
                    </li>
                  ),
                )}
                <li>o cadastro, o perfil e o acesso à plataforma</li>
              </ul>
              {resumo.avaliacoes_feitas_para_outros > 0 && (
                <p className="mt-2 text-muted-foreground">
                  As {resumo.avaliacoes_feitas_para_outros} avaliações que esta pessoa fez de outros
                  colaboradores <span className="text-foreground">continuam</span>, marcadas como
                  "Avaliador removido".
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmacao-exclusao">
            Para confirmar, digite o nome completo:{" "}
            <span className="text-foreground">{colaborador?.nome}</span>
          </Label>
          <Input
            id="confirmacao-exclusao"
            value={confirmacao}
            autoComplete="off"
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!confere || excluir.isPending}
            onClick={() => excluir.mutate()}
          >
            {excluir.isPending ? "Excluindo..." : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
