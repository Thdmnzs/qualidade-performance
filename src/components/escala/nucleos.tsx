import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { definirNucleos, lerNucleos, NUCLEOS, type Nucleo } from "@/lib/escala-api";

const NOMES: Record<Nucleo, string> = {
  rede: "Rede",
  cxtech: "CX Tech",
  quali: "Qualidade",
  log: "Logística",
  "F&R": "Fraude e Risco",
  "cob B2B": "Cobrança B2B",
  auto: "Automação",
};

/**
 * Os núcleos (20/10/2026): de qual núcleo cada pessoa faz parte (mais de um por pessoa), no estilo das folgas
 * fixas. A supervisão marca; cada mudança vai para o Histórico. Só registra quem é de qual núcleo.
 */
export function NucleosDoTime({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const qc = useQueryClient();
  const { data: nucleos = {}, isLoading } = useQuery({
    queryKey: ["nucleos-do-time"],
    queryFn: lerNucleos,
  });
  const [salvando, setSalvando] = useState<string | null>(null);
  async function alternar(pessoa: { id: string; nome: string }, n: Nucleo) {
    const atuais = nucleos[pessoa.id] ?? [];
    const novos = atuais.includes(n) ? atuais.filter((x) => x !== n) : [...atuais, n];
    setSalvando(pessoa.id);
    qc.setQueryData(["nucleos-do-time"], { ...nucleos, [pessoa.id]: novos }); // a marca aparece na hora
    try {
      await definirNucleos(pessoa.id, novos);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
      await qc.invalidateQueries({ queryKey: ["nucleos-do-time"] });
    }
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os núcleos...</p>;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="font-bold">Os núcleos</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        De qual núcleo cada pessoa faz parte. Uma pessoa pode estar em mais de um.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="p-2 text-left">A pessoa</th>
              {NUCLEOS.map((n) => (
                <th key={n} className="p-2 text-center">
                  <span className="block font-bold text-foreground">{n}</span>
                  <span className="block text-[10px] font-medium">{NOMES[n]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p, i) => (
              <tr key={p.id} className={`border-t border-border ${i % 2 ? "bg-secondary/60" : ""}`}>
                <td className="p-2 font-bold">{p.nome}</td>
                {NUCLEOS.map((n) => (
                  <td key={n} className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-[#00700A]"
                      checked={(nucleos[p.id] ?? []).includes(n)}
                      disabled={salvando === p.id}
                      onChange={() => alternar(p, n)}
                      aria-label={`${p.nome} no núcleo ${NOMES[n]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
