/**
 * As trocas de escala (12/10/2026): a regra de COMO FICA a escala depois de uma troca.
 * A MESMA regra vale no banco (que aplica a troca na aprovação); os testes dos dois lados
 * usam os mesmos cenários, para eles nunca discordarem.
 *
 *   * O que se troca é o HORÁRIO: a janela de trabalho e a pausa vêm da outra pessoa.
 *   * As reuniões (o mensal e o 1:1) ficam na mesma hora, se couberem no horário novo.
 *   * As atividades da pessoa (o N2 e o atendimento) vão junto, na mesma ordem. Sobrando horas,
 *     viram atendimento; faltando, sai primeiro o atendimento (e um N2 que não couber gera um aviso).
 *   * Um dia sem trabalho (a folga, as férias) vai como está.
 *   * A troca de folgas (dois dias): cada um leva as atividades do dia que DEIXOU de trabalhar.
 *   * Sair da escala (feriado): quem entra recebe o horário só com atendimento.
 */
import {
  dataDoDia,
  segundaDaSemana,
  type DiasDaSemana,
  type Horas,
  type LinhaDoDia,
  type Sigla,
} from "@/lib/escala";

export type TipoDeTroca = "horarios" | "folgas" | "feriado";
export const TIPOS: Record<TipoDeTroca, string> = {
  horarios: "Trocar os horários de um dia",
  folgas: "Trocar as folgas (dois dias)",
  feriado: "Sair da escala (feriado)",
};

type Papeis = {
  pausa: string | null;
  atendimento: string | null;
  reunioes: Set<string>;
  trabalho: Set<string>;
};
export function papeisDasSiglas(siglas: Map<string, Sigla>): Papeis {
  const lista = [...siglas.values()];
  return {
    pausa: lista.find((s) => s.sigla.toLowerCase() === "p")?.id ?? null,
    atendimento:
      [...lista].sort((a, b) => a.ordem - b.ordem).find((s) => s.em_atendimento)?.id ?? null,
    reunioes: new Set(
      lista.filter((s) => ["mensal", "1:1"].includes(s.sigla.toLowerCase())).map((s) => s.id),
    ),
    trabalho: new Set(lista.filter((s) => s.conta_como_trabalho).map((s) => s.id)),
  };
}

/** O horário de uma pessoa depois da troca: a janela de uma, as atividades da outra. */
export function redistribuir(
  janela: Horas | null,
  atividades: Horas | null,
  p: Papeis,
): { horas: Horas | null; avisos: string[] } {
  const avisos: string[] = [];
  if (!janela) return { horas: null, avisos };
  const temTrabalho = (l: Horas | null) =>
    !!l && l.some((h) => h && (p.trabalho.has(h) || h === p.pausa));
  if (!temTrabalho(janela)) return { horas: [...janela], avisos }; // a folga, as férias: vão como estão
  const horas: Horas = janela.map(() => null);
  const trabalhoDaJanela = janela.map((h, k) => (h ? k : -1)).filter((k) => k >= 0);
  for (const k of trabalhoDaJanela) if (janela[k] === p.pausa) horas[k] = p.pausa;
  const minhas = temTrabalho(atividades) ? atividades! : [];
  minhas.forEach((h, k) => {
    if (!h || !p.reunioes.has(h)) return;
    if (trabalhoDaJanela.includes(k) && !horas[k]) horas[k] = h;
    else avisos.push("Uma reunião fica fora do horário novo.");
  });
  const livres = trabalhoDaJanela.filter((k) => !horas[k]);
  let fluxo = minhas.filter(
    (h): h is string => !!h && h !== p.pausa && !p.reunioes.has(h) && p.trabalho.has(h),
  );
  while (fluxo.length > livres.length && p.atendimento && fluxo.lastIndexOf(p.atendimento) >= 0)
    fluxo.splice(fluxo.lastIndexOf(p.atendimento), 1);
  if (fluxo.length > livres.length) {
    avisos.push(`Não cabem ${fluxo.length - livres.length} hora(s) de atividade no horário novo.`);
    fluxo = fluxo.slice(0, livres.length);
  }
  while (fluxo.length < livres.length && p.atendimento) fluxo.push(p.atendimento);
  livres.forEach((k, i) => (horas[k] = fluxo[i] ?? null));
  return { horas, avisos: [...new Set(avisos)] };
}

/**
 * A troca aplicada à semana: em cada dia, a pessoa A fica com o horário de B (e vice-versa).
 * Quem não tinha linha no dia e passa a ter ENTRA na posição de quem saiu.
 */
export function aplicarTroca(
  dias: DiasDaSemana,
  troca: {
    de: { id: string; nome: string };
    para: { id: string; nome: string };
    dias: number[];
    tipo: TipoDeTroca;
  },
  siglas: Map<string, Sigla>,
): { dias: DiasDaSemana; avisos: string[] } {
  const p = papeisDasSiglas(siglas);
  const novos: DiasDaSemana = dias.map((d) => d.map((l) => ({ ...l, horas: [...l.horas] })));
  const avisos: string[] = [];
  const linhaDe = (d: number, id: string) =>
    dias[d]?.find((l) => l.employee_id === id)?.horas ?? null;
  // Nas folgas, os dias vêm em pares (de dois em dois): cada dia tem o "outro" do par.
  const outroDe = new Map<number, number>();
  if (troca.tipo === "folgas")
    for (let i = 0; i + 1 < troca.dias.length; i += 2) {
      outroDe.set(troca.dias[i]!, troca.dias[i + 1]!);
      outroDe.set(troca.dias[i + 1]!, troca.dias[i]!);
    }
  for (const d of troca.dias) {
    const outro = troca.tipo === "folgas" ? (outroDe.get(d) ?? d) : d;
    const a = redistribuir(
      linhaDe(d, troca.para.id),
      troca.tipo === "feriado" ? null : linhaDe(outro, troca.de.id),
      p,
    );
    const b = redistribuir(
      linhaDe(d, troca.de.id),
      troca.tipo === "feriado" ? null : linhaDe(outro, troca.para.id),
      p,
    );
    avisos.push(...a.avisos, ...b.avisos);
    const linhas = novos[d]!;
    const posA = linhas.findIndex((l) => l.employee_id === troca.de.id);
    const posB = linhas.findIndex((l) => l.employee_id === troca.para.id);
    const novoA: LinhaDoDia | null = a.horas
      ? { employee_id: troca.de.id, nome: troca.de.nome, horas: a.horas }
      : null;
    const novoB: LinhaDoDia | null = b.horas
      ? { employee_id: troca.para.id, nome: troca.para.nome, horas: b.horas }
      : null;
    // Cada um na posição em que estava; quem entra, na posição de quem saiu.
    const resultado: (LinhaDoDia | null)[] = [...linhas];
    if (posA >= 0) resultado[posA] = novoA ?? (posB < 0 ? novoB : null);
    if (posB >= 0) resultado[posB] = novoB ?? (posA < 0 ? novoA : null);
    if (posA < 0 && posB >= 0 && novoA && novoB) resultado.push(novoA);
    if (posB < 0 && posA >= 0 && novoA && novoB) resultado.push(novoB);
    novos[d] = resultado.filter((l): l is LinhaDoDia => !!l);
  }
  return { dias: novos, avisos: [...new Set(avisos)] };
}

/** O que impede a troca (as mesmas regras do banco), ou nada. */
export function problemaDaTroca(
  dias: DiasDaSemana,
  troca: { de: string; para: string | null; dias: number[]; tipo: TipoDeTroca },
  datas: string[], // a data de cada dia da troca
  hoje: string,
): string | null {
  if (!troca.para) return "Escolha com quem trocar.";
  if (troca.para === troca.de) return "Escolha outra pessoa.";
  if (
    troca.tipo === "folgas"
      ? troca.dias.length !== 2 || troca.dias[0] === troca.dias[1]
      : troca.dias.length !== 1
  )
    return troca.tipo === "folgas" ? "Escolha dois dias diferentes." : "Escolha o dia.";
  if (datas.some((d) => d < hoje)) return "Escolha dias a partir de hoje.";
  const esta = (d: number, id: string) => dias[d]?.some((l) => l.employee_id === id) ?? false;
  if (troca.dias.every((d) => !esta(d, troca.de) && !esta(d, troca.para!)))
    return "Nenhum dos dois está na escala nesse dia.";
  if (troca.tipo === "feriado") {
    if (!esta(troca.dias[0]!, troca.de)) return "Você não está na escala desse dia.";
    if (esta(troca.dias[0]!, troca.para))
      return "Essa pessoa já está na escala desse dia: use “Trocar os horários”.";
  }
  return null;
}

/** O "Como fica", em uma linha (para a mensagem e para a tela). */
export function resumoDaJornada(
  horas: Horas | null | undefined,
  p: Papeis,
  nomeDaFaixa: (id: string) => string | undefined,
): string {
  if (!horas || !horas.some(Boolean)) return "fora da escala";
  if (!horas.some((h) => h && (p.trabalho.has(h) || h === p.pausa)))
    return nomeDaFaixa(horas.find(Boolean)!)?.toLowerCase() ?? "fora";
  const ks = horas.map((h, k) => (h ? k : -1)).filter((k) => k >= 0);
  return `${6 + ks[0]!}h às ${6 + ks[ks.length - 1]! + 1}h`;
}

// ---------- O pedido pelo dia (13/10/2026): o que cada pessoa faz num dia, e os dias que servem ----------
export type Estado = "trabalha" | "folga" | "fora";
export type ContextoDasTrocas = {
  hoje: string;
  /** A folga fixa de cada pessoa (seg = 0 ... dom = 6). */
  folgas: Map<string, number[]>;
  /** As semanas publicadas (pelo início), com a escala de cada dia. */
  publicadas: Map<string, DiasDaSemana>;
  feriados: Set<string>;
  siglas: Map<string, Sigla>;
};
export type ModoDaFolga = "um" | "dois";
const diaDaSemana = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
export const diasDaSemanaDe = (iso: string) =>
  Array.from({ length: 7 }, (_, i) => dataDoDia(segundaDaSemana(iso), i));

/** Numa semana publicada, a escala; nas outras, a folga fixa (a MESMA regra do banco). */
export function estadoNoDia(ctx: ContextoDasTrocas, emp: string, data: string): Estado {
  const semana = ctx.publicadas.get(segundaDaSemana(data));
  if (semana) {
    const linha = semana[diaDaSemana(data)]?.find((l) => l.employee_id === emp);
    if (!linha) return "fora";
    const p = papeisDasSiglas(ctx.siglas);
    return linha.horas.some((h) => h && (p.trabalho.has(h) || h === p.pausa))
      ? "trabalha"
      : "folga";
  }
  return (ctx.folgas.get(emp) ?? []).includes(diaDaSemana(data)) ? "folga" : "trabalha";
}
/** As folgas "de um lado só" na semana: as minhas que ela não tem, e as dela que eu não tenho. */
export function folgasExclusivas(ctx: ContextoDasTrocas, eu: string, ela: string, data: string) {
  const dias = diasDaSemanaDe(data);
  return {
    minhas: dias.filter(
      (x) => estadoNoDia(ctx, eu, x) === "folga" && estadoNoDia(ctx, ela, x) === "trabalha",
    ),
    delas: dias.filter(
      (x) => estadoNoDia(ctx, ela, x) === "folga" && estadoNoDia(ctx, eu, x) === "trabalha",
    ),
  };
}
/** Os feriados (a partir de hoje) com a escala publicada, em que eu estou escalado. */
export const feriadosComigo = (ctx: ContextoDasTrocas, eu: string) =>
  [...ctx.feriados]
    .filter(
      (s) =>
        s >= ctx.hoje &&
        ctx.publicadas.has(segundaDaSemana(s)) &&
        estadoNoDia(ctx, eu, s) === "trabalha",
    )
    .sort();
/** As opções do segundo dia, na folga de um dia. */
export function segundosDias(ctx: ContextoDasTrocas, eu: string, ela: string, dia: string) {
  const { minhas, delas } = folgasExclusivas(ctx, eu, ela, dia);
  return (estadoNoDia(ctx, eu, dia) === "folga" ? delas : minhas).filter((x) => x >= ctx.hoje);
}
/** O dia serve para esse tipo de troca, com essa pessoa? (as mesmas regras do banco) */
export function diaServe(
  ctx: ContextoDasTrocas,
  eu: string,
  ela: string,
  tipo: TipoDeTroca,
  modo: ModoDaFolga,
  data: string,
): boolean {
  if (data < ctx.hoje) return false;
  const a = estadoNoDia(ctx, eu, data);
  const b = estadoNoDia(ctx, ela, data);
  if (tipo === "horarios") return a === "trabalha" && b === "trabalha";
  if (tipo === "feriado") return feriadosComigo(ctx, eu).includes(data) && b === "fora";
  if (!((a === "folga" && b === "trabalha") || (a === "trabalha" && b === "folga"))) return false;
  if (modo === "um") return segundosDias(ctx, eu, ela, data).length > 0;
  const { minhas, delas } = folgasExclusivas(ctx, eu, ela, data);
  return (
    minhas.length > 0 &&
    minhas.length === delas.length &&
    [...minhas, ...delas].every((x) => x >= ctx.hoje)
  );
}
/** Como ficam as folgas da semana (as datas de cada uma, antes e depois). */
export function comoFicamAsFolgas(
  ctx: ContextoDasTrocas,
  eu: string,
  ela: string,
  modo: ModoDaFolga,
  dia: string,
  dia2: string | null,
) {
  const dias = diasDaSemanaDe(dia);
  const antesMinhas = dias.filter((x) => estadoNoDia(ctx, eu, x) === "folga");
  const antesDelas = dias.filter((x) => estadoNoDia(ctx, ela, x) === "folga");
  const { minhas, delas } = folgasExclusivas(ctx, eu, ela, dia);
  if (modo === "dois")
    return {
      antesMinhas,
      antesDelas,
      depoisMinhas: [...antesMinhas.filter((x) => !minhas.includes(x)), ...delas].sort(),
      depoisDelas: [...antesDelas.filter((x) => !delas.includes(x)), ...minhas].sort(),
    };
  const euFolgo = estadoNoDia(ctx, eu, dia) === "folga";
  const [minha, dela] = euFolgo ? [dia, dia2] : [dia2, dia];
  return {
    antesMinhas,
    antesDelas,
    depoisMinhas: antesMinhas.map((x) => (x === minha && dela ? dela : x)).sort(),
    depoisDelas: antesDelas.map((x) => (x === dela && minha ? minha : x)).sort(),
  };
}
/** Os dias da troca (para o "Como fica" de uma semana publicada): nas folgas, em pares. */
export function diasDaTroca(
  ctx: ContextoDasTrocas,
  eu: string,
  ela: string,
  tipo: TipoDeTroca,
  modo: ModoDaFolga,
  dia: string,
  dia2: string | null,
): number[] {
  if (tipo !== "folgas") return [diaDaSemana(dia)];
  if (modo === "um") return dia2 ? [diaDaSemana(dia), diaDaSemana(dia2)] : [];
  const { minhas, delas } = folgasExclusivas(ctx, eu, ela, dia);
  return minhas.flatMap((x, i) => [diaDaSemana(x), diaDaSemana(delas[i]!)]);
}
