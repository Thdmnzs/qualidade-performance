import { describe, expect, it } from "vitest";

import { base32ParaBytes, codigoDoCelular } from "../../../e2e/codigo-do-celular";

// Os valores oficiais do padrão (a RFC 6238, apêndice B): o segredo "12345678901234567890", em 8 dígitos
const SEGREDO = Buffer.from("12345678901234567890");
describe("o código do celular dos testes de ponta a ponta (o TOTP)", () => {
  it("bate com os valores oficiais do padrão", () => {
    expect(codigoDoCelular(SEGREDO, 59_000, 8)).toBe("94287082");
    expect(codigoDoCelular(SEGREDO, 1_111_111_109_000, 8)).toBe("07081804");
    expect(codigoDoCelular(SEGREDO, 1_234_567_890_000, 8)).toBe("89005924");
    expect(codigoDoCelular(SEGREDO, 2_000_000_000_000, 8)).toBe("69279037");
  });
  it("a chave em texto do cadastro (base32), com espaços e minúsculas", () => {
    expect(base32ParaBytes("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ").toString()).toBe(
      "12345678901234567890",
    );
    expect(base32ParaBytes("gezdgnbvgy3tqojqgezdgnbvgy3tqojq").equals(SEGREDO)).toBe(true);
  });
  it("um caractere inválido na chave é recusado", () => {
    expect(() => base32ParaBytes("GEZD1")).toThrow();
  });
});
