import { describe, expect, it } from "vitest";
import {
  atingiuMeta,
  diasDaQuinzena,
  horasEMinutos,
  horasExigidas,
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
