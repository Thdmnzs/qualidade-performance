import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async (_a: unknown) => ({ error: null }));
const eqApagado = vi.fn(async (_c: string, _v: string) => ({ error: null }));
const rpc = vi.fn(async (_n: string, _a?: unknown) => ({ data: true, error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (n: string, a?: unknown) => rpc(n, a),
    from: () => ({
      upsert: (a: unknown) => upsert(a),
      update: () => {
        const filtros: [string, string][] = [];
        const c: Record<string, unknown> = {};
        c["eq"] = (col: string, v: string) => (filtros.push([col, v]), eqApagado(col, v), c);
        c["gte"] = () => c;
        c["not"] = async () => ({ error: null });
        c["then"] = (ok: (v: unknown) => void) => ok({ error: null });
        return c;
      },
    }),
  },
}));
process.env["SLACK_BOT_TOKEN"] = "xoxb-teste";
const {
  assinaturaValida,
  CANAL_DE_INSTABILIDADE,
  CANAL_DO_MURAL,
  lerMuralSePreciso,
  textoDaMensagem,
  tratarEvento,
} = await import("../slack-mural.server");

// O Slack simulado: o canal, as conversas e as pessoas
const PAI = {
  ts: "1792522885.457269",
  user: "U032Y777M0B",
  text: "<!here> *[alinhamento] reembolso*\ncriticidade: média",
  reply_count: 1,
  reactions: [{ name: "white_check_mark", count: 5 }],
};
const RESPOSTA = {
  ts: "1792523069.000100",
  thread_ts: PAI.ts,
  user: "U032Y777M0B",
  text: "pessoal, <@U05SSN24P3L> explica",
};
const chamadas: string[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      chamadas.push(u.pathname.replace("/api/", ""));
      const m = u.pathname.replace("/api/", "");
      if (m === "conversations.history")
        return Response.json({
          ok: true,
          messages: [PAI, { ts: "1.1", subtype: "channel_join", text: "entrou" }],
        });
      if (m === "conversations.replies")
        return Response.json({ ok: true, messages: [PAI, RESPOSTA] });
      if (m === "users.info")
        return Response.json({
          ok: true,
          user: {
            profile: {
              display_name: u.searchParams.get("user") === "U032Y777M0B" ? "vitor" : "Ardson",
            },
          },
        });
      return Response.json({ ok: false, error: "desconhecido" });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  chamadas.length = 0;
});

describe("a assinatura do Slack", () => {
  const segredo = "segredo-de-teste";
  const corpo = '{"type":"event_callback"}';
  const agora = 1_792_522_900_000;
  const assinar = (momento: string) =>
    `v0=${createHmac("sha256", segredo).update(`v0:${momento}:${corpo}`).digest("hex")}`;
  it("a certa vale; a errada, a de outro corpo e a sem segredo não", () => {
    const m = String(agora / 1000);
    expect(assinaturaValida({ corpo, momento: m, assinatura: assinar(m), segredo, agora })).toBe(
      true,
    );
    expect(assinaturaValida({ corpo, momento: m, assinatura: "v0=errada", segredo, agora })).toBe(
      false,
    );
    expect(
      assinaturaValida({ corpo: corpo + " ", momento: m, assinatura: assinar(m), segredo, agora }),
    ).toBe(false);
    expect(
      assinaturaValida({ corpo, momento: m, assinatura: assinar(m), segredo: "", agora }),
    ).toBe(false);
  });
  it("um aviso de mais de 5 minutos é recusado (contra a repetição)", () => {
    const antigo = String(agora / 1000 - 301);
    expect(
      assinaturaValida({ corpo, momento: antigo, assinatura: assinar(antigo), segredo, agora }),
    ).toBe(false);
  });
});

describe("os avisos do Slack no mural", () => {
  it("uma mensagem nova: o comunicado com a conversa, os nomes no lugar das menções e o ✅", async () => {
    await tratarEvento({
      type: "message",
      channel: CANAL_DO_MURAL,
      ts: PAI.ts,
      user: PAI.user,
      text: PAI.text,
    } as never);
    const linha = upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(linha).toMatchObject({
      ts: PAI.ts,
      autor_nome: "Vitor",
      reacoes_ok: 5,
      qtd_respostas: 1,
      apagado: false,
    });
    expect(linha["respostas"]).toEqual([
      { ts: RESPOSTA.ts, autor_nome: "Vitor", texto: "pessoal, <@U05SSN24P3L|Ardson> explica" },
    ]);
  });
  it("uma resposta na conversa: relê o comunicado de cima", async () => {
    await tratarEvento({ type: "message", channel: CANAL_DO_MURAL, ...RESPOSTA } as never);
    expect((upsert.mock.calls[0]![0] as { ts: string }).ts).toBe(PAI.ts);
  });
  it("um comunicado apagado no Slack some do mural", async () => {
    await tratarEvento({
      type: "message",
      channel: CANAL_DO_MURAL,
      subtype: "message_deleted",
      deleted_ts: PAI.ts,
      previous_message: { ts: PAI.ts },
    } as never);
    expect(eqApagado).toHaveBeenCalledWith("canal", CANAL_DO_MURAL);
    expect(eqApagado).toHaveBeenCalledWith("ts", PAI.ts);
  });
  it("um aviso de outro canal é ignorado (nada é lido nem gravado)", async () => {
    await tratarEvento({
      type: "message",
      channel: "C_OUTRO",
      ts: "1.0",
      text: "segredo de outro canal",
    } as never);
    expect(chamadas).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("a releitura do canal", () => {
  it("com a reserva: lê o canal (sem as entradas no canal), grava, e conclui", async () => {
    expect(await lerMuralSePreciso(5)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(2); // os dois canais (e, em cada um, só a mensagem: a entrada no canal não)
    expect(upsert.mock.calls.map(([l]) => (l as { canal: string }).canal)).toEqual([
      CANAL_DO_MURAL,
      CANAL_DE_INSTABILIDADE,
    ]);
    expect(rpc.mock.calls.map(([n]) => n)).toEqual([
      "reservar_leitura_do_mural",
      "concluir_leitura_do_mural",
    ]);
  });
  it("uma leitura que falha (por exemplo, sem a permissão no Slack) não conta como feita", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "missing_scope" })),
    );
    await expect(lerMuralSePreciso(5)).rejects.toThrow("missing_scope");
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["reservar_leitura_do_mural"]); // sem o "concluir"
  });
  it("sem a reserva (a última leitura é recente, ou outra está em andamento): nada", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await lerMuralSePreciso(5)).toBe(false);
    expect(chamadas).toEqual([]);
  });
});

describe("as instabilidades (20/10/2026)", () => {
  it("o texto de um aviso do Statuspage, nos blocos (com a situação pelo texto alternativo da imagem)", () => {
    const texto = textoDaMensagem({
      text: "",
      blocks: [
        {
          type: "section",
          text: {
            text: "*Incident: Resolved*\n*<https://status.pagar.me/incidents/8dp|Instabilidade: Transacional - PIX>*\nEntre 00:54 e 01:35 passamos por uma instabilidade.",
          },
        },
        {
          type: "context",
          elements: [
            { type: "image", alt_text: "operational" },
            { type: "mrkdwn", text: "Transacional - Transacional - PIX" },
          ],
        },
        { type: "actions", elements: [{ type: "button", text: "View all updates" }] },
      ],
    });
    expect(texto).toBe(
      "*Incident: Resolved*\n*<https://status.pagar.me/incidents/8dp|Instabilidade: Transacional - PIX>*\nEntre 00:54 e 01:35 passamos por uma instabilidade.\noperational\nTransacional - Transacional - PIX",
    );
    expect(texto).not.toContain("View all updates"); // os botões ficam de fora
  });
  it("os anexos (o formato antigo das integrações), e o texto comum quando não há nada além", () => {
    expect(
      textoDaMensagem({
        attachments: [
          { title: "Instabilidade", title_link: "https://x.io/i/1", text: "A API caiu." },
        ],
      }),
    ).toBe("*<https://x.io/i/1|Instabilidade>*\nA API caiu.");
    expect(textoDaMensagem({ text: "o PIX caiu de novo?" })).toBe("o PIX caiu de novo?");
  });
  it("um aviso do #instabilidade é gravado no canal dele", async () => {
    await tratarEvento({
      type: "message",
      channel: CANAL_DE_INSTABILIDADE,
      ts: PAI.ts,
      text: "o PIX caiu?",
    } as never);
    expect((upsert.mock.calls[0]![0] as { canal: string }).canal).toBe(CANAL_DE_INSTABILIDADE);
  });
});
