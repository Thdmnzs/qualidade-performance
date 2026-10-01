import { ArrowRight } from "lucide-react";

import { lerAlteracoes, ROTULO_RESPOSTA, type Resposta } from "@/lib/avaliacao";
import { numeroBR } from "@/lib/format";

const COR: Record<Resposta, string> = {
  sim: "bg-primary/15 text-primary",
  medio: "bg-warning/15 text-warning",
  nao: "bg-destructive/15 text-destructive",
};

function Selo({ resposta }: { resposta: Resposta }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR[resposta]}`}>
      {ROTULO_RESPOSTA[resposta]}
    </span>
  );
}

/**
 * Antes e depois de uma contestação aceita: a nota e cada critério alterado.
 * Os dados vêm de contestations.alteracoes, gravado pelo banco no momento do
 * ajuste. Não traz quem ajustou (oculto do colaborador).
 */
export function AntesDepoisDaContestacao({
  notaAnterior,
  notaNova,
  alteracoes,
}: {
  notaAnterior: number | null;
  notaNova: number | null;
  alteracoes: unknown;
}) {
  const itens = lerAlteracoes(alteracoes);
  if (notaAnterior === null || notaNova === null) return null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-background/40 p-4">
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Nota:</span>
        <span className="font-display text-muted-foreground line-through">
          {numeroBR(Number(notaAnterior))}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span className="font-display font-semibold text-primary">
          {numeroBR(Number(notaNova))}
        </span>
      </p>
      {itens.length > 0 && (
        <ol className="space-y-3">
          {itens.map((a) => (
            <li key={a.ordem} className="text-sm">
              <p className="font-medium">
                {a.ordem}. {a.descricao}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Antes</span>
                <Selo resposta={a.antes.resposta} />
                {Number(a.antes.desconto) > 0 && (
                  <span className="text-destructive">−{numeroBR(Number(a.antes.desconto))}</span>
                )}
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Depois</span>
                <Selo resposta={a.depois.resposta} />
                {Number(a.depois.desconto) > 0 && (
                  <span className="text-destructive">−{numeroBR(Number(a.depois.desconto))}</span>
                )}
              </div>
              {a.antes.observacao && (
                <p className="mt-1 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium">Apontamento anterior:</span> {a.antes.observacao}
                </p>
              )}
              {a.depois.observacao && (
                <p className="mt-1 rounded-lg bg-secondary px-3 py-2 text-xs">
                  <span className="font-medium">Apontamento atual:</span> {a.depois.observacao}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
