/**
 * O código do celular para os testes de ponta a ponta (23/10/2026): o mesmo cálculo do aplicativo autenticador
 * (o TOTP, RFC 6238: o HMAC-SHA1 do segredo com o relógio, a cada 30 segundos, em 6 dígitos). Sem biblioteca: o
 * Node já tem o HMAC.
 */
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** A chave que o CX Hub mostra no cadastro ("JBSW Y3DP..."), em bytes. */
export function base32ParaBytes(chave: string): Buffer {
  const limpa = chave.toUpperCase().replace(/[\s=-]/g, "");
  let bits = "";
  for (const c of limpa) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error("A chave do aplicativo tem um caractere inválido.");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** O código de um momento (o mesmo que o aplicativo mostraria). */
export function codigoDoCelular(segredo: Buffer, agoraMs = Date.now(), digitos = 6): string {
  const contador = Math.floor(agoraMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", segredo).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 10 ** digitos).padStart(digitos, "0");
}
