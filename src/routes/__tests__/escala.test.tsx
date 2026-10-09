// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (op: Record<string, unknown>) => ({ options: op }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
let resposta: Record<string, unknown> = {};
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => resposta,
  createServerFn: () => ({}),
}));
vi.mock("@/lib/escala.functions", () => ({ escalaDaSemanaFn: {}, feriasDoAnoFn: {} }));

const { Route } = await import("../_authenticated/escala");
const Pagina = (Route as unknown as { options: { component: () => React.ReactElement } }).options
  .component;
const H = (inicio: number, ...xs: string[]) =>
  Array.from({ length: 16 }, (_, i) =>
    xs[i + 6 - inicio] ? { texto: xs[i + 6 - inicio]!, cor: "#c9daf8", mescla: null } : null,
  );
const SEMANA = {
  abas: [{ titulo: "05 a 11/10", inicio: "2026-10-05", fim: "2026-10-11" }],
  titulo: "05 a 11/10",
  lidaEm: Date.now(),
  semana: {
    horas: Array.from({ length: 16 }, (_, i) => i + 6),
    dias: [
      {
        nome: "segunda",
        titulo: "segunda feira",
        data: "2026-10-05",
        pessoas: [
          {
            nome: "Ruby",
            horas: Array.from({ length: 16 }, (_, i) =>
              i < 9 ? { texto: "folga", cor: "#ff9900", mescla: 0 } : null,
            ),
          },
          { nome: "Thiago", horas: H(6, "i", "i", "i", "i", "P", "i", "i", "i", "mensal") },
        ],
      },
    ],
  },
};
const abrir = (r: Record<string, unknown>) => {
  resposta = r;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Pagina />
    </QueryClientProvider>,
  );
};
afterEach(() => cleanup());

describe("a tela da Escala", () => {
  it("o colaborador: o '(você)' na própria linha, as horas sem a pausa, e sem a linha Online", async () => {
    abrir({ ...SEMANA, eu: "Thiago", ehAdm: false, leitura: null });
    const linha = (await screen.findByText("(você)")).closest("tr")!;
    expect(within(linha).getByText("8")).toBeTruthy(); // 9 horas na escala, menos a pausa
    expect(screen.queryByText("Online")).toBeNull();
    expect(screen.queryByText("Leitura da planilha")).toBeNull();
    expect(screen.getByRole("tab", { name: "Meu dia" })).toBeTruthy();
  });
  it("a folga mesclada aparece numa célula só, por cima das horas", async () => {
    abrir({ ...SEMANA, eu: "Thiago", ehAdm: false, leitura: null });
    const folga = (await screen.findAllByText("folga"))[0]!.closest("td")!;
    expect(folga.getAttribute("colspan")).toBe("9");
    expect(folga.getAttribute("title")).toBe("Folga"); // só o significado, ao passar o mouse
  });
  it("o 'Meu dia': os blocos da própria escala, com o significado", async () => {
    abrir({ ...SEMANA, eu: "Thiago", ehAdm: false, leitura: null });
    await userEvent.click(await screen.findByRole("tab", { name: "Meu dia" }));
    expect(screen.getByText("Seu dia: 8 horas de trabalho")).toBeTruthy();
    expect(screen.getByText("6h às 10h")).toBeTruthy();
    expect(screen.getAllByText("Reunião mensal de alinhamento").length).toBeGreaterThan(0);
  });
  it("o ADM: sem o 'Meu dia', com a linha Online (só quem está em atendimento) e o quadro da leitura", async () => {
    abrir({
      ...SEMANA,
      eu: null,
      ehAdm: true,
      leitura: {
        planilha: "https://docs.google.com/x",
        semCadastro: ["Ruby"],
        encontrados: [{ planilha: "Thiago", cadastro: "Thiago Dantas" }],
      },
    });
    const online = (await screen.findByText("Online")).closest("tr")!;
    const numeros = within(online)
      .getAllByText(/^\d$/)
      .map((e) => e.textContent);
    expect(numeros.slice(0, 5)).toEqual(["1", "1", "1", "1", "0"]); // às 10h, o Thiago está em pausa
    expect(screen.queryByRole("tab", { name: "Meu dia" })).toBeNull();
    expect(
      screen.getByText("1 nome da planilha não encontrou um cadastro no QualityHUB", {
        exact: false,
      }),
    ).toBeTruthy();
  });
  it("a planilha não compartilhada: a mensagem, sem quebrar a tela", async () => {
    resposta = {};
    abrir({
      abas: [],
      titulo: null,
      semana: null,
      lidaEm: null,
      eu: null,
      ehAdm: false,
      leitura: null,
    });
    expect(await screen.findByText(/Nenhuma aba de semana foi encontrada/)).toBeTruthy();
  });
});
