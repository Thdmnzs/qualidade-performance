import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (f: unknown) => f }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://x") }));
const { sessaoComOCodigo } = await import("../auth-middleware");

describe("o login das funções do servidor exige o código do celular (21/10/2026)", () => {
  it("só a sessão que passou pelo código (aal2)", () => {
    expect(sessaoComOCodigo({ sub: "u", aal: "aal2" })).toBe(true);
    expect(sessaoComOCodigo({ sub: "u", aal: "aal1" })).toBe(false); // só a senha
    expect(sessaoComOCodigo({ sub: "u" })).toBe(false);
    expect(sessaoComOCodigo(null)).toBe(false);
  });
});
