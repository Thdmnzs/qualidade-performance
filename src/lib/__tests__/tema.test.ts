import { describe, expect, it } from "vitest";
import { CHAVE_DO_TEMA, proximoTema, SCRIPT_DO_TEMA, temaGuardado } from "../tema";

describe("tema", () => {
  it("o botão alterna entre claro e escuro", () => {
    expect(proximoTema("claro")).toBe("escuro");
    expect(proximoTema("escuro")).toBe("claro");
  });
  it("sem escolha guardada (ou com valor estranho), abre no claro", () => {
    expect(temaGuardado(null)).toBe("claro");
    expect(temaGuardado("automatico")).toBe("claro");
    expect(temaGuardado("escuro")).toBe("escuro");
  });
  it("o script do cabeçalho lê a mesma chave, é pequeno e não quebra sem armazenamento", () => {
    expect(SCRIPT_DO_TEMA).toContain(JSON.stringify(CHAVE_DO_TEMA));
    expect(SCRIPT_DO_TEMA).toMatch(/^try\{.*\}catch\(e\)\{\}$/);
    expect(SCRIPT_DO_TEMA.length).toBeLessThan(200);
  });
  it("o script aplica a classe 'dark' só quando o escuro está guardado", () => {
    const rodar = (guardado: string | null) => {
      const classes = new Set<string>();
      const documento = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
      const armazenamento = { getItem: (k: string) => (k === CHAVE_DO_TEMA ? guardado : null) };
      new Function("document", "localStorage", SCRIPT_DO_TEMA)(documento, armazenamento);
      return classes.has("dark");
    };
    expect(rodar("escuro")).toBe(true);
    expect(rodar("claro")).toBe(false);
    expect(rodar(null)).toBe(false);
  });
});
