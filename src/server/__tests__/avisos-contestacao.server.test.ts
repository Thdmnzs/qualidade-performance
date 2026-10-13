import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- O banco, simulado: uma contestação, com as mesmas regras das funções ----------
type Estado = {
  status: string;
  slack_ts: string | null;
  slack_abertura_em: string | null;
  slack_lembrete_em: string | null;
  slack_resposta_em: string | null;
};
let c: Estado;
const COL: Record<string, keyof Estado> = {
  abertura: "slack_abertura_em",
  lembrete: "slack_lembrete_em",
  resposta: "slack_resposta_em",
};
const rpc = vi.fn(async (nome: string, a: Record<string, string>) => {
  if (nome === "dados_do_aviso_de_contestacao")
    return {
      data: [
        {
          ...c,
          id: a["_id"],
          colaborador: "Rubia",
          tipo: "interacao",
          assunto: "Portabilidade",
          data_contato: "2026-10-03",
          avaliador: "Rachel Kivel",
          responder_ate: "2026-10-10T02:59:00Z",
          respondida_em: "2026-10-09T13:41:00Z",
          respondeu: "Rachel Kivel",
          nota_anterior: 95,
          nota_nova: 100,
        },
      ],
      error: null,
    };
  if (nome === "reservar_aviso_slack") {
    const col = COL[a["_evento"]!]!;
    const pode =
      c[col] === null &&
      (a["_evento"] !== "resposta" || ["deferida", "indeferida"].includes(c.status));
    if (pode) (c[col] as string | null) = "agora";
    return { data: pode, error: null };
  }
  if (nome === "desfazer_aviso_slack") {
    (c[COL[a["_evento"]!]!] as string | null) = null;
    return { data: null, error: null };
  }
  if (nome === "guardar_mensagem_slack") {
    if (!c.slack_ts) c.slack_ts = a["_ts"]!;
    return { data: null, error: null };
  }
  if (nome === "avisos_slack_pendentes")
    return { data: [{ id: "c1", evento: "lembrete" }], error: null };
  return { data: null, error: null };
});
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (n: string, a: Record<string, string>) => rpc(n, a) },
}));

// ---------- O Slack, simulado ----------
let slackRecusa = false;
const postagens: Record<string, unknown>[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, op: RequestInit) => {
    const corpo = JSON.parse(String(op.body));
    if (slackRecusa)
      return new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
      });
    postagens.push({
      ...corpo,
      autorizacao: (op.headers as Record<string, string>)["authorization"],
    });
    return new Response(JSON.stringify({ ok: true, ts: `ts-${postagens.length}` }), {
      status: 200,
    });
  }),
);
const { avisarContestacao, tarefaDosAvisos } = await import("../avisos-contestacao.server");

beforeEach(() => {
  c = {
    status: "aberta",
    slack_ts: null,
    slack_abertura_em: null,
    slack_lembrete_em: null,
    slack_resposta_em: null,
  };
  postagens.length = 0;
  slackRecusa = false;
  process.env["SLACK_BOT_TOKEN"] = "xoxb-teste";
  process.env["SLACK_CANAL_QUALIDADE"] = "C0QUALIDADE";
  process.env["CRON_SECRET"] = "segredo";
});
afterEach(() => {
  delete process.env["SLACK_BOT_TOKEN"];
});

describe("os avisos de contestação no Slack", () => {
  it("a abertura vai para o canal, com o token só no cabeçalho, e sem pré-visualização do link", async () => {
    await avisarContestacao("c1");
    expect(postagens).toHaveLength(1);
    expect(postagens[0]).toMatchObject({
      channel: "C0QUALIDADE",
      unfurl_links: false,
      autorizacao: "Bearer xoxb-teste",
    });
    expect(String(postagens[0]!["text"])).toContain("UMA NOVA CONTESTAÇÃO FOI ABERTA");
    expect(postagens[0]).not.toHaveProperty("thread_ts");
    expect(c.slack_ts).toBe("ts-1");
  });
  it("chamado de novo, não posta outra vez (nenhum aviso duplicado)", async () => {
    await avisarContestacao("c1");
    await avisarContestacao("c1");
    expect(postagens).toHaveLength(1);
  });
  it("a resposta sai na conversa da abertura", async () => {
    await avisarContestacao("c1");
    c.status = "deferida";
    await avisarContestacao("c1");
    expect(postagens).toHaveLength(2);
    expect(postagens[1]).toMatchObject({ thread_ts: "ts-1", reply_broadcast: false });
    expect(String(postagens[1]!["text"])).toContain("*aceita* (nota 95 → 100)");
  });
  it("o Slack recusou: a reserva é desfeita, e a próxima tentativa manda o aviso", async () => {
    slackRecusa = true;
    await avisarContestacao("c1");
    expect(c.slack_abertura_em).toBeNull();
    slackRecusa = false;
    await avisarContestacao("c1");
    expect(postagens).toHaveLength(1);
  });
  it("sem o Slack configurado, nada é postado (e nada quebra)", async () => {
    delete process.env["SLACK_BOT_TOKEN"];
    await avisarContestacao("c1");
    expect(postagens).toHaveLength(0);
  });
});

describe("a tarefa da manhã", () => {
  const pedido = (h?: string) =>
    new Request("https://x/api/avisos-contestacoes", { headers: h ? { authorization: h } : {} });
  it("sem o segredo, ninguém dispara", async () => {
    expect((await tarefaDosAvisos(pedido())).status).toBe(401);
    expect((await tarefaDosAvisos(pedido("Bearer errado"))).status).toBe(401);
  });
  it("o lembrete sai na conversa da abertura, e também no canal", async () => {
    c.slack_ts = "ts-abertura";
    c.slack_abertura_em = "antes";
    const r = await tarefaDosAvisos(pedido("Bearer segredo"));
    expect(await r.json()).toEqual({ avisos: 1, trocas: 0 }); // a tarefa da manhã também conta os avisos de troca (13/10/2026);
    expect(postagens[0]).toMatchObject({ thread_ts: "ts-abertura", reply_broadcast: true });
    expect(String(postagens[0]!["text"])).toContain("vence hoje");
  });
});
