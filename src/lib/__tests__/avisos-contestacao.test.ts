import { describe, expect, it } from "vitest";
import {
  protegerSlack,
  textoDaAbertura,
  textoDaResposta,
  TEXTO_DO_LEMBRETE,
  type DadosDoAviso,
} from "../avisos-contestacao";

const D: DadosDoAviso = {
  status: "aberta",
  colaborador: "Rubia",
  tipo: "interacao",
  assunto: "Portabilidade",
  data_contato: "2026-10-03",
  avaliador: "Rachel Kivel",
  responder_ate: "2026-10-10T02:59:00Z", // 09/10, 23:59 em Fortaleza
  respondida_em: null,
  respondeu: null,
  nota_anterior: null,
  nota_nova: null,
};

describe("textoDaAbertura", () => {
  it("como na prévia: quem, qual avaliação, o prazo de 1 dia útil e o link", () => {
    expect(textoDaAbertura(D, "https://qh.vercel.app")).toBe(
      [
        "*📝 UMA NOVA CONTESTAÇÃO FOI ABERTA*",
        '*Rubia* contestou a avaliação de *Interação* "Portabilidade", do contato de 03/10/2026, avaliada por *Rachel Kivel*.',
        "Você tem *1 dia útil* para responder: até *09/10/2026, 23:59*.",
        "<https://qh.vercel.app/admin/contestacoes|Abrir no CX Hub>",
      ].join("\n"),
    );
  });
  it("um ticket de back-office", () => {
    expect(
      textoDaAbertura({ ...D, tipo: "ticket_n2", assunto: "[cxtech] B2C" }, "https://x"),
    ).toContain('a avaliação de *Ticket de back-office* "[cxtech] B2C"');
  });
});

describe("protegerSlack: nada nos dados vira comando do Slack", () => {
  it("<!channel> não chama o canal, e um link não se disfarça", () => {
    const t = textoDaAbertura(
      { ...D, assunto: "<!channel> veja <http://golpe.com|aqui>" },
      "https://x",
    );
    expect(t).not.toContain("<!channel>");
    expect(t).not.toContain("<http://golpe.com");
    expect(t).toContain("&lt;!channel&gt; veja &lt;http://golpe.com|aqui&gt;");
  });
  it("o & também", () => expect(protegerSlack("P&D")).toBe("P&amp;D"));
});

describe("textoDaResposta", () => {
  const r = { ...D, respondida_em: "2026-10-09T13:41:00Z", respondeu: "Rachel Kivel" };
  it("aceita, com a nota", () => {
    expect(textoDaResposta({ ...r, status: "deferida", nota_anterior: 95, nota_nova: 100 })).toBe(
      "✅ *Rachel Kivel* respondeu a contestação de *Rubia* em 09/10/2026, às 10:41: *aceita* (nota 95 → 100).",
    );
  });
  it("recusada", () => {
    expect(textoDaResposta({ ...r, status: "indeferida" })).toBe(
      "❌ *Rachel Kivel* respondeu a contestação de *Rubia* em 09/10/2026, às 10:41: *recusada*.",
    );
  });
});

it("o lembrete", () => expect(TEXTO_DO_LEMBRETE).toContain("vence hoje*, às 23:59"));
