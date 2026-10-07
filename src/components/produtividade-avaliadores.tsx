import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { periodoPadrao, validarPeriodo } from "@/lib/periodo";

type Atalho = "7" | "30" | "90" | "personalizado";
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (min: number) =>
  `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
const ms = (min: number) =>
  `${Math.floor(min)}m ${String(Math.round((min % 1) * 60)).padStart(2, "0")}s`;
const um = (v: number) => v.toFixed(1).replace(".", ",");

/** Aba "Avaliadores" do Histórico: o tempo dedicado a cada avaliação. Só o ADM. */
export function ProdutividadeAvaliadores() {
  const [atalho, setAtalho] = useState<Atalho>("30");
  const [pers, setPers] = useState(() => periodoPadrao(new Date()));
  const hoje = new Date();
  const periodo =
    atalho === "personalizado"
      ? pers
      : {
          de: iso(
            new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - Number(atalho) + 1),
          ),
          ate: iso(hoje),
        };
  const erro = atalho === "personalizado" ? validarPeriodo(pers.de, pers.ate) : null;

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["produtividade-avaliadores", periodo.de, periodo.ate],
    enabled: !erro,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("produtividade_avaliadores", {
        _de: periodo.de,
        _ate: periodo.ate,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const n = (v: unknown) => Number(v ?? 0);
  const tot = linhas.reduce(
    (s, l) => ({ av: s.av + n(l.avaliacoes), ct: s.ct + n(l.contadas), min: s.min + n(l.minutos) }),
    { av: 0, ct: 0, min: 0 },
  );
  const ordenadas = [...linhas].sort((a, b) => {
    const r = (l: (typeof linhas)[number]) =>
      n(l.contadas) ? n(l.contadas) / (n(l.minutos) / 60) : -1;
    return r(b) - r(a);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="av-periodo" className="text-xs">
            Período
          </Label>
          <select
            id="av-periodo"
            value={atalho}
            onChange={(e) => setAtalho(e.target.value as Atalho)}
            className="block h-10 rounded-md border border-input bg-background px-3 text-sm font-bold"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        {atalho === "personalizado" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="av-de" className="text-xs">
                De
              </Label>
              <Input
                id="av-de"
                type="date"
                value={pers.de}
                onChange={(e) => setPers((p) => ({ ...p, de: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="av-ate" className="text-xs">
                Até
              </Label>
              <Input
                id="av-ate"
                type="date"
                value={pers.ate}
                onChange={(e) => setPers((p) => ({ ...p, ate: e.target.value }))}
              />
            </div>
            <p className={`self-center text-xs ${erro ? "font-bold text-destructive" : ""}`}>
              {erro ??
                "Para um dia só, escolha a mesma data nos dois campos. Até 92 dias por consulta."}
            </p>
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm">Carregando...</p>
      ) : linhas.length === 0 ? (
        <EmptyState
          titulo="Sem avaliações no período"
          texto="Nenhuma avaliação registrada neste período."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Avaliações no período", String(tot.av)],
              [
                "Avaliações por hora (time)",
                tot.min ? `${um(tot.ct / (tot.min / 60))} por hora` : "sem medição",
              ],
              ["Tempo médio por avaliação", tot.ct ? ms(tot.min / tot.ct) : "sem medição"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wide">{rotulo}</p>
                <p className="mt-2 font-display text-3xl font-bold">{valor}</p>
              </div>
            ))}
          </div>

          <section className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Avaliador</th>
                  <th className="px-4 py-3">Avaliações</th>
                  <th className="px-4 py-3">Tempo dedicado</th>
                  <th className="px-4 py-3">Avaliações por hora</th>
                  <th className="px-4 py-3">Tempo médio</th>
                  <th className="px-4 py-3">Sorteios descartados</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l) => {
                  const fora = n(l.avaliacoes) - n(l.contadas);
                  const porHora = n(l.contadas) ? n(l.contadas) / (n(l.minutos) / 60) : null;
                  return (
                    <tr key={l.avaliador_user_id} className="border-t border-border">
                      <td className="px-4 py-3 font-bold">{l.nome}</td>
                      <td className="px-4 py-3">
                        {l.avaliacoes}
                        {fora > 0 && <span className="text-xs"> ({fora} fora da conta)</span>}
                      </td>
                      <td className="px-4 py-3">{hm(n(l.minutos))}</td>
                      <td className="px-4 py-3">
                        {porHora === null ? (
                          "sem medição"
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-24 overflow-hidden rounded-full bg-secondary"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.min(100, (porHora / 12) * 100)}%` }}
                              />
                            </div>
                            <b>{um(porHora)}</b>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {n(l.contadas) ? ms(n(l.minutos) / n(l.contadas)) : "—"}
                      </td>
                      <td className="px-4 py-3">{l.descartes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs">
              O tempo de cada avaliação vai do momento em que o contato é aberto na ficha (sorteado
              ou colado) até o registro. Tempos acima de 60 minutos ficam fora da conta, porque
              provavelmente não refletem o trabalho real (por exemplo, um contato aberto num dia e
              registrado no outro). Avaliações registradas antes desta medição começar também ficam
              fora.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
