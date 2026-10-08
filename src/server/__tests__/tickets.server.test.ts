import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- O banco, simulado (consultas encadeadas, como o cliente do Supabase) ----------
let sorteios: Record<string, unknown>[] = [];
let avaliadas: Record<string, unknown>[] = [];
// Quem está sorteando (desde 07/10/2026, os núcleos dependem do e-mail dele).
let emailDoAvaliador = "rachel@flukeoperadora.com.br";
let ehAdm = false;
const rpc = vi.fn();
const consulta = (dados: unknown) => {
  const q: Record<string, unknown> = {};
  let porUsuario = false;
  q["select"] = () => q;
  q["eq"] = (coluna: string) => {
    if (coluna === "user_id") porUsuario = true;
    return q;
  };
  q["single"] = async () => ({ data: dados, error: null });
  q["maybeSingle"] = async () => ({
    data: porUsuario ? { email: emailDoAvaliador } : dados,
    error: null,
  });
  q["then"] = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: dados, error: null }).then(ok);
  return q;
};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabela: string) =>
      consulta(
        tabela === "sorteios_contato"
          ? sorteios
          : tabela === "evaluations"
            ? avaliadas
            : tabela === "fortnights"
              ? { data_inicio: "2026-10-01", data_fim: "2026-10-15" }
              : { nome: "Rubia", email: "rubia@fluke.com" },
      ),
  },
}));

// ---------- O Intercom, simulado (formato da API 2.16) ----------
const parte = (autor: { type: string; id: number; name?: string }, quando: number, extra = {}) => ({
  part_type: "ticket_state_updated_by_admin",
  ticket_state: "submitted",
  author: autor,
  created_at: quando,
  ...extra,
});
const RUBIA = { type: "admin", id: 701, name: "Rubia" };
const OUTRA = { type: "admin", id: 702, name: "Outra Pessoa" };
const ROBO = { type: "bot", id: 1, name: "Fluxo" };
const ticket = (id: string, partes: unknown[]) => ({
  id,
  ticket_id: `14${id}`,
  ticket_type: { id: "9", name: "[cxtech] B2C" },
  ticket_state: { category: "submitted" },
  created_at: 1_791_380_000,
  ticket_attributes: {
    _default_title_: `Ticket ${id}`,
    "Tipo de solicitação": "dash: falha/atualização",
  },
  linked_objects: { data: [{ type: "conversation", id: "555" }] },
  ticket_parts: { ticket_parts: partes },
});
let tickets: ReturnType<typeof ticket>[] = [];
const pedidos: { caminho: string; corpo: unknown }[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, opcoes?: RequestInit) => {
    const caminho = new URL(url).pathname;
    pedidos.push({ caminho, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : null });
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (caminho === "/me") return json({ app: { id_code: "a3qubsb2" } });
    if (caminho === "/admins")
      return json({ admins: [{ id: 701, name: "Rubia", email: "rubia@fluke.com" }] });
    if (caminho === "/ticket_types")
      return json({
        data: [
          { id: "9", name: "[cxtech] B2C" },
          { id: "10", name: "[leads] B2B" },
          { id: "11", name: "teste [automação]" },
          { id: "12", name: "[rede] portabilidade", archived: true },
        ],
      });
    if (caminho === "/tickets/search") return json({ tickets });
    // As conversas encerradas da quinzena (para o sorteio de atendimento): a 555 (do ticket 1) e a 777.
    if (caminho === "/conversations/search")
      return json({ conversations: [{ id: "555" }, { id: "777" }] });
    if (caminho === "/conversations/777")
      return json({
        id: "777",
        source: {
          type: "conversation",
          author: { type: "user", id: "c2", name: "Outro cliente" },
          body: "<p>Oi</p>",
        },
        conversation_parts: {
          conversation_parts: [
            {
              part_type: "comment",
              body: "<p>Olá!</p>",
              author: { type: "admin", id: 701, name: "Rubia" },
            },
          ],
        },
      });
    if (caminho === "/conversations/555")
      return json({
        id: "555",
        source: {
          type: "whatsapp",
          author: { type: "user", id: "c1", name: "Cliente" },
          body: "<p>Meu app não libera o cadastro.</p>",
        },
        conversation_parts: {
          conversation_parts: [
            {
              part_type: "comment",
              body: "<p>Vou acionar o time técnico.</p>",
              author: { type: "admin", id: 701, name: "Rubia" },
            },
          ],
        },
      });
    const t = tickets.find((x) => caminho === `/tickets/${x.id}`);
    return t ? json(t) : new Response("{}", { status: 404 });
  }),
);
process.env["INTERCOM_ACCESS_TOKEN"] = "token-de-teste";

const { sortearContato, buscarContato, contatoEmAberto } = await import("../intercom.server");
const ids = { chamadorId: "aval-1", employeeId: "emp-rubia", fortnightId: "q-1" };

beforeEach(() => {
  sorteios = [];
  avaliadas = [];
  emailDoAvaliador = "rachel@flukeoperadora.com.br";
  ehAdm = false;
  pedidos.length = 0;
  rpc.mockReset();
  rpc.mockImplementation(async (nome: string) => ({
    data:
      nome === "pode_atuar_sobre"
        ? true
        : nome === "is_admin"
          ? ehAdm
          : nome === "registrar_sorteio_contato"
            ? "sorteio-novo"
            : null,
    error: null,
  }));
});

describe("sorteio de tickets de back-office", () => {
  it("sorteia só os criados pela colaboradora (nunca o de outra pessoa nem o sem criador)", async () => {
    tickets = [
      ticket("1", [
        parte(RUBIA, 10),
        parte(ROBO, 11, { part_type: "assignment", ticket_state: null }),
      ]),
      ticket("2", [parte(OUTRA, 10)]),
      ticket("3", [parte(ROBO, 10, { part_type: "assignment", ticket_state: null })]),
    ];
    for (let i = 0; i < 5; i++) {
      const c = await sortearContato({ ...ids, tipo: "ticket_n2" });
      expect(c.conversaId).toBe("1");
      expect(c.ticket?.criador).toBe("Rubia");
      expect(c.atendenteEscreveu).toBe(true);
      expect(c.assunto).toBe("[cxtech] B2C · dash: falha/atualização");
      expect(c.ticket?.conversaDeOrigem).toBe(
        "https://app.intercom.com/a/inbox/a3qubsb2/inbox/conversation/555",
      );
    }
    const registro = rpc.mock.calls.find((c) => c[0] === "registrar_sorteio_contato")!;
    expect(registro[1]).toMatchObject({ _tipo: "ticket_n2", _conversa_id: "1" });
  });

  it("busca só os tipos dos núcleos (sem [leads], sem teste, sem arquivado)", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)])];
    await sortearContato({ ...ids, tipo: "ticket_n2" });
    const busca = pedidos.find((p) => p.caminho === "/tickets/search")!.corpo as {
      query: { value: { operator?: string; value: { value: string }[] }[] };
    };
    expect(busca.query.value[0]!.value.map((v) => v.value)).toEqual(["9"]);
  });

  it("um ticket já sorteado não volta", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)]), ticket("4", [parte(RUBIA, 10)])];
    sorteios = [
      {
        id: "s0",
        conversa_id: "1",
        link: "x",
        descartado_em: "2026-10-05",
        sorteado_por: "aval-1",
        tipo: "ticket_n2",
      },
    ];
    const c = await sortearContato({ ...ids, tipo: "ticket_n2" });
    expect(c.conversaId).toBe("4");
  });

  it("nada disponível: a mensagem diz quantos ficaram de fora sem criador", async () => {
    tickets = [ticket("2", [parte(OUTRA, 10)]), ticket("3", [parte(ROBO, 10)])];
    await expect(sortearContato({ ...ids, tipo: "ticket_n2" })).rejects.toThrow(
      /Não há tickets de back-office criados por Rubia.*1 ticket\(s\) da quinzena ficaram de fora/,
    );
  });

  it("uma CONVERSA em aberto não volta quando se sorteia um ticket", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)])];
    sorteios = [
      {
        id: "s9",
        conversa_id: "999",
        link: "y",
        descartado_em: null,
        sorteado_por: "aval-1",
        tipo: "interacao",
      },
    ];
    const c = await sortearContato({ ...ids, tipo: "ticket_n2" });
    expect(c.conversaId).toBe("1");
    expect(c.jaEmAberto).toBe(false);
  });

  it("um TICKET em aberto do mesmo avaliador volta (não é um sorteio novo)", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)]), ticket("4", [parte(RUBIA, 10)])];
    sorteios = [
      {
        id: "s1",
        conversa_id: "4",
        link: "z",
        descartado_em: null,
        sorteado_por: "aval-1",
        tipo: "ticket_n2",
      },
    ];
    const c = await sortearContato({ ...ids, tipo: "ticket_n2" });
    expect(c).toMatchObject({ conversaId: "4", jaEmAberto: true, sorteioId: "s1" });
  });
});

describe("colar o link de um ticket", () => {
  it("o ticket da própria colaboradora: aceito", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)])];
    const c = await buscarContato({
      ...ids,
      referencia: "https://app.intercom.com/a/inbox/x/inbox/conversation/1",
      tipo: "ticket_n2",
    });
    expect(c.ticket?.titulo).toBe("Ticket 1");
  });
  it("um ticket criado por outra pessoa: recusado, dizendo por quem", async () => {
    tickets = [ticket("2", [parte(OUTRA, 10)])];
    await expect(
      buscarContato({
        ...ids,
        referencia: "https://app.intercom.com/a/inbox/x/inbox/conversation/2",
        tipo: "ticket_n2",
      }),
    ).rejects.toThrow("Este ticket foi criado por Outra Pessoa, e não por Rubia.");
  });
});

describe("o sorteio em aberto (a brecha do recarregar)", () => {
  const link = (id: string) => `https://app.intercom.com/a/inbox/x/inbox/conversation/${id}`;
  beforeEach(() => {
    tickets = [ticket("1", [parte(RUBIA, 10)]), ticket("4", [parte(RUBIA, 10)])];
    sorteios = [
      {
        id: "s1",
        conversa_id: "4",
        link: "z",
        descartado_em: null,
        sorteado_por: "aval-1",
        tipo: "ticket_n2",
      },
    ];
  });
  it("ao abrir o cartão, o contato em aberto volta", async () => {
    expect(await contatoEmAberto({ ...ids, tipo: "ticket_n2" })).toMatchObject({
      conversaId: "4",
      sorteioId: "s1",
      jaEmAberto: true,
    });
  });
  it("sem sorteio em aberto (ou só de outro tipo), nada volta", async () => {
    expect(await contatoEmAberto({ ...ids, tipo: "interacao" })).toBeNull();
    sorteios = [];
    expect(await contatoEmAberto({ ...ids, tipo: "ticket_n2" })).toBeNull();
  });
  it("a busca de OUTRO link é recusada enquanto houver o sorteio em aberto", async () => {
    await expect(
      buscarContato({ ...ids, referencia: link("1"), tipo: "ticket_n2" }),
    ).rejects.toThrow(/sorteado em aberto.*Inserir link/);
  });
  it("o próprio contato sorteado pode ser buscado pelo link", async () => {
    expect(await buscarContato({ ...ids, referencia: link("4"), tipo: "ticket_n2" })).toMatchObject(
      { conversaId: "4" },
    );
  });
  it("descartado o sorteio, outro link é aceito", async () => {
    sorteios = [{ ...sorteios[0]!, descartado_em: "2026-10-07" }];
    expect(await buscarContato({ ...ids, referencia: link("1"), tipo: "ticket_n2" })).toMatchObject(
      { conversaId: "1" },
    );
  });
  it("sem a quinzena (a pré-avaliação, por dentro), a busca não confere o sorteio", async () => {
    const { fortnightId: _semQuinzena, ...semQuinzena } = ids;
    expect(
      await buscarContato({ ...semQuinzena, referencia: link("1"), tipo: "ticket_n2" }),
    ).toMatchObject({ conversaId: "1" });
  });
});

describe("os núcleos e a conversa do ticket (reunião de 07/10/2026)", () => {
  const link = (id: string) => `https://app.intercom.com/a/inbox/x/inbox/conversation/${id}`;
  beforeEach(() => {
    tickets = [ticket("1", [parte(RUBIA, 10)])];
  });
  it("o ticket sorteado traz a conversa com o cliente (as mensagens e o canal)", async () => {
    const c = await sortearContato({ ...ids, tipo: "ticket_n2" });
    expect(c.ticket?.conversa?.canal).toEqual({ tipo: "whatsapp", rotulo: "WhatsApp" });
    expect(c.ticket?.conversa?.mensagens.map((m) => m.texto)).toEqual([
      "Meu app não libera o cadastro.",
      "Vou acionar o time técnico.",
    ]);
  });
  it("a Fran não recebe ticket de CX Tech (não é núcleo dela)", async () => {
    emailDoAvaliador = "fran@flukeoperadora.com.br";
    await expect(sortearContato({ ...ids, tipo: "ticket_n2" })).rejects.toThrow(
      /Nenhum tipo de ticket/,
    );
  });
  it("uma avaliadora fora da tabela: não recebe tickets, e é orientada a completar com atendimento", async () => {
    emailDoAvaliador = "nova@flukeoperadora.com.br";
    await expect(sortearContato({ ...ids, tipo: "ticket_n2" })).rejects.toThrow(
      /ainda não tem núcleos.*Complete as 10 com avaliações de atendimento/,
    );
  });
  it("o ADM sorteia de qualquer núcleo", async () => {
    emailDoAvaliador = "admin@teste.com";
    ehAdm = true;
    expect((await sortearContato({ ...ids, tipo: "ticket_n2" })).conversaId).toBe("1");
  });
  it("a conversa do ticket já foi avaliada como atendimento: o ticket sai do sorteio", async () => {
    avaliadas = [{ link_conversa: link("555"), tipo: "interacao" }];
    await expect(sortearContato({ ...ids, tipo: "ticket_n2" })).rejects.toThrow(
      /dos seus núcleos.*Complete as 10 com avaliações de atendimento/,
    );
  });
  it("colar o link de um ticket de outro núcleo: recusado, dizendo o núcleo", async () => {
    emailDoAvaliador = "fran@flukeoperadora.com.br";
    await expect(
      buscarContato({ ...ids, referencia: link("1"), tipo: "ticket_n2" }),
    ).rejects.toThrow(
      "Este ticket é do núcleo CX Tech, que não está entre os seus (Rede, Logística, Fraude e Risco, Financeiro).",
    );
  });
});

describe("o outro sentido: a conversa de um ticket avaliado", () => {
  it("não cai no sorteio de atendimento (foi avaliada junto com o ticket)", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)])]; // o ticket 1 saiu da conversa 555
    avaliadas = [
      {
        link_conversa: "https://app.intercom.com/a/inbox/x/inbox/conversation/1",
        tipo: "ticket_n2",
      },
    ];
    for (let i = 0; i < 6; i++) {
      const c = await sortearContato({ ...ids, tipo: "interacao" });
      expect(c.conversaId).toBe("777");
    }
  });
  it("sem o ticket avaliado, a conversa 555 continua podendo ser sorteada", async () => {
    tickets = [ticket("1", [parte(RUBIA, 10)])];
    const vistas = new Set<string>();
    for (let i = 0; i < 30; i++)
      vistas.add((await sortearContato({ ...ids, tipo: "interacao" })).conversaId);
    expect(vistas.has("555")).toBe(true);
  });
});
