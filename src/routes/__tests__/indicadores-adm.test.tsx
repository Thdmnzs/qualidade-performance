// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({ options: opcoes }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ usePermissoes: () => ({ isAdmin: true, isLoading: false }) }));
const lerAgora = vi.fn(async () => ({ ok: true, gravadas: 11, linhas: 11, ignoradas: [] }));
vi.mock("@/lib/indicadores.functions", () => ({ lerPlanilhaAgoraFn: () => lerAgora() }));
const CAB = [
  "Data",
  "Membro",
  "Conversas atribuídas (total)",
  "Conversas atribuídas (membro da equipe)",
  "Horas ativas",
  "Conv. atribuídas por hora ativa - total",
  "Conv. atribuídas por hora ativa - membro da equipe",
  "Conv. atribuídas por hora ativa - ajustada",
  "CSAT avaliações positivas",
  "CSAT total de avaliações",
  "CSAT %",
  "[B2C] SLA primeira resposta chat (s)",
  "[B2C] SLA primeira resposta email (s)",
  "[B2C] SLA chat (s)",
  "[B2C] SLA email (s)",
  "[B2B] SLA primeira resposta chat (s)",
  "[B2B] SLA primeira resposta email (s)",
  "[B2B] SLA chat (s)",
  "[B2B] SLA email (s)",
];
// As linhas reais de 15/10 (três delas)
const DADOS = [
  CAB,
  [
    "15/10/2026",
    "TIME",
    "325",
    "25",
    "47,00",
    "6,91",
    "0,53",
    "6,38",
    "41",
    "43",
    "95,3%",
    "238",
    "605",
    "326",
    "1315",
    "328",
    "394",
    "320",
    "1175",
  ],
  [
    "15/10/2026",
    "Kaio",
    "59",
    "0",
    "7,80",
    "7,56",
    "0,00",
    "7,56",
    "11",
    "11",
    "100,0%",
    "154",
    "422",
    "222",
    "123",
    "194",
    "",
    "265",
  ],
  ["15/10/2026", "Thiago", "0", "0", "", "", "", "", "", "", "", "", "", "96"],
];
const ANALISE = [
  ["Métricas individuais do time de CX"],
  ["Período", "Mês atual"],
  ["Início do período", "01/10/2026"],
  ["Fim do período", "15/10/2026"],
  [],
  ["Membro", "Conv. atribuídas por hora ativa - ajustada", "CSAT %", "[B2C] SLA chat"],
  ["Kaio", "7,68", "99,1%", "3:51"],
  ["Thiago", "9,91", "93,5%", "3:14"],
  ["TIME", "5,83", "97,3%", "5:27"],
];
let leituras: unknown[] = [];
const rpc = vi.fn(async (nome: string, _a?: unknown) => {
  if (nome === "copia_da_planilha")
    return {
      data: {
        dados: { valores: DADOS, dia: "2026-10-15", lida_em: "2026-10-16T11:00:00Z" },
        analise: { valores: ANALISE, dia: null, lida_em: "2026-10-16T11:00:00Z" },
      },
      error: null,
    };
  if (nome === "leituras_da_planilha_recentes") return { data: leituras, error: null };
  return { data: null, error: null };
});
const consulta = (dados: unknown) => {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c["then"] = (ok: (v: unknown) => void) => ok({ data: dados, error: null });
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (n: string, a?: unknown) => rpc(n, a),
    from: () => consulta([{ id: "rachel", nome: "Rachel Kivel", nome_na_planilha: "Rachel" }]),
  },
}));
const { Route } = await import("../_authenticated/admin/indicadores");
const Tela = (Route as unknown as { options: { component: ComponentType } }).options.component;
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tela />
    </QueryClientProvider>,
  );
const linhas = () => [...document.querySelectorAll("tbody tr")];
afterEach(() => {
  cleanup();
  leituras = [];
  vi.clearAllMocks();
});

describe("os indicadores na visão da supervisão (a cópia da planilha)", () => {
  it("o Ontem: as linhas da aba Dados, como estão, e o SLA geral esperando a planilha", async () => {
    abrir();
    expect(await screen.findByRole("tab", { name: "Ontem · qui 15/10" })).toBeTruthy();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(document.querySelectorAll("thead tr:nth-child(2) th")).toHaveLength(21);
    expect(screen.getByText("aguardando a planilha")).toBeTruthy();
    const kaio = [...linhas()[1]!.querySelectorAll("td")].map((td) => td.textContent);
    expect(kaio.slice(0, 8)).toEqual([
      "15/10/2026",
      "Kaio",
      "59",
      "0",
      "7,80",
      "7,56",
      "0,00",
      "7,56",
    ]); // como na planilha
    expect(kaio[16]).toBe("—"); // a célula vazia
    expect(linhas()[0]!.querySelector("td")!.className).toContain("bg-primary/10"); // o TIME em destaque
  });
  it("a quinzena: a aba Análise, com as informações do período; e o filtro do membro", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("tab", { name: "A quinzena (aba Análise)" }));
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(screen.getByText("Mês atual")).toBeTruthy();
    expect(
      [...linhas()[1]!.querySelectorAll("td")].slice(0, 4).map((td) => td.textContent),
    ).toEqual(["Thiago", "9,91", "93,5%", "3:14"]);
    fireEvent.change(screen.getByRole("combobox", { name: "O membro" }), {
      target: { value: "TIME" },
    });
    expect(linhas()).toHaveLength(1);
  });
  it("o nome sem dono: ligar a uma pessoa, e ler de novo", async () => {
    leituras = [
      {
        id: "l1",
        lida_em: "2026-10-16T11:00:00Z",
        origem: "automatica",
        gravadas: 10,
        ignoradas: [{ nome: "Fulano", linhas: 2 }],
        erro: null,
      },
    ];
    abrir();
    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toContain("“Fulano”");
    fireEvent.change(await within(aviso).findByRole("combobox", { name: "A pessoa de Fulano" }), {
      target: { value: "rachel" },
    });
    fireEvent.click(within(aviso).getByRole("button", { name: "Ligar" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("associar_nome_da_planilha", {
        _employee_id: "rachel",
        _nome: "Fulano",
      }),
    );
    await waitFor(() => expect(lerAgora).toHaveBeenCalled());
  });
  it("a leitura que falhou aparece, com o motivo", async () => {
    leituras = [
      {
        id: "l1",
        lida_em: "2026-10-16T11:00:00Z",
        origem: "automatica",
        gravadas: 0,
        ignoradas: [],
        erro: "A conta de serviço não tem acesso à planilha.",
      },
    ];
    abrir();
    expect((await screen.findByRole("alert")).textContent).toContain("não tem acesso à planilha");
  });
});
