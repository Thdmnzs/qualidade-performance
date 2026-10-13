import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DIAS_DA_SEMANA } from "@/lib/escala";
import { definirFolgaFixa, lerFolgasFixas, type PessoaDoTime } from "@/lib/trocas-api";

/**
 * As folgas fixas do time (o ADM): os dias da semana em que cada pessoa folga. O pedido de troca
 * usa essas folgas nas semanas que ainda não foram publicadas. Cada mudança é salva na hora.
 */
export function FolgasFixas() {
  const qc = useQueryClient();
  const { data: time = [], isLoading } = useQuery({
    queryKey: ["folgas-fixas"],
    queryFn: lerFolgasFixas,
  });
  const [salvando, setSalvando] = useState<string | null>(null);
  async function alternar(p: PessoaDoTime, d: number) {
    const novos = p.dias.includes(d)
      ? p.dias.filter((x) => x !== d)
      : [...p.dias, d].sort((a, b) => a - b);
    if (novos.length > 4) {
      toast.error("São no máximo quatro folgas fixas por semana.");
      return;
    }
    setSalvando(p.employee_id);
    // Mostra a mudança na hora; se o banco recusar, a lista volta ao que estava.
    qc.setQueryData<PessoaDoTime[]>(["folgas-fixas"], (atual) =>
      atual?.map((x) => (x.employee_id === p.employee_id ? { ...x, dias: novos } : x)),
    );
    try {
      await definirFolgaFixa(p.employee_id, novos);
      toast.success(
        `${p.nome.split(" ")[0]}: ${novos.length ? `folga ${novos.map((x) => DIAS_DA_SEMANA[x]!.toLowerCase()).join(" e ")}` : "sem folga fixa"}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
      await qc.invalidateQueries({ queryKey: ["folgas-fixas"] });
    }
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as folgas...</p>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Folgas fixas</h2>
        <p className="text-sm text-muted-foreground">
          Os dias em que cada pessoa folga, toda semana. O pedido de troca usa essas folgas nas
          semanas que ainda não foram publicadas. Clique num dia para ligar ou desligar: a mudança é
          salva na hora.
        </p>
      </div>
      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2">Pessoa</th>
              {DIAS_DA_SEMANA.map((d) => (
                <th key={d} className="pb-2 text-center">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {time.map((p) => (
              <tr key={p.employee_id} className="border-t border-border">
                <td className="py-2 pr-2">
                  <b>{p.nome}</b>
                  {p.supervisao && (
                    <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold">
                      supervisão · fora das trocas
                    </span>
                  )}
                </td>
                {DIAS_DA_SEMANA.map((d, i) => {
                  const folga = p.dias.includes(i);
                  return (
                    <td key={d} className="py-2 text-center">
                      <button
                        type="button"
                        disabled={salvando === p.employee_id}
                        aria-pressed={folga}
                        aria-label={`${p.nome}, ${d}: ${folga ? "folga" : "trabalha"}`}
                        onClick={() => alternar(p, i)}
                        className={`h-8 w-11 rounded-lg border text-[11px] font-bold disabled:opacity-50 ${folga ? "border-[#FF9900] bg-[#FF9900] text-[#0D0F0D]" : "border-border text-muted-foreground hover:border-primary"}`}
                      >
                        {folga ? "folga" : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
