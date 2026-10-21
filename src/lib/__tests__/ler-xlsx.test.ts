// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A versão da fflate DO NAVEGADOR (a que vai para o site): a do Node não usa o trabalhador em segundo plano, e não
// reproduziria o problema de 21/10/2026.
vi.mock(
  "fflate",
  async () => import(/* @vite-ignore */ `${process.cwd()}/node_modules/fflate/esm/browser.js`),
);
const { lerXlsx } = await import("../ler-xlsx");
const fflate = await import("fflate");
const FIXTURE = `${process.cwd()}/src/lib/__tests__/fixtures/escala-19-a-25-10.xlsx`;

// Como a CSP do navegador faz: o trabalhador é CRIADO sem erro, mas nunca carrega nem responde.
let criados = 0;
const original = { Worker: globalThis.Worker, url: URL.createObjectURL };
beforeAll(() => {
  globalThis.Worker = class {
    constructor() {
      criados++;
    }
    onmessage = null;
    onerror = null;
    postMessage() {}
    terminate() {}
    addEventListener() {}
  } as unknown as typeof Worker;
  URL.createObjectURL = () => "blob:bloqueado";
});
afterAll(() => {
  globalThis.Worker = original.Worker;
  URL.createObjectURL = original.url;
});
/** Um XLSX grande, como uma planilha real: a escala, e uma segunda aba com dados variados (mais de 512 KB compactado). */
function xlsxGrande() {
  const partes = fflate.unzipSync(new Uint8Array(readFileSync(FIXTURE)));
  let x = 7;
  const aleatorio = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const linha = (r: number) =>
    `<row r="${r}">${Array.from({ length: 30 }, (_, k) => `<c r="${String.fromCharCode(65 + (k % 26))}${r}"><v>${(aleatorio() * 100000).toFixed(4)}</v></c>`).join("")}</row>`;
  const aba2 = `<worksheet><sheetData>${Array.from({ length: 6000 }, (_, r) => linha(r + 1)).join("")}</sheetData></worksheet>`;
  return fflate.zipSync({ ...partes, "xl/worksheets/sheet2.xml": fflate.strToU8(aba2) });
}

describe("a leitura do XLSX", () => {
  const linhas = lerXlsx(new Uint8Array(readFileSync(FIXTURE)));
  it("a primeira aba (e não a segunda, a do resumo), linha por linha, com os números e os textos", () => {
    expect(linhas[0]!.slice(0, 5)).toEqual(["demanda", "", 2, 1, 2]); // a célula com um texto vazio, como no arquivo
    expect(linhas[4]!.slice(0, 3)).toEqual(["Ruby", 8, "folga"]);
    expect(linhas.flat()).not.toContain("outra aba");
  });
  it("as células ficam no lugar (uma linha com buracos não se desloca)", () => {
    expect(linhas[5]!.slice(0, 11)).toEqual([
      "Suelen",
      8,
      "i",
      "i",
      "i",
      "i",
      "P",
      "i",
      "cob B2B",
      "i",
      "i",
    ]);
  });
  it("um arquivo que não é XLSX é recusado", () => {
    expect(() => lerXlsx(new TextEncoder().encode("isto não é um xlsx"))).toThrow();
  });
});

describe("o XLSX grande, com o trabalhador bloqueado como no navegador (21/10/2026)", () => {
  it("é lido, e NENHUM trabalhador em segundo plano é criado", () => {
    const grande = xlsxGrande();
    expect(grande.length).toBeGreaterThan(512 * 1024); // acima do limite em que a descompactação assíncrona usaria um
    criados = 0;
    const linhas = lerXlsx(grande);
    expect(linhas.filter((l) => l.length).length).toBeGreaterThan(100);
    expect(linhas[5]![0]).toBe("Suelen");
    expect(criados).toBe(0);
  });
  it("a prova do problema: a descompactação assíncrona, com o mesmo arquivo, cria o trabalhador e fica parada", async () => {
    criados = 0;
    const resultado = await Promise.race([
      new Promise((ok) => fflate.unzip(xlsxGrande(), () => ok("leu"))),
      new Promise((ok) => setTimeout(() => ok("parada"), 1500)),
    ]);
    expect(resultado).toBe("parada");
    expect(criados).toBe(1);
  });
});
