// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({ options: opcoes }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
let PODE = true;
vi.mock("@/hooks/useAuth", () => ({
  usePermissoes: () => ({ podeAvaliar: PODE, isLoading: false }),
}));
const ORIENTACOES = [
  {
    id: "c1",
    ordem: 1,
    grupo: "LGPD",
    descricao: "Cumpriu LGPD?",
    permite_medio: false,
    sim: null,
    medio: null,
    nao: null,
    exemplo: null,
    autor: null,
    em: null,
    versoes: 0,
  },
  {
    id: "c2",
    ordem: 2,
    grupo: "Tom de voz / Marca",
    descricao: "Demonstrou empatia?",
    permite_medio: true,
    sim: "Reconhece o sentimento.",
    medio: null,
    nao: null,
    exemplo: null,
    autor: "Rachel Kivel",
    em: "2026-10-20T15:00:00Z",
    versoes: 2,
  },
  {
    id: "c6",
    ordem: 6,
    grupo: "Diagnóstico",
    descricao: "Checou o histórico?",
    permite_medio: false,
    sim: null,
    medio: null,
    nao: null,
    exemplo: null,
    autor: null,
    em: null,
    versoes: 0,
  },
];
const api = {
  lerOrientacoes: vi.fn(async () => ORIENTACOES),
  lerVersoes: vi.fn(async () => [
    {
      sim: "Reconhece o sentimento.",
      medio: null,
      nao: null,
      exemplo: null,
      autor: "Rachel Kivel",
      em: "2026-10-20T15:00:00Z",
    },
    {
      sim: "Versão antiga.",
      medio: null,
      nao: null,
      exemplo: null,
      autor: "Vitor de Almeida",
      em: "2026-10-19T15:00:00Z",
    },
  ]),
  salvarOrientacao: vi.fn(async (..._a: unknown[]) => {}),
  lerConcordancia: vi.fn(async () => ({
    avaliacoes: 10,
    pre_avaliadas: 8,
    criterios: [
      {
        id: "c1",
        ordem: 1,
        grupo: "LGPD",
        descricao: "Cumpriu LGPD?",
        tem_orientacao: false,
        total: 8,
        acordos: 8,
        mudanca: null,
        motivos: null,
      },
      {
        id: "c6",
        ordem: 6,
        grupo: "Diagnóstico",
        descricao: "Checou o histórico?",
        tem_orientacao: false,
        total: 8,
        acordos: 4,
        mudanca: "sim>nao",
        motivos: { nao_viu: 3 },
      },
    ],
  })),
  lerAvaliacoesParaExemplos: vi.fn(async () => [
    {
      id: "a1",
      data: "2026-10-14",
      pessoa: "Kaio",
      nota: 98.2,
      exemplar: false,
      processo: "Internet lenta",
      assunto: null,
      comentario: "Ótimo diagnóstico.",
    },
  ]),
  marcarExemplar: vi.fn(async (..._a: unknown[]) => {}),
  registrarMotivos: vi.fn(),
};
vi.mock("@/lib/treinar-a-ia-api", () => api);
const { Route } = await import("../_authenticated/admin/treinar-a-ia");
const Tela = (Route as unknown as { options: { component: ComponentType } }).options.component;
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tela />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  PODE = true;
});

describe("Treinar a IA", () => {
  it("as orientações: o critério, o autor, o médio só onde a ficha permite, e o que a IA recebe", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /2\. Demonstrou empatia\?/ }));
    expect(screen.getByText(/Escrita por/).textContent).toContain("Rachel Kivel");
    expect(screen.getByText("Conta como MÉDIO")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Conta como NÃO"), {
      target: { value: "Ignora a irritação." },
    });
    expect(
      screen.getByText(
        "Conta como SIM: Reconhece o sentimento. Conta como NÃO: Ignora a irritação.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar a orientação" }));
    await waitFor(() =>
      expect(api.salvarOrientacao).toHaveBeenCalledWith("c2", {
        sim: "Reconhece o sentimento.",
        medio: "",
        nao: "Ignora a irritação.",
        exemplo: "",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /1\. Cumpriu LGPD\?/ }));
    expect(screen.queryByText("Conta como MÉDIO")).toBeNull();
  });
  it("as versões: ver, e usar uma antiga", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /2\. Demonstrou empatia\?/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver as versões/ }));
    const versoes = await screen.findByRole("list", { name: "As versões" });
    fireEvent.click(await within(versoes).findByRole("button", { name: "Usar esta versão" }));
    expect((screen.getByLabelText("Conta como SIM") as HTMLTextAreaElement).value).toBe(
      "Versão antiga.",
    );
  });
  it("a concordância: do menor acordo, e o Ajustar abre o critério nas orientações", async () => {
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "A concordância" }));
    expect(await screen.findByText("Acordo geral")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy(); // (8 + 4) ÷ 16
    expect(screen.getByText("Sim → Não")).toBeTruthy();
    expect(screen.getByText("A IA não viu algo na conversa (3)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ajustar a orientação/ }));
    expect(screen.getByRole("tab", { name: "As orientações" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      (await screen.findByRole("button", { name: /6\. Checou o histórico\?/ })).getAttribute(
        "aria-current",
      ),
    ).toBe("true");
  });
  it("os exemplos: marcar com a estrela", async () => {
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "Os exemplos" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Marcar a avaliação de Kaio como exemplar" }),
    );
    await waitFor(() => expect(api.marcarExemplar).toHaveBeenCalledWith("a1", true));
  });
  it("o colaborador não entra", () => {
    PODE = false;
    abrir();
    expect(screen.getByText("Acesso restrito")).toBeTruthy();
  });
});
