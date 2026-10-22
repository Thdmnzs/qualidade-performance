// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/escala", async (original) => ({
  ...(await original<object>()),
  hojeIso: () => "2026-10-21",
}));
const registrar = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/perfil-api", () => ({
  lerMeusNucleos: async () => ["auto", "cxtech"],
  lerMeuHorario: async () => ({ entrada: 13, saida: 22, pausa: 17, fds_dias: null }),
  lerMinhaFolgaFixa: async () => [2, 6],
  lerMeusHumores: async () => [{ dia: "2026-10-20", nivel: 4, comentario: null }],
  registrarHumor: (...a: unknown[]) => registrar(...a),
}));
// A semana real do Thiago (19 a 25/10): as siglas por hora, das 6h às 21h
const S = (sigla: string) => `id-${sigla}`;
const linha = (siglas: (string | null)[]) => ({
  employee_id: "eu",
  horas: siglas.map((x) => (x ? S(x) : null)),
});
const nada = Array(7).fill(null);
vi.mock("@/lib/escala-api", () => ({
  lerSiglas: async () =>
    ["i", "P", "cxtech", "auto", "folga"].map((s) => ({
      id: S(s),
      sigla: s,
      cor: "#eee",
      significado: s,
    })),
  lerSemana: async () => ({
    inicio: "2026-10-19",
    situacao: "publicada",
    eu: "eu",
    feriados: [],
    dias: [
      [linha(["i", "i", "i", "i", "i", "P", "cxtech", "cxtech", "i", ...Array(7).fill(null)])],
      [linha([...nada, "i", "auto", "auto", "auto", "P", "auto", "auto", "auto", "i"])],
      [linha([...nada, ...Array(9).fill("folga")])],
      [],
      [],
      [],
      [],
    ],
  }),
  lerFerias: async () => ({
    ano: 2026,
    eu: "eu",
    feriados: new Set(),
    porDia: new Map([
      ["2026-11-23", [{ employee_id: "eu", nome: "Thiago" }]],
      ["2026-11-24", [{ employee_id: "eu", nome: "Thiago" }]],
    ]),
  }),
  lerPedidos: async () => [
    {
      id: "p1",
      employee_id: "eu",
      nome: "Thiago",
      de: "2026-11-22",
      ate: "2026-11-29",
      observacao: null,
      situacao: "cancelado",
      motivo: null,
    },
  ],
}));
const { SobreMim } = await import("../sobre-mim");
const { MinhaSemanaEFerias } = await import("../minha-semana");
const abrir = (el: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("o Sobre mim", () => {
  it("os núcleos, o horário e a folga fixa da própria pessoa", async () => {
    abrir(<SobreMim employeeId="eu" />);
    expect(await screen.findByText("auto · Automação")).toBeTruthy();
    expect(screen.getByText("cxtech · CX Tech")).toBeTruthy();
    expect(await screen.findByText(/13:00 às 22:00/)).toBeTruthy();
    expect(await screen.findByText("quarta e domingo")).toBeTruthy();
  });
  it("o termômetro: escolher, contar mais e registrar; e os 7 dias", async () => {
    abrir(<SobreMim employeeId="eu" />);
    const dias = await screen.findByLabelText("Os seus últimos 7 dias");
    await waitFor(() => expect(dias.textContent).toContain("🙂")); // o dia 20, bem
    fireEvent.click(screen.getByRole("radio", { name: "muito bem" }));
    fireEvent.change(screen.getByLabelText("Quer contar mais? (opcional)"), {
      target: { value: "Dia ótimo!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(5, "Dia ótimo!"));
    expect(screen.getByText("🔒 Só você e a supervisão veem.")).toBeTruthy();
  });
});

describe("a minha semana e as minhas férias", () => {
  it("os dias da semana real: o horário, a folga e a folga fixa; e hoje em destaque", async () => {
    abrir(<MinhaSemanaEFerias employeeId="eu" folgaFixa={[2, 6]} />);
    const semana = await screen.findByLabelText("A minha semana");
    await waitFor(() => expect(semana.textContent).toContain("06:00 – 15:00"));
    expect(semana.textContent).toContain("13:00 – 22:00");
    expect(within(semana).getAllByText("folga fixa")).toHaveLength(1); // o domingo (a quarta tem a folga da escala)
    expect(within(semana).getByText("folga")).toBeTruthy();
    expect(within(semana).getByText("hoje")).toBeTruthy();
  });
  it("as férias marcadas (agrupadas) e os pedidos, com a situação", async () => {
    abrir(<MinhaSemanaEFerias employeeId="eu" folgaFixa={[2, 6]} />);
    const ferias = await screen.findByLabelText("As minhas férias");
    await waitFor(() => expect(ferias.textContent).toContain("23/11 a 24/11"));
    expect(ferias.textContent).toContain("2 dias");
    expect(ferias.textContent).toContain("cancelado");
  });
});
