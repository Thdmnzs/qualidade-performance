import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// As funções do servidor e o login que cada uma usa: TODAS exigem o código, menos o uso do código de recuperação.
const ARQUIVOS = [
  "acessos",
  "avisos-contestacao",
  "avisos-trocas",
  "indicadores",
  "intercom",
  "mural",
  "notion",
  "pre-avaliacao",
  "senha",
  "verificacao",
];
describe("a etapa 2 no servidor: o login que exige o código", () => {
  it("só o uso do código de recuperação aceita uma sessão sem o código", () => {
    const semOCodigo: string[] = [];
    for (const a of ARQUIVOS) {
      const texto = readFileSync(`${process.cwd()}/src/lib/${a}.functions.ts`, "utf8");
      for (const m of texto.matchAll(
        /export const (\w+)\s*=\s*createServerFn[\s\S]*?\.middleware\(\[([^\]]*)\]/g,
      ))
        if (m[2]!.includes("SemOCodigo")) semOCodigo.push(m[1]!);
    }
    expect(semOCodigo).toEqual(["usarCodigoDeRecuperacaoFn"]);
  });
});

describe("a recuperação pelo código, por inteiro (23/10/2026)", () => {
  // O erro de 23/10/2026: a função usava o login sem a exigência, mas o LIMITE DE USO, que vem antes, tinha DENTRO
  // dele o login que exige o código, e a recuperação era sempre recusada.
  it("nenhuma peça da recuperação exige o código do celular (nem o limite de uso, por dentro)", () => {
    const funcoes = readFileSync(`${process.cwd()}/src/lib/verificacao.functions.ts`, "utf8");
    const m = funcoes.match(
      /export const usarCodigoDeRecuperacaoFn[\s\S]*?\.middleware\(\[([\s\S]*?)\]\)/,
    );
    expect(m, "a recuperação tem os middlewares").not.toBeNull();
    const pecas = m![1]!;
    expect(pecas).toContain("requireSupabaseAuthSemOCodigo");
    expect(pecas).toContain("limiteDeUsoSemOCodigo(");
    expect(pecas).not.toMatch(/\brequireSupabaseAuth\b(?!SemOCodigo)/);
    expect(pecas).not.toMatch(/\blimiteDeUso\(/);
    const limite = readFileSync(
      `${process.cwd()}/src/integrations/supabase/limite-de-uso.ts`,
      "utf8",
    );
    const dentro = limite.match(
      /export function limiteDeUsoSemOCodigo[\s\S]*?\.middleware\(\[([^\]]*)\]\)/,
    );
    expect(dentro![1]!.trim()).toBe("requireSupabaseAuthSemOCodigo");
  });
});
