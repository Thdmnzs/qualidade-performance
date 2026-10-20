import { describe, expect, it } from "vitest";

import {
  acordoGeral,
  corDoAcordo,
  doMenorAcordo,
  mudancaLegivel,
  percentual,
  textoParaAIA,
} from "../treinar-a-ia";

const C = (ordem: number, total: number, acordos: number) => ({
  id: `c${ordem}`,
  ordem,
  grupo: "g",
  descricao: "d",
  tem_orientacao: false,
  total,
  acordos,
  mudanca: null,
  motivos: null,
});
describe("treinar a IA: as regras", () => {
  it("a mudança legível, e o percentual", () => {
    expect(mudancaLegivel("sim>medio")).toBe("Sim → Médio");
    expect(mudancaLegivel(null)).toBe("—");
    expect(percentual({ total: 4, acordos: 3 })).toBe(75);
    expect(percentual({ total: 0, acordos: 0 })).toBeNull();
  });
  it("as cores, e a ordem do menor acordo (os sem dados no fim)", () => {
    expect([corDoAcordo(90), corDoAcordo(75), corDoAcordo(50)]).toEqual([
      "#13A403",
      "#D69E2E",
      "#C62828",
    ]);
    expect(
      doMenorAcordo([C(1, 10, 9), C(2, 10, 5), C(3, 0, 0), C(4, 10, 7)]).map((c) => c.ordem),
    ).toEqual([2, 4, 1, 3]);
  });
  it("o acordo geral pesa cada sugestão igual (e não cada critério)", () => {
    expect(acordoGeral([C(1, 90, 90), C(2, 10, 0)])).toBe(90); // e não (100 + 0) ÷ 2 = 50
    expect(acordoGeral([])).toBeNull();
  });
  it("o texto que a IA recebe (o mesmo do banco); o médio só onde a ficha permite", () => {
    const o = { sim: " Reconhece o sentimento. ", medio: "Cordial.", nao: "Ignora.", exemplo: "" };
    expect(textoParaAIA(o, true)).toBe(
      "Conta como SIM: Reconhece o sentimento. Conta como MÉDIO: Cordial. Conta como NÃO: Ignora.",
    );
    expect(textoParaAIA(o, false)).toBe(
      "Conta como SIM: Reconhece o sentimento. Conta como NÃO: Ignora.",
    );
  });
});
