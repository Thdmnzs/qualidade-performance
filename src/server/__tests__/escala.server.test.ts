import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------- O banco, simulado: quem chama, se é ADM, e os cadastros ----------
let chamador: { id: string; nome: string } | null = { id: "emp-thiago", nome: "Thiago Dantas" };
let ehAdm = false;
const CADASTROS = [
  { id: "emp-thiago", nome: "Thiago Dantas" },
  { id: "emp-rachel", nome: "Rachel Kivel" },
];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: ehAdm, error: null }),
    from: () => {
      let porUsuario = false;
      const q: Record<string, unknown> = {};
      q["select"] = () => q;
      q["eq"] = (col: string) => {
        if (col === "user_id") porUsuario = true;
        return q;
      };
      q["maybeSingle"] = async () => ({ data: porUsuario ? chamador : null, error: null });
      q["then"] = (r: (v: unknown) => void) => r({ data: CADASTROS, error: null });
      return q;
    },
  },
}));

// ---------- O Google, simulado: o token e a planilha ----------
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
process.env["GOOGLE_SERVICE_ACCOUNT_JSON"] = JSON.stringify({
  client_email: "qualityhub-leitor@qualityhub-510921.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
const cel = (texto: string | null, cor?: [number, number, number]) => ({
  ...(texto ? { formattedValue: texto } : {}),
  effectiveFormat: {
    backgroundColor: cor
      ? { red: cor[0], green: cor[1], blue: cor[2] }
      : { red: 1, green: 1, blue: 1 },
  },
});
const horas = Array.from({ length: 16 }, (_, i) => cel(`${i + 6}h`));
const AZUL: [number, number, number] = [0xc9 / 255, 0xda / 255, 0xf8 / 255];
const SEMANA = {
  sheets: [
    {
      merges: [{ startRowIndex: 3, endRowIndex: 4, startColumnIndex: 2, endColumnIndex: 11 }],
      data: [
        {
          rowData: [
            { values: [cel("segunda"), cel(null), cel("segunda feira")] },
            { values: [cel("analistas online")] },
            { values: [cel("analista"), cel("hr/dia"), ...horas] },
            { values: [cel("Ruby"), cel("8"), cel("folga", [1, 0.6, 0])] },
            { values: [cel("Thiago"), cel("8"), cel("i", AZUL), cel("P", [0.85, 0.85, 0.85])] },
            { values: [cel("Rachel"), cel("8"), cel("i", AZUL)] },
          ],
        },
      ],
    },
  ],
};
const FERIAS = {
  sheets: [
    {
      data: [
        {
          rowData: [
            {
              values: [
                "dia",
                "JAN/26",
                "FEV/26",
                "MAR/26",
                "ABR/26",
                "MAI/26",
                "JUN/26",
                "JUL/26",
                "AGO/26",
                "SET/26",
                "OUT/26",
                "NOV/26",
                "DEZ/26",
              ].map((t) => cel(t)),
            },
            { values: [cel("9"), ...Array.from({ length: 9 }, () => cel(null)), cel("Thiago")] },
          ],
        },
      ],
    },
  ],
};
let compartilhada = true;
const leituras: string[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return json({ access_token: "tok", expires_in: 3600 });
    if (!compartilhada) return json({ error: { code: 403 } }, 403);
    leituras.push(decodeURIComponent(url));
    if (url.includes("fields=sheets.properties.title")) {
      return json({
        sheets: ["05 a 11/10", "12 a 18/10", "férias 26"].map((title) => ({
          properties: { title },
        })),
      });
    }
    return json(decodeURIComponent(url).includes("férias") ? FERIAS : SEMANA);
  }),
);
const { lerEscalaDaSemana, lerFeriasDoAno, esquecerMemoriaDaEscala } =
  await import("../escala.server");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  esquecerMemoriaDaEscala();
  leituras.length = 0;
  chamador = { id: "emp-thiago", nome: "Thiago Dantas" };
  ehAdm = false;
  compartilhada = true;
});
afterEach(() => vi.useRealTimers());

describe("a escala da semana", () => {
  it("abre a semana de hoje, com as cores da planilha (o branco é 'sem cor'), e o 'você'", async () => {
    const r = await lerEscalaDaSemana({ chamadorId: "u-thiago" });
    expect(r.titulo).toBe("05 a 11/10");
    expect(r.abas.map((a) => a.titulo)).toEqual(["12 a 18/10", "05 a 11/10"]); // a de férias fica de fora
    const thiago = r.semana!.dias[0]!.pessoas[1]!;
    expect(thiago.horas[0]).toEqual({ texto: "i", cor: "#c9daf8", mescla: null });
    expect(r.semana!.dias[0]!.pessoas[0]!.horas[8]?.texto).toBe("folga"); // a faixa mesclada
    expect(r.eu).toBe("Thiago");
    expect(r.leitura).toBeNull(); // o quadro da leitura é só do ADM
  });
  it("para o ADM: o quadro da leitura, com os nomes sem cadastro", async () => {
    ehAdm = true;
    chamador = { id: "emp-adm", nome: "Admin Teste" };
    const r = await lerEscalaDaSemana({ chamadorId: "u-adm" });
    expect(r.eu).toBeNull();
    expect(r.leitura).toMatchObject({
      semCadastro: ["Ruby"],
      encontrados: [
        { planilha: "Thiago", cadastro: "Thiago Dantas" },
        { planilha: "Rachel", cadastro: "Rachel Kivel" },
      ],
    });
  });
  it("quem não é um membro ativo não lê a escala", async () => {
    chamador = null;
    await expect(lerEscalaDaSemana({ chamadorId: "u-fora" })).rejects.toThrow(
      "não está vinculado a um colaborador ativo",
    );
  });
  it("a planilha não compartilhada com o robô: uma mensagem clara", async () => {
    compartilhada = false;
    await expect(lerEscalaDaSemana({ chamadorId: "u-thiago" })).rejects.toThrow(
      "não está compartilhada com o robô",
    );
  });
});

describe("a memória de 2 minutos", () => {
  const lidas = () => leituras.filter((u) => u.includes("05 a 11/10")).length;
  it("duas aberturas seguidas leem a planilha uma vez", async () => {
    await lerEscalaDaSemana({ chamadorId: "u" });
    await lerEscalaDaSemana({ chamadorId: "u" });
    expect(lidas()).toBe(1);
  });
  it("depois de 2 minutos, lê de novo", async () => {
    await lerEscalaDaSemana({ chamadorId: "u" });
    vi.setSystemTime(new Date("2026-10-09T15:02:01Z"));
    await lerEscalaDaSemana({ chamadorId: "u" });
    expect(lidas()).toBe(2);
  });
  it("o 'Atualizar' lê na hora, mas não duas vezes em 15 segundos", async () => {
    await lerEscalaDaSemana({ chamadorId: "u" });
    await lerEscalaDaSemana({ chamadorId: "u", forcar: true });
    expect(lidas()).toBe(1);
    vi.setSystemTime(new Date("2026-10-09T15:00:16Z"));
    await lerEscalaDaSemana({ chamadorId: "u", forcar: true });
    expect(lidas()).toBe(2);
  });
});

describe("as férias do ano", () => {
  it("a aba 'férias 26', com o 'você'", async () => {
    const r = await lerFeriasDoAno({ chamadorId: "u-thiago" });
    expect(r.titulo).toBe("férias 26");
    expect(r.ferias!.dias["9-9"]).toEqual({ pessoas: ["Thiago"], feriado: false });
    expect(r.eu).toBe("Thiago");
  });
});
