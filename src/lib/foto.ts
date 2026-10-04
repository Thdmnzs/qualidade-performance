/**
 * Foto de perfil: regras e preparação da imagem.
 *
 * A imagem é preparada NO NAVEGADOR antes do envio: recorte quadrado no
 * centro, 256 x 256 px, WebP. Redesenhar a imagem descarta os metadados do
 * arquivo original (como o local onde a foto foi tirada e o aparelho).
 */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];
export const TAMANHO_MAXIMO_ORIGINAL = 10 * 1024 * 1024; // 10 MB (o que é enviado tem poucos KB)
export const LADO_FINAL = 256;
export const BUCKET_DAS_FOTOS = "avatares";

/** Caminho da foto no armazenamento: um arquivo por cadastro. */
export const caminhoDaFoto = (employeeId: string) => `${employeeId}/avatar.webp`;

/** Mensagem de erro, ou null quando o arquivo pode ser usado. */
export function validarArquivoDeFoto(arquivo: { type: string; size: number }): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return "Envie uma imagem JPG, PNG ou WebP.";
  if (arquivo.size > TAMANHO_MAXIMO_ORIGINAL) return "A foto original pode ter até 10 MB.";
  return null;
}

/** O maior quadrado possível, no centro da imagem. */
export function recorteCentral(
  largura: number,
  altura: number,
): { x: number; y: number; lado: number } {
  const lado = Math.min(largura, altura);
  return { x: (largura - lado) / 2, y: (altura - lado) / 2, lado };
}

/** Iniciais do nome, para quando não há foto. */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Prepara a foto para o envio (só no navegador). Devolve a imagem pronta e um
 * endereço local para mostrar a prévia antes de salvar.
 */
export async function prepararFoto(arquivo: File): Promise<{ blob: Blob; previa: string }> {
  const erro = validarArquivoDeFoto(arquivo);
  if (erro) throw new Error(erro);
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    throw new Error("Não consegui abrir essa imagem. Tente outra.");
  }
  const { x, y, lado } = recorteCentral(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = LADO_FINAL;
  tela.height = LADO_FINAL;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a foto.");
  ctx.drawImage(imagem, x, y, lado, lado, 0, 0, LADO_FINAL, LADO_FINAL);
  imagem.close();
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/webp", 0.85));
  // Alguns navegadores antigos não geram WebP e devolvem PNG: o armazenamento só aceita WebP.
  if (!blob || blob.type !== "image/webp") {
    throw new Error(
      "Seu navegador não conseguiu preparar a foto. Tente pelo Chrome, Edge ou Firefox atualizados.",
    );
  }
  return { blob, previa: URL.createObjectURL(blob) };
}
