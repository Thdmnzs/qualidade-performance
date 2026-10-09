/**
 * A interpretação da planilha "escala cx" (10/10/2026). Puro (sem rede), para ser
 * testado com a estrutura real da planilha (os prints de 05 a 11/10 e "férias 26").
 *
 * A aba da semana ("05 a 11/10"):
 *   - um bloco por dia: a linha com o nome do dia na coluna A ("segunda", "terça"...),
 *     a linha "analista | hr/dia | 6h | 7h ... 21h" e uma linha por pessoa (nome na A);
 *   - cada célula é uma hora, com a sigla da atividade e a cor de fundo;
 *   - folga e férias são FAIXAS mescladas, por cima de várias horas.
 * A aba de férias ("férias 26"): os dias (1 a 31) nas linhas, os meses ("JAN/26") nas
 * colunas, e em cada célula os nomes (separados por "/") ou "feriado".
 */
export type Celula = { texto: string | null; cor: string | null; mescla?: number };
export type AbaBruta = {
  titulo: string;
  linhas: Celula[][];
  mesclas: { r0: number; r1: number; c0: number; c1: number }[];
};

export type HoraDaPessoa = { texto: string; cor: string | null; mescla: number | null } | null;
export type PessoaDoDia = { nome: string; horas: HoraDaPessoa[] };
export type DiaDaSemana = {
  nome: string;
  titulo: string;
  data: string | null;
  pessoas: PessoaDoDia[];
};
export type Semana = { horas: number[]; dias: DiaDaSemana[] };

const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const LINHAS_DE_APOIO = new Set(["analistas online", "analista", "c. demanda", "c demanda", "dia"]);

export const normalizar = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------- As mesclas: o texto e a cor da célula de cima à esquerda valem para todas ----------
export function expandirMesclas(aba: AbaBruta): Celula[][] {
  const linhas = aba.linhas.map((l) => l.map((c) => ({ ...c })));
  aba.mesclas.forEach((m, id) => {
    const origem = aba.linhas[m.r0]?.[m.c0];
    if (!origem) return;
    for (let r = m.r0; r < m.r1; r++) {
      linhas[r] ??= [];
      for (let c = m.c0; c < m.c1; c++)
        linhas[r]![c] = { texto: origem.texto, cor: origem.cor, mescla: id };
    }
  });
  return linhas;
}

// ---------- O período da aba: "05 a 11/10" (ou "28/09 a 04/10") ----------
export function periodoDaAba(titulo: string, hoje: Date): { inicio: string; fim: string } | null {
  const m = normalizar(titulo).match(/^(\d{1,2})(?:\/(\d{1,2}))?\s*a\s*(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const dFim = Number(m[3]);
  const mFim = Number(m[4]);
  const dIni = Number(m[1]);
  const mIni = m[2] ? Number(m[2]) : dIni > dFim ? mFim - 1 : mFim; // "28 a 04/10": o início é em setembro
  // O ano que deixa a semana mais perto de hoje (as abas não têm o ano).
  const candidatos = [-1, 0, 1].map((a) => new Date(hoje.getFullYear() + a, mFim - 1, dFim));
  const fim = candidatos.sort(
    (a, b) => Math.abs(a.getTime() - hoje.getTime()) - Math.abs(b.getTime() - hoje.getTime()),
  )[0]!;
  const inicio = new Date(fim.getFullYear() - (mIni > mFim ? 1 : 0), (mIni - 1 + 12) % 12, dIni);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
  return { inicio: iso(inicio), fim: iso(fim) };
}

/** A aba da semana de hoje; sem ela, a mais recente que já começou; sem nenhuma, a primeira. */
export function abaDaSemana(
  abas: { titulo: string; inicio: string; fim: string }[],
  hoje: Date,
): string | null {
  const h = iso(hoje);
  const atual = abas.find((a) => a.inicio <= h && h <= a.fim);
  if (atual) return atual.titulo;
  const passadas = abas.filter((a) => a.inicio <= h).sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
  return passadas[0]?.titulo ?? abas[0]?.titulo ?? null;
}

// ---------- A aba da semana ----------
export function lerSemana(aba: AbaBruta, hoje: Date): Semana {
  const linhas = expandirMesclas(aba);
  const periodo = periodoDaAba(aba.titulo, hoje);
  const dias: DiaDaSemana[] = [];
  let horas: number[] = [];
  let colunasDasHoras: number[] = [];
  let dia: DiaDaSemana | null = null;
  for (const linha of linhas) {
    const a = normalizar(linha[0]?.texto);
    const iDia = DIAS.findIndex((d) => a === d || a.startsWith(d + " ") || a.startsWith(d + "-"));
    if (iDia >= 0) {
      // O título do dia: o texto mais longo da linha (o "segunda feira", ou "quarta 15/11 proclamação...").
      const titulo = linha.map((c) => c?.texto ?? "").sort((x, y) => y.length - x.length)[0] ?? a;
      const data = periodo
        ? iso(new Date(new Date(periodo.inicio + "T12:00:00").getTime() + iDia * 86_400_000))
        : null;
      dia = { nome: DIAS[iDia]!, titulo: titulo.trim(), data, pessoas: [] };
      dias.push(dia);
      colunasDasHoras = [];
      continue;
    }
    if (a === "analista") {
      const novas: number[] = [];
      colunasDasHoras = [];
      linha.forEach((c, i) => {
        const m = normalizar(c?.texto).match(/^(\d{1,2})h$/);
        if (m) {
          colunasDasHoras.push(i);
          novas.push(Number(m[1]));
        }
      });
      if (novas.length) horas = novas;
      continue;
    }
    if (!dia || !colunasDasHoras.length || !a || LINHAS_DE_APOIO.has(a)) continue;
    const nome = String(linha[0]?.texto ?? "").trim();
    dia.pessoas.push({
      nome,
      horas: colunasDasHoras.map((i) => {
        const c = linha[i];
        const texto = String(c?.texto ?? "").trim();
        return texto ? { texto, cor: c?.cor ?? null, mescla: c?.mescla ?? null } : null;
      }),
    });
  }
  return { horas, dias };
}

// ---------- As horas, o "Online" e as siglas ----------
const NAO_CONTA = new Set(["p", "pausa", "folga", "ferias", "off", "ausente"]);
/** As horas de trabalho: tudo, menos a pausa e as ausências (as reuniões contam). */
export const horasDeTrabalho = (horas: HoraDaPessoa[]) =>
  horas.filter((h) => h && !NAO_CONTA.has(normalizar(h.texto))).length;
/** Em atendimento (o "i", de Intercom): é o que conta na linha "Online". */
export const emAtendimento = (h: HoraDaPessoa) => normalizar(h?.texto) === "i";

export const SIGNIFICADO: Record<string, string> = {
  i: "Intercom (atendimento)",
  rede: "Rede",
  log: "Logística",
  "f&r": "Fraude e Risco",
  cx: "CX (demandas dos supervisores)",
  cxtech: "CX Tech",
  auto: "Automação",
  quali: "Qualidade",
  "cob b2b": "Cobrança B2B",
  p: "Pausa",
  ferias: "Férias",
  off: "Ausente",
  folga: "Folga",
  mensal: "Reunião mensal de alinhamento",
  "1:1": "Feedback individual com o supervisor",
};
export const significado = (sigla: string) => SIGNIFICADO[normalizar(sigla)] ?? null;

/** A cor da letra pela cor da célula: escura nas claras, branca nas escuras. */
export function corDoTexto(fundo: string | null): string {
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

// ---------- A aba de férias ----------
export type DiaDeFerias = { pessoas: string[]; feriado: boolean };
export type Ferias = { ano: number | null; meses: string[]; dias: Record<string, DiaDeFerias> };

export function lerFerias(aba: AbaBruta): Ferias {
  const linhas = expandirMesclas(aba);
  let colunasDosMeses: { col: number; mes: number }[] = [];
  let colunaDoDia = -1;
  let ano: number | null = null;
  const dias: Record<string, DiaDeFerias> = {};
  const MESES = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  for (const linha of linhas) {
    const textos = linha.map((c) => normalizar(c?.texto));
    if (!colunasDosMeses.length) {
      const achados = textos
        .map((t, col) => ({
          col,
          m: t.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/?(\d{2,4})?$/),
        }))
        .filter((x) => x.m);
      if (achados.length >= 6) {
        colunasDosMeses = achados.map((x) => ({ col: x.col, mes: MESES.indexOf(x.m![1]!) }));
        const a = achados[0]!.m![2];
        ano = a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : null;
        colunaDoDia = textos.findIndex((t) => t === "dia");
        if (colunaDoDia < 0) colunaDoDia = Math.max(0, colunasDosMeses[0]!.col - 1);
      }
      continue;
    }
    const dia = Number(textos[colunaDoDia]);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) continue;
    for (const { col, mes } of colunasDosMeses) {
      const partes = String(linha[col]?.texto ?? "")
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);
      if (!partes.length) continue;
      const feriado = partes.some((p) => normalizar(p) === "feriado");
      const pessoas = partes.filter((p) => normalizar(p) !== "feriado");
      dias[`${mes}-${dia}`] = { pessoas, feriado };
    }
  }
  return { ano, meses: colunasDosMeses.map((m) => MESES[m.mes]!.toUpperCase()), dias };
}

// ---------- Quem é quem: o nome da planilha e o cadastro ----------
/**
 * O cadastro de um nome da planilha: o primeiro nome igual, ou o começo dele ("Fran"
 * para "Franciele"). Com dois cadastros possíveis, nenhum (para não destacar a pessoa errada).
 */
export function cadastroDoNome<T extends { nome: string }>(
  nomeNaPlanilha: string,
  cadastros: T[],
): T | null {
  const alvo = normalizar(nomeNaPlanilha);
  if (!alvo) return null;
  const primeiro = (c: T) => normalizar(c.nome).split(" ")[0] ?? "";
  const iguais = cadastros.filter((c) => primeiro(c) === alvo || normalizar(c.nome) === alvo);
  if (iguais.length === 1) return iguais[0]!;
  if (iguais.length > 1) return null;
  const comecam = cadastros.filter((c) => primeiro(c).startsWith(alvo) && alvo.length >= 3);
  return comecam.length === 1 ? comecam[0]! : null;
}
