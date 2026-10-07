import { describe, expect, it } from "vitest";
import { abasNaJanela, lerAba, lerEscala, semanaDaAba } from "../escala";

// Reprodução da estrutura real da planilha "escala cx" (a leitura da API devolve
// o texto da célula; numa célula mesclada, só a primeira tem o valor).
const HORAS = [
  "",
  "analista",
  "hr/dia",
  "7h",
  "8h",
  "9h",
  "10h",
  "11h",
  "12h",
  "13h",
  "14h",
  "15h",
  "16h",
  "17h",
  "18h",
];
const bloco = (titulo: string, pessoas: (string | number)[][]) => [
  ["", titulo],
  ["", "analistas online", "", 4, 4, 4, 4, 3, 4, 4, 2, 4, 3, 3, 3],
  HORAS,
  ...pessoas,
  [],
  ["", "", "c. demanda", 4, 3, 3, 4, 3, 4, 4, 3, 3, 3, 3, 3],
];
const ABA = {
  titulo: "SEMANA 13/11 A 19/11",
  linhas: [
    [],
    ...bloco("SEGUNDA", [
      [
        "bloco 1",
        "Marcus",
        8,
        "cxtech",
        "task",
        "task",
        "escala",
        "task",
        "pausa",
        "escala",
        "semanal",
        "cxtech",
      ],
      [
        "bloco 2",
        "Fran",
        7,
        "",
        "",
        "",
        "",
        "",
        "escala",
        "quali",
        "semanal",
        "quali",
        "pausa",
        "escala",
        "escala",
      ],
      [
        "bloco 3",
        "Rachel",
        7,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "semanal",
        "Quali",
        "escala",
        "cxtech",
        "pausa",
      ],
    ]),
    ...bloco("TERÇA", [
      [
        "bloco 2",
        "Fran",
        7,
        "",
        "",
        "",
        "",
        "",
        "quali",
        "quali",
        "escala",
        "escala",
        "pausa",
        "escala",
        "escala",
      ],
    ]),
    ...bloco("QUARTA  15/11 PROCLAMAÇÃO DA REPÚBLICA", [
      [
        "bloco 3",
        "Rachel",
        7,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "QUALI",
        "escala",
        "escala",
        "cxtech",
        "pausa",
      ],
    ]),
  ],
};
const HOJE = new Date(2023, 10, 20); // 20/11/2023: a aba de 13/11 é desse ano

describe("semanaDaAba", () => {
  it("o ano é o que deixa a data mais perto de hoje", () => {
    expect(semanaDaAba("SEMANA 13/11 A 19/11", new Date(2023, 10, 20))!.getFullYear()).toBe(2023);
    expect(semanaDaAba("SEMANA 29/12 A 04/01", new Date(2027, 0, 3))!.getFullYear()).toBe(2026);
  });
  it("aba que não é de semana: null", () => {
    expect(semanaDaAba("Resumo", HOJE)).toBeNull();
  });
});

describe("lerAba", () => {
  const r = lerAba(ABA, HOJE);
  it("conta as células 'quali' (sem diferenciar maiúsculas) de cada pessoa, por dia", () => {
    expect(r.linhas).toEqual([
      { nome: "Fran", dia: "2023-11-13", horas: 2, aba: "SEMANA 13/11 A 19/11" },
      { nome: "Rachel", dia: "2023-11-13", horas: 1, aba: "SEMANA 13/11 A 19/11" },
      { nome: "Fran", dia: "2023-11-14", horas: 2, aba: "SEMANA 13/11 A 19/11" },
      { nome: "Rachel", dia: "2023-11-15", horas: 1, aba: "SEMANA 13/11 A 19/11" },
    ]);
  });
  it("o feriado no título não atrapalha (e a data do título vale)", () => {
    expect(r.dias).toEqual(["2023-11-13", "2023-11-14", "2023-11-15"]);
  });
  it("'task' não conta como quali, e quem não tem quali não aparece", () => {
    expect(r.linhas.some((l) => l.nome === "Marcus")).toBe(false);
  });
});

describe("lerEscala", () => {
  it("só as abas dentro da janela", () => {
    const antiga = { ...ABA, titulo: "SEMANA 13/03 A 19/03" };
    const r = lerEscala([ABA, antiga, { titulo: "Resumo", linhas: [] }], HOJE);
    expect(r.abas).toBe(1);
    expect(r.linhas.length).toBe(4);
  });
  it("abasNaJanela escolhe o que buscar na planilha", () => {
    expect(abasNaJanela(["SEMANA 13/11 A 19/11", "SEMANA 13/03 A 19/03", "Resumo"], HOJE)).toEqual([
      "SEMANA 13/11 A 19/11",
    ]);
  });
});
