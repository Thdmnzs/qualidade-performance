import { describe, expect, it } from "vitest";
import {
  atingiuMeta,
  diasDaQuinzena,
  formatarValor,
  horasEMinutos,
  horasExigidas,
  mediaSemanal,
  nivelQualidade,
  QUALIDADE_MINIMA,
  textoDaMeta,
  type Meta,
} from "../indicadores";

const produtividade: Meta = {
  meta: 6,
  unidade: "tickets/h",
  sentido: "minimo",
  escopo: "individual",
};
const slaChat: Meta = { meta: 5, unidade: "min", sentido: "maximo", escopo: "individual" };
const csat: Meta = { meta: 97, unidade: "%", sentido: "minimo", escopo: "time" };

describe("textoDaMeta", () => {
  it("descreve mínimo e máximo com a unidade", () => {
    expect(textoDaMeta(produtividade)).toBe("mínimo 6 tickets/h");
    expect(textoDaMeta(slaChat)).toBe("máximo 5 min");
    expect(textoDaMeta(csat)).toBe("mínimo 97%");
  });
});

describe("atingiuMeta", () => {
  it("mínimo: atinge com valor igual ou maior", () => {
    expect(atingiuMeta(produtividade, 6)).toBe(true);
    expect(atingiuMeta(produtividade, 5.99)).toBe(false);
  });
  it("máximo: atinge com valor igual ou menor (SLA)", () => {
    expect(atingiuMeta(slaChat, 5)).toBe(true);
    expect(atingiuMeta(slaChat, 5.01)).toBe(false);
  });
});

describe("horas exigidas por quinzena (20h/semana, semanas por dias corridos)", () => {
  const q = (inicio: string, fim: string) => ({ data_inicio: inicio, data_fim: fim });
  it("conta os dias corridos", () => {
    expect(diasDaQuinzena(q("2026-09-01", "2026-09-15"))).toBe(15);
    expect(diasDaQuinzena(q("2026-10-16", "2026-10-31"))).toBe(16);
    expect(diasDaQuinzena(q("2027-02-16", "2027-02-28"))).toBe(13);
  });
  it("bate com a tabela combinada", () => {
    expect(horasEMinutos(horasExigidas(q("2026-09-01", "2026-09-15"), 20))).toBe("42h51");
    expect(horasEMinutos(horasExigidas(q("2026-10-16", "2026-10-31"), 20))).toBe("45h43");
    expect(horasEMinutos(horasExigidas(q("2027-02-16", "2027-02-28"), 20))).toBe("37h09");
  });
  it("não sofre com o horário de verão nem com o fuso", () => {
    // datas tratadas como dias de calendário, e não como instantes
    expect(diasDaQuinzena(q("2026-11-01", "2026-11-15"))).toBe(15);
  });
});

describe("nivelQualidade (escala da especificação)", () => {
  it("fronteiras exatas de cada nível", () => {
    expect(nivelQualidade(100)).toBe("5G");
    expect(nivelQualidade(98)).toBe("5G");
    expect(nivelQualidade(97.99)).toBe("4,5G");
    expect(nivelQualidade(95)).toBe("4,5G");
    expect(nivelQualidade(94.99)).toBe("4G");
    expect(nivelQualidade(91)).toBe("4G");
    expect(nivelQualidade(90.99)).toBe("3G");
    expect(nivelQualidade(86)).toBe("3G");
    expect(nivelQualidade(85.99)).toBe("2G");
  });
  it("95,3 é 4,5G (o exemplo da especificação dizia 5G, contradizendo a escala)", () => {
    expect(nivelQualidade(95.3)).toBe("4,5G");
  });
  it("a qualidade mínima para elegibilidade é o início do 4G", () => {
    expect(nivelQualidade(QUALIDADE_MINIMA)).toBe("4G");
  });
});

describe("mediaSemanal", () => {
  const q = { data_inicio: "2026-09-01", data_fim: "2026-09-15" }; // 15 dias = 2,14 semanas
  it("44h na 1ª quinzena dão 20h32 por semana (atinge 20h)", () => {
    expect(horasEMinutos(mediaSemanal(44, q))).toBe("20h32");
  });
  it("as horas exigidas dão exatamente a meta semanal", () => {
    expect(mediaSemanal(horasExigidas(q, 20), q)).toBeCloseTo(20, 10);
  });
});

describe("formatarValor", () => {
  it("usa a unidade de cada indicador, no padrão brasileiro", () => {
    expect(formatarValor("produtividade", 6.4)).toBe("6,4 tickets/h");
    expect(formatarValor("sla_chat", 4.5)).toBe("4,5 min");
    expect(formatarValor("csat", 96.8)).toBe("96,8%");
    expect(formatarValor("horas_online", 42.5)).toBe("42h30");
    expect(formatarValor("qualidade", 95.333)).toBe("95,33");
  });
});
