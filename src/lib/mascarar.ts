/**
 * Mascaramento de dados sensíveis antes de qualquer envio à IA (06/10/2026).
 *
 * Estratégia: encontrar sequências longas de dígitos (com pontos, traços,
 * barras, espaços ou parênteses no meio), juntar só os dígitos e classificar
 * pelo formato, usando as regras de verificação de cada documento:
 *   CPF e CNPJ: dígitos verificadores. Cartão: algoritmo de Luhn.
 *   ICCID (chip): 19 ou 20 dígitos, começando com 89. IMEI: 15 dígitos.
 *   Telefone: com ou sem DDI 55, DDD e 8 ou 9 dígitos. CEP: 00000-000.
 * Datas ("03/10/2026") e valores ("R$ 59,90") ficam como estão.
 * Depois, e-mails, e os nomes informados (o cliente vira "Cliente").
 */

const soDigitos = (s: string) => s.replace(/\D/g, "");

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos =
      n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

function luhn(d: string): boolean {
  let soma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

const DATA = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const HORA = /^\d{1,2}:\d{2}/;

/** O marcador para uma sequência de dígitos, ou null (fica como está). */
function classificar(trecho: string): string | null {
  const t = trecho.trim();
  if (DATA.test(t) || HORA.test(t)) return null;
  const d = soDigitos(t);
  if (/^\d{5}-\d{3}$/.test(t)) return "[CEP]";
  if ((d.length === 19 || d.length === 20) && d.startsWith("89")) return "[ICCID]";
  if (d.length === 14 && cnpjValido(d)) return "[CNPJ]";
  if (d.length === 11 && cpfValido(d)) return "[CPF]";
  if (d.length >= 13 && d.length <= 19 && luhn(d)) {
    if (d.length === 15 && !/^3[47]/.test(d)) return "[IMEI]";
    return "[CARTÃO]";
  }
  if (d.length === 15) return "[IMEI]";
  // Telefone: DDI 55 + DDD + 8/9 dígitos, ou DDD + 8/9, ou só 8/9 (com o traço).
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return "[TELEFONE]";
  if (d.length === 10 || d.length === 11) return "[TELEFONE]";
  if ((d.length === 8 || d.length === 9) && /\d{4,5}-\d{4}/.test(t)) return "[TELEFONE]";
  return null;
}

// Uma sequência começando por dígito (ou "+" / "("), com separadores, terminando em dígito.
const SEQUENCIA = /(?<![\p{L}\d@.])[+(]?\d[\d .\-/()]{5,}\d(?![\p{L}\d@])/gu;
const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu;
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/**
 * Mascara o texto. `nomes` são substituições de nome inteiro e de cada parte
 * (ex.: { "Giovanny Do Nascimento": "Cliente" }): "Giovanny" vira "Cliente".
 */
export function mascarar(texto: string, nomes: Record<string, string> = {}): string {
  let s = texto.replace(EMAIL, "[E-MAIL]");
  s = s.replace(SEQUENCIA, (m) => classificar(m) ?? m);
  for (const [nome, marcador] of Object.entries(nomes)) {
    const partes = nome
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !PARTICULAS.has(p.toLowerCase()))
      .sort((a, b) => b.length - a.length);
    for (const parte of [nome.trim(), ...partes]) {
      if (!parte) continue;
      const seguro = parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`(?<![\\p{L}])${seguro}(?![\\p{L}])`, "giu"), marcador);
    }
  }
  // Partes de um mesmo nome lado a lado ("Cliente Cliente") viram uma só.
  for (const marcador of new Set(Object.values(nomes))) {
    s = s.replace(new RegExp(`${marcador}(\\s+${marcador})+`, "g"), marcador);
  }
  return s;
}
