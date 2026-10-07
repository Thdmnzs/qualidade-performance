import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lerEscalaFn } from "@/lib/escala.functions";
import { dataHoraBR } from "@/lib/format";
import { periodoPadrao, validarPeriodo } from "@/lib/periodo";

type Atalho = "7" | "30" | "90" | "personalizado";
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (min: number) =>
  `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
const ms = (min: number) =>
  `${Math.floor(min)}m ${String(Math.round((min % 1) * 60)).padStart(2, "0")}s`;
const um = (v: number) => v.toFixed(1).replace(".", ",");

/** Aba "Avaliadores" do Histórico: o ritmo medido e as avaliações por hora de quali. Só o ADM. */
export function ProdutividadeAvaliadores() {
  const qc = useQueryClient();
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
  const { data: leitura } = useQuery({
    queryKey: ["ultima-leitura-escala"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leituras_escala")
        .select("lido_em, erro, nomes_nao_reconhecidos")
        .order("lido_em", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const ler = useMutation({
    mutationFn: () => lerEscalaFn(),
    onSuccess: (r) => {
      toast.success(`Escala lida: ${r.abas} aba(s), ${r.gravadas} registro(s) de horas.`);
      qc.invalidateQueries({ queryKey: ["produtividade-avaliadores"] });
      qc.invalidateQueries({ queryKey: ["ultima-leitura-escala"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["ultima-leitura-escala"] });
    },
  });

  const n = (v: unknown) => Number(v ?? 0);
  const tot = linhas.reduce(
    (s, l) => ({
      av: s.av + n(l.avaliacoes),
      ct: s.ct + n(l.contadas),
      min: s.min + n(l.minutos),
      q: s.q + n(l.horas_quali),
    }),
    { av: 0, ct: 0, min: 0, q: 0 },
  );
  const temEscala = linhas.some((l) => l.horas_quali !== null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
        <Button
          variant="outline"
          className="font-bold"
          disabled={ler.isPending}
          onClick={() => ler.mutate()}
        >
          <RefreshCw className={`size-4 ${ler.isPending ? "animate-spin" : ""}`} /> Ler a escala
          agora
        </Button>
      </div>

      <p className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">
        {leitura
          ? leitura.erro
            ? `A última leitura da escala (${dataHoraBR(leitura.lido_em)}) falhou: ${leitura.erro}`
            : `Escala lida em ${dataHoraBR(leitura.lido_em)}, da planilha "escala cx" (as células "quali" de cada avaliadora).${
                leitura.nomes_nao_reconhecidos.length
                  ? ` Nomes não reconhecidos: ${leitura.nomes_nao_reconhecidos.join(", ")}.`
                  : ""
              }`
          : "A escala ainda não foi lida. As colunas da escala aparecem depois da primeira leitura."}
      </p>

      {isLoading ? (
        <p className="text-sm">Carregando...</p>
      ) : linhas.length === 0 ? (
        <EmptyState
          titulo="Sem dados no período"
          texto="Nenhuma avaliação registrada nem hora de quali na escala para este período."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Avaliações no período", String(tot.av)],
              [
                "Ritmo medido (time)",
                tot.min ? `${um(tot.ct / (tot.min / 60))} por hora` : "sem medição",
              ],
              [
                "Por hora de quali (time)",
                temEscala && tot.q ? `${um(tot.av / tot.q)} por hora` : "aguardando a escala",
              ],
              [
                "Aproveitamento das horas de quali",
                temEscala && tot.q
                  ? `${Math.round((tot.min / 60 / tot.q) * 100)}%`
                  : "aguardando a escala",
              ],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-wide">{rotulo}</p>
                <p className="mt-2 font-display text-2xl font-bold">{valor}</p>
              </div>
            ))}
          </div>

          <section className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Avaliador</th>
                  <th className="px-4 py-3">Avaliações</th>
                  <th className="px-4 py-3">Ritmo medido</th>
                  <th className="px-4 py-3">Tempo médio</th>
                  <th className="bg-[#eef4ff] px-4 py-3 dark:bg-[#1b2433]">Horas de quali</th>
                  <th className="bg-[#eef4ff] px-4 py-3 dark:bg-[#1b2433]">Por hora de quali</th>
                  <th className="bg-[#eef4ff] px-4 py-3 dark:bg-[#1b2433]">Aproveitamento</th>
                  <th className="px-4 py-3">Descartes</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const fora = n(l.avaliacoes) - n(l.contadas);
                  const q = l.horas_quali === null ? null : n(l.horas_quali);
                  const aprov = q ? Math.round((n(l.minutos) / 60 / q) * 100) : null;
                  return (
                    <tr key={l.avaliador_user_id} className="border-t border-border">
                      <td className="px-4 py-3 font-bold">{l.nome}</td>
                      <td className="px-4 py-3">
                        {l.avaliacoes}
                        {fora > 0 && <span className="text-xs"> ({fora} fora da conta)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {n(l.contadas) ? (
                          <>
                            <b>{um(n(l.contadas) / (n(l.minutos) / 60))}</b> por hora
                          </>
                        ) : (
                          "sem medição"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {n(l.contadas) ? ms(n(l.minutos) / n(l.contadas)) : "—"}
                      </td>
                      <td className="bg-[#f7faff] px-4 py-3 dark:bg-[#161e2a]">
                        {q === null ? "aguardando a escala" : hm(q * 60)}
                      </td>
                      <td className="bg-[#f7faff] px-4 py-3 dark:bg-[#161e2a]">
                        {q ? (
                          <>
                            <b>{um(n(l.avaliacoes) / q)}</b> por hora
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="bg-[#f7faff] px-4 py-3 dark:bg-[#161e2a]">
                        {aprov === null ? (
                          "—"
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-20 overflow-hidden rounded-full bg-secondary"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full bg-[#2b5fc9]"
                                style={{ width: `${Math.min(100, aprov)}%` }}
                              />
                            </div>
                            <b>{aprov}%</b>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{l.descartes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs">
              <b>Ritmo medido:</b> avaliações por hora de trabalho de avaliação.{" "}
              <b>Por hora de quali:</b> avaliações por hora de quali dada na escala.{" "}
              <b>Aproveitamento:</b> quanto das horas de quali foi gasto avaliando. O tempo de cada
              avaliação vai do momento em que o contato é aberto na ficha (sorteado ou colado) até o
              registro; acima de 60 minutos, ou sem abertura registrada, fica fora da conta.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
