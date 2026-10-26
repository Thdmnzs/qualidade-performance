import { afterEach, describe, expect, it, vi } from "vitest";

const ler = vi.fn(async (_m: string) => ({ ok: true }) as { ok: boolean; erro?: string });
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
process.env["CRON_SECRET"] = "o-segredo-do-agendador";
const { pedidoDoAgendador } = await import("../agendador.server");
const modulo = await import("../planilha-indicadores.server");
vi.spyOn(modulo, "lerPlanilhaDosIndicadores").mockImplementation(ler as never);
afterEach(() => vi.clearAllMocks());
const pedido = (auth?: string) =>
  new Request("https://x/api/ler-planilha", { headers: auth ? { authorization: auth } : {} });

describe("a conferência do agendador (as tarefas agendadas)", () => {
  it("só com a senha certa", () => {
    expect(pedidoDoAgendador(pedido("Bearer o-segredo-do-agendador"))).toBe(true);
    expect(pedidoDoAgendador(pedido("Bearer outro"))).toBe(false);
    expect(pedidoDoAgendador(pedido())).toBe(false);
  });
  it("sem o segredo configurado, ninguém passa (nem com o cabeçalho vazio)", () => {
    const antes = process.env["CRON_SECRET"];
    delete process.env["CRON_SECRET"];
    expect(pedidoDoAgendador(pedido("Bearer "))).toBe(false);
    process.env["CRON_SECRET"] = antes;
  });
});

describe("a tarefa da planilha, às 10h (23/10/2026)", () => {
  it("sem a senha do agendador: 401, e a planilha não é lida", async () => {
    const r = await modulo.tarefaDaPlanilha(pedido("Bearer errado"));
    expect(r.status).toBe(401);
  });
  it("o agendador ligado no vercel.json, às 13h UTC (10h em Fortaleza e em Brasília)", async () => {
    const { readFileSync } = await import("node:fs");
    const crons = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, "utf8")).crons as {
      path: string;
      schedule: string;
    }[];
    expect(crons).toContainEqual({ path: "/api/ler-planilha", schedule: "0 13 * * *" });
    expect(crons).toContainEqual({ path: "/api/avisos-contestacoes", schedule: "0 11 * * *" }); // a da manhã continua às 8h
  });
  it("a tarefa da manhã não lê mais a planilha", async () => {
    const { readFileSync } = await import("node:fs");
    const manha = readFileSync(`${process.cwd()}/src/server/avisos-contestacao.server.ts`, "utf8");
    expect(manha).not.toMatch(/lerPlanilhaDosIndicadores\(/);
  });
});
