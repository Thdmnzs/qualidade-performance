import { beforeEach, describe, expect, it, vi } from "vitest";

const consulta = (dados: unknown) => {
  const q: Record<string, unknown> = {};
  q["select"] = () => q;
  q["eq"] = () => q;
  q["single"] = async () => ({ data: dados, error: null });
  return q;
};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (nome: string) => ({ data: nome === "pode_atuar_sobre" ? true : null, error: null }),
    from: () => consulta({ nome: "Rubia", email: "rubia@fluke.com" }),
  },
}));

let origem: Record<string, unknown> = {};
const pedidos: string[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    const caminho = new URL(url).pathname;
    pedidos.push(caminho);
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (caminho === "/me") return json({ app: { id_code: "a3qubsb2" } });
    if (caminho === "/admins")
      return json({ admins: [{ id: 701, name: "Rubia", email: "rubia@fluke.com" }] });
    if (caminho === "/conversations/123")
      return json({
        id: "123",
        created_at: 10_000,
        source: { ...origem, author: { type: "user", id: "c1" }, body: "<p>Oi</p>" },
        conversation_parts: {
          conversation_parts: [
            {
              part_type: "comment",
              body: "<p>Olá</p>",
              author: { type: "admin", id: 701, name: "Rubia" },
            },
          ],
        },
      });
    return new Response("{}", { status: 404 });
  }),
);
process.env["INTERCOM_ACCESS_TOKEN"] = "token-de-teste";
const { buscarContato } = await import("../intercom.server");
const buscar = () =>
  buscarContato({
    chamadorId: "aval-1",
    employeeId: "emp-1",
    referencia: "https://app.intercom.com/a/inbox/x/inbox/conversation/123",
  });

beforeEach(() => {
  pedidos.length = 0;
});

describe("o canal do contato, de ponta a ponta", () => {
  it("chat sem página: App", async () => {
    origem = { type: "conversation", url: null };
    expect((await buscar()).canal).toEqual({ tipo: "app", rotulo: "App" });
  });
  it("site e WhatsApp", async () => {
    origem = { type: "conversation", url: "https://fluke.com.br/ajuda" };
    expect((await buscar()).canal).toEqual({ tipo: "site", rotulo: "Site" });
    origem = { type: "whatsapp" };
    expect((await buscar()).canal).toEqual({ tipo: "whatsapp", rotulo: "WhatsApp" });
  });
  it("o cadastro do cliente nunca é buscado (uma chamada a menos por contato)", async () => {
    origem = { type: "conversation" };
    await buscar();
    expect(pedidos.some((p) => p.startsWith("/contacts/"))).toBe(false);
  });
});
