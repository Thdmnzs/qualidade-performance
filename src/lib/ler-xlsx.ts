/**
 * A leitura de um XLSX (21/10/2026), para a importação da escala: a PRIMEIRA aba, em linhas e células.
 *
 * Um XLSX é um arquivo compactado (zip) com textos em XML dentro. A descompactação é a SÍNCRONA da `fflate`: a
 * assíncrona usa um trabalhador em segundo plano (um Web Worker de um "blob:") nos arquivos acima de 512 KB, que a
 * política de segurança do site bloqueia, e a leitura ficava parada. Só são abertos os arquivos que interessam (a
 * aba e os textos dela); as imagens e as outras abas, que costumam deixar o arquivo grande, nem são descompactadas.
 */
import { strFromU8, unzipSync } from "fflate";

const xml = (texto: string) => new DOMParser().parseFromString(texto, "application/xml");
/** Os elementos de um nome, com ou sem o prefixo do espaço de nomes (alguns programas escrevem "x:c"). */
const todos = (raiz: Document | Element, nome: string) =>
  Array.from(raiz.getElementsByTagNameNS("*", nome));
/** "B5" → a coluna 1 (a partir de zero). */
const colunaDe = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
};
const textoDe = (el: Element) =>
  todos(el, "t")
    .map((t) => t.textContent ?? "")
    .join("");

export function lerXlsx(bytes: Uint8Array): (string | number | null)[][] {
  const abrir = (nomes: (n: string) => boolean) =>
    unzipSync(bytes, { filter: (f) => nomes(f.name) });
  // 1) Qual é a primeira aba: o "workbook" diz a ordem, e as "rels" dizem o arquivo de cada uma.
  const indice = abrir((n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels");
  const livro = indice["xl/workbook.xml"];
  if (!livro) throw new Error("O arquivo não é um XLSX.");
  const primeira = todos(xml(strFromU8(livro)), "sheet")[0];
  const id =
    primeira?.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    ) ?? primeira?.getAttribute("r:id");
  const rels = indice["xl/_rels/workbook.xml.rels"];
  const alvo =
    rels && id
      ? todos(xml(strFromU8(rels)), "Relationship")
          .find((r) => r.getAttribute("Id") === id)
          ?.getAttribute("Target")
      : null;
  const caminho = alvo
    ? alvo.startsWith("/")
      ? alvo.slice(1)
      : `xl/${alvo.replace(/^\.\//, "")}`
    : "xl/worksheets/sheet1.xml";
  // 2) A aba e os textos compartilhados (o XLSX guarda cada texto uma vez só, e a célula aponta para ele).
  const partes = abrir((n) => n === caminho || n === "xl/sharedStrings.xml");
  const aba = partes[caminho];
  if (!aba) throw new Error("A primeira aba não foi encontrada no arquivo.");
  const compartilhados = partes["xl/sharedStrings.xml"]
    ? todos(xml(strFromU8(partes["xl/sharedStrings.xml"])), "si").map(textoDe)
    : [];
  // 3) As linhas e as células, cada uma no lugar dela (uma célula vazia não aparece no XML).
  const linhas: (string | number | null)[][] = [];
  for (const row of todos(xml(strFromU8(aba)), "row")) {
    const r = Number(row.getAttribute("r") ?? linhas.length + 1) - 1;
    const linha: (string | number | null)[] = [];
    let proxima = 0;
    for (const c of todos(row, "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? colunaDe(ref) : proxima;
      proxima = col + 1;
      const tipo = c.getAttribute("t");
      const v = todos(c, "v")[0]?.textContent ?? null;
      let valor: string | number | null = null;
      if (tipo === "s") valor = v === null ? null : (compartilhados[Number(v)] ?? null);
      else if (tipo === "inlineStr") valor = textoDe(c);
      else if (tipo === "str" || tipo === "e") valor = v;
      else if (tipo === "b") valor = v === "1" ? "TRUE" : "FALSE";
      else if (v !== null && v !== "") valor = Number.isFinite(Number(v)) ? Number(v) : v;
      linha[col] = valor;
    }
    linhas[r] = Array.from(linha, (x) => x ?? null);
  }
  return Array.from(linhas, (l) => l ?? []);
}
