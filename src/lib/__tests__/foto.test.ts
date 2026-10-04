import { describe, expect, it } from "vitest";
import { caminhoDaFoto, iniciais, recorteCentral, validarArquivoDeFoto } from "../foto";

describe("validarArquivoDeFoto", () => {
  it("aceita JPG, PNG e WebP até 10 MB", () => {
    expect(validarArquivoDeFoto({ type: "image/jpeg", size: 4 * 1024 * 1024 })).toBeNull();
    expect(validarArquivoDeFoto({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
  });
  it("recusa outros tipos, inclusive SVG (que pode conter código)", () => {
    expect(validarArquivoDeFoto({ type: "image/svg+xml", size: 1000 })).toMatch(/JPG, PNG ou WebP/);
    expect(validarArquivoDeFoto({ type: "text/html", size: 1000 })).toMatch(/JPG, PNG ou WebP/);
  });
  it("recusa acima de 10 MB", () => {
    expect(validarArquivoDeFoto({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toMatch(
      /10 MB/,
    );
  });
});

describe("recorteCentral", () => {
  it("foto deitada: corta as laterais", () => {
    expect(recorteCentral(4000, 3000)).toEqual({ x: 500, y: 0, lado: 3000 });
  });
  it("foto em pé: corta em cima e embaixo", () => {
    expect(recorteCentral(1080, 1920)).toEqual({ x: 0, y: 420, lado: 1080 });
  });
  it("foto quadrada: não corta nada", () => {
    expect(recorteCentral(500, 500)).toEqual({ x: 0, y: 0, lado: 500 });
  });
});

describe("caminho e iniciais", () => {
  it("um arquivo por cadastro, sempre com o mesmo nome", () => {
    expect(caminhoDaFoto("abc-123")).toBe("abc-123/avatar.webp");
  });
  it("as duas primeiras iniciais", () => {
    expect(iniciais("Thiago Dantas")).toBe("TD");
    expect(iniciais("  rachel  ")).toBe("R");
    expect(iniciais("Ana Maria de Souza")).toBe("AM");
  });
});
