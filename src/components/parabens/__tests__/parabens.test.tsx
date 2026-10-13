// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
  },
}));
let hoje: unknown[] = [];
let recados: unknown[] = [];
const api = {
  lerAniversariantesDeHoje: vi.fn(async () => hoje),
  lerProximosAniversarios: vi.fn(async (..._a: unknown[]) => [
    { employee_id: "s", nome: "Suelen Rocha", dia: 14, mes: 10, data: "2026-10-14" },
  ]),
  darParabens: vi.fn(async (..._a: unknown[]) => {}),
  lerMeusRecados: vi.fn(async () => recados),
  ocultarRecado: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/parabens-api", () => api);
const { AniversariantesDeHoje } = await import("../aniversariantes-de-hoje");
const { MuralDosParabens } = await import("../mural");
const abrir = (el: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {el}
    </QueryClientProvider>,
  );
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Aniversariantes de hoje (a Visão geral)", () => {
  it("sem ninguém fazendo aniversário, o cartão não aparece", async () => {
    hoje = [];
    const { container } = abrir(<AniversariantesDeHoje />);
    await waitFor(() => expect(api.lerAniversariantesDeHoje).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
  it("a colega dá os parabéns (com uma sugestão), e os próximos aniversários aparecem", async () => {
    hoje = [{ employee_id: "t", nome: "Thiago Dantas", sou_eu: false, ja_dei: false }];
    abrir(<AniversariantesDeHoje />);
    expect(await screen.findByText("Hoje é o aniversário de Thiago Dantas!")).toBeTruthy();
    expect(await screen.findByText(/Suelen \(quarta, 14\/10\)/)).toBeTruthy();
    expect(screen.queryByText(/\d+ pessoas? já/)).toBeNull(); // sem nenhuma contagem
    fireEvent.click(screen.getByRole("button", { name: "🎉 Dar os parabéns" }));
    expect(
      (screen.getByRole("button", { name: "🎉 Enviar os parabéns" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "💚 Muitas felicidades!" }));
    fireEvent.click(screen.getByRole("button", { name: "🎉 Enviar os parabéns" }));
    await waitFor(() =>
      expect(api.darParabens).toHaveBeenCalledWith("t", "💚 Muitas felicidades!"),
    );
  });
  it("depois de dar, o botão vira o ✓; e o aniversariante vê o próprio texto", async () => {
    hoje = [
      { employee_id: "t", nome: "Thiago Dantas", sou_eu: false, ja_dei: true },
      { employee_id: "a", nome: "Ana Colab", sou_eu: true, ja_dei: false },
    ];
    abrir(<AniversariantesDeHoje />);
    expect(await screen.findByText("✓ Você deu os parabéns")).toBeTruthy();
    expect(screen.getByText("Hoje é o seu aniversário! 🎉")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "🎉 Dar os parabéns" })).toBeNull();
  });
});

describe("o mural (o Meu perfil)", () => {
  const RECADOS = [
    { id: "r1", autor: "Rachel Kivel", texto: "Parabéns! 💚", criado_em: "2026-10-12T11:12:00Z" },
    {
      id: "r2",
      autor: "Kaio Melo",
      texto: "<b>oi</b><script>alert(1)</script>",
      criado_em: "2026-10-12T12:00:00Z",
    },
  ];
  it("no aniversário, aberto; o recado com código aparece como texto", async () => {
    recados = RECADOS;
    abrir(<MuralDosParabens employeeId="a" aniversarioHoje />);
    expect(await screen.findByText("💌 Seus parabéns de hoje")).toBeTruthy();
    expect(screen.getByText("Parabéns! 💚")).toBeTruthy();
    expect(screen.getByText("<b>oi</b><script>alert(1)</script>")).toBeTruthy(); // como texto
    expect(document.querySelector("#recados-dos-parabens script")).toBeNull();
  });
  it("nos outros dias, minimizado; e a escolha fica guardada", async () => {
    recados = RECADOS;
    abrir(<MuralDosParabens employeeId="a" aniversarioHoje={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Mostrar os recados/ }));
    expect(screen.getByText("Parabéns! 💚")).toBeTruthy();
    cleanup();
    abrir(<MuralDosParabens employeeId="a" aniversarioHoje={false} />);
    expect(await screen.findByText("Parabéns! 💚")).toBeTruthy(); // lembrou que estava aberto
  });
  it("ocultar um recado", async () => {
    recados = RECADOS;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    abrir(<MuralDosParabens employeeId="a" aniversarioHoje />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Ocultar o recado de Rachel Kivel" }),
    );
    await waitFor(() => expect(api.ocultarRecado).toHaveBeenCalledWith("r1"));
  });
  it("sem recados, o mural não aparece", async () => {
    recados = [];
    const { container } = abrir(<MuralDosParabens employeeId="a" aniversarioHoje />);
    await waitFor(() => expect(api.lerMeusRecados).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
