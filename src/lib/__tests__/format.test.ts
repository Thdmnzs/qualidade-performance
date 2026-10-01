import { describe, expect, it } from "vitest";
import {
  confirmacaoConfere,
  dataBR,
  LOGIN_VALIDO,
  normalizarEmail,
  normalizarLogin,
} from "../format";

describe("dataBR", () => {
  it("formata data de calendário sem deslocar o dia (bug das quinzenas)", () => {
    expect(dataBR("2026-09-01")).toBe("01/09/2026");
    expect(dataBR("2026-09-15")).toBe("15/09/2026");
    expect(dataBR("2026-09-16")).toBe("16/09/2026");
  });

  it("não depende do fuso do computador de quem acessa", () => {
    // Virada de ano é o caso mais sensível: um deslocamento mudaria até o ano.
    expect(dataBR("2027-01-01")).toBe("01/01/2027");
  });

  it("converte momentos (com horário) para o fuso de Fortaleza", () => {
    // 02:00 UTC do dia 1º = 23:00 do dia 31 em Fortaleza (UTC-3)
    expect(dataBR("2026-09-01T02:00:00Z")).toBe("31/08/2026");
  });

  it("mostra travessão para valor vazio", () => {
    expect(dataBR(null)).toBe("—");
    expect(dataBR("")).toBe("—");
  });
});

describe("normalizarLogin", () => {
  it("converte nome digitado em login válido", () => {
    expect(normalizarLogin("Thiago Dantas")).toBe("thiago.dantas");
    expect(normalizarLogin("  João   da Silva ")).toBe("joao.da.silva");
    expect(normalizarLogin("maria@empresa")).toBe("mariaempresa");
  });

  it("gera resultado aceito pelo padrão do banco", () => {
    expect(LOGIN_VALIDO.test(normalizarLogin("Thiago Dantas"))).toBe(true);
    expect(LOGIN_VALIDO.test("Thiago Dantas")).toBe(false);
  });
});

describe("normalizarEmail", () => {
  it("remove espaços e usa minúsculas, como o banco exige", () => {
    expect(normalizarEmail("  Thiago@Empresa.com ")).toBe("thiago@empresa.com");
  });
});

describe("confirmacaoConfere (mesma regra do banco)", () => {
  it("aceita o nome com maiúsculas e espaços diferentes", () => {
    expect(confirmacaoConfere("  thiago DANTAS ", "Thiago Dantas")).toBe(true);
  });
  it("recusa nome incompleto", () => {
    expect(confirmacaoConfere("Thiago", "Thiago Dantas")).toBe(false);
  });
});
