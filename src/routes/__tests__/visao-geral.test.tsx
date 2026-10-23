// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({ options: opcoes }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((t: string) => toast(t), { error: (t: string) => toast(t) }),
}));
vi.mock("@/components/parabens/aniversariantes-de-hoje", () => ({
  AniversariantesDeHoje: () => null,
}));
vi.mock("@/hooks/useAuth", () => ({
  useCurrentEmployee: () => ({ data: { id: "e1", nome: "Thiago Dantas" }, isLoading: false }),
  usePermissoes: () => ({ temAreaDeColaborador: true, isLoading: false }),
}));
vi.mock("@/lib/escala", async (original) => ({
  ...(await original<object>()),
  hojeIso: () => "2026-10-20",
}));
let SEMANA: unknown = {
  inicio: "2026-10-19",
  situacao: "rascunho",
  eu: "e1",
  feriados: [],
  dias: Array.from({ length: 7 }, () => []),
};
vi.mock("@/lib/escala-api", () => ({ lerSemana: async () => SEMANA, lerSiglas: async () => [] }));
vi.mock("@/lib/mural.functions", () => ({ atualizarMuralFn: async () => ({ leu: false }) }));

const agora = new Date().toISOString();
const ALINHAMENTO = {
  ts: "1792522885.457269",
  autor_nome: "Vitor",
  texto:
    "<!here> *[alinhamento] pedido de cancelamento nos primeiros 30 dias: reembolso só quando o cliente pede*\ncriticidade: média\ntempo de leitura: 1 min",
  respostas: [
    {
      ts: "1792523069.0001",
      autor_nome: "Vitor",
      texto:
        "*em pedido de cancelamento, a gente não devolve o dinheiro proativamente.*\n• primeiro, tente reter\n<javascript:alert(1)|clique aqui>",
    },
  ],
  qtd_respostas: 1,
  reacoes_ok: 5,
  criado_em: agora,
  editado_em: null,
};
const PIX = {
  ts: "1792519820.972259",
  autor_nome: "Vitor",
  texto: "<!subteam^S08C07AL3RT> o pix já está disponível :waveparrot:",
  respostas: [],
  qtd_respostas: 0,
  reacoes_ok: 7,
  criado_em: "2026-10-15T15:00:00Z",
  editado_em: null,
};
let LISTA: unknown[] = [];
// O #instabilidade (os avisos reais do Pagar.me), e o canal pedido em cada consulta
const INST = "C027Y8CP9U4";
const URL_PIX = "https://status.pagar.me/incidents/8dp250w89vlc";
const aviso = (etapa: string, situacao: string, corpo: string) =>
  `*Incident: ${etapa}*\n*<${URL_PIX}|Instabilidade: Transacional - PIX>*\n${corpo}\n${situacao}\nTransacional - Transacional - PIX`;
const avisoDoPix = (
  ts: string,
  etapa: string,
  situacao: string,
  corpo: string,
  criado_em: string,
) => ({
  ts,
  autor_nome: "Pagarme Status",
  texto: aviso(etapa, situacao, corpo),
  respostas: [],
  qtd_respostas: 0,
  reacoes_ok: 0,
  criado_em,
  editado_em: null,
});
const ha = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
let INSTABILIDADES: unknown[] = [];
let aoMudar: (() => void) | null = null;
let aoMudarInst: (() => void) | null = null;
const consulta = () => {
  const c: Record<string, unknown> = {};
  let canal = "";
  for (const m of ["select", "gte", "order", "limit"]) c[m] = () => c;
  c["eq"] = (col: string, v: string) => (col === "canal" ? (canal = v) : null, c);
  c["then"] = (ok: (v: unknown) => void) =>
    ok({ data: canal === INST ? INSTABILIDADES : LISTA, error: null });
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => consulta(),
    channel: () => {
      const canal = {
        on: (_e: string, f: { filter?: string }, cb: () => void) => (
          f.filter?.includes(INST) ? (aoMudarInst = cb) : (aoMudar = cb),
          canal
        ),
        subscribe: () => canal,
      };
      return canal;
    },
    removeChannel: async () => {},
  },
}));
const { Route } = await import("../_authenticated/painel");
const Tela = (Route as unknown as { options: { component: ComponentType } }).options.component;
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tela />
    </QueryClientProvider>,
  );
beforeEach(() => {
  LISTA = [ALINHAMENTO, PIX];
  INSTABILIDADES = [];
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a Visão geral nova (20/10/2026)", () => {
  it("o Meu dia (e o atalho para a escala completa), sem o resultado da quinzena", async () => {
    abrir();
    expect(await screen.findByText("A escala desta semana ainda não foi publicada.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ver a escala completa/ }).getAttribute("href")).toBe(
      "/escala",
    );
    expect(screen.queryByText(/elegível|Prévia/i)).toBeNull();
  });
  it("na semana publicada sem a pessoa: o aviso do dia", async () => {
    SEMANA = {
      inicio: "2026-10-19",
      situacao: "publicada",
      eu: "e1",
      feriados: [],
      dias: Array.from({ length: 7 }, () => []),
    };
    abrir();
    expect(await screen.findByText(/Você não está escalado\(a\) neste dia/)).toBeTruthy();
  });
  it("o mural: o cabeçalho do alinhamento, e o comunicado sem o padrão", async () => {
    abrir();
    const cartoes = await within(await screen.findByLabelText("O mural do CX")).findAllByRole(
      "article",
    );
    expect(cartoes).toHaveLength(2);
    const a = within(cartoes[0]!);
    expect(
      a.getByText(
        "Pedido de cancelamento nos primeiros 30 dias: reembolso só quando o cliente pede",
      ),
    ).toBeTruthy();
    expect(a.getByText("criticidade média")).toBeTruthy();
    expect(a.getByText("⏱ 1 min de leitura")).toBeTruthy();
    expect(a.getByText(/para @aqui/)).toBeTruthy();
    expect(a.getByText("✅ 5 pessoas leram")).toBeTruthy();
    expect(within(cartoes[1]!).getByText(/o pix já está disponível/).textContent).not.toContain(
      ":waveparrot:",
    );
  });
  it("o Ler aqui abre a conversa dentro do CX Hub (o negrito, a lista, e o link perigoso só como texto)", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Ler aqui" }));
    const conversa = screen.getByLabelText("A conversa");
    expect(
      within(conversa).getByText(
        "em pedido de cancelamento, a gente não devolve o dinheiro proativamente.",
      ).tagName,
    ).toBe("B");
    expect(within(conversa).getByRole("listitem").textContent).toBe("primeiro, tente reter");
    expect(within(conversa).queryByRole("link")).toBeNull(); // o javascript: não vira link
    expect(within(conversa).getByText("clique aqui")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByLabelText("A conversa")).toBeNull();
  });
  it("ao vivo: um comunicado novo chega com a tela aberta, no topo, com o aviso, e a conversa aberta continua", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Ler aqui" }));
    LISTA = [
      {
        ...ALINHAMENTO,
        ts: "1792530000.0001",
        texto: "<!here> *[alinhamento] novo processo de portabilidade*\ncriticidade: alta",
        respostas: [],
        criado_em: new Date().toISOString(),
      },
      ALINHAMENTO,
      PIX,
    ];
    await act(async () => aoMudar!());
    await waitFor(() =>
      expect(within(screen.getByLabelText("O mural do CX")).getAllByRole("article")).toHaveLength(
        3,
      ),
    );
    expect(
      within(screen.getByLabelText("O mural do CX")).getAllByRole("article")[0]!.textContent,
    ).toContain("Novo processo de portabilidade");
    expect(toast).toHaveBeenCalledWith("📣 Novo no mural: Novo processo de portabilidade");
    expect(screen.getByLabelText("A conversa")).toBeTruthy();
  });
  it("os novos desde a última visita ficam em destaque", async () => {
    localStorage.setItem("cxhub:mural:visita:e1", "2026-10-16T00:00:00Z");
    abrir();
    expect(await screen.findByText(/1 novo desde a sua última visita/)).toBeTruthy();
  });
});

describe("as instabilidades na Visão geral (20/10/2026)", () => {
  const quadro = () => screen.getByLabelText("Instabilidades");
  it("sem nada acontecendo: o aviso pequeno, e o mural continua com os comunicados dele", async () => {
    abrir();
    expect(
      await within(await screen.findByLabelText("Instabilidades")).findByText(
        "✅ Nenhuma instabilidade agora",
      ),
    ).toBeTruthy();
    expect(
      await within(screen.getByLabelText("O mural do CX")).findAllByRole("article"),
    ).toHaveLength(2);
  });
  it("o incidente resolvido: uma linha, e a linha do tempo com as três etapas", async () => {
    INSTABILIDADES = [
      avisoDoPix(
        "3",
        "Resolved",
        "operational",
        "Entre 00:54 e 01:35 passamos por uma instabilidade.",
        ha(60 * 30),
      ),
      avisoDoPix(
        "2",
        "Monitoring",
        "degraded_performance",
        "Desde 01h00 estamos com nosso ambiente estável.",
        ha(60 * 30 + 25),
      ),
      avisoDoPix(
        "1",
        "Identified",
        "major_outage",
        "Identificamos às 00:54 uma instabilidade.",
        ha(60 * 30 + 28),
      ),
    ];
    abrir();
    fireEvent.click(
      await within(await screen.findByLabelText("Instabilidades")).findByRole("button", {
        name: "Ver as atualizações (3)",
      }),
    );
    const etapas = within(quadro())
      .getAllByRole("listitem")
      .map((l) => l.textContent!.match(/Identificado|Monitorando|Resolvido/)![0]);
    expect(etapas).toEqual(["Identificado", "Monitorando", "Resolvido"]);
    expect(within(quadro()).getByText("✅ Nenhuma instabilidade agora")).toBeTruthy();
  });
  it("um incidente ativo em destaque; e um novo, chegando com a tela aberta, dá o aviso", async () => {
    INSTABILIDADES = [
      avisoDoPix(
        "1",
        "Identified",
        "major_outage",
        "Identificamos uma instabilidade no PIX.",
        ha(3),
      ),
    ];
    abrir();
    const alerta = await within(await screen.findByLabelText("Instabilidades")).findByRole("alert");
    expect(alerta.textContent).toContain("AGORA · queda total");
    expect(alerta.textContent).toContain("Transacional - PIX");
    INSTABILIDADES = [
      ...INSTABILIDADES,
      {
        ...avisoDoPix("9", "Investigating", "partial_outage", "A API está lenta.", ha(1)),
        texto:
          "*Incident: Investigating*\n*<https://status.pagar.me/incidents/novo|Instabilidade: API>*\nA API está lenta.\npartial_outage\nAPI Pagar.me v5.0",
      },
    ];
    await act(async () => aoMudarInst!());
    await waitFor(() => expect(within(quadro()).getAllByRole("alert")).toHaveLength(2));
    expect(toast).toHaveBeenCalledWith("⚠️ Instabilidade agora: API Pagar.me v5.0 (queda parcial)");
  });
  it("a mensagem de uma pessoa: o aviso simples, com a conversa no Ler aqui", async () => {
    INSTABILIDADES = [
      {
        ts: "5",
        autor_nome: "Kaio",
        texto: "o PIX caiu de novo?",
        respostas: [{ ts: "6", autor_nome: "Carol", texto: "Sim, já estamos vendo!" }],
        qtd_respostas: 1,
        reacoes_ok: 0,
        criado_em: ha(10),
        editado_em: null,
      },
    ];
    abrir();
    fireEvent.click(
      await within(await screen.findByLabelText("Instabilidades")).findByRole("button", {
        name: "Ler aqui",
      }),
    );
    expect(within(quadro()).getByText("Sim, já estamos vendo!")).toBeTruthy();
  });
});

describe("o período dos incidentes resolvidos (23/10/2026, o vídeo)", () => {
  it("com o período no texto do aviso: o horário real", async () => {
    INSTABILIDADES = [
      avisoDoPix(
        "3",
        "Resolved",
        "operational",
        "Entre 00:54 e 01:35 passamos por uma instabilidade.",
        ha(60 * 30),
      ),
    ];
    abrir();
    const quadro = await screen.findByLabelText("Instabilidades");
    await waitFor(() => expect(quadro.textContent).toContain("das 00:54 às 01:35 (41 min)"));
  });
  it("com um aviso só e sem o período: só o horário (e não 'das 10:49 às 10:49')", async () => {
    INSTABILIDADES = [
      avisoDoPix("3", "Resolved", "operational", "O cenário foi normalizado.", ha(60 * 30)),
    ];
    abrir();
    const quadro = await screen.findByLabelText("Instabilidades");
    await waitFor(() => expect(quadro.textContent).toMatch(/, às \d\d:\d\d/));
    expect(quadro.textContent).not.toMatch(/das (\d\d:\d\d) às \1/);
  });
});
