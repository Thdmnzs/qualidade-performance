// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GrupoDeAtalhos } from "@/lib/acesso-rapido";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const LISTA: GrupoDeAtalhos[] = [
  {
    id: "g1",
    nome: "Atendimento",
    icone: "🎧",
    links: [
      { id: "a1", nome: "Intercom", url: "https://app.intercom.com" },
      { id: "a2", nome: "Wave", url: "https://wave" },
    ],
  },
  {
    id: "g2",
    nome: "Planilhas",
    icone: "📊",
    links: [{ id: "a3", nome: "PIN/PUK (eSIM)", url: "https://docs.google.com/s", restrito: true }],
  },
];
const api = {
  lerAcessoRapido: vi.fn(async () => LISTA),
  salvarGrupo: vi.fn(async (..._a: unknown[]) => "g9"),
  excluirGrupo: vi.fn(async (..._a: unknown[]) => {}),
  moverGrupo: vi.fn(async (..._a: unknown[]) => {}),
  salvarAtalho: vi.fn(async (..._a: unknown[]) => "a9"),
  excluirAtalho: vi.fn(async (..._a: unknown[]) => {}),
  moverAtalho: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/acesso-rapido-api", () => api);
const { EditorDoAcessoRapido, problemaDoEndereco } = await import("../acesso-rapido-editor");
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EditorDoAcessoRapido />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a edição do acesso rápido (o ADM)", () => {
  it("o endereço: só https, e sem espaços (a mesma regra do banco)", () => {
    expect(problemaDoEndereco("https://exemplo.com")).toBeNull();
    expect(problemaDoEndereco("http://exemplo.com")).toContain("https://");
    expect(problemaDoEndereco("javascript:alert(1)")).toContain("https://");
    expect(problemaDoEndereco("https://exemplo.com/a b")).toContain("espaços");
  });
  it("criar um grupo", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Novo grupo/ }));
    const janela = await screen.findByRole("dialog");
    fireEvent.change(within(janela).getByRole("textbox", { name: "Emoji" }), {
      target: { value: "🧪" },
    });
    fireEvent.change(within(janela).getByRole("textbox", { name: "Nome do grupo" }), {
      target: { value: "  Ferramentas novas " },
    });
    fireEvent.click(within(janela).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(api.salvarGrupo).toHaveBeenCalledWith(null, "Ferramentas novas", "🧪"),
    );
  });
  it("criar um link: recusa o endereço sem https; aceita o certo, com o subgrupo e o restrito", async () => {
    abrir();
    const grupo = await screen.findByRole("region", { name: "O grupo Atendimento" });
    fireEvent.click(within(grupo).getByRole("button", { name: /Novo link/ }));
    const janela = await screen.findByRole("dialog");
    fireEvent.change(within(janela).getByRole("textbox", { name: "Nome" }), {
      target: { value: "Exemplo" },
    });
    fireEvent.change(within(janela).getByRole("textbox", { name: "Endereço" }), {
      target: { value: "http://exemplo.com" },
    });
    expect(within(janela).getByText(/precisa começar com https/)).toBeTruthy();
    expect(
      (within(janela).getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(janela).getByRole("textbox", { name: "Endereço" }), {
      target: { value: "https://exemplo.com" },
    });
    fireEvent.change(within(janela).getByRole("combobox", { name: "Subgrupo (opcional)" }), {
      target: { value: "Slides" },
    });
    fireEvent.click(within(janela).getByRole("checkbox", { name: /Restrito/ }));
    fireEvent.click(within(janela).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(api.salvarAtalho).toHaveBeenCalledWith({
        id: null,
        grupoId: "g1",
        nome: "Exemplo",
        url: "https://exemplo.com",
        sub: "Slides",
        restrito: true,
      }),
    );
  });
  it("reordenar e excluir (com a confirmação)", async () => {
    abrir();
    const grupo = await screen.findByRole("region", { name: "O grupo Atendimento" });
    expect(
      (within(grupo).getByRole("button", { name: "Subir o link Intercom" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true); // já é o primeiro
    fireEvent.click(within(grupo).getByRole("button", { name: "Descer o link Intercom" }));
    await waitFor(() => expect(api.moverAtalho).toHaveBeenCalledWith("a1", 1));
    fireEvent.click(within(grupo).getByRole("button", { name: "Excluir o grupo Atendimento" }));
    const confirmar = await screen.findByRole("alertdialog");
    expect(confirmar.textContent).toContain("Os 2 links dele também saem");
    fireEvent.click(within(confirmar).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(api.excluirGrupo).toHaveBeenCalledWith("g1"));
  });
});
