import { describe, expect, it } from "vitest";
import { nomeDoArquivo, paraCsv } from "../exportar";

describe("paraCsv", () => {
  const linhas = [
    { quinzena: "2026-01 · Q1", valor: 7.236, elegivel: true },
    { quinzena: "2026-01 · Q2 (parcial)", valor: null, elegivel: false },
  ];
  const csv = paraCsv(linhas, [
    { rotulo: "Quinzena", valor: (l) => l.quinzena },
    { rotulo: "Produtividade", valor: (l) => l.valor },
    { rotulo: "Elegível", valor: (l) => l.elegivel },
  ]);
  it("abre no Excel em português: BOM, ';' e vírgula nos decimais", () => {
    expect(csv).toBe(
      "\ufeffQuinzena;Produtividade;Elegível\r\n2026-01 · Q1;7,24;sim\r\n2026-01 · Q2 (parcial);;não",
    );
  });
  it("textos com ';', aspas ou quebra de linha vão entre aspas", () => {
    const c = paraCsv(
      [{ t: 'faltou; a "nota"\nfinal' }],
      [{ rotulo: "Feedback", valor: (l) => l.t }],
    );
    expect(c.split("\r\n")[1]).toBe('"faltou; a ""nota""\nfinal"');
  });
  it("um texto que começa com '=' não vira fórmula no Excel", () => {
    const c = paraCsv(
      [{ t: '=HYPERLINK("x")' }, { t: "-1 de desconto" }],
      [{ rotulo: "Feedback", valor: (l) => l.t }],
    );
    expect(c.split("\r\n").slice(1)).toEqual(['"\'=HYPERLINK(""x"")"', "'-1 de desconto"]);
  });
  it("números negativos continuam números", () => {
    expect(paraCsv([{ v: -2.5 }], [{ rotulo: "V", valor: (l) => l.v }]).split("\r\n")[1]).toBe(
      "-2,5",
    );
  });
});

describe("nomeDoArquivo", () => {
  it("sem acentos nem espaços, com a data", () => {
    expect(nomeDoArquivo("Evolução do SLA (e-mail)", new Date(2026, 9, 7))).toBe(
      "evolucao-do-sla-e-mail-2026-10-07",
    );
  });
});
