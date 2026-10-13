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
  lerFerias: vi.fn(async (ano: number) => ({
    ano,
    eu: "t",
    feriados: new Set<string>(),
    porDia: new Map(),
  })),
};
const TIME = [
  { employee_id: "t", nome: "Thiago Dantas", dias: [2, 6], supervisao: false },
  { employee_id: "s", nome: "Suelen Rocha", dias: [3, 6], supervisao: false },
  { employee_id: "c", nome: "Carol Supervisora", dias: [5, 6], supervisao: true },
];
const api = {
  lerMinhasTrocas: vi.fn(async () => trocas),
  lerTrocasParaAprovar: vi.fn(async () => trocas),
  pedirTroca: vi.fn(async (..._a: unknown[]) => {}),
  pedirTrocaNoDia: vi.fn(async (..._a: unknown[]) => {}),
  lerFolgasFixas: vi.fn(async () => TIME),
  definirFolgaFixa: vi.fn(async (..._a: unknown[]) => {}),
  responderTroca: vi.fn(async (..._a: unknown[]) => {}),
  cancelarTroca: vi.fn(async (..._a: unknown[]) => {}),
  decidirTroca: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/escala-api", () => escala);
vi.mock("@/lib/trocas-api", () => api);
const avisarTrocaFn = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/avisos-trocas.functions", () => ({ avisarTrocaFn }));
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
  const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar ›" }));
  const abrirFormulario = async () => {
    trocas = [];
    abrir(<TrocasDoTime />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Pedir uma troca" }));
    return screen.findByRole("dialog");
  };
  it("passo a passo: com quem, a troca, o dia (numa semana publicada) e o envio", async () => {
    const janela = await abrirFormulario();
    fireEvent.click(await within(janela).findByRole("button", { name: /Suelen Rocha/ }));
    expect(within(janela).queryByRole("button", { name: /Carol/ })).toBeNull(); // a supervisão, fora
    continuar();
    fireEvent.click(within(janela).getByRole("button", { name: /Trocar os horários de um dia/ }));
    continuar();
    expect(within(janela).getByText("Em que dia vocês trocam os horários?")).toBeTruthy();
    fireEvent.click(await within(janela).findByRole("button", { name: "ter 20/10" }));
    continuar();
    expect(within(janela).getByText("Confira e envie")).toBeTruthy();
    expect(await within(janela).findByText(/Você: 6h às 15h → 13h às 22h/)).toBeTruthy(); // o como fica, com as horas
    fireEvent.click(within(janela).getByRole("button", { name: "Enviar o pedido" }));
    await waitFor(() =>
      expect(api.pedirTrocaNoDia).toHaveBeenCalledWith(
        "2026-10-20",
        "horarios",
        "s",
        null,
        null,
        "",
      ),
    );
  });
  it("escolher só marca: quem avança é o Continuar", async () => {
    const janela = await abrirFormulario();
    const passo = () => janela.querySelector('[aria-current="step"]')!.textContent;
    fireEvent.click(await within(janela).findByRole("button", { name: /Suelen Rocha/ }));
    fireEvent.click(within(janela).getByRole("button", { name: /Suelen Rocha/ }));
    expect(passo()).toContain("1. Com quem");
    continuar();
    fireEvent.click(within(janela).getByRole("button", { name: /Trocar as folgas/ }));
    fireEvent.click(within(janela).getByRole("button", { name: /Trocar os horários de um dia/ }));
    expect(passo()).toContain("2. A troca");
  });
  it("a folga de um dia numa semana não publicada (pela folga fixa), com o segundo dia sozinho", async () => {
    const janela = await abrirFormulario();
    fireEvent.click(await within(janela).findByRole("button", { name: /Suelen Rocha/ }));
    continuar();
    fireEvent.click(within(janela).getByRole("button", { name: /Trocar as folgas/ }));
    continuar();
    // a quarta 28/10: o Thiago folga; a Suelen folga só na quinta (o domingo, as duas): o segundo dia é a quinta
    fireEvent.click(await within(janela).findByRole("button", { name: "qua 28/10" }));
    expect(
      within(janela).getByRole("button", { name: "qui 29/10" }).getAttribute("aria-pressed"),
    ).toBe("true");
    continuar();
    expect(janela.textContent).toContain("Você: qua 28/10 e dom 01/11 → qui 29/10 e dom 01/11");
    expect(janela.textContent).toContain("Suelen: qui 29/10 e dom 01/11 → qua 28/10 e dom 01/11");
    expect(within(janela).getByText(/A escala dessa semana ainda não foi publicada/)).toBeTruthy();
    fireEvent.click(within(janela).getByRole("button", { name: "Enviar o pedido" }));
    await waitFor(() =>
      expect(api.pedirTrocaNoDia).toHaveBeenCalledWith(
        "2026-10-28",
        "folgas",
        "s",
        "um",
        "2026-10-29",
        "",
      ),
    );
  });
  it("a colega aceita o pedido que chegou para ela", async () => {
    trocas = [TROCA("aguardando_colega")];
    abrir(<TrocasDoTime />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar a troca" }));
    await waitFor(() => expect(api.responderTroca).toHaveBeenCalledWith("x1", true));
    await waitFor(() => expect(avisarTrocaFn).toHaveBeenCalledWith({ data: { trocaId: "x1" } })); // a Central de Turnos avisa o canal
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
    expect(avisarTrocaFn).toHaveBeenCalledWith({ data: { trocaId: "x1" } }); // e a decisão vai na conversa
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

describe("as folgas fixas (o ADM)", () => {
  it("ligar um dia salva as folgas em ordem; e a supervisão aparece marcada", async () => {
    const { FolgasFixas } = await import("../folgas-fixas");
    abrir(<FolgasFixas />);
    expect(await screen.findByText("supervisão · fora das trocas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thiago Dantas, SEG: trabalha" }));
    await waitFor(() => expect(api.definirFolgaFixa).toHaveBeenCalledWith("t", [0, 2, 6]));
  });
});
