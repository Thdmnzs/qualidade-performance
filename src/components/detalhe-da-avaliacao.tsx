import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { numeroBR } from "@/lib/format";

const ESTILO_RESPOSTA = {
  sim: { rotulo: "Sim", classe: "bg-primary/15 text-primary" },
  medio: { rotulo: "Médio", classe: "bg-warning/15 text-warning" },
  nao: { rotulo: "Não", classe: "bg-destructive/15 text-destructive" },
} as const;

/**
 * Apontamentos de uma avaliação: os 14 critérios, com resposta, desconto e
 * justificativa, mais comentários e link. Buscado só quando a avaliação é
 * aberta (carregamento sob demanda) e guardado em cache pelo React Query.
 * Usado na área de avaliação e em "Minhas avaliações": o RLS garante que
 * cada um só recebe o que pode ver (o colaborador, só as próprias e só após
 * o fechamento; e nunca quem avaliou, que não está nesta consulta).
 */
export function DetalheDaAvaliacao({ avaliacaoId }: { avaliacaoId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["avaliacao-detalhe", avaliacaoId],
    queryFn: async () => {
      const [itens, extra] = await Promise.all([
        supabase
          .from("evaluation_items")
          .select(
            "resposta, desconto, observacao, evaluation_criteria(ordem, descricao, gravidade)",
          )
          .eq("evaluation_id", avaliacaoId),
        supabase
          .from("evaluations")
          .select("comentarios, link_conversa")
          .eq("id", avaliacaoId)
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
