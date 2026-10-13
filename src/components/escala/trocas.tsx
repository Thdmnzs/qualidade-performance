import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  corDoTexto,
  dataCurta,
  dataDoDia,
  DIAS_DA_SEMANA,
  DIAS_POR_EXTENSO,
  HORAS,
  hojeIso,
  periodoDaSemana,
  type DiasDaSemana,
  type Sigla,
} from "@/lib/escala";
import { lerSemana, lerSemanas, lerSiglas } from "@/lib/escala-api";
import {
  aplicarTroca,
  papeisDasSiglas,
  problemaDaTroca,
  resumoDaJornada,
  TIPOS,
  type TipoDeTroca,
} from "@/lib/trocas";
import {
  cancelarTroca,
  decidirTroca,
  lerMinhasTrocas,
  lerTrocasParaAprovar,
  pedirTroca,
  responderTroca,
  type Troca,
} from "@/lib/trocas-api";

const primeiro = (nome: string) => nome.split(" ")[0];
const quando = (inicio: string, dias: number[]) =>
  dias.map((d) => `${DIAS_POR_EXTENSO[d]}, ${dataCurta(dataDoDia(inicio, d))}`).join(" e ");
const SITUACAO: Record<Troca["situacao"], { texto: (t: Troca) => string; classe: string }> = {
  aguardando_colega: {
    texto: (t) => `aguardando ${primeiro(t.para.nome)}`,
    classe: "bg-warning/20",
  },
  aguardando_supervisao: {
    texto: () => "aguardando a supervisão",
    classe: "bg-[#E0ECFF] text-[#1E40AF] dark:bg-[#13234A] dark:text-[#9CC0FF]",
  },
  aprovada: { texto: () => "aprovada", classe: "bg-primary/10 text-primary" },
  recusada_colega: {
    texto: (t) => `recusada por ${primeiro(t.para.nome)}`,
    classe: "bg-destructive/10 text-destructive",
  },
  recusada: {
    texto: () => "recusada pela supervisão",
    classe: "bg-destructive/10 text-destructive",
  },
  cancelada: { texto: () => "cancelada", classe: "bg-secondary text-muted-foreground" },
};
const useSiglas = () => {
  const { data = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  return useMemo(() => new Map(data.map((s) => [s.id, s])), [data]);
};

/** O "Como fica": a grade de antes e depois das duas pessoas, nos dias da troca (a mesma regra do banco). */
export function ComoFica({
  inicio,
  dias,
  troca,
  siglas,
}: {
  inicio: string;
  dias: DiasDaSemana;
  troca: {
    de: { id: string; nome: string };
    para: { id: string; nome: string };
    dias: number[];
    tipo: TipoDeTroca;
  };
  siglas: Map<string, Sigla>;
}) {
  const { dias: depois, avisos } = aplicarTroca(dias, troca, siglas);
  const p = papeisDasSiglas(siglas);
  const faixa = (id: string) => siglas.get(id)?.significado;
  const linhaDe = (ds: DiasDaSemana, d: number, id: string) =>
    ds[d]?.find((l) => l.employee_id === id)?.horas ?? null;
  const Celulas = ({
    horas,
    antes,
  }: {
    horas: (string | null)[] | null;
    antes?: (string | null)[] | null;
  }) => (
    <>
      {HORAS.map((_, k) => {
        const s = horas?.[k] ? siglas.get(horas[k]!) : undefined;
        const mudou = antes !== undefined && (antes?.[k] ?? null) !== (horas?.[k] ?? null);
        return (
          <td key={k} className="px-px">
            <div
              className={`flex h-5 items-center justify-center overflow-hidden whitespace-nowrap rounded text-[9px] font-bold ${s ? "" : "border border-dashed border-border"} ${mudou ? "ring-2 ring-[#2563EB]" : ""}`}
              style={s ? { background: s.cor, color: corDoTexto(s.cor) } : undefined}
            >
              {s?.sigla ?? ""}
            </div>
          </td>
        );
      })}
    </>
  );
  return (
    <div className="space-y-3">
      {avisos.length > 0 && (
        <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs">⚠ {avisos.join(" ")}</p>
      )}
      {troca.dias.map((d) => (
        <div key={d}>
          <p className="text-xs font-bold">
            {DIAS_POR_EXTENSO[d]}, {dataCurta(dataDoDia(inicio, d))}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed border-separate [border-spacing:0_3px]">
              <colgroup>
                <col style={{ width: 70 }} />
                {HORAS.map((h) => (
                  <col key={h} />
                ))}
              </colgroup>
              <tbody>
                <tr>
                  <td />
                  {HORAS.map((h) => (
                    <td key={h} className="text-center text-[9px] text-muted-foreground">
                      {h}h
                    </td>
                  ))}
                </tr>
                <tr>
                  <td colSpan={17} className="text-[10px] font-bold text-muted-foreground">
                    Hoje
                  </td>
                </tr>
                {[troca.de, troca.para].map((x) => (
                  <tr key={`a-${x.id}`}>
                    <td className="truncate pr-1 text-[11px] font-bold">{primeiro(x.nome)}</td>
                    <Celulas horas={linhaDe(dias, d, x.id)} />
                  </tr>
                ))}
                <tr>
                  <td colSpan={17} className="pt-1 text-[10px] font-bold text-[#2563EB]">
                    Depois da troca
                  </td>
                </tr>
                {[troca.de, troca.para].map((x) => (
                  <tr key={`d-${x.id}`}>
                    <td className="truncate pr-1 text-[11px] font-bold">{primeiro(x.nome)}</td>
                    <Celulas horas={linhaDe(depois, d, x.id)} antes={linhaDe(dias, d, x.id)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {[troca.de, troca.para]
              .map(
                (x) =>
                  `${primeiro(x.nome)}: ${resumoDaJornada(linhaDe(dias, d, x.id), p, faixa)} → ${resumoDaJornada(linhaDe(depois, d, x.id), p, faixa)}`,
              )
              .join(" · ")}
          </p>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        O horário (e a pausa) é o que se troca. As atividades de N2 acompanham a pessoa, e as
        reuniões ficam na mesma hora.
      </p>
    </div>
  );
}

function CartaoDaTroca({ t, children }: { t: Troca; children?: React.ReactNode }) {
  const siglas = useSiglas();
  const { data: semana } = useQuery({
    queryKey: ["escala-semana", t.inicio],
    queryFn: () => lerSemana(t.inicio),
  });
  const [aberto, setAberto] = useState(false);
  return (
    <li className="rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p>
            <b>{primeiro(t.de.nome)}</b> ⇄ <b>{primeiro(t.para.nome)}</b> · {TIPOS[t.tipo]} ·{" "}
            {quando(t.inicio, t.dias)}
          </p>
          {t.mensagem && <p className="text-xs text-muted-foreground">“{t.mensagem}”</p>}
          {(t.situacao === "recusada" || t.situacao === "recusada_colega") && t.motivo && (
            <p className="mt-0.5 text-xs">
              <b>Motivo:</b> {t.motivo}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SITUACAO[t.situacao].classe}`}
        >
          {SITUACAO[t.situacao].texto(t)}
        </span>
      </div>
      {semana && ["aguardando_colega", "aguardando_supervisao"].includes(t.situacao) && (
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          className="mt-1 text-xs font-bold text-primary"
          aria-expanded={aberto}
        >
          {aberto ? "Esconder" : "Ver como fica a escala"}
        </button>
      )}
      {aberto && semana && (
        <div className="mt-2">
          <ComoFica inicio={t.inicio} dias={semana.dias} troca={t} siglas={siglas} />
        </div>
      )}
      {children && <div className="mt-2 flex flex-wrap justify-end gap-2">{children}</div>}
    </li>
  );
}

// ---------- O colaborador: a aba "Trocas" ----------
export function TrocasDoTime() {
  const qc = useQueryClient();
  const { data: trocas = [], isLoading } = useQuery({
    queryKey: ["minhas-trocas"],
    queryFn: lerMinhasTrocas,
    refetchInterval: 5 * 60_000,
  });
  const { data: semanas = [] } = useQuery({ queryKey: ["escala-semanas"], queryFn: lerSemanas });
  const [pedindo, setPedindo] = useState(false);
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["minhas-trocas"] }),
      qc.invalidateQueries({ queryKey: ["escala-semana"] }),
    ]);
  async function fazer(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await recarregar();
    }
  }
  // "eu": quem está logado (a semana publicada traz).
  const { data: umaSemana } = useQuery({
    queryKey: ["escala-semana", semanas[0]?.inicio],
    queryFn: () => lerSemana(semanas[0]!.inicio),
    enabled: !!semanas[0],
  });
  const eu = umaSemana?.eu ?? null;
  const paraMim = trocas.filter((t) => t.situacao === "aguardando_colega" && t.para.id === eu);
  const minhas = trocas.filter((t) => !(t.situacao === "aguardando_colega" && t.para.id === eu));
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as trocas...</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Trocas de escala</h2>
          <p className="text-sm text-muted-foreground">
            Combine uma troca com uma colega: ela aceita, e a supervisão aprova. Vale para as
            semanas já publicadas.
          </p>
        </div>
        <Button onClick={() => setPedindo(true)}>+ Pedir uma troca</Button>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">Pedidos para você</p>
        <ul className="mt-3 space-y-2">
          {paraMim.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhum pedido de troca para você.</li>
          )}
          {paraMim.map((t) => (
            <CartaoDaTroca key={t.id} t={t}>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => fazer(() => responderTroca(t.id, false), "Você recusou a troca.")}
              >
                Recusar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  fazer(
                    () => responderTroca(t.id, true),
                    "Você aceitou a troca. Agora ela vai para a supervisão.",
                  )
                }
              >
                Aceitar a troca
              </Button>
            </CartaoDaTroca>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">Minhas trocas</p>
        <ul className="mt-3 space-y-2">
          {minhas.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhuma troca ainda.</li>
          )}
          {minhas.map((t) => (
            <CartaoDaTroca key={t.id} t={t}>
              {t.de.id === eu &&
                ["aguardando_colega", "aguardando_supervisao"].includes(t.situacao) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.confirm("Cancelar o pedido de troca?") &&
                      fazer(() => cancelarTroca(t.id), "Pedido de troca cancelado.")
                    }
                  >
                    Cancelar o pedido
                  </Button>
                )}
            </CartaoDaTroca>
          ))}
        </ul>
      </section>
      <JanelaDePedirTroca
        aberta={pedindo}
        aoFechar={() => setPedindo(false)}
        aoEnviar={recarregar}
      />
    </div>
  );
}

function JanelaDePedirTroca({
  aberta,
  aoFechar,
  aoEnviar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aoEnviar: () => Promise<unknown>;
}) {
  const siglas = useSiglas();
  const hoje = hojeIso();
  const { data: semanas = [] } = useQuery({
    queryKey: ["escala-semanas"],
    queryFn: lerSemanas,
    enabled: aberta,
  });
  const abertas = semanas
    .filter((s) => s.situacao === "publicada" && dataDoDia(s.inicio, 6) >= hoje)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const [inicio, setInicio] = useState<string | null>(null);
  const semanaEscolhida = inicio ?? abertas[0]?.inicio ?? null;
  const { data: semana } = useQuery({
    queryKey: ["escala-semana", semanaEscolhida],
    queryFn: () => lerSemana(semanaEscolhida!),
    enabled: aberta && !!semanaEscolhida,
  });
  const [tipo, setTipo] = useState<TipoDeTroca>("horarios");
  const [com, setCom] = useState("");
  const [d1, setD1] = useState<number | null>(null);
  const [d2, setD2] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const eu = semana?.eu ?? null;
  const colegas = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of semana?.dias ?? [])
      for (const l of d) if (l.employee_id !== eu) m.set(l.employee_id, l.nome);
    return [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [semana, eu]);
  const diasAbertos = semanaEscolhida
    ? [0, 1, 2, 3, 4, 5, 6].filter((d) => dataDoDia(semanaEscolhida, d) >= hoje)
    : [];
  const dia1 = d1 ?? diasAbertos[0] ?? 0;
  const dia2 = d2 ?? diasAbertos.find((d) => d !== dia1) ?? dia1;
  const dias = tipo === "folgas" ? [dia1, dia2] : [dia1];
  const pessoa = colegas.find((c) => c.id === com) ?? null;
  const problema =
    semana && eu && semanaEscolhida
      ? problemaDaTroca(
          semana.dias,
          { de: eu, para: pessoa?.id ?? null, dias, tipo },
          dias.map((d) => dataDoDia(semanaEscolhida, d)),
          hoje,
        )
      : null;
  const fechar = () => {
    setCom("");
    setMensagem("");
    setD1(null);
    setD2(null);
    setTipo("horarios");
    aoFechar();
  };
  async function enviar() {
    if (!semanaEscolhida || !pessoa || problema) return;
    setEnviando(true);
    try {
      await pedirTroca(semanaEscolhida, tipo, dias, pessoa.id, mensagem.trim());
      toast.success(
        `Pedido enviado para ${primeiro(pessoa.nome)}. Quando ela aceitar, ele vai para a supervisão.`,
      );
      await aoEnviar();
      fechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }
  const seletor = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Pedir uma troca</DialogTitle>
          <DialogDescription>A colega precisa aceitar, e a supervisão, aprovar.</DialogDescription>
        </DialogHeader>
        {!abertas.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma semana publicada com dias a partir de hoje.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">
                A semana
                <select
                  aria-label="A semana"
                  className={`mt-1 ${seletor}`}
                  value={semanaEscolhida ?? ""}
                  onChange={(e) => setInicio(e.target.value)}
                >
                  {abertas.map((s) => (
                    <option key={s.inicio} value={s.inicio}>
                      {periodoDaSemana(s.inicio)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Trocar com
                <select
                  aria-label="Trocar com"
                  className={`mt-1 ${seletor}`}
                  value={com}
                  onChange={(e) => setCom(e.target.value)}
                >
                  <option value="">Escolha a pessoa</option>
                  {colegas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(TIPOS) as TipoDeTroca[]).map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-xl border p-2.5 text-sm ${tipo === t ? "border-primary ring-1 ring-primary" : "border-border"}`}
                >
                  <input
                    type="radio"
                    name="tipo-da-troca"
                    className="mr-1 accent-primary"
                    checked={tipo === t}
                    onChange={() => setTipo(t)}
                  />
                  <b>{TIPOS[t]}</b>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold">
                {tipo === "folgas" ? "O primeiro dia" : "O dia"}
                <select
                  aria-label="O dia"
                  className={`mt-1 ${seletor}`}
                  value={dia1}
                  onChange={(e) => setD1(Number(e.target.value))}
                >
                  {diasAbertos.map((d) => (
                    <option key={d} value={d}>
                      {DIAS_DA_SEMANA[d]} {dataCurta(dataDoDia(semanaEscolhida!, d))}
                      {semana?.feriados.includes(dataDoDia(semanaEscolhida!, d))
                        ? " · feriado"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {tipo === "folgas" && (
                <label className="text-sm font-bold">
                  O segundo dia
                  <select
                    aria-label="O segundo dia"
                    className={`mt-1 ${seletor}`}
                    value={dia2}
                    onChange={(e) => setD2(Number(e.target.value))}
                  >
                    {diasAbertos.map((d) => (
                      <option key={d} value={d}>
                        {DIAS_DA_SEMANA[d]} {dataCurta(dataDoDia(semanaEscolhida!, d))}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {problema ? (
              <p className="text-sm font-medium text-destructive">{problema}</p>
            ) : (
              semana &&
              eu &&
              pessoa && (
                <div className="rounded-xl border border-border p-3">
                  <p className="mb-2 text-sm font-bold">Como fica a escala</p>
                  <ComoFica
                    inicio={semanaEscolhida!}
                    dias={semana.dias}
                    troca={{ de: { id: eu, nome: "Você" }, para: pessoa, dias, tipo }}
                    siglas={siglas}
                  />
                </div>
              )
            )}
            <label className="block text-sm font-bold">
              Mensagem para {pessoa ? primeiro(pessoa.nome) : "a colega"} (opcional)
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ex.: tenho médico de manhã"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!pessoa || !!problema || enviando || !abertas.length}>
            {enviando ? "Enviando..." : "Enviar o pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- O ADM: as trocas para aprovar ----------
export function TrocasParaAprovar({
  aoAjustar,
}: {
  aoAjustar: (inicio: string, dia: number) => void;
}) {
  const qc = useQueryClient();
  const { data: trocas = [], isLoading } = useQuery({
    queryKey: ["trocas-para-aprovar"],
    queryFn: lerTrocasParaAprovar,
    refetchInterval: 5 * 60_000,
  });
  const [recusando, setRecusando] = useState<Troca | null>(null);
  const [motivo, setMotivo] = useState("");
  async function decidir(t: Troca, aprovar: boolean, m: string | null, depois?: () => void) {
    try {
      await decidirTroca(t.id, aprovar, m);
      toast.success(
        aprovar
          ? `Troca aprovada: ${primeiro(t.de.nome)} ⇄ ${primeiro(t.para.nome)}. A escala publicada já mudou.`
          : "Troca recusada.",
      );
      depois?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["trocas-para-aprovar"] }),
        qc.invalidateQueries({ queryKey: ["escala-semana"] }),
      ]);
    }
  }
  const aguardando = trocas.filter((t) => t.situacao === "aguardando_supervisao");
  const decididas = trocas.filter((t) => t.situacao !== "aguardando_supervisao");
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as trocas...</p>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Trocas de escala</h2>
        <p className="text-sm text-muted-foreground">
          As trocas já aceitas pelas duas pessoas esperam a sua decisão. Ao aprovar, a escala
          publicada muda na hora. Use “Aprovar e ajustar” para arrumar as atividades de N2 logo em
          seguida.
        </p>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">Para aprovar · {aguardando.length}</p>
        <ul className="mt-3 space-y-2">
          {aguardando.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Nenhuma troca esperando a sua decisão.
            </li>
          )}
          {aguardando.map((t) => (
            <CartaoDaTroca key={t.id} t={t}>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setRecusando(t)}
              >
                Recusar
              </Button>
              <Button variant="outline" size="sm" onClick={() => decidir(t, true, null)}>
                Aprovar
              </Button>
              <Button
                size="sm"
                onClick={() => decidir(t, true, null, () => aoAjustar(t.inicio, t.dias[0]!))}
              >
                Aprovar e ajustar
              </Button>
            </CartaoDaTroca>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">Decididas recentemente</p>
        <ul className="mt-3 space-y-2">
          {decididas.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhuma ainda.</li>
          )}
          {decididas.map((t) => (
            <CartaoDaTroca key={t.id} t={t} />
          ))}
        </ul>
      </section>
      <Dialog
        open={!!recusando}
        onOpenChange={(a) => {
          if (!a) {
            setRecusando(null);
            setMotivo("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Recusar a troca{" "}
              {recusando ? `${primeiro(recusando.de.nome)} ⇄ ${primeiro(recusando.para.nome)}` : ""}
            </DialogTitle>
            <DialogDescription>
              O motivo aparece para as duas pessoas, no QualityHUB.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={3}
            aria-label="O motivo da recusa"
            placeholder="Ex.: a terça já está com pouca gente às 6h"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          {motivo && motivo.trim().length < 10 && (
            <p className="text-xs font-bold text-destructive">
              Escreva o motivo, com pelo menos 10 caracteres.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 10}
              onClick={() =>
                recusando &&
                decidir(recusando, false, motivo.trim(), () => {
                  setRecusando(null);
                  setMotivo("");
                })
              }
            >
              Recusar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
