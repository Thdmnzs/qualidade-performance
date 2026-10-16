import { describe, expect, it } from "vitest";

import {
  diasQueFaltam,
  emMinutos,
  naMeta,
  ontemDe,
  quinzenaDoDia,
  riscosDaElegibilidade,
} from "../indicadores-do-dia";

const METAS = {
  produtividade: {
    meta: 6,
    unidade: "tickets/h",
    sentido: "minimo" as const,
    escopo: "individual" as const,
  },
  horas_online: {
    meta: 20,
    unidade: "h",
    sentido: "minimo" as const,
    escopo: "individual" as const,
  },
  sla_chat: { meta: 5, unidade: "min", sentido: "maximo" as const, escopo: "individual" as const },
};
describe("os indicadores do dia", () => {
  it("a quinzena de um dia (as duas metades, e o fim de cada mês)", () => {
    expect(quinzenaDoDia("2026-10-14")).toEqual({ de: "2026-10-01", ate: "2026-10-15" });
    expect(quinzenaDoDia("2026-10-16")).toEqual({ de: "2026-10-16", ate: "2026-10-31" });
    expect(quinzenaDoDia("2026-02-20")).toEqual({ de: "2026-02-16", ate: "2026-02-28" });
    expect(quinzenaDoDia("2028-02-20").ate).toBe("2028-02-29"); // o ano bissexto
  });
  it("ontem, os dias que faltam e o SLA em minutos", () => {
    expect(ontemDe("2026-11-01")).toBe("2026-10-31");
    expect(diasQueFaltam("2026-10-29", "2026-10-31")).toBe(3);
    expect(emMinutos(300)).toBe(5);
    expect(emMinutos(null)).toBeNull();
  });
  it("na meta: o mínimo e o máximo; sem dado, null", () => {
    expect(naMeta(METAS, "produtividade", 6)).toBe(true);
    expect(naMeta(METAS, "sla_chat", 5.5)).toBe(false);
    expect(naMeta(METAS, "sla_chat", null)).toBeNull();
  });
  it("os riscos da elegibilidade", () => {
    expect(
      riscosDaElegibilidade(
        { qualidade: 95, produtividade: 6.2, horas_semanais: 21, quiz: true },
        METAS,
      ),
    ).toEqual([]);
    expect(
      riscosDaElegibilidade(
        { qualidade: 88, produtividade: 5.1, horas_semanais: 19, quiz: null },
        METAS,
      ),
    ).toEqual(["qualidade", "produtividade", "horas", "quiz"]);
    expect(
      riscosDaElegibilidade(
        { qualidade: null, produtividade: null, horas_semanais: null, quiz: true },
        METAS,
      ),
    ).toEqual([]); // sem dado não é risco
  });
});
