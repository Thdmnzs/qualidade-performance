import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aplicarTrocasDaSemana, lerFolgasFixas, lerTrocasParaAprovar } from "@/lib/trocas-api";
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AvisoDeFeriado, Chip, Flutuante, Legenda } from "@/components/escala/comum";
import { SemanaDoTime } from "@/components/escala/semana-do-time";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adicionarAoDia,
  atribuirFolgasEHorarios,
  avisoDaPessoa,
  type ConflitoDeFolga,
  copiarDia,
  corDoTexto,
  dataCurta,
  dataDoDia,
  definirHoras,
  DIAS_DA_SEMANA,
  DIAS_POR_EXTENSO,
  type DiasDaSemana,
  diaTemEscala,
  ficarOffAPartirDe,
  hojeIso,
  HORAS,
  horasDeTrabalho,
  intervaloDeHoras,
  jornada,
  limparDiaDaPessoa,
  type LinhaDoDia,
  moverNoDia,
  nomeCurto,
  onlinePorHora,
  periodoDaSemana,
  segundaDaSemana,
  type Sigla,
  somarDias,
  substituirNoDia,
  tirarDoDia,
} from "@/lib/escala";
import {
  criarSigla,
  lerFerias,
  lerHorariosDeTrabalho,
  lerSemana,
  lerSemanas,
  lerSiglas,
  publicarSemana,
  salvarDia,
  salvarDias,
} from "@/lib/escala-api";

type Pessoa = { id: string; nome: string };
const CORES_SUGERIDAS = [
  "#B4A7D6",
  "#A2C4C9",
  "#F9CB9C",
  "#B6D7A8",
  "#EA9999",
  "#FFE599",
  "#9FC5E8",
  "#D5A6BD",
  "#674EA7",
  "#45818E",
];
const ESPERA_PARA_SALVAR_MS = 600;
const vazia = (): DiasDaSemana => Array.from({ length: 7 }, () => []);

/** A montagem da semana (o ADM): rascunho → publicada. Grava sozinha, um instante depois de cada mudança. */
/** Uma lista vazia FIXA: `?? []` criaria uma nova a cada desenho, e o React recalcularia à toa. */
const SEM_LINHAS: LinhaDoDia[] = [];

export function MontarSemana({
  pessoas,
  inicioInicial,
  diaInicial,
}: {
  pessoas: Pessoa[];
  /** O "Aprovar e ajustar" das trocas abre a montagem já na semana e no dia da troca. */
  inicioInicial?: string | undefined;
  diaInicial?: number | undefined;
}) {
  const qc = useQueryClient();
  const estaSemana = segundaDaSemana(hojeIso());
  const [inicio, setInicio] = useState(inicioInicial ?? estaSemana);
  const [dia, setDia] = useState(
    () =>
      diaInicial ??
      Math.max(0, Array.from({ length: 7 }, (_, i) => dataDoDia(estaSemana, i)).indexOf(hojeIso())),
  );
  const [dias, setDias] = useState<DiasDaSemana>(vazia());
  const [estado, setEstado] = useState<{ tipo: "salvo" | "salvando" | "erro"; em?: number }>({
    tipo: "salvo",
  });
  // A seleção de horas: arrastando pela linha, ou clicando numa e, com o Shift, em outra.
  const [celulaAberta, setCelulaAberta] = useState<{
    linha: number;
    de: number;
    ate: number;
    ancora: DOMRect;
  } | null>(null);
  const [arraste, setArraste] = useState<{ linha: number; de: number; ate: number } | null>(null);
  const baseDoShift = useRef<{ linha: number; hora: number } | null>(null);
  const [menuDaPessoa, setMenuDaPessoa] = useState<{ linha: number; ancora: DOMRect } | null>(null);
  // As horas que mudaram nesta visita (a marca laranja), por semana, dia, pessoa e hora.
  const [mudadas, setMudadas] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState<null | "publicar" | "apagar" | "copiar-dia" | "ver-time">(
    null,
  );
  const pendentes = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const fecharLista = useCallback(() => setCelulaAberta(null), []);
  const fecharMenu = useCallback(() => setMenuDaPessoa(null), []);

  const { data: siglasLista = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  const siglas = useMemo(() => new Map(siglasLista.map((s) => [s.id, s])), [siglasLista]);
  const { data: semanas = [] } = useQuery({ queryKey: ["escala-semanas"], queryFn: lerSemanas });
  const { data: semana, isLoading } = useQuery({
    queryKey: ["escala-semana", inicio],
    queryFn: () => lerSemana(inicio),
  });

  // O que veio do banco vira o estado da tela (a não ser que haja gravações esperando).
  // Até isso acontecer, a montagem fica TRAVADA: um clique antes da semana carregar gravaria
  // um dia incompleto por cima do que está no banco.
  const [carregadaPara, setCarregadaPara] = useState<string | null>(null);
  useEffect(() => {
    if (semana && semana.inicio === inicio && pendentes.current.size === 0) {
      setDias(semana.dias);
      setCarregadaPara(inicio);
    }
  }, [semana, inicio]);
  const pronta = carregadaPara === inicio && !isLoading;

  const recarregar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["escala-semana", inicio] }),
      qc.invalidateQueries({ queryKey: ["escala-semanas"] }),
    ]);
  };

  // As trocas aprovadas desta semana que esperavam a escala ser montada (13/10/2026).
  const { data: trocasDoAdm = [] } = useQuery({
    queryKey: ["trocas-para-aprovar"],
    queryFn: lerTrocasParaAprovar,
  });
  const aAplicar = trocasDoAdm.filter(
    (t) => t.inicio === inicio && t.situacao === "aprovada" && !t.aplicada,
  );
  const [aplicando, setAplicando] = useState(false);
  // ---------- Atribuir as folgas fixas (13/10/2026): só nas semanas não publicadas ----------
  const { data: folgasFixas = [] } = useQuery({
    queryKey: ["folgas-fixas"],
    queryFn: lerFolgasFixas,
  });
  const anosDaSemana = [...new Set([inicio.slice(0, 4), somarDias(inicio, 6).slice(0, 4)])].map(
    Number,
  );
  const { data: feriasDoAno } = useQuery({
    queryKey: ["escala-ferias", anosDaSemana[0]],
    queryFn: () => lerFerias(anosDaSemana[0]!),
  });
  const { data: feriasDoOutroAno } = useQuery({
    queryKey: ["escala-ferias", anosDaSemana[1] ?? anosDaSemana[0]],
    queryFn: () => lerFerias(anosDaSemana[1] ?? anosDaSemana[0]!),
    enabled: anosDaSemana.length > 1,
  });
  const { data: horariosDeTrabalho = new Map() } = useQuery({
    queryKey: ["horarios-de-trabalho"],
    queryFn: lerHorariosDeTrabalho,
  });
  const [conflitosDeFolga, setConflitosDeFolga] = useState<ConflitoDeFolga[]>([]);
  const [semHorario, setSemHorario] = useState<{ employee_id: string; nome: string }[]>([]);
  useEffect(() => {
    setConflitosDeFolga([]);
    setSemHorario([]);
  }, [inicio]);
  async function atribuirFolgas() {
    if (pendentes.current.size > 0 || estado.tipo === "salvando") {
      toast.info("Aguarde um instante: a montagem ainda está salvando.");
      return;
    }
    // Os dias de uma troca já aplicada nesta semana não são tocados (a troca tem prioridade).
    const protegidos = new Set(
      trocasDoAdm
        .filter((t) => t.inicio === inicio && t.situacao === "aprovada" && t.aplicada)
        .flatMap((t) => t.dias.flatMap((d) => [`${t.de.id}:${d}`, `${t.para.id}:${d}`])),
    );
    const r = atribuirFolgasEHorarios({
      inicio,
      dias,
      pessoas,
      folgas: new Map(folgasFixas.map((f) => [f.employee_id, f.dias])),
      horarios: horariosDeTrabalho,
      siglas: [...siglas.values()],
      emFerias: (id: string, data: string) =>
        [feriasDoAno, feriasDoOutroAno].some((f) =>
          f?.porDia.get(data)?.some((x) => x.employee_id === id),
        ),
      protegidos,
      feriados: new Set(semana?.feriados ?? []),
    });
    setConflitosDeFolga(r.conflitos);
    setSemHorario(r.semHorario);
    if (r.mudados.length === 0) {
      if (r.conflitos.length === 0 && r.semHorario.length === 0)
        toast.info("As folgas e os horários já estão nesta semana.");
      return;
    }
    const partes = [
      r.horarios &&
        `${r.horarios} ${r.horarios === 1 ? "horário atribuído" : "horários atribuídos"}`,
      r.folgas && `${r.folgas} ${r.folgas === 1 ? "folga atribuída" : "folgas atribuídas"}`,
      r.retiradas &&
        `${r.retiradas} ${r.retiradas === 1 ? "folga tirada" : "folgas tiradas"} do fim de semana ou do feriado`,
    ].filter(Boolean);
    await gravarVariosDias(
      Object.fromEntries(r.mudados.map((d: number) => [d, r.dias[d]!])),
      `${partes.join(" e ")}.`,
    );
  }
  function porAFolga(c: ConflitoDeFolga) {
    const folga = [...siglas.values()].find((s) => s.sigla.toLowerCase() === "folga")?.id;
    if (!folga) return;
    mudarDia(
      c.dia,
      (dias[c.dia] ?? []).map((l) =>
        l.employee_id === c.employee_id ? { ...l, horas: l.horas.map(() => folga) } : l,
      ),
    );
    setConflitosDeFolga((x) =>
      x.filter((y) => !(y.employee_id === c.employee_id && y.dia === c.dia)),
    );
  }

  async function aplicarTrocas() {
    // Antes, as gravações da própria montagem precisam terminar (senão, uma delas gravaria por cima da troca).
    if (pendentes.current.size > 0 || estado.tipo === "salvando") {
      toast.info("Aguarde um instante: a montagem ainda está salvando.");
      return;
    }
    setAplicando(true);
    try {
      const n = await aplicarTrocasDaSemana(inicio);
      if (n > 0)
        toast.success(
          n === 1
            ? "A troca aprovada foi aplicada na escala."
            : `${n} trocas aprovadas foram aplicadas na escala.`,
        );
      else
        toast.info(
          "A escala dos dias da troca ainda não está montada para as duas pessoas: monte esses dias, e aplique de novo.",
        );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAplicando(false);
      await Promise.all([
        recarregar(),
        qc.invalidateQueries({ queryKey: ["trocas-para-aprovar"] }),
      ]);
    }
  }

  /** Mudou um dia: a tela muda na hora, e a gravação acontece um instante depois. */
  function mudarDia(d: number, novas: LinhaDoDia[]) {
    if (!pronta) return;
    const antes = new Map((dias[d] ?? []).map((l) => [l.employee_id, l.horas]));
    setMudadas((m) => {
      const n = new Set(m);
      for (const l of novas)
        l.horas.forEach(
          (h, k) =>
            (antes.get(l.employee_id)?.[k] ?? null) !== h &&
            n.add(`${inicio}:${d}:${l.employee_id}:${k}`),
        );
      return n;
    });
    setDias((atual) => atual.map((l, i) => (i === d ? novas : l)));
    setEstado({ tipo: "salvando" });
    clearTimeout(pendentes.current.get(d));
    pendentes.current.set(
      d,
      setTimeout(async () => {
        pendentes.current.delete(d);
        try {
          await salvarDia(inicio, d, novas);
          setEstado({ tipo: "salvo", em: Date.now() });
          if (pendentes.current.size === 0) await recarregar();
        } catch (e) {
          setEstado({ tipo: "erro" });
          toast.error((e as Error).message);
          await recarregar();
        }
      }, ESPERA_PARA_SALVAR_MS),
    );
  }

  /** Vários dias de uma vez (copiar, apagar): por inteiro, ou nada. */
  async function gravarVariosDias(novos: Record<number, LinhaDoDia[]>, ok: string) {
    if (!pronta) return;
    for (const t of pendentes.current.values()) clearTimeout(t);
    pendentes.current.clear();
    setEstado({ tipo: "salvando" });
    try {
      await salvarDias(inicio, novos);
      setEstado({ tipo: "salvo", em: Date.now() });
      toast.success(ok);
    } catch (e) {
      setEstado({ tipo: "erro" });
      toast.error((e as Error).message);
    } finally {
      await recarregar();
    }
  }

  async function trocarDeSemana(nova: string) {
    if (pendentes.current.size) {
      toast.info("Aguarde um instante: a última mudança ainda está sendo salva.");
      return;
    }
    setCarregadaPara(null);
    setInicio(nova);
    setDia(0);
  }

  async function copiarSemanaAnterior() {
    const anterior = await lerSemana(somarDias(inicio, -7));
    if (!anterior.dias.some((d) => d.length)) {
      toast.info(`A semana de ${periodoDaSemana(somarDias(inicio, -7))} está vazia.`);
      return;
    }
    if (
      dias.some(diaTemEscala) &&
      !window.confirm("Esta semana já tem escala. Substituir pela semana anterior?")
    )
      return;
    await gravarVariosDias(
      Object.fromEntries(anterior.dias.map((l, i) => [i, l])),
      `A semana de ${periodoDaSemana(somarDias(inicio, -7))} foi copiada. Ajuste o que mudou.`,
    );
  }

  const linhas = dias[dia] ?? SEM_LINHAS;
  useEffect(() => {
    if (!arraste) return;
    const soltar = () => {
      const a = arraste;
      setArraste(null);
      const ancora = document
        .querySelector(`[data-celula="${a.linha}-${a.ate}"]`)
        ?.getBoundingClientRect();
      if (ancora) setCelulaAberta({ ...a, ancora });
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, [arraste]);
  const selecionada = (i: number, k: number) => {
    const s = arraste ?? celulaAberta;
    return !!s && s.linha === i && k >= Math.min(s.de, s.ate) && k <= Math.max(s.de, s.ate);
  };
  const todosOsNomes = useMemo(() => pessoas.map((p) => p.nome), [pessoas]);
  const data = dataDoDia(inicio, dia);
  const feriado = semana?.feriados.includes(data) ?? false;
  const foraDoDia = pessoas.filter((p) => !linhas.some((l) => l.employee_id === p.id));
  const online = onlinePorHora(linhas, siglas);
  const presentes = useMemo(() => {
    const ids = new Set(linhas.flatMap((l) => l.horas).filter(Boolean) as string[]);
    return siglasLista.filter((s) => ids.has(s.id));
  }, [linhas, siglasLista]);
  const opcoesDeSemana = useMemo(() => {
    const m = new Map<string, string>(semanas.map((s) => [s.inicio, s.situacao]));
    for (const i of [estaSemana, somarDias(estaSemana, 7)]) if (!m.has(i)) m.set(i, "nova");
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [semanas, estaSemana]);

  return (
    <div className="space-y-4">
      {aAplicar.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/10 px-4 py-3 text-sm">
          <div>
            <p className="font-bold">
              🔁{" "}
              {aAplicar.length === 1
                ? "1 troca aprovada espera"
                : `${aAplicar.length} trocas aprovadas esperam`}{" "}
              esta semana ser montada
            </p>
            <p className="text-xs">
              {aAplicar
                .map((t) => `${t.de.nome.split(" ")[0]} ⇄ ${t.para.nome.split(" ")[0]}`)
                .join(" · ")}
              . Monte os dias da troca, e aplique: a escala das duas pessoas troca na hora.
            </p>
          </div>
          <Button size="sm" disabled={aplicando || !pronta} onClick={aplicarTrocas}>
            {aplicando ? "Aplicando..." : "Aplicar as trocas aprovadas"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Montar a semana</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label="Semana"
              value={inicio}
              onChange={(e) => trocarDeSemana(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
            >
              {opcoesDeSemana.map(([i, s]) => (
                <option key={i} value={i}>
                  {periodoDaSemana(i)} ·{" "}
                  {s === "publicada" ? "publicada" : s === "rascunho" ? "rascunho" : "nova"}
                  {i === estaSemana ? " (esta)" : ""}
                </option>
              ))}
            </select>
            {semana?.situacao === "publicada" ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                Publicada: o time já vê, e cada mudança vai para o histórico
              </span>
            ) : (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold">
                Rascunho: o time ainda não vê
              </span>
            )}
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {estado.tipo === "salvando"
                ? "Salvando..."
                : estado.tipo === "erro"
                  ? "Não foi possível salvar a última mudança."
                  : estado.em
                    ? `Salvo às ${new Date(estado.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={atribuirFolgas}
            disabled={!pronta || semana?.situacao === "publicada"}
            title={
              semana?.situacao === "publicada"
                ? "A semana publicada não recebe as folgas fixas sozinha."
                : "Põe a folga fixa e o horário de trabalho de cada pessoa nos dias vazios desta semana."
            }
          >
            <CalendarCheck className="size-4" /> Atribuir folgas e horários
          </Button>
          <Button variant="outline" onClick={copiarSemanaAnterior} disabled={!pronta}>
            <Copy className="size-4" /> Copiar a semana anterior
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setJanela("apagar")}
            disabled={!pronta}
          >
            <Trash2 className="size-4" /> Apagar tudo
          </Button>
          <Button
            onClick={() => setJanela("publicar")}
            disabled={!pronta || semana?.situacao === "publicada"}
          >
            {semana?.situacao === "publicada" ? "Publicada ✓" : "Publicar para o time"}
          </Button>
        </div>
      </div>

      {semHorario.length > 0 && (
        <div
          className="rounded-xl border border-warning/50 bg-warning/15 px-4 py-3 text-sm"
          role="status"
        >
          <div className="flex items-center justify-between gap-2">
            <p>
              ⚠️ <b>{semHorario.map((p) => p.nome).join(", ")}</b>{" "}
              {semHorario.length === 1 ? "ainda não tem" : "ainda não têm"} horário de trabalho: os
              dias de trabalho ficaram vazios. Preencha na ficha, em Colaboradores (🔒 Dados
              pessoais).
            </p>
            <button
              type="button"
              className="text-muted-foreground"
              aria-label="Fechar o aviso"
              onClick={() => setSemHorario([])}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {conflitosDeFolga.length > 0 && (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-destructive">
              ⚠️{" "}
              {conflitosDeFolga.length === 1
                ? "1 conflito"
                : `${conflitosDeFolga.length} conflitos`}{" "}
              com as folgas fixas
            </p>
            <button
              type="button"
              className="text-muted-foreground"
              aria-label="Fechar o aviso"
              onClick={() => setConflitosDeFolga([])}
            >
              <X className="size-4" />
            </button>
          </div>
          {conflitosDeFolga.map((c) => (
            <div
              key={`${c.employee_id}-${c.dia}`}
              className="mt-2 flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                <b>{c.nome}</b> tem horário na {DIAS_POR_EXTENSO[c.dia]},{" "}
                {dataCurta(dataDoDia(inicio, c.dia))}, que é um dia da folga fixa.
              </span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => porAFolga(c)}>
                  Pôr a folga
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setConflitosDeFolga((x) =>
                      x.filter((y) => !(y.employee_id === c.employee_id && y.dia === c.dia)),
                    )
                  }
                >
                  Manter o horário
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dia">
        {DIAS_DA_SEMANA.map((d, i) => {
          const dt = dataDoDia(inicio, i);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={i === dia}
              onClick={() => setDia(i)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${i === dia ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
            >
              <b>{d}</b> {dataCurta(dt)}
              {semana?.feriados.includes(dt) && (
                <span className="ml-1 rounded-full bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold">
                  🎉 feriado
                </span>
              )}
              {!diaTemEscala(dias[i] ?? []) && (
                <span className="ml-1 text-[10px] opacity-70">· vazio</span>
              )}
            </button>
          );
        })}
      </div>

      {feriado && (
        <AvisoDeFeriado>
          <b>
            🎉 {DIAS_POR_EXTENSO[dia]}, {dataCurta(data)}, é feriado.
          </b>{" "}
          Monte a equipe reduzida: tire do dia quem não vai trabalhar (o ✕ ao lado do nome). O time
          verá o aviso de feriado na aba Escala.{" "}
          <button type="button" className="font-bold underline" onClick={() => mudarDia(dia, [])}>
            Começar com a equipe vazia
          </button>
        </AvisoDeFeriado>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clique numa hora para escolher a atividade. As cores vêm da sigla.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJanela("ver-time")}
            disabled={!pronta}
          >
            <Eye className="size-4" /> Ver como o time vê
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!pronta}
            onClick={() =>
              diaTemEscala(linhas)
                ? setJanela("copiar-dia")
                : toast.info("Este dia está vazio: preencha-o antes de copiar.")
            }
          >
            <Copy className="size-4" /> Copiar este dia para...
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        {!pronta ? (
          <p className="text-sm text-muted-foreground">Carregando a semana...</p>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: 128 }} />
              <col style={{ width: 62 }} />
              {HORAS.map((h) => (
                <col key={h} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="pb-1 text-left text-xs font-medium">Analista</th>
                <th className="pb-1 text-xs font-medium">h</th>
                {HORAS.map((h) => (
                  <th key={h} className="pb-1 text-[11px] font-bold">
                    {h}h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const fundo = i % 2 ? "bg-secondary/70" : "";
                const aviso = avisoDaPessoa(l.horas, siglas);
                return (
                  <tr key={l.employee_id}>
                    <td className={`rounded-l-[10px] py-1.5 pl-1.5 ${fundo}`}>
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => mudarDia(dia, moverNoDia(linhas, i, -1))}
                            className="flex h-3.5 w-[18px] items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-25"
                            aria-label={`Subir ${l.nome}`}
                            title={`Subir ${l.nome}`}
                          >
                            <ChevronUp className="size-3" strokeWidth={3} />
                          </button>
                          <button
                            type="button"
                            disabled={i === linhas.length - 1}
                            onClick={() => mudarDia(dia, moverNoDia(linhas, i, 1))}
                            className="flex h-3.5 w-[18px] items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-25"
                            aria-label={`Descer ${l.nome}`}
                            title={`Descer ${l.nome}`}
                          >
                            <ChevronDown className="size-3" strokeWidth={3} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => mudarDia(dia, tirarDoDia(linhas, i))}
                          className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Tirar ${l.nome} deste dia`}
                          title={`Tirar ${l.nome} deste dia`}
                        >
                          <X className="size-3" strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) =>
                            setMenuDaPessoa({
                              linha: i,
                              ancora: e.currentTarget.getBoundingClientRect(),
                            })
                          }
                          className="flex size-[18px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          aria-label={`Mais ações para ${l.nome}`}
                          title="Ficar off, substituir ou limpar o dia"
                        >
                          <MoreHorizontal className="size-3.5" strokeWidth={3} />
                        </button>
                        <span className="truncate text-sm font-bold" title={l.nome}>
                          {nomeCurto(l.nome, todosOsNomes)}
                        </span>
                      </div>
                    </td>
                    <td className={`py-1.5 text-center text-xs ${fundo}`}>
                      {horasDeTrabalho(l.horas, siglas) || "–"}
                      {aviso && <div className="text-[10px] font-bold text-warning">{aviso}</div>}
                    </td>
                    {l.horas.map((h, k) => {
                      const s = h ? siglas.get(h) : undefined;
                      const aberta = selecionada(i, k);
                      const mudou = mudadas.has(`${inicio}:${dia}:${l.employee_id}:${k}`);
                      return (
                        <td
                          key={k}
                          className={`px-px py-1.5 ${fundo} ${k === l.horas.length - 1 ? "rounded-r-[10px]" : ""}`}
                        >
                          <button
                            type="button"
                            aria-label={`${l.nome}, ${HORAS[k]}h: ${s ? s.significado : "vazio"}`}
                            title={s ? s.significado : "vazio: clique para escolher"}
                            data-celula={`${i}-${k}`}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              setCelulaAberta(null);
                              const base = baseDoShift.current;
                              const de = e.shiftKey && base && base.linha === i ? base.hora : k;
                              if (!e.shiftKey || !base || base.linha !== i)
                                baseDoShift.current = { linha: i, hora: k };
                              setArraste({ linha: i, de, ate: k });
                            }}
                            onMouseEnter={() =>
                              arraste && arraste.linha === i && setArraste({ ...arraste, ate: k })
                            }
                            onClick={(e) => {
                              // Pelo teclado (Enter ou espaço), a lista abre para esta hora.
                              if (e.detail === 0)
                                setCelulaAberta({
                                  linha: i,
                                  de: k,
                                  ate: k,
                                  ancora: e.currentTarget.getBoundingClientRect(),
                                });
                            }}
                            className={`block w-full select-none rounded-[7px] ${mudou ? "shadow-[inset_0_-3px_0_#F59E0B]" : ""} ${aberta ? "outline outline-2 -outline-offset-2 outline-[#2563EB] brightness-90" : "hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-[#2563EB]"}`}
                          >
                            {s ? (
                              <Chip sigla={s} longo={s.sigla.length >= 6} />
                            ) : (
                              <div className="h-8 rounded-[7px] border border-dashed border-border" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td
                  className="border-t-2 border-border pl-2.5 pt-3 text-xs font-bold"
                  title="Quantas pessoas estão em atendimento em cada hora"
                >
                  Online
                </td>
                <td className="border-t-2 border-border pt-3" />
                {online.map((n, k) => (
                  <td key={k} className="border-t-2 border-border px-px pt-3">
                    <div className="flex h-[26px] items-center justify-center rounded-[7px] bg-primary/10 text-xs font-bold text-primary">
                      {n}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        {pronta && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {foraDoDia.length ? (
              <>
                <span className="text-xs font-bold">
                  Adicionar a este dia (entra no fim da lista):
                </span>
                {foraDoDia.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      mudarDia(dia, adicionarAoDia(linhas, { employee_id: p.id, nome: p.nome }))
                    }
                  >
                    + {nomeCurto(p.nome, todosOsNomes)}
                  </Button>
                ))}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Todo o time está neste dia. Use o ✕ ao lado de um nome para tirá-lo (como numa
                escala de feriado).
              </span>
            )}
          </div>
        )}
      </section>
      <Legenda siglas={presentes} />

      {celulaAberta && linhas[celulaAberta.linha] && (
        <ListaDeAtividades
          ancora={celulaAberta.ancora}
          aoFechar={fecharLista}
          titulo={(() => {
            const hs = intervaloDeHoras(celulaAberta.de, celulaAberta.ate);
            const nome = nomeCurto(linhas[celulaAberta.linha]!.nome, todosOsNomes);
            return `${nome} · ${HORAS[hs[0]!]}h às ${HORAS[hs[hs.length - 1]!]! + 1}h${hs.length > 1 ? ` · ${hs.length} horas` : ""}`;
          })()}
          atual={
            celulaAberta.de === celulaAberta.ate
              ? (linhas[celulaAberta.linha]!.horas[celulaAberta.de] ?? null)
              : undefined
          }
          siglas={siglasLista}
          aoEscolher={(sigla) => {
            mudarDia(
              dia,
              definirHoras(
                linhas,
                celulaAberta.linha,
                intervaloDeHoras(celulaAberta.de, celulaAberta.ate),
                sigla,
              ),
            );
            setCelulaAberta(null);
          }}
          aoCriar={async (sigla, significado, cor) => {
            const id = await criarSigla(sigla, cor, significado);
            await qc.invalidateQueries({ queryKey: ["escala-siglas"] });
            mudarDia(
              dia,
              definirHoras(
                linhas,
                celulaAberta.linha,
                intervaloDeHoras(celulaAberta.de, celulaAberta.ate),
                id,
              ),
            );
            setCelulaAberta(null);
            toast.success(
              `A atividade "${sigla}" (${significado}) foi criada, e já aparece na lista de todas as horas.`,
            );
          }}
        />
      )}

      {menuDaPessoa && linhas[menuDaPessoa.linha] && (
        <MenuDaPessoa
          ancora={menuDaPessoa.ancora}
          aoFechar={fecharMenu}
          linha={linhas[menuDaPessoa.linha]!}
          dataDoDia={`${DIAS_POR_EXTENSO[dia]}, ${dataCurta(data)}`}
          foraDoDia={foraDoDia}
          temOff={siglasLista.some((x) => x.sigla.toLowerCase() === "off")}
          aoFicarOff={(hora) => {
            const off = siglasLista.find((x) => x.sigla.toLowerCase() === "off")!;
            mudarDia(dia, ficarOffAPartirDe(linhas, menuDaPessoa.linha, hora, off.id));
            toast.success(
              `${linhas[menuDaPessoa.linha]!.nome.split(" ")[0]} fica off a partir das ${HORAS[hora]}h.`,
            );
            setMenuDaPessoa(null);
          }}
          aoSubstituir={(p) => {
            const saiu = linhas[menuDaPessoa.linha]!.nome.split(" ")[0];
            mudarDia(
              dia,
              substituirNoDia(linhas, menuDaPessoa.linha, { employee_id: p.id, nome: p.nome }),
            );
            toast.success(
              `${p.nome.split(" ")[0]} entrou no lugar de ${saiu}, com as mesmas horas. Ajuste o N2, se precisar.`,
            );
            setMenuDaPessoa(null);
          }}
          aoLimpar={() => {
            mudarDia(dia, limparDiaDaPessoa(linhas, menuDaPessoa.linha));
            setMenuDaPessoa(null);
          }}
        />
      )}

      <JanelaDePublicar
        aberta={janela === "publicar"}
        aoFechar={() => setJanela(null)}
        inicio={inicio}
        dias={dias}
        feriados={semana?.feriados ?? []}
        siglas={siglas}
        aoPublicar={async () => {
          try {
            await publicarSemana(inicio);
            toast.success("Publicada. O time já vê esta semana na aba Escala.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setJanela(null);
            await recarregar();
          }
        }}
      />
      <JanelaDeApagar
        aberta={janela === "apagar"}
        aoFechar={() => setJanela(null)}
        dia={dia}
        inicio={inicio}
        aoApagar={async (semanaToda) => {
          setJanela(null);
          await gravarVariosDias(
            semanaToda
              ? Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, []]))
              : { [dia]: [] },
            semanaToda
              ? "A semana inteira foi apagada."
              : `O dia ${DIAS_DA_SEMANA[dia]} ${dataCurta(dataDoDia(inicio, dia))} foi apagado.`,
          );
        }}
      />
      <JanelaDeCopiarDia
        aberta={janela === "copiar-dia"}
        aoFechar={() => setJanela(null)}
        dia={dia}
        inicio={inicio}
        dias={dias}
        aoCopiar={async (para) => {
          setJanela(null);
          const r = copiarDia(dias, dia, para);
          await gravarVariosDias(
            Object.fromEntries(para.map((i) => [i, r[i]!])),
            `${DIAS_DA_SEMANA[dia]} copiado para ${para.map((i) => DIAS_DA_SEMANA[i]).join(", ")}. Abra cada dia e troque o que for diferente.`,
          );
        }}
      />
      <Dialog open={janela === "ver-time"} onOpenChange={(a) => !a && setJanela(null)}>
        <DialogContent className="max-w-[min(96vw,1100px)]">
          <DialogHeader>
            <DialogTitle>Como o time vê · {periodoDaSemana(inicio)}</DialogTitle>
            <DialogDescription>
              {semana?.situacao === "publicada"
                ? "É o que o time está vendo agora na aba Escala."
                : "É o que o time vai ver na aba Escala, depois da publicação."}
            </DialogDescription>
          </DialogHeader>
          <SemanaDoTime
            inicio={inicio}
            dias={dias}
            feriados={semana?.feriados ?? []}
            eu={null}
            siglas={siglas}
            diaInicial={dia}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListaDeAtividades({
  ancora,
  aoFechar,
  titulo,
  atual,
  siglas,
  aoEscolher,
  aoCriar,
}: {
  ancora: DOMRect;
  aoFechar: () => void;
  titulo: string;
  atual: string | null | undefined; // undefined: várias horas selecionadas (nenhuma marcada)
  siglas: Sigla[];
  aoEscolher: (sigla: string | null) => void;
  aoCriar: (sigla: string, significado: string, cor: string) => Promise<void>;
}) {
  const [nova, setNova] = useState(false);
  const [sigla, setSigla] = useState("");
  const [significado, setSignificado] = useState("");
  const [cor, setCor] = useState(CORES_SUGERIDAS[0]!);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  async function criar() {
    const s = sigla.trim();
    const n = significado.trim();
    const problema = !s
      ? "Escreva a sigla."
      : !n
        ? "Escreva o que é a atividade."
        : siglas.some((x) => x.sigla.toLowerCase() === s.toLowerCase())
          ? `A sigla "${s}" já existe: escolha ela na lista.`
          : "";
    if (problema) return setErro(problema);
    setCriando(true);
    try {
      await aoCriar(s, n, cor);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCriando(false);
    }
  }
  return (
    <Flutuante ancora={ancora} aoFechar={aoFechar} largura={250}>
      <p className="px-1.5 pb-1.5 text-[11px] font-bold text-muted-foreground">{titulo}</p>
      <div role="listbox" aria-label="Atividade desta hora">
        {siglas.map((s) => (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={atual === s.id}
            onClick={() => aoEscolher(s.id)}
            className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-secondary ${atual === s.id ? "bg-secondary" : ""}`}
          >
            <span
              className="min-w-[52px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold"
              style={{ background: s.cor, color: corDoTexto(s.cor) }}
            >
              {s.sigla}
            </span>
            {s.significado}
          </button>
        ))}
        <button
          type="button"
          role="option"
          aria-selected={atual === null}
          onClick={() => aoEscolher(null)}
          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-secondary ${atual === null ? "bg-secondary" : ""}`}
        >
          <span className="min-w-[52px] rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-center text-[11px]">
            vazio
          </span>
          Deixar vazio
        </button>
      </div>
      <div className="mt-1 border-t border-border pt-1.5">
        {!nova ? (
          <button
            type="button"
            onClick={() => setNova(true)}
            className="w-full rounded-md px-1.5 py-1 text-left text-sm font-bold text-primary hover:bg-secondary"
          >
            + Nova atividade
          </button>
        ) : (
          <div className="space-y-2 p-1">
            <input
              value={sigla}
              onChange={(e) => setSigla(e.target.value)}
              maxLength={10}
              placeholder="Sigla (até 10 letras), ex.: trein"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              autoFocus
            />
            <input
              value={significado}
              onChange={(e) => setSignificado(e.target.value)}
              maxLength={40}
              placeholder="O que é, ex.: Treinamento"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {CORES_SUGERIDAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  aria-pressed={cor === c}
                  onClick={() => setCor(c)}
                  className={`size-[22px] rounded-full border-2 ${cor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <label
                className="relative size-[22px] cursor-pointer rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
                title="Outra cor"
              >
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value.toUpperCase())}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className="rounded-full px-2 py-0.5 font-bold"
                style={{ background: cor, color: corDoTexto(cor) }}
              >
                {sigla.trim() || "sigla"}
              </span>
              <span className="text-muted-foreground">assim ela vai aparecer</span>
            </div>
            {erro && <p className="text-xs font-bold text-destructive">{erro}</p>}
            <Button size="sm" className="w-full" onClick={criar} disabled={criando}>
              {criando ? "Criando..." : "Criar e usar nesta hora"}
            </Button>
          </div>
        )}
      </div>
    </Flutuante>
  );
}

function JanelaDePublicar({
  aberta,
  aoFechar,
  inicio,
  dias,
  feriados,
  siglas,
  aoPublicar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  inicio: string;
  dias: DiasDaSemana;
  feriados: string[];
  siglas: Map<string, Sigla>;
  aoPublicar: () => void;
}) {
  const vazios = dias.filter((d) => !diaTemEscala(d)).length;
  const semPausa = dias.flat().filter((l) => avisoDaPessoa(l.horas, siglas) === "sem pausa").length;
  const deFeriado = dias
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => feriados.includes(dataDoDia(inicio, i)));
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicar a escala de {periodoDaSemana(inicio)}?</DialogTitle>
          <DialogDescription>
            O time passa a ver esta semana na aba Escala. Depois de publicada, uma mudança aparece
            para o time na hora, e fica no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          {deFeriado.map(({ i, d }) => (
            <p key={i}>
              🎉 {DIAS_DA_SEMANA[i]} {dataCurta(dataDoDia(inicio, i))} é feriado: {d.length}{" "}
              {d.length === 1 ? "pessoa escalada" : "pessoas escaladas"}. O time verá o aviso.
            </p>
          ))}
          <p>
            {vazios
              ? `⚠ ${vazios} ${vazios === 1 ? "dia está vazio" : "dias estão vazios"}.`
              : "✓ Todos os dias estão preenchidos."}
          </p>
          <p>
            {semPausa
              ? `⚠ ${semPausa} ${semPausa === 1 ? "linha está" : "linhas estão"} sem pausa.`
              : "✓ Todo mundo tem pausa."}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={aoPublicar}>Publicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JanelaDeApagar({
  aberta,
  aoFechar,
  dia,
  inicio,
  aoApagar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  dia: number;
  inicio: string;
  aoApagar: (semanaToda: boolean) => void;
}) {
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Apagar a escala</DialogTitle>
          <DialogDescription>O que você quer apagar? Isso não pode ser desfeito.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => aoApagar(false)}>
            Só este dia ({DIAS_DA_SEMANA[dia]} {dataCurta(dataDoDia(inicio, dia))})
          </Button>
          <Button variant="destructive" onClick={() => aoApagar(true)}>
            A semana inteira (os 7 dias)
          </Button>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JanelaDeCopiarDia({
  aberta,
  aoFechar,
  dia,
  inicio,
  dias,
  aoCopiar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  dia: number;
  inicio: string;
  dias: DiasDaSemana;
  aoCopiar: (para: number[]) => void;
}) {
  const [marcados, setMarcados] = useState<number[]>([]);
  useEffect(() => {
    if (aberta) setMarcados([0, 1, 2, 3, 4].filter((i) => i !== dia)); // os dias úteis, menos o próprio
  }, [aberta, dia]);
  const substituidos = marcados.filter((i) => diaTemEscala(dias[i] ?? [])).length;
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Copiar {DIAS_DA_SEMANA[dia]} {dataCurta(dataDoDia(inicio, dia))} para...
          </DialogTitle>
          <DialogDescription>
            Marque os dias que vão receber uma cópia. Depois, é só abrir cada um e trocar o que for
            diferente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {DIAS_DA_SEMANA.map((d, i) =>
            i === dia ? null : (
              <label
                key={d}
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={marcados.includes(i)}
                  onChange={(e) =>
                    setMarcados((m) => (e.target.checked ? [...m, i] : m.filter((x) => x !== i)))
                  }
                />
                <b>{d}</b> {dataCurta(dataDoDia(inicio, i))}
                {diaTemEscala(dias[i] ?? []) ? (
                  <span className="text-xs font-bold text-warning">
                    · já tem escala: será substituída
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">· vazio</span>
                )}
              </label>
            ),
          )}
        </div>
        {substituidos > 0 && (
          <p className="text-xs font-bold text-warning">
            ⚠ {substituidos}{" "}
            {substituidos === 1
              ? "dia marcado já tem escala, e vai ser substituído"
              : "dias marcados já têm escala, e vão ser substituídos"}
            .
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button disabled={!marcados.length} onClick={() => aoCopiar(marcados.sort())}>
            Copiar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O ⋯ de cada pessoa: ficar off a partir de uma hora, substituir por quem está fora do dia, e limpar o dia. */
function MenuDaPessoa({
  ancora,
  aoFechar,
  linha,
  dataDoDia,
  foraDoDia,
  temOff,
  aoFicarOff,
  aoSubstituir,
  aoLimpar,
}: {
  ancora: DOMRect;
  aoFechar: () => void;
  linha: LinhaDoDia;
  dataDoDia: string;
  foraDoDia: Pessoa[];
  temOff: boolean;
  aoFicarOff: (hora: number) => void;
  aoSubstituir: (p: Pessoa) => void;
  aoLimpar: () => void;
}) {
  const j = jornada(linha.horas);
  const horasDaJornada = j ? intervaloDeHoras(j.de, j.ate) : [];
  const [hora, setHora] = useState(
    () => horasDaJornada[Math.floor(horasDaJornada.length / 2)] ?? 0,
  );
  const [substituto, setSubstituto] = useState(foraDoDia[0]?.id ?? "");
  const primeiroNome = linha.nome.split(" ")[0];
  const caixa = "rounded-lg bg-secondary p-2.5";
  return (
    <Flutuante ancora={ancora} aoFechar={aoFechar} largura={280}>
      <p className="px-1.5 pb-1.5 text-[11px] font-bold text-muted-foreground">
        {primeiroNome} · {dataDoDia}
      </p>
      <div className="space-y-2">
        {temOff && j && (
          <div className={caixa}>
            <p className="text-xs font-bold">🚪 Ficar off a partir de</p>
            <div className="mt-1.5 flex gap-2">
              <select
                aria-label="A hora em que fica off"
                value={hora}
                onChange={(e) => setHora(Number(e.target.value))}
                className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
              >
                {horasDaJornada.map((k) => (
                  <option key={k} value={k}>
                    {HORAS[k]}h
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => aoFicarOff(hora)}>
                Aplicar
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              As horas seguintes da jornada viram “off”.
            </p>
          </div>
        )}
        <div className={caixa}>
          <p className="text-xs font-bold">⇄ Substituir por</p>
          {foraDoDia.length ? (
            <>
              <div className="mt-1.5 flex gap-2">
                <select
                  aria-label="Quem entra no lugar"
                  value={substituto}
                  onChange={(e) => setSubstituto(e.target.value)}
                  className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {foraDoDia.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => aoSubstituir(foraDoDia.find((p) => p.id === substituto)!)}
                  disabled={!substituto}
                >
                  Aplicar
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entra com as mesmas horas, e {primeiroNome} sai do dia. Ajuste o N2 depois, se
                precisar.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">Todo o time já está neste dia.</p>
          )}
        </div>
        <button
          type="button"
          onClick={aoLimpar}
          className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
        >
          🧹 Limpar o dia desta pessoa
        </button>
      </div>
    </Flutuante>
  );
}
