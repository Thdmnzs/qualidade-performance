// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/escala", async (original) => ({
  ...(await original<object>()),
  hojeIso: () => "2026-10-22",
}));
const { CalendarioDeFerias, FERIAS_POR_VIR, FERIAS_TIRADAS, LegendaDasFerias } =
  await import("../calendario-de-ferias");
afterEach(cleanup);
const kaio = [{ employee_id: "k", nome: "Kaio" }];
const DADOS = {
  ano: 2026,
  eu: null,
  feriados: new Set<string>(),
  porDia: new Map([
    ["2026-10-20", kaio], // já tiradas
    ["2026-10-22", kaio], // hoje (em andamento: por vir)
    ["2026-11-23", kaio], // por vir
  ]),
};
const cor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const dia = (d: number, m: number) =>
  document.querySelector(`[title^="${d}/${m}:"]`) as HTMLElement;

describe("as férias em dois tons (22/10/2026)", () => {
  it("as já tiradas (antes de hoje) no tom escuro; as de hoje em diante no tom claro", () => {
    render(<CalendarioDeFerias dados={DADOS as never} />);
    expect(dia(20, 10).style.background).toBe(cor(FERIAS_TIRADAS));
    expect(dia(20, 10).title).toContain("Férias (já tiradas): Kaio");
    expect(dia(22, 10).style.background).toBe(cor(FERIAS_POR_VIR));
    expect(dia(23, 11).style.background).toBe(cor(FERIAS_POR_VIR));
    expect(dia(23, 11).title).toContain("Férias: Kaio");
  });
  it("a legenda com os dois tons", () => {
    render(<LegendaDasFerias comMinhas={false} />);
    expect(screen.getByText("Férias já tiradas")).toBeTruthy();
    expect(screen.getByText("Férias por vir")).toBeTruthy();
  });
});
