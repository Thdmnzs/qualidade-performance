import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- O banco, simulado: uma troca, com as mesmas regras das funções ----------
type Estado = {
  situacao: string;
  aceita: boolean;
  aplicada: boolean;
  slack_ts: string | null;
  slack_aviso_em: string | null;
  slack_fim_em: string | null;
};
let t: Estado;
const rpc = vi.fn(async (nome: string, a: Record<string, string>) => {
  if (nome === "dados_do_aviso_de_troca")
    return {
      data: {
        ...t,
        id: a["_id"],
        tipo: "folgas",
        modo: "um",
        de: "Thiago Dantas",
        para: "Amanda Lima",
        datas: ["2026-10-14", "2026-10-15"],
        folgas_de: ["2026-10-14"],
        folgas_para: ["2026-10-15"],
        horario_de: null,
        horario_para: null,
        decidida_por: "Vitor Lima",
      },
      error: null,
    };
  if (nome === "reservar_aviso_de_troca") {
    const aviso = a["_evento"] === "aviso";
    const pode = aviso
      ? t.slack_aviso_em === null && t.aceita && t.situacao !== "recusada_colega"
      : t.slack_fim_em === null &&
        !!t.slack_ts &&
        ["aprovada", "recusada", "cancelada"].includes(t.situacao);
    if (pode) t[aviso ? "slack_aviso_em" : "slack_fim_em"] = "agora";
    return { data: pode, error: null };
  }
  if (nome === "desfazer_aviso_de_troca") {
    t[a["_evento"] === "aviso" ? "slack_aviso_em" : "slack_fim_em"] = null;
    return { data: null, error: null };
  }
  if (nome === "guardar_mensagem_da_troca") {
    t.slack_ts = a["_ts"]!;
    return { data: null, error: null };
  }
  if (nome === "avisos_de_troca_pendentes")
    return {
      data: [
        { id: "x1", evento: "aviso" },
        { id: "x1", evento: "fim" },
      ],
      error: null,
    };
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
      return new Response(JSON.stringify({ ok: false, error: "not_in_channel" }), { status: 200 });
    postagens.push({
      ...corpo,
      autorizacao: (op.headers as Record<string, string>)["authorization"],
    });
    return new Response(JSON.stringify({ ok: true, ts: `ts-${postagens.length}` }), {
      status: 200,
    });
  }),
);
const { avisarTroca, avisosDeTrocaPendentes } = await import("../central-de-turnos.server");

beforeEach(() => {
  t = {
    situacao: "aguardando_supervisao",
    aceita: true,
    aplicada: false,
    slack_ts: null,
    slack_aviso_em: null,
    slack_fim_em: null,
  };
  postagens.length = 0;
  slackRecusa = false;
  process.env["SLACK_TURNOS_TOKEN"] = "xoxb-turnos";
  process.env["SLACK_CANAL_ESCALA"] = "C-ESCALA";
  process.env["SLACK_BOT_TOKEN"] = "xoxb-radar";
  process.env["SLACK_CANAL_QUALIDADE"] = "C-QUALIDADE";
});
afterEach(() => vi.clearAllMocks());

describe("a Central de Turnos", () => {
  it("o aviso sai no canal de escala, com o token da Central (e não com os do Radar)", async () => {
    await avisarTroca("x1");
    expect(postagens).toHaveLength(1);
    expect(postagens[0]!["channel"]).toBe("C-ESCALA");
    expect(postagens[0]!["autorizacao"]).toBe("Bearer xoxb-turnos");
    expect(String(postagens[0]!["text"])).toContain(
      "*Como fica*: Thiago folga na quinta; Amanda, na quarta",
    );
    expect(t.slack_ts).toBe("ts-1"); // a marca da mensagem, para o fim ir na conversa
  });
  it("o aviso não sai duas vezes; e o fim vai na conversa", async () => {
    await avisarTroca("x1");
    await avisarTroca("x1");
    expect(postagens).toHaveLength(1);
    t.situacao = "aprovada";
    await avisarTroca("x1");
    expect(postagens).toHaveLength(2);
    expect(postagens[1]!["thread_ts"]).toBe("ts-1");
    expect(postagens[1]!["text"]).toBe(
      "🟢 *Aprovada* por Vitor Lima. A troca entra na escala quando a semana for montada.",
    );
  });
  it("aprovada logo depois do aceite (antes de o aviso sair): o aviso e o fim, na ordem", async () => {
    t.situacao = "recusada";
    await avisarTroca("x1");
    expect(postagens.map((p) => String(p["text"]).split("\n")[0])).toEqual([
      "🔁 *TROCA DE ESCALA PARA APROVAR*",
      "🔴 *Recusada* por Vitor Lima.",
    ]);
  });
  it("se o Slack recusar, a reserva é desfeita (a tarefa da manhã tenta de novo)", async () => {
    slackRecusa = true;
    await avisarTroca("x1");
    expect(t.slack_aviso_em).toBeNull();
    slackRecusa = false;
    expect(await avisosDeTrocaPendentes()).toBe(1); // a mesma troca, uma vez só
    expect(postagens).toHaveLength(1);
  });
  it("antes do aceite, nada sai; e sem as variáveis da Central, também não", async () => {
    t.aceita = false;
    await avisarTroca("x1");
    expect(postagens).toHaveLength(0);
    t.aceita = true;
    delete process.env["SLACK_TURNOS_TOKEN"];
    await avisarTroca("x1");
    expect(postagens).toHaveLength(0);
  });
});
