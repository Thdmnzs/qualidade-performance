import { describe, expect, it } from "vitest";

import { abaixoDoHabitual, diasComHumor, nivelDoHumor } from "../humor";

const r = (dia: string, nivel: number) => ({ dia: `2026-10-${dia}`, nivel });
describe("o termômetro do humor", () => {
  it("os níveis", () => {
    expect(nivelDoHumor(1)?.nome).toBe("muito mal");
    expect(nivelDoHumor(5)?.emoji).toBe("😄");
    expect(nivelDoHumor(null)).toBeNull();
  });
  it("abaixo do habitual: os 3 últimos bem abaixo da média dos 14 dias (o caso do Kaio da prévia)", () => {
    expect(
      abaixoDoHabitual([
        r("08", 4),
        r("09", 4),
        r("10", 4),
        r("11", 4),
        r("12", 4),
        r("13", 2),
        r("14", 2),
        r("15", 2),
      ]),
    ).toBe(true);
  });
  it("não é abaixo do habitual: um dia ruim só, ou poucos registros", () => {
    expect(
      abaixoDoHabitual([r("10", 4), r("11", 4), r("12", 4), r("13", 4), r("14", 4), r("15", 1)]),
    ).toBe(false);
    expect(abaixoDoHabitual([r("14", 5), r("15", 1)])).toBe(false);
  });
  it("os dias sem registro ficam vazios, na ordem", () => {
    expect(diasComHumor("2026-10-21", 3, [r("19", 4), r("21", 5)])).toEqual([
      { dia: "2026-10-19", nivel: 4 },
      { dia: "2026-10-20", nivel: null },
      { dia: "2026-10-21", nivel: 5 },
    ]);
  });
});
