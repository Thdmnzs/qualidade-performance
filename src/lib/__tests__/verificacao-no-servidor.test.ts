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
