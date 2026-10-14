// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const FICHA = {
  nome: "Ana Colab",
  aniversario_dia: 11,
  aniversario_mes: 10,
  aniversario_visivel: true,
  aniversario_tema: true,
  cep: "59150000",
  rua: "Rua das Dunas",
  numero: "120",
  complemento: null,
  bairro: "Centro",
  cidade: "Parnamirim",
  uf: "RN",
  contato_nome: "Maria",
  contato_parentesco: "Mãe",
  contato_telefone: "84999990000",
  atualizado_em: "2026-10-09T12:00:00Z",
  corrigido_pela_adm: false,
};
const api = {
  lerMeusDados: vi.fn(async () => FICHA),
  salvarMeusDados: vi.fn(async (..._a: unknown[]) => {}),
  lerDadosDe: vi.fn(async (..._a: unknown[]) => FICHA),
  corrigirDadosDe: vi.fn(async (..._a: unknown[]) => {}),
  lerSituacaoDosDados: vi.fn(async () => new Map()),
};
vi.mock("@/lib/dados-pessoais-api", () => api);
// O horário de trabalho (13/10/2026): ainda não preenchido.
const escalaApi = {
  lerHorariosDeTrabalho: vi.fn(async () => new Map()),
  definirHorarioDeTrabalho: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/escala-api", () => escalaApi);
const { EditarPerfil } = await import("../editar-perfil");
const { FichaDoAdm } = await import("../ficha-do-adm");
const abrir = (el: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {el}
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("o Editar perfil (a pessoa)", () => {
  it("mostra os dados com as máscaras, e salva o que mudou", async () => {
    abrir(<EditarPerfil aberto aoFechar={() => {}} />);
    expect(((await screen.findByPlaceholderText("00000-000")) as HTMLInputElement).value).toBe(
      "59150-000",
    );
    expect((screen.getByPlaceholderText("(84) 90000-0000") as HTMLInputElement).value).toBe(
      "(84) 99999-0000",
    );
    expect(screen.getByText("Mostrar o meu aniversário para o time")).toBeTruthy(); // as escolhas da pessoa
    fireEvent.change(screen.getByPlaceholderText("(84) 90000-0000"), {
      target: { value: "84977772222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.salvarMeusDados).toHaveBeenCalled());
    expect(
      (api.salvarMeusDados.mock.calls[0]![0] as { contato_telefone: string }).contato_telefone,
    ).toBe("(84) 97777-2222");
  });
  it("com um dado errado, avisa e não salva", async () => {
    abrir(<EditarPerfil aberto aoFechar={() => {}} />);
    await screen.findByPlaceholderText("00000-000");
    fireEvent.change(screen.getByLabelText("Dia do aniversário"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Mês do aniversário"), { target: { value: "2" } });
    expect(screen.getByText("Esse dia não existe nesse mês.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("a ficha do ADM", () => {
  it("mostra os dados, com o telefone para copiar e ligar", async () => {
    abrir(<FichaDoAdm pessoa={{ id: "a", nome: "Ana Colab" }} aoFechar={() => {}} />);
    expect(await screen.findByText("Rua das Dunas, 120")).toBeTruthy();
    expect(screen.getByText("(84) 99999-0000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "📞 Ligar" }).getAttribute("href")).toBe(
      "tel:+5584999990000",
    );
    expect(screen.getByText(/pela própria pessoa/)).toBeTruthy();
  });
  it("corrige, sem as escolhas da pessoa", async () => {
    abrir(<FichaDoAdm pessoa={{ id: "a", nome: "Ana Colab" }} aoFechar={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "✏️ Corrigir" }));
    expect(screen.queryByText("Mostrar o meu aniversário para o time")).toBeNull();
    expect(screen.getByText(/são escolhas da pessoa/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("00000-000"), { target: { value: "01310100" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar a correção" }));
    await waitFor(() => expect(api.corrigirDadosDe).toHaveBeenCalled());
    expect(api.corrigirDadosDe.mock.calls[0]![0]).toBe("a");
    expect((api.corrigirDadosDe.mock.calls[0]![1] as { cep: string }).cep).toBe("01310-100");
  });
});

describe("o horário de trabalho, na ficha do ADM", () => {
  it("preencher: confere a pausa e salva o horário", async () => {
    abrir(<FichaDoAdm pessoa={{ id: "a", nome: "Ana Colab" }} aoFechar={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Preencher o horário/ }));
    const [entrada, saida, pausa] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect([entrada!.value, saida!.value, pausa!.value]).toEqual(["8", "17", "12"]); // a sugestão inicial
    fireEvent.change(pausa!, { target: { value: "16" } }); // a pausa na última hora
    expect(screen.getByText(/A pausa precisa ficar dentro do horário/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Salvar o horário" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(pausa!, { target: { value: "13" } });
    expect(screen.getByText("9 horas na escala, com 1 hora de pausa.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar o horário" }));
    await waitFor(() =>
      expect(escalaApi.definirHorarioDeTrabalho).toHaveBeenCalledWith("a", {
        entrada: 8,
        saida: 17,
        pausa: 13,
        fimDeSemana: null,
      }),
    );
  });
});

describe("o horário do fim de semana, na ficha do ADM", () => {
  it("marcar o fim de semana: o sábado às 6h, e salvar os dois horários", async () => {
    abrir(<FichaDoAdm pessoa={{ id: "a", nome: "Ana Colab" }} aoFechar={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Preencher o horário/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Entrada (a semana)" }), {
      target: { value: "13" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Saída (a semana)" }), {
      target: { value: "22" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Pausa (a semana)" }), {
      target: { value: "17" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Horário diferente aos fins de semana" }));
    expect(screen.getByRole("button", { name: "Sábado" }).getAttribute("aria-pressed")).toBe(
      "true",
    ); // o sábado já vem marcado
    fireEvent.change(screen.getByRole("combobox", { name: "Entrada (o fim de semana)" }), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Saída (o fim de semana)" }), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Pausa (o fim de semana)" }), {
      target: { value: "14" },
    });
    expect(screen.getByText(/A pausa do fim de semana precisa ficar dentro/)).toBeTruthy(); // a pausa na última hora
    fireEvent.change(screen.getByRole("combobox", { name: "Pausa (o fim de semana)" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar o horário" }));
    await waitFor(() =>
      expect(escalaApi.definirHorarioDeTrabalho).toHaveBeenCalledWith("a", {
        entrada: 13,
        saida: 22,
        pausa: 17,
        fimDeSemana: { dias: [5], entrada: 6, saida: 15, pausa: 10 },
      }),
    );
  });
  it("o fim de semana sem nenhum dia escolhido é recusado", async () => {
    abrir(<FichaDoAdm pessoa={{ id: "a", nome: "Ana Colab" }} aoFechar={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Preencher o horário/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Horário diferente aos fins de semana" }));
    fireEvent.click(screen.getByRole("button", { name: "Sábado" })); // desmarca o sábado
    expect(screen.getByText("Escolha o sábado, o domingo ou os dois.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Salvar o horário" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
