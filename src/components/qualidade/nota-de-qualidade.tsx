import { useQuery } from "@tanstack/react-query";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { supabase } from "@/integrations/supabase/client";
import { nomeQuinzena, numeroBR } from "@/lib/format";
import { nivelQualidade, QUALIDADE_MINIMA } from "@/lib/indicadores";
import { publicada } from "@/lib/quinzena";

type Quinzena = { id: string; ano: number; mes: number; tipo: string; status: string };
type Nota = { minha_nota: number | null; minhas_avaliacoes: number | null } | null;

type Elegibilidade = { oficial: boolean; elegivel: boolean | null; motivos: string[] } | null;
const lerElegibilidade = async (id: string): Promise<Elegibilidade> => {
  const { data, error } = await supabase.rpc("meu_resultado_da_quinzena", { _fortnight_id: id });
  if (error) throw error;
  return (data ?? null) as unknown as Elegibilidade;
};
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
  const { data: eleg = null } = useQuery({
    queryKey: ["meu-resultado", ultima?.id, employeeId],
    enabled: !!ultima && !!employeeId,
    queryFn: () => lerElegibilidade(ultima!.id),
  });
  if (!ultima) return null;
  const valor = nota?.minha_nota == null ? null : Number(nota.minha_nota);
  const ok = valor == null ? null : valor >= QUALIDADE_MINIMA;
  const qtd = nota?.minhas_avaliacoes ?? 0;
  return (
    <section className="mb-5 grid gap-3 md:grid-cols-2" aria-label="A nota de qualidade">
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
      {eleg && eleg.elegivel != null && (
        <div
          className={`rounded-2xl border p-4 ${eleg.elegivel ? "border-[#B4DEC3] bg-[#E7F5EC] dark:border-[#2B6B44] dark:bg-[#12301F]" : "border-[#F4B4AE] bg-[#FDE4E2] dark:border-[#6B2D28] dark:bg-[#3A1C1A]"}`}
          aria-label="A elegibilidade"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Para o bônus</span>
            <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-bold">
              {eleg.oficial ? "oficial" : "prévia · em contestação"}
            </span>
          </div>
          <p
            className={`mt-2 text-xl font-bold ${eleg.elegivel ? "text-[#157A3A] dark:text-[#3EE07A]" : "text-[#C62828] dark:text-[#FF8A80]"}`}
          >
            {eleg.elegivel ? "✓ Elegível" : "⚠ Não elegível"}
          </p>
          {eleg.motivos.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {eleg.motivos.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {nomeQuinzena(ultima)}.{" "}
            {eleg.oficial
              ? "O resultado oficial, do fechamento."
              : "Uma contestação aceita pode mudar a nota; o resultado oficial sai no fechamento."}
          </p>
        </div>
      )}
      {emAndamento && (
        <p className="text-xs text-muted-foreground md:col-span-2">
          A nota da quinzena em andamento ({nomeQuinzena(emAndamento)}) aparece na publicação,
          quando você também pode contestar uma avaliação.
        </p>
      )}
    </section>
  );
}
