import { describe, expect, it } from "vitest";

import { separarAtendentes, type Mensagem } from "../intercom";
import { montarPedido } from "../pre-avaliacao";

// O exemplo da supervisão: um contato com a Rubia, a Suelen e o Thiago, e a Rachel avaliando o Thiago
const RUBIA = "101";
const SUELEN = "102";
const THIAGO = "103";
const m = (
  autor: Mensagem["autor"],
  texto: string,
  autorId: string | null = null,
  nome: string | null = null,
): Mensagem => ({ autor, texto, autorId, nome, quando: null });
const CONVERSA: Mensagem[] = [
  m("cliente", "Meu chip não dá sinal."),
  m("atendente", "Oi! Vou verificar a sua linha.", RUBIA, "Rubia Lopes"),
  m("nota", "Transferindo para o turno da tarde.", RUBIA, "Rubia Lopes"),
  m("atendente", "Olá, continuo o atendimento. Pode reiniciar o aparelho?", SUELEN, "Suelen Rocha"),
  m("cliente", "Reiniciei e nada."),
  m("atendente", "Abri um chamado na operadora, o prazo é de 24h.", THIAGO, "Thiago Dantas"),
  m("atendente", "Te aviso assim que responderem!", THIAGO, "Thiago Dantas"),
];

describe("os contatos com vários atendentes (22/10/2026)", () => {
  it("marca só as respostas do avaliado, e lista os três atendentes na ordem", () => {
    const { mensagens, atendentes } = separarAtendentes(CONVERSA, THIAGO);
    expect(mensagens.filter((x) => x.doAvaliado).map((x) => x.texto)).toEqual([
      "Abri um chamado na operadora, o prazo é de 24h.",
      "Te aviso assim que responderem!",
    ]);
    expect(atendentes.map((a) => [a.nome, a.avaliado, a.mensagens])).toEqual([
      ["Rubia Lopes", false, 1], // a nota interna não conta como resposta
      ["Suelen Rocha", false, 1],
      ["Thiago Dantas", true, 2],
    ]);
  });
  it("o mesmo contato, avaliando a Rubia: a parte dela", () => {
    const { mensagens } = separarAtendentes(CONVERSA, RUBIA);
    expect(mensagens.filter((x) => x.doAvaliado).map((x) => x.texto)).toEqual([
      "Oi! Vou verificar a sua linha.",
    ]);
  });
  it("o pedido para a IA: os rótulos, a instrução de avaliar só o avaliado, e nenhum nome do time", () => {
    const { mensagens } = separarAtendentes(CONVERSA, THIAGO);
    const pedido = montarPedido({
      ficha: [],
      mensagens,
      atributos: [],
      processo: null,
      dicionario: null,
    });
    const texto = pedido.messages[0]!.content as string;
    expect(texto).toContain(
      "<atendentes>Este contato teve MAIS DE UM atendente. Avalie SOMENTE o atendimento do [Atendente avaliado]",
    );
    expect(texto).toContain("[Outro atendente] Oi! Vou verificar a sua linha.");
    expect(texto).toContain("[Outro atendente] Olá, continuo o atendimento.");
    expect(texto).toContain("[Atendente avaliado] Abri um chamado na operadora");
    expect(texto).not.toMatch(/Rubia|Suelen|Thiago/); // os nomes não vão (a conversa ainda é mascarada antes)
  });
  it("uma conversa com um atendente só: o pedido de sempre (sem a instrução, com o rótulo Atendente)", () => {
    const { mensagens } = separarAtendentes(
      CONVERSA.filter((x) => x.autorId !== RUBIA && x.autorId !== SUELEN),
      THIAGO,
    );
    const texto = montarPedido({
      ficha: [],
      mensagens,
      atributos: [],
      processo: null,
      dicionario: null,
    }).messages[0]!.content as string;
    expect(texto).not.toContain("<atendentes>");
    expect(texto).toContain("[Atendente] Abri um chamado na operadora");
  });
});
