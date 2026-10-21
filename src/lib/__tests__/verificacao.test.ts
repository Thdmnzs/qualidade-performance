import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ALFABETO, destinoDaVerificacao, gerarCodigos, normalizarCodigo } from "../verificacao";

describe("a verificação em duas etapas: para onde mandar a pessoa", () => {
  it("sem o aplicativo: cadastrar (é obrigatório para todos)", () => {
    expect(destinoDaVerificacao({ currentLevel: "aal1", nextLevel: "aal1" })).toBe("cadastrar");
    expect(destinoDaVerificacao(null)).toBe("cadastrar");
  });
  it("com o aplicativo, mas sem o código nesta sessão: verificar", () => {
    expect(destinoDaVerificacao({ currentLevel: "aal1", nextLevel: "aal2" })).toBe("verificar");
  });
  it("com o código: ok", () => {
    expect(destinoDaVerificacao({ currentLevel: "aal2", nextLevel: "aal2" })).toBe("ok");
  });
});

describe("os códigos de recuperação", () => {
  const codigos = gerarCodigos((n) => new Uint8Array(randomBytes(n)));
  it("10 códigos, no formato XXXX-XXXX, sem repetidos", () => {
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const c of codigos) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it("sem os caracteres que se confundem (0, O, 1, I e L)", () => {
    expect(ALFABETO).not.toMatch(/[0O1IL]/);
    for (const c of codigos) expect(c).not.toMatch(/[0O1IL]/);
  });
  it("todos os caracteres com a mesma chance (os bytes acima do limite são descartados)", () => {
    // Uma fonte que só devolve 255 (acima do limite de 248) e depois 0: o 255 é descartado, e sai o "A".
    let vez = 0;
    const [c] = gerarCodigos((n) => new Uint8Array(n).fill(vez++ % 2 ? 0 : 255), 1);
    expect(c).toBe("AAAA-AAAA");
  });
  it("o código como a pessoa digita", () => {
    expect(normalizarCodigo(" r4tp 2wza ")).toBe("R4TP-2WZA");
    expect(normalizarCodigo("R4TP-2WZ")).toBeNull();
  });
});
