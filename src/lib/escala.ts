/**
 * Leitura da planilha da escala (07/10/2026): as horas de quali de cada pessoa.
 *
 * Estrutura (a planilha "escala cx"):
 *   - Uma aba por semana: "SEMANA 13/11 A 19/11" (sem o ano).
 *   - Dentro dela, um bloco por dia: a linha com o nome do dia ("SEGUNDA",
 *     "QUARTA 15/11 PROCLAMAÇÃO DA REPÚBLICA"...), a linha "analista | hr/dia |
 *     7h | 8h | ... | 22h" e uma linha por pessoa, com a atividade de cada hora.
 *   - Cada célula "quali" é 1 hora de task de qualidade.
 * Puro (sem rede), para ser testado com a estrutura real.
 */
export type AbaDaEscala = { titulo: string; linhas: (string | number | null | undefined)[][] };
export type HorasDoDia = { nome: string; dia: string; horas: number; aba: string };
export type LeituraDaEscala = { linhas: HorasDoDia[]; dias: string[]; abas: number };

const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const IGNORAR = new Set(["c. demanda", "analistas online", "analista", "hr/dia"]);

export const normalizar = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Um "dd/mm" sem ano: o ano que deixa a data mais perto da referência. */
function comAno(dia: number, mes: number, referencia: Date): Date | null {
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const opcoes = [-1, 0, 1].map((d) => new Date(referencia.getFullYear() + d, mes - 1, dia));
  const validas = opcoes.filter((o) => o.getDate() === dia && o.getMonth() === mes - 1);
  if (!validas.length) return null;
  return validas.sort(
    (a, b) =>
      Math.abs(a.getTime() - referencia.getTime()) - Math.abs(b.getTime() - referencia.getTime()),
  )[0]!;
}

/** O primeiro dia da semana da aba ("SEMANA 13/11 A 19/11"), ou null se não for uma aba de semana. */
export function semanaDaAba(titulo: string, hoje: Date): Date | null {
  const m = normalizar(titulo).match(/semana\s+(\d{1,2})\/(\d{1,2})\s+a\s+(\d{1,2})\/(\d{1,2})/);
  return m ? comAno(Number(m[1]), Number(m[2]), hoje) : null;
}

/** As horas de quali de uma aba, e todos os dias lidos nela. */
export function lerAba(aba: AbaDaEscala, hoje: Date): { linhas: HorasDoDia[]; dias: string[] } {
  const inicio = semanaDaAba(aba.titulo, hoje);
  if (!inicio) return { linhas: [], dias: [] };
  const linhas: HorasDoDia[] = [];
  const dias: string[] = [];
  let dia: string | null = null;
  let colNome = -1;
  let colsHoras: number[] = [];
  for (const linha of aba.linhas) {
    const celulas = linha.map(normalizar);
    // Início de um dia: o nome do dia nas primeiras colunas (com ou sem data e feriado).
    const iDia = celulas.slice(0, 4).findIndex((c) => DIAS.some((d) => c.startsWith(d)));
    if (iDia >= 0) {
      const texto = celulas[iDia]!;
      const deslocamento = DIAS.findIndex((d) => texto.startsWith(d));
      const dm = texto.match(/(\d{1,2})\/(\d{1,2})/);
      const data =
        (dm && comAno(Number(dm[1]), Number(dm[2]), inicio)) ||
        new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + deslocamento);
      dia = iso(data);
      if (!dias.includes(dia)) dias.push(dia);
      colsHoras = [];
      continue;
    }
    // O cabeçalho das horas: "analista | hr/dia | 7h | 8h | ...".
    const iAnalista = celulas.indexOf("analista");
    if (iAnalista >= 0) {
      colNome = iAnalista;
      colsHoras = celulas.map((c, i) => (/^\d{1,2}h$/.test(c) ? i : -1)).filter((i) => i >= 0);
      continue;
    }
    if (!dia || !colsHoras.length || colNome < 0) continue;
    const nome = String(linha[colNome] ?? "").trim();
    if (!nome || IGNORAR.has(normalizar(nome))) continue;
    const horas = colsHoras.filter((i) => celulas[i] === "quali").length;
    if (horas > 0) linhas.push({ nome, dia, horas, aba: aba.titulo });
  }
  return { linhas, dias };
}

/** Todas as abas de semana dentro da janela (dos últimos 120 dias até daqui a 14). */
export function lerEscala(abas: AbaDaEscala[], hoje: Date, janelaDias = 120): LeituraDaEscala {
  const de = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - janelaDias);
  const ate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 14);
  const linhas: HorasDoDia[] = [];
  const dias = new Set<string>();
  let lidas = 0;
  for (const aba of abas) {
    const inicio = semanaDaAba(aba.titulo, hoje);
    if (!inicio || inicio < de || inicio > ate) continue;
    lidas++;
    const r = lerAba(aba, hoje);
    linhas.push(...r.linhas);
    r.dias.forEach((d) => dias.add(d));
  }
  return { linhas, dias: [...dias].sort(), abas: lidas };
}

/** As abas que a leitura deve buscar na planilha (para não baixar as antigas). */
export const abasNaJanela = (titulos: string[], hoje: Date, janelaDias = 120) =>
  titulos.filter((t) => lerEscala([{ titulo: t, linhas: [] }], hoje, janelaDias).abas === 1);
