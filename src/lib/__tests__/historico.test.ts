import { describe, expect, it } from "vitest";
import { resumoDosSorteios } from "../historico";

const nomes: Record<string, string> = { r: "Rachel Kivel", a: "Admin Teste" };
const nomeDe = (id: string | null) =>
  id ? (nomes[id] ?? "Avaliador removido") : "Avaliador removido";
const s = (quem: string | null, descartado: boolean) => ({
  sorteado_por: quem,
  descartado_em: descartado ? "2026-10-03" : null,
});

describe("resumoDosSorteios", () => {
  it("conta sorteados e descartados por avaliador, mais descartes primeiro", () => {
    const r = resumoDosSorteios(
      [s("r", false), s("r", true), s("a", true), s("a", true), s("a", false)],
      nomeDe,
    );
    expect(r.map((x) => `${x.avaliador}:${x.sorteados}/${x.descartados}`)).toEqual([
      "Admin Teste:3/2",
      "Rachel Kivel:2/1",
    ]);
  });
  it("o alerta vale ACIMA de 30% (30% exato não alerta)", () => {
    const dez = (descartes: number) => [...Array(10)].map((_, i) => s("r", i < descartes));
    expect(resumoDosSorteios(dez(3), nomeDe)[0]).toMatchObject({ proporcao: 0.3, alerta: false });
    expect(resumoDosSorteios(dez(4), nomeDe)[0]).toMatchObject({ proporcao: 0.4, alerta: true });
  });
  it("quem foi removido do sistema aparece como 'Avaliador removido'", () => {
    expect(resumoDosSorteios([s(null, true)], nomeDe)[0]!.avaliador).toBe("Avaliador removido");
  });
  it("sem sorteios, lista vazia", () => {
    expect(resumoDosSorteios([], nomeDe)).toEqual([]);
  });
});
