import { describe, expect, it } from "vitest";

import type { Mensagem } from "../intercom";
import {
  encaixarConversa,
  LIMITE_DA_CONVERSA,
  LIMITE_POR_MENSAGEM,
  montarPedido,
} from "../pre-avaliacao";

const m = (texto: string, autor: Mensagem["autor"] = "cliente"): Mensagem => ({
  autor,
  nome: null,
  quando: null,
  texto,
});

describe("o tamanho da conversa para a IA (29/10/2026)", () => {
  it("uma conversa normal vai inteira, sem nenhum corte", () => {
    const conversa = [m("Meu chip não funciona."), m("Vou verificar!", "atendente")];
    expect(encaixarConversa(conversa)).toEqual({ mensagens: conversa, cortou: false });
  });
  it("uma mensagem longa demais (um e-mail com o histórico citado) é cortada, com o aviso", () => {
    const { mensagens, cortou } = encaixarConversa([m("x".repeat(LIMITE_POR_MENSAGEM * 3))]);
    expect(cortou).toBe(true);
    expect(mensagens[0]!.texto.length).toBeLessThan(LIMITE_POR_MENSAGEM + 80);
    expect(mensagens[0]!.texto).toContain("o resto desta mensagem foi cortado");
  });
  it("uma conversa gigante: ficam o começo (o pedido) e o fim (a solução), e o meio vira um aviso", () => {
    const conversa = [
      m("O PEDIDO DO CLIENTE"),
      ...Array.from({ length: 200 }, (_, i) => m(`${i} `.padEnd(7_000, "y"))),
      m("A SOLUÇÃO", "atendente"),
    ];
    const { mensagens, cortou } = encaixarConversa(conversa);
    expect(cortou).toBe(true);
    expect(mensagens[0]!.texto).toBe("O PEDIDO DO CLIENTE");
    expect(mensagens.at(-1)!.texto).toBe("A SOLUÇÃO");
    expect(
      mensagens.some((x) => /mensagens do meio da conversa foram omitidas/.test(x.texto)),
    ).toBe(true);
    expect(mensagens.reduce((t, x) => t + x.texto.length, 0)).toBeLessThanOrEqual(
      LIMITE_DA_CONVERSA + 200,
    );
  });
  it("o pedido para a IA fica dentro do limite, mesmo com uma conversa gigante", () => {
    const conversa = Array.from({ length: 400 }, (_, i) => m(`${i} `.padEnd(9_000, "z")));
    const pedido = montarPedido({
      ficha: [],
      mensagens: conversa,
      atributos: [],
      processo: null,
      dicionario: null,
    });
    const texto = pedido.messages[0]!.content as string;
    expect(texto.length).toBeLessThan(LIMITE_DA_CONVERSA + 20_000);
    expect(texto).toContain("foram omitidas, pelo tamanho");
  });
});
