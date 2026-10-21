import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { lerCsv, lerPlanilhaDaEscala, ligarApelidos, montarSemana } from "../importar-escala";

// A planilha REAL da supervisão (a escala de 19 a 25/10)
const CSV = readFileSync(new URL("./fixtures/escala-19-a-25-10.csv", import.meta.url), "utf8");
const SIGLAS = [
  "i",
  "P",
  "rede",
  "cx",
  "cxtech",
  "auto",
  "quali",
  "log",
  "F&R",
  "cob B2B",
  "1:1",
  "folga",
  "férias",
  "off",
].map((s) => ({ id: `id-${s}`, sigla: s }));
const PESSOAS = [
  "Amanda Silva",
  "Ardson Lopes",
  "Carol Confort",
  "Franciele Rezende",
  "Kaio Luiz",
  "Katia Tchu",
  "Luiz Oliveira",
  "Rachel Kivel",
  "Rubia Lopes",
  "Simone Silva",
  "Suelen Rocha",
  "Thiago Dantas",
  "Virmaud Junior",
  "Vitor de Almeida",
].map((nome) => ({
  id: nome,
  nome,
  nome_na_planilha:
    nome === "Franciele Rezende"
      ? "Fran"
      : nome === "Luiz Oliveira"
        ? "Luiz Fernando"
        : (nome.split(" ")[0] ?? null),
}));

describe("a importação da escala: a planilha real", () => {
  const lida = lerPlanilhaDaEscala(lerCsv(CSV));
  it("os 7 dias, com as pessoas de cada um", () => {
    expect(lida.dias.map((d) => d.length)).toEqual([14, 14, 14, 14, 14, 5, 4]);
    expect(lida.dias[0]![1]).toEqual({
      apelido: "Suelen",
      siglas: [
        "i",
        "i",
        "i",
        "i",
        "P",
        "i",
        "cob B2B",
        "i",
        "i",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    });
  });
  it("o problema real: a vírgula solta (Thiago, sábado, 7h)", () => {
    expect(lida.problemas).toEqual([
      { tipo: "celula", dia: 5, apelido: "Thiago", hora: 7, valor: "," },
    ]);
  });
  it("os apelidos: o primeiro nome e o da planilha dos indicadores ligam sozinhos; o Ruby, não", () => {
    const apelidos = [...new Set(lida.dias.flat().map((l) => l.apelido))];
    const lig = ligarApelidos(apelidos, PESSOAS, {});
    expect(lig["fran"]).toBe("Franciele Rezende");
    expect(lig["carol"]).toBe("Carol Confort");
    expect(lig["luiz"]).toBe("Luiz Oliveira");
    expect(lig["ruby"]).toBeUndefined();
    expect(ligarApelidos(["Ruby"], PESSOAS, { ruby: "Rubia Lopes" })["ruby"]).toBe("Rubia Lopes"); // depois de guardado
  });
  it("a semana montada: a folga e as férias no dia inteiro; e o que falta decidir (o Ruby e a eleições)", () => {
    const apelidos = [...new Set(lida.dias.flat().map((l) => l.apelido))];
    const m = montarSemana({
      lida,
      siglas: SIGLAS,
      ligacoes: ligarApelidos(apelidos, PESSOAS, {}),
    });
    expect(m.semDono).toEqual(["Ruby"]);
    expect(m.desconhecidas).toEqual(["eleições"]);
    const fran = m.dias["0"]!.find((l) => l.employee_id === "Franciele Rezende")!;
    expect(fran.horas).toEqual(Array(16).fill("id-férias")); // segunda: férias, o dia inteiro
    const kaio = m.dias["0"]!.find((l) => l.employee_id === "Kaio Luiz")!;
    expect(kaio.horas).toEqual(Array(16).fill("id-folga"));
  });
  it("com as decisões: o Ruby ligado, e a eleições tratada como folga (o dia inteiro)", () => {
    const apelidos = [...new Set(lida.dias.flat().map((l) => l.apelido))];
    const m = montarSemana({
      lida,
      siglas: SIGLAS,
      ligacoes: { ...ligarApelidos(apelidos, PESSOAS, {}), ruby: "Rubia Lopes" },
      decisoes: { eleições: { para: "id-folga" } },
    });
    expect(m.semDono).toEqual([]);
    expect(m.desconhecidas).toEqual([]);
    expect(Object.values(m.dias).map((d) => d.length)).toEqual([14, 14, 14, 14, 14, 5, 4]);
    expect(
      m.dias["6"]!.find((l) => l.employee_id === "Virmaud Junior")!.horas.filter(
        (h) => h === "id-folga",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("a importação da escala: o CSV", () => {
  it("as aspas, a vírgula dentro delas e o fim de linha do Windows", () => {
    expect(lerCsv('a,"b, c","d ""e"""\r\nf,g')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["f", "g"],
    ]);
  });
});
