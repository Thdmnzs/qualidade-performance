import { describe, expect, it } from "vitest";
import { mascarar } from "../mascarar";

describe("mascarar: documentos", () => {
  it("CPF com e sem pontuação (válidos)", () => {
    expect(mascarar("Meu CPF é 123.456.789-09.")).toBe("Meu CPF é [CPF].");
    expect(mascarar("cpf 12345678909")).toBe("cpf [CPF]");
  });
  it("CNPJ válido", () => {
    expect(mascarar("CNPJ 11.222.333/0001-81")).toBe("CNPJ [CNPJ]");
  });
  it("11 dígitos que NÃO são CPF válido viram telefone (DDD + celular)", () => {
    expect(mascarar("me liga 84991234567")).toBe("me liga [TELEFONE]");
  });
});

describe("mascarar: telefone e endereço", () => {
  it("vários formatos de telefone", () => {
    expect(mascarar("(84) 99123-4567")).toBe("[TELEFONE]");
    expect(mascarar("+55 84 99123-4567")).toBe("[TELEFONE]");
    expect(mascarar("ligue 99123-4567")).toBe("ligue [TELEFONE]");
    expect(mascarar("fixo (84) 3201-1234")).toBe("fixo [TELEFONE]");
  });
  it("CEP", () => {
    expect(mascarar("CEP 59150-000")).toBe("CEP [CEP]");
  });
  it("e-mail", () => {
    expect(mascarar("no e-mail giovanny.pasq@gmail.com, ok?")).toBe("no e-mail [E-MAIL], ok?");
  });
});

describe("mascarar: telecom e cartão", () => {
  it("ICCID do chip (19 dígitos, começando com 89), com espaços", () => {
    expect(mascarar("O chip é o 8955 0123 4567 8901 234.")).toBe("O chip é o [ICCID].");
  });
  it("IMEI (15 dígitos)", () => {
    expect(mascarar("IMEI 356938035643809")).toBe("IMEI [IMEI]");
  });
  it("cartão de crédito (Luhn), com espaços", () => {
    expect(mascarar("cartão 4111 1111 1111 1111")).toBe("cartão [CARTÃO]");
  });
});

describe("mascarar: o que NÃO é mascarado", () => {
  it("datas, horas, valores e números curtos", () => {
    expect(mascarar("No dia 03/10/2026 às 11:22, paguei R$ 59,90 no plano de 20 GB.")).toBe(
      "No dia 03/10/2026 às 11:22, paguei R$ 59,90 no plano de 20 GB.",
    );
  });
});

describe("mascarar: nomes", () => {
  const nomes = { "Giovanny Do Nascimento Pasqualin": "Cliente", Thiago: "Atendente" };
  it("o nome inteiro e cada parte; partículas (do, da) ficam", () => {
    expect(mascarar("Oi, Giovanny! Aqui é o Thiago.", nomes)).toBe(
      "Oi, Cliente! Aqui é o Atendente.",
    );
    expect(mascarar("Sr. Pasqualin, tudo certo?", nomes)).toBe("Sr. Cliente, tudo certo?");
    expect(mascarar("Giovanny Do Nascimento Pasqualin", nomes)).toBe("Cliente");
  });
  it("não troca pedaços de outras palavras", () => {
    expect(mascarar("Thiagoso não é nome.", nomes)).toBe("Thiagoso não é nome.");
  });
  it("sem diferenciar maiúsculas e acentos digitados igual", () => {
    expect(mascarar("GIOVANNY, tudo bem?", nomes)).toBe("Cliente, tudo bem?");
  });
});
