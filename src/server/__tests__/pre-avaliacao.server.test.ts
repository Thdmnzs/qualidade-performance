import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- Substitutos do banco e do Intercom ----------
const rpc = vi.fn();
const fichaDoBanco = [
  {
    id: "c1",
    ordem: 1,
    descricao: "Cumpriu LGPD?",
    grupo: "LGPD",
    permite_medio: false,
    orientacao: null,
    versao: 1,
  },
  {
    id: "c2",
    ordem: 2,
    descricao: "Demonstrou empatia?",
    grupo: "Tom de voz",
    permite_medio: true,
    orientacao: null,
    versao: 1,
  },
];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabela: string) => ({
      select: () => ({
        eq: () =>
          tabela === "employees"
            ? { single: async () => ({ data: { nome: "Thiago Dantas" }, error: null }) }
            : Promise.resolve({ data: fichaDoBanco, error: null }),
      }),
    }),
  },
}));
vi.mock("@/server/intercom.server", () => ({
  ErroDoIntercom: class extends Error {},
  buscarContato: vi.fn(async () => ({
    mensagens: [
      {
        autor: "cliente",
        nome: "Giovanny Pasqualin",
        quando: 1,
        texto: "Meu CPF é 123.456.789-09 e o e-mail giovanny@gmail.com.",
      },
      { autor: "atendente", nome: "Thiago", quando: 2, texto: "Oi, Giovanny! Já verifico." },
    ],
    atributos: [{ nome: "Assunto", valor: "Conectividade" }],
    assunto: "Internet",
  })),
}));

const { preAvaliar } = await import("../pre-avaliacao.server");
const ids = { chamadorId: "u1", employeeId: "e1", fortnightId: "f1", conversaId: "123" };
const respostaDoClaude = (input: unknown) =>
  new Response(
    JSON.stringify({
      content: [{ type: "tool_use", name: "registrar_pre_avaliacao", input }],
      usage: { input_tokens: 900, output_tokens: 200 },
    }),
    { status: 200 },
  );

beforeEach(() => {
  rpc.mockReset();
  process.env["ANTHROPIC_API_KEY"] = "chave-de-teste";
  rpc.mockImplementation(async (nome: string, args: Record<string, unknown>) => {
    if (nome === "buscar_pre_avaliacao") return { data: null, error: null };
    if (nome === "referencias_para_pre_avaliacao")
      return { data: [{ processo_id: null, dicionario: null }], error: null };
    if (nome === "registrar_pre_avaliacao") return { data: args["_sugestoes"], error: null };
    return { data: null, error: null };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["ANTHROPIC_API_KEY"];
});

describe("preAvaliar (servidor, com o Claude simulado)", () => {
  it("sem a chave: indisponível, e nada é enviado", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const envio = vi.fn();
    vi.stubGlobal("fetch", envio);
    expect(await preAvaliar(ids)).toEqual({ estado: "indisponivel" });
    expect(envio).not.toHaveBeenCalled();
  });

  it("a mesma conversa: reaproveita a sugestão guardada, sem novo pedido", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { criterios: {}, comentario: "guardada" },
      error: null,
    }));
    const envio = vi.fn();
    vi.stubGlobal("fetch", envio);
    const r = await preAvaliar(ids);
    expect(r).toMatchObject({ estado: "pronta", reaproveitada: true });
    expect(envio).not.toHaveBeenCalled();
  });

  it("o pedido sai MASCARADO, com a chave só no cabeçalho", async () => {
    const envio = vi.fn(async () =>
      respostaDoClaude({
        criterios: [
          { criterio_id: "c1", resposta: "sim" },
          { criterio_id: "c2", resposta: "medio", observacao: "Faltou acolher." },
        ],
        comentario: "Bom.",
      }),
    );
    vi.stubGlobal("fetch", envio);
    const r = await preAvaliar(ids);
    const [url, opcoes] = envio.mock.calls[0] as unknown as [string, RequestInit];
    const corpo = String(opcoes.body);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((opcoes.headers as Record<string, string>)["x-api-key"]).toBe("chave-de-teste");
    expect(corpo).not.toContain("chave-de-teste");
    expect(corpo).not.toMatch(/123\.456\.789-09|giovanny@gmail|Giovanny|Pasqualin|Thiago/);
    expect(corpo).toContain("[CPF]");
    expect(corpo).toContain("[E-MAIL]");
    expect(corpo).toContain("Oi, Cliente!");
    expect(r).toMatchObject({ estado: "pronta", reaproveitada: false });
    if (r.estado === "pronta")
      expect(r.sugestoes.criterios["c2"]).toEqual({
        resposta: "medio",
        observacao: "Faltou acolher.",
      });
    const gravou = rpc.mock.calls.find((c) => c[0] === "registrar_pre_avaliacao")!;
    expect(gravou[1]).toMatchObject({
      _modelo: "claude-sonnet-5-5",
      _tokens_entrada: 900,
      _tokens_saida: 200,
    });
  });

  it("a IA responde com erro: 'falhou', sem repassar o corpo do erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("detalhes internos", { status: 500 })),
    );
    expect(await preAvaliar(ids)).toEqual({
      estado: "falhou",
      motivo: "A IA não respondeu (código 500).",
    });
  });

  it("a IA responde fora do formato: 'falhou', e nada é gravado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaDoClaude({ nota: 100 })),
    );
    expect(await preAvaliar(ids)).toEqual({
      estado: "falhou",
      motivo: "A resposta da IA veio num formato inesperado.",
    });
    expect(rpc.mock.calls.some((c) => c[0] === "registrar_pre_avaliacao")).toBe(false);
  });
});
