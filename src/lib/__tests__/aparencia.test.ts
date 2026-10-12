import { describe, expect, it } from "vitest";

import {
  aparenciaDeAgora,
  CAPAS,
  MOLDURAS,
  quantoFalta,
  quaseLa,
  temporadaDoMes,
  type MinhaAparencia,
} from "../aparencia";

const base: MinhaAparencia = {
  capa: "torre",
  moldura: "ouro",
  capa_da_temporada: true,
  moldura_da_temporada: true,
  capa_temporada_preferida: null,
  mes: 10,
  nivel: 11,
  capas_liberadas: [],
  molduras_liberadas: [],
};

describe("o catálogo", () => {
  it("20 capas e 7 molduras, sem códigos repetidos (os mesmos do banco)", () => {
    expect(CAPAS).toHaveLength(20);
    expect(new Set(CAPAS.map((c) => c.id)).size).toBe(20);
    expect(MOLDURAS.map((m) => m.id)).toEqual([
      "nenhuma",
      "verde",
      "prata",
      "ouro",
      "lendaria",
      "fluker",
      "bruxas",
    ]);
  });
  it("as temporadas de cada mês", () => {
    expect(temporadaDoMes(10).capas.map((c) => c.id)).toEqual(["bruxas", "rosa"]);
    expect(temporadaDoMes(10).moldura?.id).toBe("bruxas");
    expect(temporadaDoMes(11).capas.map((c) => c.id)).toEqual(["azul", "black"]);
    expect(temporadaDoMes(11).moldura).toBeNull();
    expect(temporadaDoMes(3).capas).toEqual([]);
  });
});

describe("a aparência de agora", () => {
  it("em outubro, com as chaves ligadas: a capa e a moldura da temporada", () => {
    expect(aparenciaDeAgora(base)).toEqual({ capa: "bruxas", moldura: "bruxas" });
  });
  it("a capa preferida da temporada (o Outubro Rosa)", () => {
    expect(aparenciaDeAgora({ ...base, capa_temporada_preferida: "rosa" }).capa).toBe("rosa");
  });
  it("com as chaves desligadas, valem as escolhidas", () => {
    expect(
      aparenciaDeAgora({ ...base, capa_da_temporada: false, moldura_da_temporada: false }),
    ).toEqual({ capa: "torre", moldura: "ouro" });
  });
  it("num mês sem temporada, valem as escolhidas (mesmo com as chaves ligadas)", () => {
    expect(aparenciaDeAgora({ ...base, mes: 3 })).toEqual({ capa: "torre", moldura: "ouro" });
  });
  it("em novembro, a capa da temporada, mas a moldura de sempre (novembro não tem moldura)", () => {
    expect(aparenciaDeAgora({ ...base, mes: 11 })).toEqual({ capa: "azul", moldura: "ouro" });
  });
});

describe("o Quase lá", () => {
  const entrada = {
    ganhas: new Set([35, 36, 53]),
    quinzenasCom100: 3,
    quinzenasAvaliadas: 6,
    centrais: [{ numero: 56, ganhas: 9, total: 13 }],
  };
  it("as 3 mais perto, sem as já ganhas", () => {
    const r = quaseLa(entrada);
    // 56: 9 de 13 (69%); 54: 3 de 5 (60%, faltam 2); 42: 6 de 10 (60%, faltam 4). No empate, a que falta menos.
    expect(r.map((x) => x.numero)).toEqual([56, 54, 42]);
  });
  it("o que falta, no singular e no plural", () => {
    expect(quantoFalta({ numero: 54, atual: 4, alvo: 5, unidade: "quinzenas com 100" })).toBe(
      "Falta só mais 1 quinzena com 100!",
    );
    expect(quantoFalta({ numero: 56, atual: 9, alvo: 13, unidade: "conquistas" })).toBe(
      "Faltam 4 conquistas.",
    );
  });
});
