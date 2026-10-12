import { describe, expect, it } from "vitest";

import {
  mascaraDoCep,
  mascaraDoTelefone,
  problemaDaFicha,
  textoDoQueFalta,
  type Ficha,
} from "../dados-pessoais";

const vazia: Ficha = {
  aniversario_dia: null,
  aniversario_mes: null,
  aniversario_visivel: true,
  aniversario_tema: true,
  cep: null,
  rua: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  contato_nome: null,
  contato_parentesco: null,
  contato_telefone: null,
};

describe("as máscaras", () => {
  it("o CEP", () => {
    expect(mascaraDoCep("59150000")).toBe("59150-000");
    expect(mascaraDoCep("591")).toBe("591");
    expect(mascaraDoCep("59150-0009999")).toBe("59150-000");
  });
  it("o telefone (celular e fixo)", () => {
    expect(mascaraDoTelefone("84999990000")).toBe("(84) 99999-0000");
    expect(mascaraDoTelefone("8433330000")).toBe("(84) 3333-0000");
    expect(mascaraDoTelefone("84")).toBe("84");
  });
});

describe("as conferências (as mesmas do banco)", () => {
  it("uma ficha vazia pode ser salva", () => expect(problemaDaFicha(vazia)).toBeNull());
  it("o aniversário", () => {
    expect(problemaDaFicha({ ...vazia, aniversario_dia: 31, aniversario_mes: 2 })).toBe(
      "Esse dia não existe nesse mês.",
    );
    expect(problemaDaFicha({ ...vazia, aniversario_dia: 29, aniversario_mes: 2 })).toBeNull();
    expect(problemaDaFicha({ ...vazia, aniversario_dia: 5 })).toBe(
      "Escolha o dia e o mês do aniversário.",
    );
  });
  it("o CEP e o telefone", () => {
    expect(problemaDaFicha({ ...vazia, cep: "591" })).toBe("O CEP precisa ter 8 números.");
    expect(
      problemaDaFicha({ ...vazia, contato_nome: "Maria", contato_telefone: "99999-0000" }),
    ).toBe("O telefone precisa ter o DDD e o número.");
    expect(problemaDaFicha({ ...vazia, contato_telefone: "(84) 99999-0000" })).toBe(
      "Escreva o nome do contato de emergência.",
    );
  });
});

it("o que falta, sem os dados", () => {
  expect(textoDoQueFalta([])).toBeNull();
  expect(textoDoQueFalta(["tudo"])).toBe("não preenchidos");
  expect(textoDoQueFalta(["endereço", "contato de emergência"])).toBe(
    "falta: endereço e contato de emergência",
  );
});
