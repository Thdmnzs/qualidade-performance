import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  avisosDoPedido,
  datasDoPeriodo,
  hojeIso,
  somarDias,
  ultimoDiaDosPedidos,
} from "@/lib/escala";
import { curta, periodoDoPedido, problemaDoPedido, diasDoPedido } from "@/lib/pedidos-de-ferias";
import type { FeriasDoAno, PedidoDeFerias } from "@/lib/escala-api";

/** Os avisos do período, em texto (o feriado, e os dias com 2 pessoas). */
export function AvisosDoPeriodo({
  datas,
  dados,
  pessoa,
}: {
  datas: string[];
  dados: FeriasDoAno;
  pessoa: string | null;
}) {
  const a = avisosDoPedido(datas, dados, pessoa);
  return (
    <>
      {a.feriados.length > 0 && (
        <p>
          🎉 Inclui {a.feriados.length === 1 ? "um feriado" : `${a.feriados.length} feriados`} (
          {a.feriados.map(curta).join(", ")}).
        </p>
      )}
      {a.cheios.length > 0 && (
        <p className="font-medium text-warning">
          ⚠ Já há 2 pessoas de férias em: {a.cheios.map(curta).join(", ")}.
        </p>
      )}
    </>
  );
}

export function JanelaDePedirFerias({
  aberta,
  aoFechar,
  inicial,
  dados,
  pedidos,
  eu,
  aoEnviar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  inicial: { de: string; ate: string } | null;
  dados: FeriasDoAno;
  pedidos: PedidoDeFerias[];
  eu: string | null;
  aoEnviar: (de: string, ate: string, observacao: string) => Promise<void>;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (aberta) {
      setDe(inicial?.de ?? "");
      setAte(inicial?.ate ?? "");
      setObs("");
    }
  }, [aberta, inicial]);
  const datas = datasDoPeriodo(de, ate);
  const problema =
    de && ate && !datas.length
      ? "A data final precisa ser depois da inicial."
      : problemaDoPedido(datas, dados, pedidos, eu);
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pedir férias</DialogTitle>
          <DialogDescription>
            O pedido vai para a supervisão, que aprova ou recusa. Você acompanha em “Meus pedidos”.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">
            De
            <input
              type="date"
              min={somarDias(hojeIso(), 1)}
              max={ultimoDiaDosPedidos()}
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Até
            <input
              type="date"
              min={de || somarDias(hojeIso(), 1)}
              max={ultimoDiaDosPedidos()}
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
        <label className="block text-sm font-bold">
          Observação (opcional)
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={300}
            placeholder="Ex.: viagem de família já marcada"
            className="mt-1 h-16 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <div className="space-y-1 text-sm">
          {problema ? (
            <p className="font-medium text-destructive">{problema}</p>
          ) : datas.length > 0 ? (
            <>
              <p>
                <b>
                  {datas.length} {datas.length === 1 ? "dia" : "dias"}
                </b>{" "}
                de férias: {periodoDoPedido({ de, ate })}.
              </p>
              <AvisosDoPeriodo datas={datas} dados={dados} pessoa={eu} />
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={!datas.length || !!problema || enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                await aoEnviar(de, ate, obs.trim());
                aoFechar();
              } finally {
                setEnviando(false);
              }
            }}
          >
            {enviando ? "Enviando..." : "Enviar o pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SITUACAO: Record<PedidoDeFerias["situacao"], { texto: string; classe: string }> = {
  aguardando: { texto: "aguardando", classe: "bg-warning/20" },
  aprovado: { texto: "aprovado", classe: "bg-primary/10 text-primary" },
  recusado: { texto: "recusado", classe: "bg-destructive/10 text-destructive" },
  cancelado: { texto: "cancelado", classe: "bg-secondary text-muted-foreground" },
};
const quando = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Fortaleza",
  });

export function MeusPedidos({
  pedidos,
  aoCancelar,
}: {
  pedidos: PedidoDeFerias[];
  aoCancelar: (p: PedidoDeFerias) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-bold">Meus pedidos</p>
      <ul className="mt-2 space-y-2">
        {pedidos.length === 0 && (
          <li className="text-xs text-muted-foreground">Nenhum pedido ainda.</li>
        )}
        {pedidos.map((p) => (
          <li key={p.id} className="rounded-xl border border-border p-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{periodoDoPedido(p)}</b>{" "}
                <span className="text-xs text-muted-foreground">
                  · {diasDoPedido(p)} {diasDoPedido(p) === 1 ? "dia" : "dias"} · pedido em{" "}
                  {quando(p.criado_em)}
                </span>
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SITUACAO[p.situacao].classe}`}
              >
                {SITUACAO[p.situacao].texto}
              </span>
            </div>
            {p.situacao === "recusado" && p.motivo && (
              <p className="mt-1 text-xs">
                <b>Motivo:</b> {p.motivo}
              </p>
            )}
            {p.situacao === "aguardando" && (
              <button
                type="button"
                onClick={() => aoCancelar(p)}
                className="mt-1 text-xs font-bold text-muted-foreground underline"
              >
                Cancelar o pedido
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
