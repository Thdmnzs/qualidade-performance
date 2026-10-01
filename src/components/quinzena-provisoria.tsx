/**
 * PROVISÓRIO — ferramenta de teste para fechar e reabrir a quinzena.
 *
 * Existe para visualizar o sistema com a quinzena fechada enquanto o fluxo
 * definitivo de fechamento (status intermediários, contestação, ranking,
 * elegibilidade e auditoria) não é construído. Remover quando ele existir:
 * basta apagar este arquivo e o <QuinzenaProvisoria /> em app-shell.tsx.
 *
 * Só ADM: a tela esconde o botão para os demais, e o RLS da tabela
 * fortnights (fortnights_admin_write) recusa a alteração de qualquer outro.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { nomeQuinzena } from "@/lib/format";
import { fetchQuinzenas } from "@/lib/queries";

export function QuinzenaProvisoria() {
  const { isAdmin, employee } = usePermissoes();
  const qc = useQueryClient();

  const { data: quinzenas = [] } = useQuery({
    queryKey: ["quinzenas"],
    queryFn: fetchQuinzenas,
    enabled: isAdmin,
  });
  // A mais recente (fetchQuinzenas já ordena da mais nova para a mais antiga).
  const quinzena = quinzenas[0];

  const alternar = useMutation({
    mutationFn: async () => {
      if (!quinzena) return;
      const fechar = quinzena.status !== "fechada";
      const { error } = await supabase
        .from("fortnights")
        .update(
          fechar
            ? {
                status: "fechada",
                fechado_em: new Date().toISOString(),
                fechado_por: employee?.user_id ?? null,
              }
            : { status: "aberta", fechado_em: null, fechado_por: null },
        )
        .eq("id", quinzena.id);
      if (error) throw new Error(error.message);
      return fechar;
    },
    onSuccess: (fechou) => {
      toast.success(fechou ? "Quinzena fechada." : "Quinzena reaberta.");
      // O status afeta várias telas; atualiza tudo (aceitável numa ferramenta de teste).
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(`Não foi possível alterar a quinzena: ${e.message}`),
  });

  if (!isAdmin || !quinzena) return null;

  const fechada = quinzena.status === "fechada";
  const nome = nomeQuinzena(quinzena);

  function confirmar() {
    const mensagem = fechada
      ? `Reabrir a ${nome}?\n\nAvaliações voltam a poder ser registradas e excluídas, e os colaboradores deixam de ver os próprios resultados.`
      : `Fechar a ${nome}?\n\nNão será mais possível registrar nem excluir avaliações, e os colaboradores passam a ver as próprias avaliações e resultados.`;
    if (confirm(mensagem)) alternar.mutate();
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-warning/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{nome}</p>
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
          Provisório
        </span>
      </div>
      <p className="mt-1 text-xs">
        Status:{" "}
        <span className={fechada ? "text-destructive" : "text-primary"}>
          {fechada ? "Fechada" : "Aberta"}
        </span>
      </p>
      <button
        type="button"
        onClick={confirmar}
        disabled={alternar.isPending}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
      >
        {fechada ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
        {alternar.isPending ? "Alterando..." : fechada ? "Reabrir quinzena" : "Fechar quinzena"}
      </button>
    </div>
  );
}
