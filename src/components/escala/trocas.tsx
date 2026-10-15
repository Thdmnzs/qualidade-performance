import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { avisarTrocaFn } from "@/lib/avisos-trocas.functions";
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
  segundaDaSemana,
  somarDias,
  type DiasDaSemana,
  type Sigla,
} from "@/lib/escala";
import { lerFerias, lerSemana, lerSemanas, lerSiglas } from "@/lib/escala-api";
import {
  aplicarTroca,
  comoFicamAsFolgas,
  diaServe,
  diasDaTroca,
  estadoNoDia,
  feriadosComigo,
  papeisDasSiglas,
  resumoDaJornada,
  segundosDias,
  TIPOS,
  type ContextoDasTrocas,
  type ModoDaFolga,
  type TipoDeTroca,
} from "@/lib/trocas";
import {
  cancelarTroca,
  decidirTroca,
  lerFolgasFixas,
  lerMinhasTrocas,
  lerTrocasParaAprovar,
  pedirTrocaNoDia,
  responderTroca,
  type Troca,
} from "@/lib/trocas-api";

const primeiro = (nome: string) => nome.split(" ")[0];
/**
 * Avisa a Central de Turnos (o Slack) logo depois da ação, sem esperar a resposta: se o
 * Slack demorar ou falhar, a troca não fica presa, e a tarefa da manhã tenta de novo.
 */
const avisarCentralDeTurnos = (trocaId: string) =>
  void avisarTrocaFn({ data: { trocaId } }).catch(() => {});
// As datas de uma troca, em ordem e sem repetir (a de "os dois dias" tem quatro, em pares).
const quando = (inicio: string, dias: number[]) =>
  [...new Set(dias)]
    .sort((a, b) => a - b)
    .map((d) => `${DIAS_POR_EXTENSO[d]}, ${dataCurta(dataDoDia(inicio, d))}`)
    .join(" e ");
const SITUACAO: Record<Troca["situacao"], { texto: (t: Troca) => string; classe: string }> = {
  aguardando_colega: {
    texto: (t) => `aguardando ${primeiro(t.para.nome)}`,
    classe: "bg-warning/20",
  },
  aguardando_supervisao: {
    texto: () => "aguardando a supervisão",
    classe: "bg-[#E0ECFF] text-[#1E40AF] dark:bg-[#13234A] dark:text-[#9CC0FF]",
  },
  aprovada: {
    texto: (t) => (t.aplicada ? "aprovada" : "aprovada · entra ao montar a semana"),
    classe: "bg-primary/10 text-primary",
  },
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
        // O contorno marca só as horas COM atividade que mudaram (as que ficaram vazias, não).
        const mudou = antes !== undefined && !!s && (antes?.[k] ?? null) !== (horas?.[k] ?? null);
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
                    {linhaDe(dias, d, x.id) ? (
                      <Celulas horas={linhaDe(dias, d, x.id)} />
                    ) : (
                      <td
                        colSpan={HORAS.length}
                        className="px-1 text-[11px] italic text-muted-foreground"
                      >
                        fora da escala neste dia
                      </td>
                    )}
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
                    {linhaDe(depois, d, x.id) ? (
                      <Celulas horas={linhaDe(depois, d, x.id)} antes={linhaDe(dias, d, x.id)} />
                    ) : (
                      <td
                        colSpan={HORAS.length}
                        className="px-1 text-[11px] italic text-muted-foreground"
                      >
                        sai da escala neste dia
                      </td>
                    )}
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
      {semana?.situacao === "publicada" &&
        ["aguardando_colega", "aguardando_supervisao"].includes(t.situacao) && (
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
                  fazer(async () => {
                    await responderTroca(t.id, true);
                    avisarCentralDeTurnos(t.id);
                  }, "Você aceitou a troca. Agora ela vai para a supervisão.")
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
                      fazer(async () => {
                        await cancelarTroca(t.id);
                        avisarCentralDeTurnos(t.id);
                      }, "Pedido de troca cancelado.")
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
  const ano = Number(hoje.slice(0, 4));
  // O que o formulário lê: o time (com as folgas fixas), os feriados (e quem sou eu), e as semanas publicadas.
  const { data: time = [] } = useQuery({
    queryKey: ["folgas-fixas"],
    queryFn: lerFolgasFixas,
    enabled: aberta,
  });
  const { data: feriasDoAno } = useQuery({
    queryKey: ["escala-ferias", ano],
    queryFn: () => lerFerias(ano),
    enabled: aberta,
  });
  const { data: feriasDoProximo } = useQuery({
    queryKey: ["escala-ferias", ano + 1],
    queryFn: () => lerFerias(ano + 1),
    enabled: aberta,
  });
  const { data: semanas = [] } = useQuery({
    queryKey: ["escala-semanas"],
    queryFn: lerSemanas,
    enabled: aberta,
  });
  const limite = somarDias(hoje, 92);
  const publicadasNoPeriodo = semanas.filter(
    (x) => x.situacao === "publicada" && dataDoDia(x.inicio, 6) >= hoje && x.inicio <= limite,
  );
  const lidas = useQueries({
    queries: publicadasNoPeriodo.map((x) => ({
      queryKey: ["escala-semana", x.inicio],
      queryFn: () => lerSemana(x.inicio),
      enabled: aberta,
    })),
  });
  const eu = feriasDoAno?.eu ?? null;
  const ctx: ContextoDasTrocas = useMemo(
    () => ({
      hoje,
      folgas: new Map(time.map((p) => [p.employee_id, p.dias])),
      publicadas: new Map(
        lidas.flatMap((r) => (r.data ? [[r.data.inicio, r.data.dias] as const] : [])),
      ),
      feriados: new Set([...(feriasDoAno?.feriados ?? []), ...(feriasDoProximo?.feriados ?? [])]),
      siglas,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoje, time, siglas, feriasDoAno, feriasDoProximo, lidas.map((r) => r.dataUpdatedAt).join(",")],
  );
  const colegas = time.filter((p) => p.employee_id !== eu && !p.supervisao);
  const minhasFolgas = time.find((p) => p.employee_id === eu)?.dias ?? [];

  // As respostas (escolher só marca; quem avança é o Continuar).
  const [passo, setPasso] = useState(1);
  const [com, setCom] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoDeTroca | null>(null);
  const [modo, setModo] = useState<ModoDaFolga>("um");
  const [dia, setDia] = useState<string | null>(null);
  const [dia2, setDia2] = useState<string | null>(null);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pessoa = colegas.find((c) => c.employee_id === com) ?? null;
  const comFeriado =
    !!eu && !!com && feriadosComigo(ctx, eu).some((s) => estadoNoDia(ctx, com, s) === "fora");
  const completo = !!(com && tipo && dia && (tipo !== "folgas" || modo === "dois" || dia2));
  const podeIr = (n: number) =>
    n === 1 || (n === 2 && !!com) || (n === 3 && !!com && !!tipo) || (n === 4 && completo);
  const escolhendo2 = tipo === "folgas" && modo === "um" && !!dia;
  const fechar = () => {
    setPasso(1);
    setCom(null);
    setTipo(null);
    setModo("um");
    setDia(null);
    setDia2(null);
    setMensagem("");
    setMes(hoje.slice(0, 7));
    aoFechar();
  };
  const curta = (iso: string) =>
    `${DIAS_DA_SEMANA[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7]!.toLowerCase()} ${dataCurta(iso)}`;
  const resumo = (n: number) =>
    n === 1
      ? (pessoa?.nome.split(" ")[0] ?? "—")
      : n === 2
        ? tipo
          ? tipo === "folgas"
            ? `As folgas · ${modo === "um" ? "um dia" : "os dois dias"}`
            : TIPOS[tipo]
          : "—"
        : n === 3
          ? !dia
            ? "—"
            : tipo === "folgas" && modo === "dois"
              ? `a semana de ${dataCurta(segundaDaSemana(dia))}`
              : `${curta(dia)}${dia2 ? ` e ${curta(dia2)}` : ""}`
          : completo
            ? "pronto"
            : "—";
  async function enviar() {
    if (!completo || !com || !tipo || !dia) return;
    setEnviando(true);
    try {
      await pedirTrocaNoDia(
        dia,
        tipo,
        com,
        tipo === "folgas" ? modo : null,
        tipo === "folgas" && modo === "um" ? dia2 : null,
        mensagem.trim(),
      );
      toast.success(
        `Pedido enviado para ${pessoa?.nome.split(" ")[0]}. Quando ela aceitar, ele vai para a supervisão.`,
      );
      await aoEnviar();
      fechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }
  // O calendário do mês, com os dias que servem
  const [anoDoMes, numMes] = mes.split("-").map(Number) as [number, number];
  const primeiroDoMes = `${mes}-01`;
  const diasNoMes = new Date(Date.UTC(anoDoMes, numMes, 0)).getUTCDate();
  const vazios = (new Date(`${primeiroDoMes}T12:00:00Z`).getUTCDay() + 6) % 7;
  const segundos = eu && com && dia && escolhendo2 ? segundosDias(ctx, eu, com, dia) : [];
  const mudarMes = (n: number) => {
    const d = new Date(Date.UTC(anoDoMes, numMes - 1 + n, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const PASSOS = ["Com quem", "A troca", "O dia", "Revisão"];
  const opcao = (on: boolean) =>
    `flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm ${on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary"}`;
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && fechar()}>
      {/* A janela é uma GRADE: sem o min-w-0 nos itens, o conteúdo a empurraria para os lados. */}
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Pedir uma troca</DialogTitle>
          <DialogDescription>A colega aceita, e a supervisão aprova.</DialogDescription>
        </DialogHeader>
        <nav className="flex gap-1.5" aria-label="Os passos">
          {PASSOS.map((t, i) => (
            <button
              key={t}
              type="button"
              disabled={!podeIr(i + 1)}
              aria-current={passo === i + 1 ? "step" : undefined}
              onClick={() => setPasso(i + 1)}
              className={`min-w-0 flex-1 rounded-xl border px-2.5 py-1.5 text-left disabled:opacity-40 ${passo === i + 1 ? "border-primary ring-1 ring-primary" : i + 1 < passo ? "border-border bg-primary/10" : "border-border"}`}
            >
              <span className="block text-[11px] font-bold text-muted-foreground">
                {i + 1}. {t}
              </span>
              <span className="block truncate text-xs font-bold">{resumo(i + 1)}</span>
            </button>
          ))}
        </nav>

        {passo === 1 && (
          <div>
            <p className="font-bold">Com quem você quer trocar?</p>
            <p className="text-xs text-muted-foreground">
              {minhasFolgas.length
                ? `Você folga: ${minhasFolgas.map((d) => DIAS_DA_SEMANA[d]!.toLowerCase()).join(" e ")}. `
                : ""}
              A supervisão não entra nas trocas.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {colegas.map((c) => (
                <button
                  key={c.employee_id}
                  type="button"
                  className={opcao(c.employee_id === com)}
                  onClick={() => {
                    if (c.employee_id !== com) {
                      setCom(c.employee_id);
                      setDia(null);
                      setDia2(null);
                      if (tipo === "feriado") setTipo(null);
                    }
                  }}
                >
                  <b className="truncate">{c.nome}</b>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">
                    {c.dias.length
                      ? `folga ${c.dias.map((d) => DIAS_DA_SEMANA[d]!.toLowerCase()).join(" e ")}`
                      : "sem folga fixa"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {passo === 2 && pessoa && (
          <div>
            <p className="font-bold">Que troca você quer fazer com {pessoa.nome.split(" ")[0]}?</p>
            <div className="mt-3 space-y-2">
              {(
                [
                  [
                    "horarios",
                    "Você fica com o horário dela, e ela com o seu, num dia em que as duas trabalham.",
                  ],
                  ["folgas", "Você folga num dia dela, e ela num dia seu."],
                  ...(comFeriado
                    ? ([
                        [
                          "feriado",
                          "Num feriado em que você está escalado, ela entra no seu lugar.",
                        ],
                      ] as const)
                    : []),
                ] as [TipoDeTroca, string][]
              ).map(([t, d]) => (
                <button
                  key={t}
                  type="button"
                  className={opcao(tipo === t)}
                  onClick={() => {
                    if (tipo !== t) {
                      setTipo(t);
                      setDia(null);
                      setDia2(null);
                    }
                  }}
                >
                  <span>
                    <b>{TIPOS[t]}</b>
                    <span className="block text-xs text-muted-foreground">{d}</span>
                  </span>
                  {tipo === t && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
            {tipo === "folgas" && (
              <div className="mt-3">
                <p className="text-sm font-bold">Quantos dias de folga?</p>
                <div className="mt-1.5 inline-flex rounded-lg border border-border p-0.5 text-sm font-bold">
                  {(["um", "dois"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={modo === m}
                      onClick={() => {
                        if (modo !== m) {
                          setModo(m);
                          setDia(null);
                          setDia2(null);
                        }
                      }}
                      className={`rounded-md px-3 py-1.5 ${modo === m ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {m === "um" ? "Um dia de folga" : "Os dois dias"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {modo === "um"
                    ? "Você troca uma das suas folgas por uma das dela, na mesma semana."
                    : "Você troca as suas folgas da semana pelas dela (um dia que as duas já folgam continua igual)."}
                </p>
              </div>
            )}
            {!comFeriado && (
              <p className="mt-3 text-xs text-muted-foreground">
                A troca de feriado aparece quando a escala de um feriado for publicada, com você
                escalado e ela fora.
              </p>
            )}
          </div>
        )}

        {passo === 3 && eu && com && tipo && (
          <div>
            <p className="font-bold">
              {tipo === "horarios"
                ? "Em que dia vocês trocam os horários?"
                : tipo === "feriado"
                  ? "Em que feriado?"
                  : modo === "dois"
                    ? "Em que semana?"
                    : escolhendo2
                      ? estadoNoDia(ctx, eu, dia!) === "folga"
                        ? `E em que dia você folga no lugar de ${pessoa?.nome.split(" ")[0]}?`
                        : `E em que dia ${pessoa?.nome.split(" ")[0]} folga no seu lugar?`
                      : "Qual folga vocês trocam?"}
            </p>
            <p className="text-xs text-muted-foreground">
              {tipo === "horarios"
                ? "Os destacados são os dias em que as duas trabalham."
                : tipo === "feriado"
                  ? "Os destacados são os feriados publicados em que você está escalado e ela, não."
                  : modo === "dois"
                    ? "Clique em qualquer dia de uma semana destacada."
                    : escolhendo2
                      ? "Os destacados em azul são os dias da mesma semana em que a troca volta."
                      : "Os destacados são os dias em que uma de vocês folga e a outra trabalha."}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                aria-label="O mês anterior"
                disabled={mes <= hoje.slice(0, 7)}
                onClick={() => mudarMes(-1)}
              >
                ‹
              </Button>
              <p className="text-sm font-bold capitalize">
                {new Date(`${primeiroDoMes}T12:00:00Z`).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                aria-label="O próximo mês"
                disabled={`${mes}-01` > limite.slice(0, 7) + "-00"}
                onClick={() => mudarMes(1)}
              >
                ›
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
              {DIAS_DA_SEMANA.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: vazios }, (_, i) => (
                <span key={`v${i}`} />
              ))}
              {Array.from({ length: diasNoMes }, (_, i) => {
                const s = `${mes}-${String(i + 1).padStart(2, "0")}`;
                const naSemana =
                  tipo === "folgas" &&
                  modo === "dois" &&
                  !!dia &&
                  segundaDaSemana(s) === segundaDaSemana(dia);
                const ok =
                  s <= limite &&
                  (escolhendo2
                    ? segundos.includes(s) || s === dia
                    : diaServe(ctx, eu, com, tipo, modo, s));
                const publicada = ctx.publicadas.has(segundaDaSemana(s));
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!ok && !naSemana}
                    aria-label={`${curta(s)}${ctx.feriados.has(s) ? " (feriado)" : ""}`}
                    aria-pressed={s === dia || s === dia2}
                    onClick={() => {
                      if (escolhendo2) {
                        if (s !== dia) setDia2(s);
                      } else {
                        setDia(s);
                        const seg =
                          tipo === "folgas" && modo === "um" ? segundosDias(ctx, eu, com, s) : [];
                        setDia2(seg.length === 1 ? seg[0]! : null);
                      }
                    }}
                    className={`relative h-11 rounded-lg border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-25 ${
                      s === dia
                        ? "border-primary bg-primary text-primary-foreground"
                        : s === dia2
                          ? "border-[#2563EB] bg-[#2563EB] text-white"
                          : escolhendo2 && segundos.includes(s)
                            ? "border-border shadow-[inset_0_0_0_2px_#2563EB]"
                            : naSemana
                              ? "border-border bg-primary/10"
                              : ok
                                ? "border-border shadow-[inset_0_0_0_2px_#13A403]"
                                : "border-border"
                    }`}
                  >
                    {i + 1}
                    {ctx.feriados.has(s) && (
                      <span className="absolute right-0.5 top-0 text-[9px]">🎉</span>
                    )}
                    <span
                      className={`absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full ${publicada ? "bg-[#13A403]" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>
                <span className="inline-block size-3 rounded shadow-[inset_0_0_0_2px_#13A403]" />{" "}
                serve para a troca
              </span>
              <span>
                <span className="inline-block size-2 rounded-full bg-[#13A403]" /> escala publicada
              </span>
            </div>
            {escolhendo2 && (
              <button
                type="button"
                className="mt-2 text-xs font-bold text-primary underline"
                onClick={() => {
                  setDia(null);
                  setDia2(null);
                }}
              >
                ↺ escolher outra folga
              </button>
            )}
          </div>
        )}

        {passo === 4 && eu && com && tipo && dia && pessoa && (
          <div className="space-y-3">
            <p className="font-bold">Confira e envie</p>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Com <b className="text-foreground">{pessoa.nome}</b> · {resumo(2)} · {resumo(3)}
              </p>
              <div className="mt-2 text-sm">
                {tipo === "folgas" ? (
                  (() => {
                    const r = comoFicamAsFolgas(ctx, eu, com, modo, dia, dia2);
                    const lista = (xs: string[]) => xs.map(curta).join(" e ") || "nenhuma";
                    return (
                      <>
                        <p className="font-bold">Como ficam as folgas da semana</p>
                        <p>
                          <b>Você:</b> {lista(r.antesMinhas)} → <b>{lista(r.depoisMinhas)}</b>
                        </p>
                        <p>
                          <b>{pessoa.nome.split(" ")[0]}:</b> {lista(r.antesDelas)} →{" "}
                          <b>{lista(r.depoisDelas)}</b>
                        </p>
                      </>
                    );
                  })()
                ) : tipo === "horarios" ? (
                  <p>
                    <b>Trocar os horários</b> de {curta(dia)}: você fica com o horário de{" "}
                    {pessoa.nome.split(" ")[0]}, e ela com o seu. As atividades de N2 acompanham
                    cada uma.
                  </p>
                ) : (
                  <p>
                    <b>Sair da escala</b> no feriado de {curta(dia)}: {pessoa.nome.split(" ")[0]}{" "}
                    entra no seu lugar, com o seu horário.
                  </p>
                )}
              </div>
              {ctx.publicadas.has(segundaDaSemana(dia)) ? (
                <div className="mt-3">
                  <ComoFica
                    inicio={segundaDaSemana(dia)}
                    dias={ctx.publicadas.get(segundaDaSemana(dia))!}
                    troca={{
                      de: { id: eu, nome: "Você" },
                      para: { id: com, nome: pessoa.nome },
                      dias: diasDaTroca(ctx, eu, com, tipo, modo, dia, dia2),
                      tipo,
                    }}
                    siglas={siglas}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  A escala dessa semana ainda não foi publicada: as horas de cada uma aparecem
                  quando ela for. A supervisão aplica a troca ao montar a semana.
                </p>
              )}
            </div>
            <label className="block text-sm font-bold">
              Mensagem para {pessoa.nome.split(" ")[0]} (opcional)
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

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            className={passo === 1 ? "invisible" : ""}
            onClick={() => setPasso(Math.max(1, passo - 1))}
          >
            ‹ Voltar
          </Button>
          {passo < 4 ? (
            <Button disabled={!podeIr(passo + 1)} onClick={() => setPasso(passo + 1)}>
              Continuar ›
            </Button>
          ) : (
            <Button disabled={!completo || enviando} onClick={enviar}>
              {enviando ? "Enviando..." : "Enviar o pedido"}
            </Button>
          )}
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
      avisarCentralDeTurnos(t.id);
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
            <DialogDescription>O motivo aparece para as duas pessoas, no CX Hub.</DialogDescription>
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
