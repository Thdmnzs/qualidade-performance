import { describe, expect, it } from "vitest";
import { periodoPadrao, textoDoPeriodo, validarPeriodo } from "../periodo";

describe("periodoPadrao", () => {
  it("os 7 dias corridos até ontem", () => {
    expect(periodoPadrao(new Date(2026, 9, 6))).toEqual({ de: "2026-09-29", ate: "2026-10-05" });
  });
  it("atravessa a virada do mês e do ano", () => {
    expect(periodoPadrao(new Date(2027, 0, 2))).toEqual({ de: "2026-12-26", ate: "2027-01-01" });
  });
});

describe("validarPeriodo", () => {
  it("período válido, inclusive um dia só", () => {
    expect(validarPeriodo("2026-10-01", "2026-10-05")).toBeNull();
    expect(validarPeriodo("2026-10-05", "2026-10-05")).toBeNull();
  });
  it("datas faltando ou invertidas", () => {
    expect(validarPeriodo("", "2026-10-05")).toBe("Escolha as duas datas.");
    expect(validarPeriodo("2026-10-05", "2026-10-01")).toBe("A data inicial é depois da final.");
  });
  it("até 92 dias: 92 passa, 93 não", () => {
    expect(validarPeriodo("2026-07-06", "2026-10-05")).toBeNull();
    expect(validarPeriodo("2026-07-05", "2026-10-05")).toBe("Escolha um período de até 92 dias.");
  });
});

describe("textoDoPeriodo", () => {
  it("intervalo e um dia só", () => {
    expect(textoDoPeriodo("2026-10-01", "2026-10-05", 3)).toBe("01/10 a 05/10 · 3 dias");
    expect(textoDoPeriodo("2026-10-05", "2026-10-05", 1)).toBe("05/10 · 1 dia");
  });
});
