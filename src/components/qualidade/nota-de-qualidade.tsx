import { useQuery } from "@tanstack/react-query";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { supabase } from "@/integrations/supabase/client";
import { nomeQuinzena, numeroBR } from "@/lib/format";
import { nivelQualidade, QUALIDADE_MINIMA } from "@/lib/indicadores";
import { publicada } from "@/lib/quinzena";

type Quinzena = { id: string; ano: number; mes: number; tipo: string; status: string };
type Nota = { minha_nota: number | null; minhas_avaliacoes: number | null } | null;

const lerNota = async (id: string): Promise<Nota> => {
  const { data, error } = await supabase.rpc("qualidade_da_quinzena", { _fortnight_id: id });
  if (error) throw error;
  return (data?.[0] ?? null) as Nota;
};

/**
 * A nota de qualidade (20/10/2026; antes na aba Qualidade dos indicadores), nas Minhas avaliações: a da
 * última quinzena PUBLICADA (a nota só existe a partir da publicação), com a anterior para comparar.
 */
export function NotaDeQualidade({
  quinzenas,
  employeeId,
}: {
  quinzenas: Quinzena[];
  employeeId: string | undefined;
}) {
  const publicadas = quinzenas.filter(publicada);
  const [ultima, anterior] = publicadas;
  const emAndamento = quinzenas.find((q) => q.status === "aberta");
  const { data: nota } = useQuery({
    queryKey: ["qualidade", ultima?.id, employeeId],
    enabled: !!ultima && !!employeeId,
    queryFn: () => lerNota(ultima!.id),
  });
  const { data: notaAnt } = useQuery({
    queryKey: ["qualidade", anterior?.id, employeeId],
    enabled: !!anterior && !!employeeId,
    queryFn: () => lerNota(anterior!.id),
  });
  if (!ultima) return null;
  const valor = nota?.minha_nota == null ? null : Number(nota.minha_nota);
  const ok = valor == null ? null : valor >= QUALIDADE_MINIMA;
  const qtd = nota?.minhas_avaliacoes ?? 0;
  return (
    <section
      className="mb-5 grid gap-3 md:grid-cols-[minmax(0,360px)_1fr]"
      aria-label="A nota de qualidade"
    >
      <CartaoIndicador
        rotulo="Qualidade"
        etiqueta="individual"
        valor={valor == null ? null : numeroBR(valor)}
        semValor="sem avaliações nesta quinzena"
        anterior={notaAnt?.minha_nota == null ? "—" : numeroBR(Number(notaAnt.minha_nota))}
        situacao={ok === null ? "aguardando" : ok ? "ok" : "fora"}
        textoDaSituacao={ok === null ? "sem nota" : ok ? "dentro da meta" : "abaixo da meta"}
        meta={`mínimo ${QUALIDADE_MINIMA} (nível 4G)`}
        descricao="A nota das suas avaliações de qualidade, pela ficha de atendimento. Ela sai na publicação da quinzena."
        legenda={`${nomeQuinzena(ultima)}${valor == null ? "" : ` · nível ${nivelQualidade(valor)} · ${qtd} ${qtd === 1 ? "avaliação" : "avaliações"}`}`}
      />
      {emAndamento && (
        <p className="self-end text-xs text-muted-foreground">
          A nota da quinzena em andamento ({nomeQuinzena(emAndamento)}) aparece na publicação,
          quando você também pode contestar uma avaliação.
        </p>
      )}
    </section>
  );
}
