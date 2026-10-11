/**
 * A escala e as férias no QualityHUB (11/10/2026): as regras da tela, puras (sem
 * rede), para serem testadas. A planilha deixou de existir: tudo vem do banco.
 *
 * Uma semana tem 7 dias (0 = segunda ... 6 = domingo), e cada pessoa de um dia tem
 * 16 horas, das 6h às 21h, cada uma com uma sigla (o id dela) ou vazia.
 */
export const HORA_INICIAL = 6;
export const QUANTAS_HORAS = 16;
export const HORAS = Array.from({ length: QUANTAS_HORAS }, (_, i) => HORA_INICIAL + i);
export const DIAS_DA_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"] as const;
export const DIAS_POR_EXTENSO = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;
export const MESES_POR_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export type Sigla = {
  id: string;
  sigla: string;
  cor: string;
  significado: string;
  conta_como_trabalho: boolean;
  em_atendimento: boolean;
  faixa: boolean;
  ordem: number;
};
export type Horas = (string | null)[]; // 16 posições: o id da sigla, ou nada
export type LinhaDoDia = { employee_id: string; nome: string; horas: Horas };
/** A semana na tela: as linhas de cada dia, na ordem. */
export type DiasDaSemana = LinhaDoDia[][];

export const horasVazias = (): Horas => Array.from({ length: QUANTAS_HORAS }, () => null);

// ---------- As datas (sempre no fuso de Fortaleza, como o resto do sistema) ----------
export const hojeIso = (agora: Date = new Date()) =>
  agora.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
const deIso = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (iso: string, n: number) => {
  const d = deIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return paraIso(d);
};
/** A segunda-feira da semana de uma data. */
export function segundaDaSemana(iso: string): string {
  const dia = deIso(iso).getUTCDay(); // 0 = domingo
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}
export const dataDoDia = (inicio: string, dia: number) => somarDias(inicio, dia);
export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const periodoDaSemana = (inicio: string) =>
  `${dataCurta(inicio)} a ${dataCurta(somarDias(inicio, 6))}`;

// ---------- As contas: as horas de trabalho e o "Online" ----------
export function horasDeTrabalho(horas: Horas, siglas: Map<string, Sigla>): number {
  return horas.filter((h) => h && siglas.get(h)?.conta_como_trabalho).length;
}
/** Quantas pessoas estão em atendimento em cada hora (a linha "Online"). */
export function onlinePorHora(linhas: LinhaDoDia[], siglas: Map<string, Sigla>): number[] {
  return HORAS.map(
    (_, k) => linhas.filter((l) => l.horas[k] && siglas.get(l.horas[k]!)?.em_atendimento).length,
  );
}
/** Os avisos de uma pessoa no dia: sem pausa (6 horas ou mais de trabalho), ou mais de 8 horas. */
export function avisoDaPessoa(
  horas: Horas,
  siglas: Map<string, Sigla>,
): "sem pausa" | "mais de 8 h" | null {
  const trabalho = horasDeTrabalho(horas, siglas);
  const temPausa = horas.some((h) => h && siglas.get(h)?.sigla.toLowerCase() === "p");
  if (trabalho >= 6 && !temPausa) return "sem pausa";
  if (trabalho > 8) return "mais de 8 h";
  return null;
}

/** As células de uma linha: as faixas (folga, férias) seguidas numa célula só. */
export function celulasDaLinha(
  horas: Horas,
  siglas: Map<string, Sigla>,
): { sigla: string | null; colunas: number; inicio: number }[] {
  const saida: { sigla: string | null; colunas: number; inicio: number }[] = [];
  for (let i = 0; i < horas.length; i++) {
    const h = horas[i] ?? null;
    let j = i;
    if (h && siglas.get(h)?.faixa) while (j + 1 < horas.length && horas[j + 1] === h) j++;
    saida.push({ sigla: h, colunas: j - i + 1, inicio: i });
    i = j;
  }
  return saida;
}

/** O "Meu dia": as horas seguidas com a mesma atividade viram um bloco ("8h às 12h"). */
export function blocosDoDia(horas: Horas): { sigla: string; de: number; ate: number }[] {
  const blocos: { sigla: string; de: number; ate: number }[] = [];
  horas.forEach((h, i) => {
    if (!h) return;
    const ult = blocos[blocos.length - 1];
    if (ult && ult.sigla === h && ult.ate === HORAS[i]) ult.ate = HORAS[i]! + 1;
    else blocos.push({ sigla: h, de: HORAS[i]!, ate: HORAS[i]! + 1 });
  });
  return blocos;
}

/** A cor da letra pela cor da célula: escura nas claras, branca nas escuras. */
export function corDoTexto(fundo: string | null | undefined): string {
  const n = parseInt(
    String(fundo ?? "")
      .replace("#", "")
      .slice(0, 6),
    16,
  );
  if (Number.isNaN(n)) return "#0D0F0D";
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luz > 0.45 ? "#0D0F0D" : "#FFFFFF";
}

/** O nome curto: o primeiro nome; com dois iguais no time, o primeiro nome e a inicial do último. */
export function nomeCurto(nome: string, todos: string[]): string {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? nome;
  const repetido =
    todos.filter((t) => t.trim().split(/\s+/)[0]?.toLowerCase() === primeiro.toLowerCase()).length >
    1;
  return repetido && partes.length > 1 ? `${primeiro} ${partes[partes.length - 1]![0]}.` : primeiro;
}

// ---------- A montagem: as operações do ADM (todas devolvem uma cópia nova) ----------
const copiaDoDia = (linhas: LinhaDoDia[]) => linhas.map((l) => ({ ...l, horas: [...l.horas] }));

export function definirHora(
  linhas: LinhaDoDia[],
  linha: number,
  hora: number,
  sigla: string | null,
): LinhaDoDia[] {
  const novo = copiaDoDia(linhas);
  if (novo[linha]) novo[linha]!.horas[hora] = sigla;
  return novo;
}
/** Tirar uma pessoa do dia (como numa escala de feriado). */
export const tirarDoDia = (linhas: LinhaDoDia[], linha: number) =>
  copiaDoDia(linhas).filter((_, i) => i !== linha);
/** Adicionar uma pessoa: a ordem é livre, então ela entra no FIM da lista. */
export function adicionarAoDia(
  linhas: LinhaDoDia[],
  pessoa: { employee_id: string; nome: string },
): LinhaDoDia[] {
  if (linhas.some((l) => l.employee_id === pessoa.employee_id)) return copiaDoDia(linhas);
  return [...copiaDoDia(linhas), { ...pessoa, horas: horasVazias() }];
}
/** As setinhas: troca a pessoa de lugar com a de cima (-1) ou a de baixo (+1). */
export function moverNoDia(linhas: LinhaDoDia[], linha: number, para: -1 | 1): LinhaDoDia[] {
  const novo = copiaDoDia(linhas);
  const alvo = linha + para;
  if (alvo < 0 || alvo >= novo.length) return novo;
  [novo[linha], novo[alvo]] = [novo[alvo]!, novo[linha]!];
  return novo;
}
/** Copiar um dia para outros dias da semana (os dias marcados são substituídos). */
export function copiarDia(dias: DiasDaSemana, de: number, para: number[]): DiasDaSemana {
  return dias.map((linhas, i) =>
    para.includes(i) && i !== de ? copiaDoDia(dias[de] ?? []) : copiaDoDia(linhas),
  );
}
export const diaTemEscala = (linhas: LinhaDoDia[]) => linhas.some((l) => l.horas.some(Boolean));

// ---------- As férias ----------
/** As datas de uma seleção (arrastando): de um dia a outro do mesmo mês, sem os dias que não existem. */
export function datasDaSelecao(ano: number, mes: number, de: number, ate: number): string[] {
  const [a, b] = [Math.min(de, ate), Math.max(de, ate)];
  const datas: string[] = [];
  for (let d = a; d <= b; d++) {
    const data = new Date(Date.UTC(ano, mes, d));
    if (data.getUTCMonth() === mes) datas.push(paraIso(data));
  }
  return datas;
}
/** As datas de um período (de, até), atravessando os meses. */
export function datasDoPeriodo(de: string, ate: string): string[] {
  if (!de || !ate || ate < de) return [];
  const datas: string[] = [];
  for (let d = de; d <= ate && datas.length <= 366; d = somarDias(d, 1)) datas.push(d);
  return datas;
}
/** Os períodos de uma pessoa: os dias seguidos viram um período ("9 a 13 de novembro"). */
export function periodosDasDatas(datas: string[]): { de: string; ate: string }[] {
  const ordenadas = [...new Set(datas)].sort();
  const periodos: { de: string; ate: string }[] = [];
  for (const d of ordenadas) {
    const ult = periodos[periodos.length - 1];
    if (ult && somarDias(ult.ate, 1) === d && ult.ate.slice(5, 7) === d.slice(5, 7)) ult.ate = d;
    else periodos.push({ de: d, ate: d });
  }
  return periodos;
}
export function textoDoPeriodo(p: { de: string; ate: string }): string {
  const mes = MESES_POR_EXTENSO[Number(p.de.slice(5, 7)) - 1];
  const d1 = Number(p.de.slice(8, 10));
  const d2 = Number(p.ate.slice(8, 10));
  return d1 === d2 ? `${d1} de ${mes}` : `${d1} a ${d2} de ${mes}`;
}

// ---------- Os pedidos de férias: os avisos (os mesmos para o colaborador e o ADM) ----------
export type AvisosDoPedido = {
  feriados: string[]; // os dias do período que são feriado
  cheios: string[]; // os dias com 2 pessoas (ou mais) já de férias, fora a própria pessoa
  jaDeFerias: boolean; // a pessoa já está de férias em TODOS os dias
  passado: boolean; // algum dia é hoje ou já passou
};
export function avisosDoPedido(
  datas: string[],
  dados: { feriados: Set<string>; porDia: Map<string, { employee_id: string }[]> },
  pessoa: string | null,
  hoje: string = hojeIso(),
): AvisosDoPedido {
  const outras = (d: string) =>
    (dados.porDia.get(d) ?? []).filter((p) => p.employee_id !== pessoa).length;
  const minhas = datas.filter((d) =>
    (dados.porDia.get(d) ?? []).some((p) => p.employee_id === pessoa),
  );
  return {
    feriados: datas.filter((d) => dados.feriados.has(d)),
    cheios: datas.filter((d) => outras(d) >= 2),
    jaDeFerias: datas.length > 0 && minhas.length === datas.length,
    passado: datas.some((d) => d <= hoje),
  };
}

// ---------- Os anos das férias: o atual e os dois seguintes (avança sozinho a cada ano) ----------
export const ANOS_A_FRENTE = 2;
export function anosDasFerias(hoje: string = hojeIso(), comOAnterior = false): number[] {
  const ano = Number(hoje.slice(0, 4));
  return Array.from(
    { length: ANOS_A_FRENTE + 1 + (comOAnterior ? 1 : 0) },
    (_, i) => ano - (comOAnterior ? 1 : 0) + i,
  );
}
/** O último dia que pode ser pedido: o fim do segundo ano seguinte. */
export const ultimoDiaDosPedidos = (hoje: string = hojeIso()) =>
  `${Number(hoje.slice(0, 4)) + ANOS_A_FRENTE}-12-31`;
