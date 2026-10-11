import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CalendarioDeFerias, LegendaDasFerias } from "@/components/escala/calendario-de-ferias";
import { Flutuante } from "@/components/escala/comum";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { datasDoPeriodo, hojeIso, MESES_POR_EXTENSO } from "@/lib/escala";
import { definirFeriado, definirFerias, lerFerias } from "@/lib/escala-api";

type Pessoa = { id: string; nome: string };

/** O lançamento das férias e dos feriados (o ADM). Cada mudança vale na hora para o time. */
export function MontarFerias({ pessoas }: { pessoas: Pessoa[] }) {
  const qc = useQueryClient();
  const [ano, setAno] = useState(Number(hojeIso().slice(0, 4)));
  const { data, isLoading, error } = useQuery({
    queryKey: ["escala-ferias", ano],
    queryFn: () => lerFerias(ano),
  });
  const [aberto, setAberto] = useState<{ datas: string[]; ancora: DOMRect } | null>(null);
  const [periodo, setPeriodo] = useState(false);
  const fechar = useCallback(() => setAberto(null), []);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["escala-ferias", ano] });

  async function mudar(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await recarregar();
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as férias...</p>;
  if (error || !data)
    return (
      <p className="text-sm text-destructive">
        {(error as Error)?.message ?? "Não foi possível carregar as férias."}
      </p>
    );

  const textoDasDatas = (datas: string[]) => {
    const [a, b] = [datas[0]!, datas[datas.length - 1]!];
    const mes = MESES_POR_EXTENSO[Number(a.slice(5, 7)) - 1];
    return datas.length === 1
      ? `${Number(a.slice(8))} de ${mes}`
      : `${Number(a.slice(8))} a ${Number(b.slice(8))} de ${mes} · ${datas.length} dias`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Férias {ano}</h2>
          <p className="text-sm text-muted-foreground">
            Clique num dia, ou clique e arraste para baixo para marcar vários de uma vez. Uma
            mudança vale na hora para o time, e fica no histórico.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Ano"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
          >
            {[ano - 1, ano, ano + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button onClick={() => setPeriodo(true)}>+ Marcar um período</Button>
        </div>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <CalendarioDeFerias
          dados={data}
          aoEscolher={(datas, ancora) => setAberto({ datas, ancora })}
          selecionados={aberto?.datas ?? []}
        />
      </section>
      <LegendaDasFerias comMinhas={false} />

      {aberto && (
        <Flutuante ancora={aberto.ancora} aoFechar={fechar}>
          <p className="px-1.5 pb-1.5 text-[11px] font-bold text-muted-foreground">
            {textoDasDatas(aberto.datas)}
          </p>
          {aberto.datas.length === 1 && (
            <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-border px-1.5 py-1.5 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={data.feriados.has(aberto.datas[0]!)}
                onChange={(e) =>
                  mudar(
                    () => definirFeriado(aberto.datas[0]!, e.target.checked),
                    e.target.checked ? "Feriado marcado." : "Feriado tirado.",
                  )
                }
              />
              <b>Feriado</b>
            </label>
          )}
          {pessoas.map((p) => {
            const tem = aberto.datas.filter((d) =>
              data.porDia.get(d)?.some((x) => x.employee_id === p.id),
            ).length;
            const parte = tem > 0 && tem < aberto.datas.length;
            return (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={tem === aberto.datas.length}
                  ref={(el) => {
                    if (el) el.indeterminate = parte;
                  }}
                  onChange={(e) =>
                    mudar(
                      () => definirFerias(p.id, aberto.datas, e.target.checked),
                      `${e.target.checked ? "Férias marcadas" : "Férias tiradas"}: ${p.nome}, ${textoDasDatas(aberto.datas)}.`,
                    )
                  }
                />
                {p.nome}
                {parte && (
                  <span className="text-xs text-muted-foreground">
                    ({tem} de {aberto.datas.length} dias)
                  </span>
                )}
              </label>
            );
          })}
          {(() => {
            const cheios = aberto.datas.filter((d) => (data.porDia.get(d)?.length ?? 0) >= 2);
            return cheios.length ? (
              <p className="px-1.5 pt-1.5 text-xs font-medium text-warning">
                ⚠ Já há 2 pessoas de férias em:{" "}
                {cheios.map((d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`).join(", ")}
              </p>
            ) : null;
          })()}
        </Flutuante>
      )}

      <MarcarPeriodo
        aberto={periodo}
        aoFechar={() => setPeriodo(false)}
        pessoas={pessoas}
        dados={data}
        aoMarcar={(id, nome, datas) =>
          mudar(
            () => definirFerias(id, datas, true),
            `Férias de ${nome} marcadas: ${datas.length} dias.`,
          )
        }
      />
    </div>
  );
}

function MarcarPeriodo({
  aberto,
  aoFechar,
  pessoas,
  dados,
  aoMarcar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  pessoas: Pessoa[];
  dados: Awaited<ReturnType<typeof lerFerias>>;
  aoMarcar: (id: string, nome: string, datas: string[]) => void;
}) {
  const [pessoa, setPessoa] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const datas = datasDoPeriodo(de, ate);
  const feriados = datas.filter((d) => dados.feriados.has(d));
  const cheios = datas.filter((d) => (dados.porDia.get(d)?.length ?? 0) >= 2);
  const escolhida = pessoas.find((p) => p.id === pessoa);
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar um período de férias</DialogTitle>
          <DialogDescription>A pessoa, e o primeiro e o último dia.</DialogDescription>
        </DialogHeader>
        <label className="block text-sm font-bold">
          Pessoa
          <select
            value={pessoa}
            onChange={(e) => setPessoa(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
          >
            <option value="">Escolha</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">
            De
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Até
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
        <div className="text-sm">
          {de && ate && !datas.length && (
            <p className="text-destructive">A data final precisa ser depois da inicial.</p>
          )}
          {datas.length > 0 && (
            <p>
              <b>
                {datas.length} {datas.length === 1 ? "dia" : "dias"}
              </b>{" "}
              de férias.
            </p>
          )}
          {feriados.length > 0 && (
            <p>🎉 Inclui {feriados.length === 1 ? "um feriado" : `${feriados.length} feriados`}.</p>
          )}
          {cheios.length > 0 && (
            <p className="text-warning">
              ⚠ Já há 2 pessoas de férias em{" "}
              {cheios.length === 1 ? "um dos dias" : `${cheios.length} dos dias`}.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={!escolhida || !datas.length}
            onClick={() => {
              aoMarcar(escolhida!.id, escolhida!.nome, datas);
              aoFechar();
            }}
          >
            Marcar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
