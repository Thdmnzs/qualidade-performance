import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (nome: string, _a: unknown) =>
  nome === "gravar_leitura_da_planilha"
    ? { data: { gravadas: 2, linhas: 3, ignoradas: [{ nome: "Fulano", linhas: 1 }] }, error: null }
    : { data: null, error: null },
);
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (n: string, a: unknown) => rpc(n, a) },
}));
vi.mock("@/server/google.server", () => ({ tokenDoGoogle: vi.fn(async () => "token-falso") }));
vi.mock("@/lib/format", () => ({ hojeEmFortaleza: () => "2026-10-15" }));
let resposta: Response;
const fetchFalso = vi.fn(async (_url: string, _op?: RequestInit) => resposta);
vi.stubGlobal("fetch", fetchFalso);
const { lerPlanilhaDosIndicadores } = await import("../planilha-indicadores.server");
afterEach(() => vi.clearAllMocks());

const DADOS = {
  values: [
    [
      "Data",
      "Membro",
      "Conversas atribuídas (total)",
      "Conversas atribuídas (membro da equipe)",
      "Horas ativas",
      "[B2C] SLA chat (s)",
      "[B2B] SLA chat (s)",
    ],
    ["14/10/2026", "Thiago", "56", "6", "8,00", "300", "200"],
    ["13/10/2026", "Thiago", "50", "0", "8,00", "300", "200"],
  ],
};
const ANALISE = {
  values: [["Período", "Mês atual"], [], ["Membro", "CSAT %"], ["Thiago", "93,5%"]],
};
const VALORES = { valueRanges: [DADOS, ANALISE] };
describe("a leitura da planilha dos indicadores", () => {
  it("lê a aba Dados com a conta de serviço, e entrega as linhas ao banco", async () => {
    resposta = new Response(JSON.stringify(VALORES), { status: 200 });
    const r = await lerPlanilhaDosIndicadores("automatica");
    expect(r).toEqual({
      ok: true,
      gravadas: 2,
      linhas: 3,
      ignoradas: [{ nome: "Fulano", linhas: 1 }],
    });
    const [url, op] = fetchFalso.mock.calls[0]!;
    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/1FevIlUGt3vxVi88QvoOk5BJmYrQr1ltqAVChYmwgk0w/values:batchGet?ranges=Dados!A1%3AZ&ranges=An%C3%A1lise!A1%3AZ200",
    );
    expect((op!.headers as Record<string, string>)["authorization"]).toBe("Bearer token-falso");
    const [, args] = rpc.mock.calls.find(([n]) => n === "gravar_leitura_da_planilha")!;
    expect(args).toEqual({
      _origem: "automatica",
      _linhas: [
        expect.objectContaining({
          nome: "Thiago",
          dia: "2026-10-14",
          conversas: 56,
          autoatribuicoes: 6,
          tempo_ativo_min: 480,
          sla_chat_s: 250,
          sla_b2c_chat_g_s: 300,
          sla_b2b_chat_g_s: 200,
        }),
        expect.objectContaining({ dia: "2026-10-13" }),
      ],
    });
    // as cópias: o dia anterior da Dados (só o 14/10), e a Análise inteira, como estão
    const copias = rpc.mock.calls
      .filter(([n]) => n === "gravar_copia_da_planilha")
      .map(([, a]) => a);
    expect(copias).toEqual([
      { _aba: "dados", _valores: [DADOS.values[0], DADOS.values[1]], _dia: "2026-10-14" },
      { _aba: "analise", _valores: ANALISE.values, _dia: null },
    ]);
  });
  it("sem acesso à planilha: avisa o que fazer, e registra o erro na leitura", async () => {
    resposta = new Response("", { status: 403 });
    const r = await lerPlanilhaDosIndicadores("manual");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain("compartilhe-a com ela");
    expect(rpc).toHaveBeenCalledWith(
      "registrar_erro_da_leitura",
      expect.objectContaining({ _origem: "manual" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("gravar_leitura_da_planilha", expect.anything());
  });
  it("uma coluna obrigatória faltando: também vira um erro registrado", async () => {
    resposta = new Response(
      JSON.stringify({
        values: [
          ["Data", "Membro"],
          ["14/10/2026", "Thiago"],
        ],
      }),
      { status: 200 },
    );
    const r = await lerPlanilhaDosIndicadores("automatica");
    expect(!r.ok && r.erro).toContain("conversas atribuidas (total)");
  });
});
