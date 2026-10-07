import { describe, expect, it } from "vitest";
import {
  assuntoDoTicket,
  camposDoTicket,
  conversaDeOrigem,
  criadorDoTicket,
  estadoDoTicket,
  historicoDoTicket,
  mensagensDoTicket,
  tipoEntraNoSorteio,
  type TicketIntercom,
} from "../tickets";

// Um ticket no formato da API, como o do print (#142555470, [cxtech] B2C).
const RUBIA = { type: "admin", id: 701, name: "Rubia" };
const TICKET: TicketIntercom = {
  id: "215476171699001",
  ticket_id: "142555470",
  ticket_type: { id: 9, name: "[cxtech] B2C" },
  ticket_state: { category: "submitted", internal_label: "Submitted" },
  created_at: 1_791_380_000,
  ticket_attributes: {
    _default_title_:
      "data de nasc estava errada, ajustei; não aparece cadastro no paiwall pra liberar! help",
    _default_description_: "",
    "Tipo de solicitação": "dash: falha/atualização",
    "Print do erro": [{ url: "https://x/print.png" }],
    MSISDN: null,
    ICCID: "",
  },
  linked_objects: { data: [{ type: "conversation", id: "215476171612345" }] },
  ticket_parts: {
    ticket_parts: [
      // fora de ordem de propósito: a regra ordena pelo horário
      {
        part_type: "assignment",
        author: { type: "bot", id: 1, name: "Fluxo de trabalho" },
        created_at: 1_791_380_002,
      },
      { part_type: "conversation_linked", author: RUBIA, created_at: 1_791_380_000 },
      {
        part_type: "ticket_state_updated_by_admin",
        ticket_state: "submitted",
        author: RUBIA,
        created_at: 1_791_380_001,
      },
      {
        part_type: "note",
        body: "<p>Cliente já reiniciou o app.</p>",
        author: RUBIA,
        created_at: 1_791_380_100,
      },
      {
        part_type: "comment",
        body: "<p>Vamos verificar.</p>",
        author: { type: "admin", id: 900, name: "Ana (CX Tech)" },
        created_at: 1_791_380_200,
      },
    ],
  },
};

describe("tipoEntraNoSorteio: os 16 tipos do Intercom", () => {
  it("entram os dos cinco núcleos (inclusive os dois do financeiro)", () => {
    for (const n of [
      "[cxtech] B2B",
      "[cxtech] B2C",
      "[cxtech] troca de titularidade",
      "[financeiro] negociação fatura B2B",
      "[financeiro] reembolso pix automático",
      "[fraude e risco]",
      "[logística]",
      "[rede] A2P ou P2A",
      "[rede] dados ou cobertura",
      "[rede] histórico de consumo",
      "[rede] IMEI",
      "[rede] portabilidade",
      "[rede] VOZ ou SMS",
      "[rede] zero rating",
    ])
      expect(tipoEntraNoSorteio(n), n).toBe(true);
  });
  it("ficam de fora o [leads] e o teste", () => {
    expect(tipoEntraNoSorteio("[leads] B2B")).toBe(false);
    expect(tipoEntraNoSorteio("teste [automação]")).toBe(false);
  });
  it("um tipo novo de um núcleo entra sozinho (e sem acento também)", () => {
    expect(tipoEntraNoSorteio("[rede] eSIM")).toBe(true);
    expect(tipoEntraNoSorteio("[logistica] devolução")).toBe(true);
  });
});

describe("criadorDoTicket: quem é avaliado", () => {
  it("o atendente do primeiro registro (a Rubia), e não o robô nem quem respondeu depois", () => {
    expect(criadorDoTicket(TICKET)).toEqual({ id: "701", nome: "Rubia" });
  });
  it("sem nenhum atendente no histórico: null (o ticket fica fora do sorteio)", () => {
    const t = {
      ...TICKET,
      ticket_parts: {
        ticket_parts: [{ part_type: "assignment", author: { type: "bot", id: 1 }, created_at: 1 }],
      },
    };
    expect(criadorDoTicket(t)).toBeNull();
    expect(criadorDoTicket({ id: 1 })).toBeNull();
  });
  it("o cliente nunca é o criador", () => {
    const t = {
      ...TICKET,
      ticket_parts: {
        ticket_parts: [
          { part_type: "comment", body: "oi", author: { type: "user", id: 5 }, created_at: 1 },
        ],
      },
    };
    expect(criadorDoTicket(t)).toBeNull();
  });
});

describe("o ticket na tela", () => {
  it("estado em português", () => {
    expect(estadoDoTicket(TICKET)).toBe("enviado");
    expect(estadoDoTicket({ id: 1, ticket_state: "in_progress" })).toBe("em andamento");
  });
  it("campos: anexos contados, vazios como não preenchidos, sem os padrões", () => {
    expect(camposDoTicket(TICKET)).toEqual([
      { nome: "Tipo de solicitação", valor: "dash: falha/atualização" },
      { nome: "Print do erro", valor: "1 anexo" },
      { nome: "MSISDN", valor: null },
      { nome: "ICCID", valor: null },
    ]);
  });
  it("notas e comentários viram mensagens (texto puro)", () => {
    expect(mensagensDoTicket(TICKET)).toEqual([
      { autor: "nota", nome: "Rubia", quando: 1_791_380_100, texto: "Cliente já reiniciou o app." },
      {
        autor: "atendente",
        nome: "Ana (CX Tech)",
        quando: 1_791_380_200,
        texto: "Vamos verificar.",
      },
    ]);
  });
  it("o histórico, em ordem, com o robô como fluxo de trabalho", () => {
    expect(historicoDoTicket(TICKET).map((h) => h.texto)).toEqual([
      "Rubia: vinculou a conversa com o cliente",
      'Rubia: mudou para "enviado"',
      "Fluxo de trabalho: atribuiu o ticket",
    ]);
  });
  it("a conversa de origem e o assunto sugerido", () => {
    expect(conversaDeOrigem(TICKET)).toBe("215476171612345");
    expect(assuntoDoTicket(TICKET)).toBe("[cxtech] B2C · dash: falha/atualização");
  });
});
