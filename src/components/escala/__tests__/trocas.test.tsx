// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const sig = (id: string, sigla: string, extra = {}) => ({
  id,
  sigla,
  cor: "#C9DAF8",
  significado: sigla,
  conta_como_trabalho: true,
  em_atendimento: false,
  faixa: false,
  ordem: 5,
  ...extra,
});
const SIGLAS = [
  sig("i", "i", { em_atendimento: true, ordem: 1 }),
  sig("P", "P", { conta_como_trabalho: false, ordem: 2 }),
  sig("cxtech", "cxtech"),
  sig("quali", "quali"),
];
const H = (ini: number, ...xs: (string | null)[]) =>
  Array.from({ length: 16 }, (_, k) => xs[k + 6 - ini] ?? null);
const SEMANA = {
  inicio: "2026-10-19",
  situacao: "publicada",
  publicada_em: "2026-10-16T12:00:00Z",
  eu: "t",
  feriados: [],
  dias: [
    [],
    [
      {
        employee_id: "t",
        nome: "Thiago Dantas",
        horas: H(6, "i", "i", "cxtech", "cxtech", "P", "i", "i", "i", "i"),
      },
      {
        employee_id: "s",
        nome: "Suelen Rocha",
        horas: H(13, "i", "i", "quali", "quali", "P", "i", "i", "i", "i"),
      },
    ],
    [],
    [],
    [],
    [],
    [],
  ],
};
const TROCA = (
  situacao: string,
  de = { id: "s", nome: "Suelen Rocha" },
  para = { id: "t", nome: "Thiago Dantas" },
) => ({
  id: "x1",
  inicio: "2026-10-19",
  tipo: "horarios",
  dias: [1],
  de,
  para,
  mensagem: "Tenho médico.",
  situacao,
  motivo: null,
  criado_em: "2026-10-16T12:00:00Z",
  aceita_em: null,
  decidida_em: null,
});
let trocas: unknown[] = [];
const escala = {
  lerSiglas: vi.fn(async () => SIGLAS),
  lerSemanas: vi.fn(async () => [{ inicio: "2026-10-19", situacao: "publicada" }]),
  lerSemana: vi.fn(async (..._a: unknown[]) => SEMANA),
};
const api = {
  lerMinhasTrocas: vi.fn(async () => trocas),
  lerTrocasParaAprovar: vi.fn(async () => trocas),
  pedirTroca: vi.fn(async (..._a: unknown[]) => {}),
  responderTroca: vi.fn(async (..._a: unknown[]) => {}),
  cancelarTroca: vi.fn(async (..._a: unknown[]) => {}),
  decidirTroca: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/escala-api", () => escala);
vi.mock("@/lib/trocas-api", () => api);
const { TrocasDoTime, TrocasParaAprovar } = await import("../trocas");
const abrir = (el: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {el}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z")); // sexta: a semana de 19/10 já publicada
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("o colaborador (a aba Trocas)", () => {
  it("pede a troca dos horários da terça, vendo o como fica antes", async () => {
    trocas = [];
    abrir(<TrocasDoTime />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Pedir uma troca" }));
    const janela = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(janela).getAllByRole("option", { name: "Suelen Rocha" }).length).toBe(1),
    );
    fireEvent.change(within(janela).getByLabelText("Trocar com"), { target: { value: "s" } });
    fireEvent.change(within(janela).getByLabelText("O dia"), { target: { value: "1" } });
    expect(await within(janela).findByText("Como fica a escala")).toBeTruthy();
    expect(within(janela).getByText(/Você: 6h às 15h → 13h às 22h/)).toBeTruthy();
    fireEvent.click(within(janela).getByRole("button", { name: "Enviar o pedido" }));
    await waitFor(() =>
      expect(api.pedirTroca).toHaveBeenCalledWith("2026-10-19", "horarios", [1], "s", ""),
    );
  });
  it("a colega aceita o pedido que chegou para ela", async () => {
    trocas = [TROCA("aguardando_colega")];
    abrir(<TrocasDoTime />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar a troca" }));
    await waitFor(() => expect(api.responderTroca).toHaveBeenCalledWith("x1", true));
  });
});

describe("o ADM (as trocas para aprovar)", () => {
  it("aprovar, e aprovar e ajustar (levando ao dia da troca)", async () => {
    trocas = [TROCA("aguardando_supervisao")];
    const aoAjustar = vi.fn();
    abrir(<TrocasParaAprovar aoAjustar={aoAjustar} />);
    expect(await screen.findByText("Para aprovar · 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e ajustar" }));
    await waitFor(() => expect(api.decidirTroca).toHaveBeenCalledWith("x1", true, null));
    await waitFor(() => expect(aoAjustar).toHaveBeenCalledWith("2026-10-19", 1));
  });
  it("recusar pede um motivo de 10 caracteres", async () => {
    trocas = [TROCA("aguardando_supervisao")];
    abrir(<TrocasParaAprovar aoAjustar={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    const janela = await screen.findByRole("dialog");
    fireEvent.change(within(janela).getByLabelText("O motivo da recusa"), {
      target: { value: "curto" },
    });
    expect(
      (within(janela).getByRole("button", { name: "Recusar" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(janela).getByLabelText("O motivo da recusa"), {
      target: { value: "Pouca gente às 6h nesse dia." },
    });
    fireEvent.click(within(janela).getByRole("button", { name: "Recusar" }));
    await waitFor(() =>
      expect(api.decidirTroca).toHaveBeenCalledWith("x1", false, "Pouca gente às 6h nesse dia."),
    );
  });
});
