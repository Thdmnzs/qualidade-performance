import { describe, expect, it } from "vitest";

import { copiaDoDia, dataDaPlanilha, linhasDaPlanilha, numero } from "../planilha-indicadores";

// O cabeçalho e as linhas DE VERDADE da aba "Dados" (lidas em 15/10/2026).
const CABECALHO = [
  "Data",
  "Membro",
  "Conversas atribuídas (total)",
  "Conversas atribuídas (membro da equipe)",
  "Horas ativas",
  "Conv. atribuídas por hora ativa - total",
  "Conv. atribuídas por hora ativa - membro da equipe",
  "Conv. atribuídas por hora ativa - ajustada",
  "CSAT avaliações positivas",
  "CSAT total de avaliações",
  "CSAT %",
  "[B2C] SLA primeira resposta chat (s)",
  "[B2C] SLA primeira resposta email (s)",
  "[B2C] SLA chat (s)",
  "[B2C] SLA email (s)",
  "[B2B] SLA primeira resposta chat (s)",
  "[B2B] SLA primeira resposta email (s)",
  "[B2B] SLA chat (s)",
  "[B2B] SLA email (s)",
];
const TIME = [
  "01/10/2026",
  "TIME",
  "413",
  "40",
  "60,00",
  "6,88",
  "0,67",
  "6,22",
  "64",
  "65",
  "98,5%",
  "266",
  "534",
  "421",
  "1166",
  "312",
  "462",
  "377",
  "1788",
];
const AMANDA = [
  "01/10/2026",
  "Amanda",
  "0",
  "0",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "317",
  "1056",
  "",
  "",
  "392",
  "1817",
];
const ARDSON = [
  "01/10/2026",
  "Ardson",
  "56",
  "22",
  "3,35",
  "16,72",
  "6,57",
  "10,15",
  "4",
  "4",
  "100,0%",
  "273",
  "199",
  "560",
  "642",
  "370",
  "409",
  "681",
  "978",
];
const KAIO = [
  "01/10/2026",
  "Kaio",
  "56",
  "0",
  "7,97",
  "7,03",
  "0,00",
  "7,03",
  "11",
  "11",
  "100,0%",
  "117",
  "164",
  "252",
  "320",
  "80",
  "",
  "270",
]; // a linha curta, como na planilha

describe("a leitura da planilha dos indicadores", () => {
  it("os números e as datas, como o Google os mostra", () => {
    expect(numero("60,00")).toBe(60);
    expect(numero("1.234,5")).toBe(1234.5);
    expect(numero("98,5%")).toBe(98.5);
    expect(numero("")).toBeNull();
    expect(numero("abc")).toBeNull();
    expect(dataDaPlanilha("01/10/2026")).toBe("2026-10-01");
    expect(dataDaPlanilha("31/02/2026")).toBeNull();
  });
  it("as linhas de verdade: o Ardson, com o SLA médio do B2C e do B2B", () => {
    const [time, amanda, ardson] = linhasDaPlanilha([CABECALHO, TIME, AMANDA, ARDSON]);
    expect(time!.nome).toBe("TIME"); // o banco ignora o TIME
    expect(ardson).toEqual({
      nome: "Ardson",
      dia: "2026-10-01",
      conversas: 56,
      autoatribuicoes: 22,
      tempo_ativo_min: 201, // 3,35 h
      sla_chat_s: 620.5, // (560 + 681) / 2: as colunas "SLA chat", e não as de "primeira resposta"
      sla_email_s: 810, // (642 + 978) / 2
      csat_positivas: 4,
      csat_total: 4,
      sla_b2c_chat_1_s: 273, // os oito tempos, como na planilha
      sla_b2c_email_1_s: 199,
      sla_b2c_chat_g_s: 560,
      sla_b2c_email_g_s: 642,
      sla_b2b_chat_1_s: 370,
      sla_b2b_email_1_s: 409,
      sla_b2b_chat_g_s: 681,
      sla_b2b_email_g_s: 978,
    });
    expect(amanda!.tempo_ativo_min).toBeNull(); // a célula vazia é "sem dado", e não zero
    expect(amanda!.sla_chat_s).toBe(354.5);
  });
  it("uma linha mais curta (a célula final vazia): o SLA do e-mail fica só com o B2C", () => {
    const [kaio] = linhasDaPlanilha([CABECALHO, KAIO]);
    expect(kaio!.sla_chat_s).toBe(261); // (252 + 270) / 2
    expect(kaio!.sla_email_s).toBe(320); // só o B2C
  });
  it("as colunas pelo nome (a ordem pode mudar); e uma obrigatória faltando é um erro", () => {
    const invertido = [CABECALHO.slice().reverse(), ARDSON.slice().reverse()];
    expect(linhasDaPlanilha(invertido)[0]!.conversas).toBe(56);
    expect(() => linhasDaPlanilha([CABECALHO.filter((c) => c !== "Horas ativas"), ARDSON])).toThrow(
      /"horas ativas"/,
    );
  });
});

describe("a cópia da aba Dados, para a supervisão", () => {
  it("o cabeçalho e só as linhas do dia, como estão na planilha (os textos, sem conta)", () => {
    const outroDia = ["02/10/2026", "Ardson", "10", "1", "2,00"];
    const c = copiaDoDia([CABECALHO, TIME, ARDSON, outroDia], "2026-10-01");
    expect(c[0]).toEqual(CABECALHO);
    expect(c.slice(1).map((l) => l[1])).toEqual(["TIME", "Ardson"]);
    expect(c[2]![4]).toBe("3,35"); // o valor como está na planilha (a vírgula, as casas)
  });
});
