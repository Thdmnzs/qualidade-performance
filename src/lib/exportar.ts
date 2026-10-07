/**
 * Exportar os dados do Painel (07/10/2026): CSV que abre direto no Excel em
 * português (separador ";", vírgula nos decimais e a marca BOM, para os acentos
 * saírem certos). Puro, para ser testado à parte.
 */
export type Coluna<T> = { rotulo: string; valor: (linha: T) => unknown };

function celula(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    s = String(Math.round(v * 100) / 100).replace(".", ",");
  } else if (typeof v === "boolean") {
    s = v ? "sim" : "não";
  } else {
    s = String(v);
  }
  // Fórmulas no Excel começam com estes sinais: um texto vindo de fora não pode virar fórmula.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** O conteúdo do CSV (com a marca BOM no começo). */
export function paraCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.rotulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(";"));
  return "\ufeff" + [cabecalho, ...corpo].join("\r\n");
}

/** "evolucao-da-produtividade-2026-10-07" (sem acentos, sem espaços). */
export function nomeDoArquivo(titulo: string, hoje = new Date()): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return `${base}-${dia}`;
}
