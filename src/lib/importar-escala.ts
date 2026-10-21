/**
 * A importação da escala (20/10/2026): a planilha da supervisão (CSV ou XLSX, no formato da "escala cx") lida e
 * montada como a semana do CX Hub. Puro, para testes. O formato: um bloco por dia ("segunda", "terça"...), e, em
 * cada um, uma linha por pessoa: o apelido, as horas do dia, e a sigla de cada hora, das 6h às 21h.
 */
import { HORA_INICIAL, QUANTAS_HORAS, type Horas } from "@/lib/escala";

export const DIAS_DA_PLANILHA = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;
const DIA_DO_NOME: Record<string, number> = {
  segunda: 0,
  terça: 1,
  terca: 1,
  quarta: 2,
  quinta: 3,
  sexta: 4,
  sábado: 5,
  sabado: 5,
  domingo: 6,
};
const RESERVADOS = new Set(["demanda", "analistas online", "analista", ""]);
const normal = (t: unknown) =>
  String(t ?? "")
    .replace(/\s+/g, " ")
    .trim();
const chave = (t: string) => normal(t).toLowerCase();

export type LinhaLida = { apelido: string; siglas: (string | null)[] };
export type Problema = {
  tipo: "celula";
  dia: number;
  apelido: string;
  hora: number;
  valor: string;
};
export type PlanilhaLida = { dias: LinhaLida[][]; problemas: Problema[] };

/** Um CSV em linhas e células (com as aspas, as vírgulas dentro delas, e o fim de linha do Windows). */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  const t = texto.replace(/^\uFEFF/, "");
  // Fecha a célula atual (e, no fim de uma linha, a linha também).
  const fecharCelula = () => {
    linha.push(celula);
    celula = "";
  };
  const fecharLinha = () => {
    fecharCelula();
    linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"'; // duas aspas dentro das aspas: uma aspa no texto
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") fecharCelula();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++; // o fim de linha do Windows
      fecharLinha();
    } else celula += c;
  }
  if (celula || linha.length) fecharLinha();
  return linhas;
}

/** A planilha em dias e pessoas. Uma célula com algo que não é uma sigla (como uma vírgula solta) vira um problema. */
export function lerPlanilhaDaEscala(linhas: unknown[][]): PlanilhaLida {
  const dias: LinhaLida[][] = Array.from({ length: 7 }, () => []);
  const problemas: Problema[] = [];
  let dia: number | null = null;
  for (const l of linhas) {
    const primeira = chave(String(l[0] ?? ""));
    if (primeira in DIA_DO_NOME) {
      dia = DIA_DO_NOME[primeira]!;
      continue;
    }
    // Uma pessoa: o apelido na primeira coluna e as horas do dia (um número) na segunda.
    if (dia === null || RESERVADOS.has(primeira) || !/^\d+([.,]\d+)?$/.test(normal(l[1]))) continue;
    const apelido = normal(l[0]);
    const siglas = Array.from({ length: QUANTAS_HORAS }, (_, k) => {
      const valor = normal(l[2 + k]);
      if (!valor) return null;
      if (!/[\p{L}\p{N}]/u.test(valor)) {
        problemas.push({ tipo: "celula", dia: dia!, apelido, hora: HORA_INICIAL + k, valor });
        return null;
      }
      return valor;
    });
    dias[dia]!.push({ apelido, siglas });
  }
  return { dias, problemas };
}

export type Sigla = { id: string; sigla: string };
/** O que fazer com uma sigla que o CX Hub não tem: tratar como outra (o id dela) ou deixar a hora vazia. */
export type Decisao = { para: string } | "vazio";
export type Montagem = {
  dias: Record<string, { employee_id: string; horas: Horas }[]>;
  semDono: string[]; // os apelidos que ainda não estão ligados a ninguém
  desconhecidas: string[]; // as siglas que o CX Hub não tem (e que ainda não têm decisão)
};

/**
 * A semana montada: cada apelido na pessoa ligada, cada sigla no id dela. Uma folga ou as férias, que a planilha
 * marca só na primeira hora, ocupam o dia inteiro (como a escala do CX Hub as guarda).
 */
export function montarSemana(p: {
  lida: PlanilhaLida;
  siglas: Sigla[];
  ligacoes: Record<string, string>; // o apelido (em minúsculas) → o id da pessoa
  decisoes?: Record<string, Decisao>; // a sigla desconhecida (em minúsculas) → a decisão
}): Montagem {
  const porSigla = new Map(p.siglas.map((s) => [chave(s.sigla), s.id]));
  const diaInteiro = new Set(
    ["folga", "férias", "ferias"].map((s) => porSigla.get(s)).filter(Boolean) as string[],
  );
  const semDono = new Set<string>();
  const desconhecidas = new Set<string>();
  const dias: Montagem["dias"] = {};
  p.lida.dias.forEach((linhas, d) => {
    dias[String(d)] = [];
    for (const l of linhas) {
      const pessoa = p.ligacoes[chave(l.apelido)];
      if (!pessoa) semDono.add(l.apelido);
      const horas: Horas = l.siglas.map((s) => {
        if (!s) return null;
        const id = porSigla.get(chave(s));
        if (id) return id;
        const decisao = p.decisoes?.[chave(s)];
        if (!decisao) desconhecidas.add(s);
        return decisao && decisao !== "vazio" ? decisao.para : null;
      });
      const preenchidas = horas.filter(Boolean);
      const unica =
        preenchidas.length === 1 && diaInteiro.has(preenchidas[0]!) ? preenchidas[0]! : null;
      if (pessoa)
        dias[String(d)]!.push({
          employee_id: pessoa,
          horas: unica ? horas.map(() => unica) : horas,
        });
    }
  });
  return { dias, semDono: [...semDono], desconhecidas: [...desconhecidas] };
}

/**
 * A ligação automática: os apelidos já guardados, e o primeiro nome (ou o apelido da planilha dos indicadores)
 * quando ele é único no time.
 */
export function ligarApelidos(
  apelidos: string[],
  pessoas: { id: string; nome: string; nome_na_planilha?: string | null }[],
  guardados: Record<string, string>,
): Record<string, string> {
  const ligacoes: Record<string, string> = {};
  for (const a of apelidos) {
    const k = chave(a);
    if (guardados[k]) {
      ligacoes[k] = guardados[k];
      continue;
    }
    const candidatos = pessoas.filter(
      (p) =>
        chave(p.nome.split(" ")[0]!) === k ||
        (p.nome_na_planilha && chave(p.nome_na_planilha) === k),
    );
    if (candidatos.length === 1) ligacoes[k] = candidatos[0]!.id;
  }
  return ligacoes;
}
