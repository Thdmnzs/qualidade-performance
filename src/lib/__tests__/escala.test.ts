import { describe, expect, it } from "vitest";
import {
  abaDaSemana,
  cadastroDoNome,
  corDoTexto,
  emAtendimento,
  horasDeTrabalho,
  lerFerias,
  lerSemana,
  periodoDaAba,
  significado,
  type AbaBruta,
  type Celula,
} from "../escala";

const HOJE = new Date(2026, 9, 9, 12); // sexta, 09/10/2026
const c = (texto: string | null, cor: string | null = null): Celula => ({ texto, cor });
const horas = Array.from({ length: 16 }, (_, i) => `${i + 6}h`);
// A segunda-feira do print: o título, o "analistas online", a linha das horas e três pessoas.
const SEMANA: AbaBruta = {
  titulo: "05 a 11/10",
  linhas: [
    [c("segunda"), c("analistas"), c("segunda feira")],
    [c("analistas online"), c(null), ...horas.map(() => c("2"))],
    [c("analista"), c("hr/dia"), ...horas.map((h) => c(h))],
    [c("Ruby"), c("8"), c("folga", "#ff9900")], // a folga é uma faixa mesclada (das 6h às 14h)
    [
      c("Thiago"),
      c("8"),
      ...["i", "i", "i", "i", "P", "i", "i", "i", "mensal"].map((t) =>
        c(t, t === "P" ? "#d9d9d9" : "#c9daf8"),
      ),
    ],
    [
      c("Rachel"),
      c("8"),
      c(null),
      c(null),
      c(null),
      ...["i", "i", "i", "i", "P", "mensal", "quali", "quali", "quali"].map((t) => c(t, "#1c5bd9")),
    ],
    [c(null)],
    [c("terça"), c(null), c("terça feira")],
    [c("analista"), c("hr/dia"), ...horas.map((h) => c(h))],
    [c("Thiago"), c("8"), c("i"), c("off", "#e06666")],
  ],
  mesclas: [{ r0: 3, r1: 4, c0: 2, c1: 11 }],
};

describe("a aba da semana", () => {
  const s = lerSemana(SEMANA, HOJE);
  it("as horas das 6h às 21h", () =>
    expect(s.horas).toEqual(Array.from({ length: 16 }, (_, i) => i + 6)));
  it("os dias, com a data pelo nome da aba", () => {
    expect(s.dias.map((d) => [d.nome, d.data])).toEqual([
      ["segunda", "2026-10-05"],
      ["terca", "2026-10-06"],
    ]);
  });
  it("as pessoas (as linhas de apoio ficam de fora)", () => {
    expect(s.dias[0]!.pessoas.map((p) => p.nome)).toEqual(["Ruby", "Thiago", "Rachel"]);
  });
  it("a faixa mesclada da folga vale para todas as horas que ela cobre", () => {
    const ruby = s.dias[0]!.pessoas[0]!;
    expect(ruby.horas.slice(0, 9).every((h) => h?.texto === "folga" && h.mescla === 0)).toBe(true);
    expect(ruby.horas[9]).toBeNull();
  });
  it("cada hora traz a sigla e a cor da planilha", () => {
    expect(s.dias[0]!.pessoas[1]!.horas[4]).toEqual({ texto: "P", cor: "#d9d9d9", mescla: null });
  });
  it("as horas de trabalho: sem a pausa e sem as ausências (as reuniões contam)", () => {
    expect(horasDeTrabalho(s.dias[0]!.pessoas[1]!.horas)).toBe(8); // 9 na escala, menos a pausa
    expect(horasDeTrabalho(s.dias[0]!.pessoas[0]!.horas)).toBe(0); // a folga
  });
  it("o 'Online' conta só quem está em atendimento (o i)", () => {
    const naHora = (k: number) =>
      s.dias[0]!.pessoas.filter((p) => emAtendimento(p.horas[k]!)).length;
    expect(naHora(0)).toBe(1); // às 6h: só o Thiago (a Ruby está de folga)
    expect(naHora(4)).toBe(1); // às 10h: a Rachel (o Thiago está em pausa)
  });
});

describe("o período e a semana atual", () => {
  it("'05 a 11/10' e '28 a 04/10' (o começo no mês anterior)", () => {
    expect(periodoDaAba("05 a 11/10", HOJE)).toEqual({ inicio: "2026-10-05", fim: "2026-10-11" });
    expect(periodoDaAba("28 a 04/10", HOJE)).toEqual({ inicio: "2026-09-28", fim: "2026-10-04" });
  });
  it("uma aba que não é de semana fica de fora", () =>
    expect(periodoDaAba("férias 26", HOJE)).toBeNull());
  it("a semana de hoje; sem ela, a mais recente que já começou", () => {
    const abas = [
      { titulo: "12 a 18/10", inicio: "2026-10-12", fim: "2026-10-18" },
      { titulo: "05 a 11/10", inicio: "2026-10-05", fim: "2026-10-11" },
    ];
    expect(abaDaSemana(abas, HOJE)).toBe("05 a 11/10");
    expect(abaDaSemana(abas.slice(0, 1), HOJE)).toBe("12 a 18/10");
    expect(abaDaSemana(abas, new Date(2026, 9, 20))).toBe("12 a 18/10");
  });
});

describe("as siglas e as cores", () => {
  it("o significado, sem diferenciar maiúsculas", () => {
    expect(significado("i")).toBe("Intercom (atendimento)");
    expect(significado("COB B2B")).toBe("Cobrança B2B");
    expect(significado("treinamento")).toBeNull();
  });
  it("a letra escura nas cores claras, e branca no azul do quali", () => {
    expect(corDoTexto("#c9daf8")).toBe("#0D0F0D");
    expect(corDoTexto("#6aa84f")).toBe("#0D0F0D");
    expect(corDoTexto("#1c5bd9")).toBe("#FFFFFF");
    expect(corDoTexto(null)).toBe("#0D0F0D");
  });
});

describe("a aba de férias", () => {
  const meses = [
    "dia",
    "JAN/26",
    "FEV/26",
    "MAR/26",
    "ABR/26",
    "MAI/26",
    "JUN/26",
    "JUL/26",
    "AGO/26",
    "SET/26",
    "OUT/26",
    "NOV/26",
    "DEZ/26",
  ];
  const linha = (dia: number, ...cels: (string | null)[]) => [
    c(String(dia)),
    ...Array.from({ length: 12 }, (_, i) => c(cels[i] ?? null)),
  ];
  const FERIAS: AbaBruta = {
    titulo: "férias 26",
    linhas: [
      [c(null)],
      meses.map((m) => c(m)),
      linha(1, "feriado", "Katia"),
      linha(16, null, "feriado / Rachel", "Suelen"),
      linha(8, null, null, "carol / Virmaud"),
    ],
    mesclas: [],
  };
  const f = lerFerias(FERIAS);
  it("os meses e o ano", () => {
    expect(f.ano).toBe(2026);
    expect(f.meses).toEqual([
      "JAN",
      "FEV",
      "MAR",
      "ABR",
      "MAI",
      "JUN",
      "JUL",
      "AGO",
      "SET",
      "OUT",
      "NOV",
      "DEZ",
    ]);
  });
  it("o feriado, a pessoa, e os dois juntos", () => {
    expect(f.dias["0-1"]).toEqual({ pessoas: [], feriado: true });
    expect(f.dias["1-1"]).toEqual({ pessoas: ["Katia"], feriado: false });
    expect(f.dias["1-16"]).toEqual({ pessoas: ["Rachel"], feriado: true });
  });
  it("duas pessoas no mesmo dia", () =>
    expect(f.dias["2-8"]!.pessoas).toEqual(["carol", "Virmaud"]));
  it("um dia livre não aparece", () => expect(f.dias["0-2"]).toBeUndefined());
});

describe("quem é quem", () => {
  const CAD = [
    { nome: "Thiago Dantas" },
    { nome: "Franciele Rezende" },
    { nome: "Rachel Kivel" },
    { nome: "Carol Lima" },
    { nome: "Carolina Souza" },
  ];
  it("pelo primeiro nome, sem diferenciar maiúsculas e acentos", () => {
    expect(cadastroDoNome("Thiago", CAD)?.nome).toBe("Thiago Dantas");
    expect(cadastroDoNome("RACHEL", CAD)?.nome).toBe("Rachel Kivel");
  });
  it("pelo começo do nome ('Fran' para 'Franciele')", () =>
    expect(cadastroDoNome("Fran", CAD)?.nome).toBe("Franciele Rezende"));
  it("o primeiro nome igual vence o começo ('Carol' é a Carol, e não a Carolina)", () => {
    expect(cadastroDoNome("Carol", CAD)?.nome).toBe("Carol Lima");
  });
  it("com dois cadastros possíveis, nenhum (para não destacar a pessoa errada)", () => {
    expect(cadastroDoNome("Car", CAD)).toBeNull();
  });
  it("um nome sem cadastro", () => expect(cadastroDoNome("Ruby", CAD)).toBeNull());
});
