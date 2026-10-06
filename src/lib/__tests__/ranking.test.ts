import { describe, expect, it } from "vitest";
import { arquivoDoPodio, degrausDoPodio, nomeNoPodio } from "../ranking";

const p = (posicao: number, nome: string) => ({ posicao, employee_id: nome, nome, destaques: [] });

describe("degrausDoPodio", () => {
  it("a ordem do desenho: 2º, 1º, 3º", () => {
    expect(
      degrausDoPodio([p(1, "Ana"), p(2, "Bruno"), p(3, "Carla")]).map(
        (d) => `${d.posicao}:${d.pessoas.map((x) => x.nome)}`,
      ),
    ).toEqual(["2:Bruno", "1:Ana", "3:Carla"]);
  });
  it("empate: duas pessoas dividem o 3º degrau, em ordem alfabética", () => {
    const d = degrausDoPodio([p(1, "Ana"), p(2, "Bruno"), p(3, "Fabio"), p(3, "Carla")]);
    expect(d[2]!.pessoas.map((x) => x.nome)).toEqual(["Carla", "Fabio"]);
  });
  it("empate no 1º: ninguém em 2º (o próximo é o 3º), e o degrau fica vazio", () => {
    const d = degrausDoPodio([p(1, "Ana"), p(1, "Bruno"), p(3, "Carla")]);
    expect(d.map((x) => x.pessoas.length)).toEqual([0, 2, 1]);
  });
});

describe("textos do pódio", () => {
  it("nome em minúsculas", () => {
    expect(nomeNoPodio("Thiago Dantas")).toBe("thiago dantas");
  });
  it("arquivo sem acentos nem espaços", () => {
    expect(arquivoDoPodio("1ª quinzena · Outubro/2026")).toBe("podio-1a-quinzena-outubro-2026.png");
  });
});
