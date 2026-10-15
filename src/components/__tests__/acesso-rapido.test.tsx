// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GrupoDeAtalhos } from "@/lib/acesso-rapido";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...p }: { children: ReactNode; to: string }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}));
const LISTA: GrupoDeAtalhos[] = [
  {
    id: "g1",
    nome: "Atendimento",
    icone: "🎧",
    links: [
      { id: "a1", nome: "Intercom", url: "https://app.intercom.com" },
      { id: "a2", nome: "Dash B2C", url: "https://dash.b2c" },
    ],
  },
  {
    id: "g2",
    nome: "Material de apoio",
    icone: "📚",
    links: [
      { id: "a3", nome: "Portabilidade", url: "https://docs.google.com/p", sub: "Slides" },
      { id: "a4", nome: "Dicionário de tags", url: "https://www.notion.so/d" },
    ],
  },
  {
    id: "g3",
    nome: "Comunicação",
    icone: "✉️",
    links: [{ id: "a5", nome: "Gmail", url: "https://mail.google.com" }],
  },
  {
    id: "g4",
    nome: "Planilhas",
    icone: "📊",
    links: [{ id: "a6", nome: "PIN/PUK (eSIM)", url: "https://docs.google.com/s", restrito: true }],
  },
];
vi.mock("@/lib/acesso-rapido-api", () => ({ lerAcessoRapido: vi.fn(async () => LISTA) }));
const { AcessoRapido } = await import("../acesso-rapido");
const abrir = (perfil: string, pessoa: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AcessoRapido perfil={perfil} pessoa={pessoa} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const nav = () => screen.getByRole("navigation", { name: "O acesso rápido" });
const links = () =>
  within(nav())
    .queryAllByRole("link")
    .map((a) => a.textContent);

describe("o acesso rápido", () => {
  it("lido do banco: o Atendimento aberto, os outros e os slides recolhidos; os links numa aba nova", async () => {
    abrir("colaborador", "ana");
    expect(await within(nav()).findByRole("link", { name: "Intercom" })).toBeTruthy();
    expect(links()).not.toContain("Gmail");
    expect(
      (within(nav()).getByRole("link", { name: "Intercom" }) as HTMLAnchorElement).target,
    ).toBe("_blank");
    fireEvent.click(within(nav()).getByRole("button", { name: /Material de apoio/ }));
    expect(links()).toContain("Dicionário de tags");
    expect(links()).not.toContain("Portabilidade");
    fireEvent.click(within(nav()).getByRole("button", { name: /^Slides/ }));
    expect(links()).toContain("Portabilidade");
  });
  it("a estrela fixa em Meus atalhos, e fica guardada para a mesma pessoa", async () => {
    const { unmount } = abrir("colaborador", "ana");
    fireEvent.click(
      await within(nav()).findByRole("button", { name: "Fixar Dash B2C nos atalhos" }),
    );
    expect(within(nav()).getByText("Meus atalhos")).toBeTruthy();
    unmount();
    abrir("colaborador", "ana");
    expect(await within(nav()).findByText("Meus atalhos")).toBeTruthy();
  });
  it("o botão Editar só para o ADM; e o restrito, só para ele", async () => {
    abrir("colaborador", "ana");
    await within(nav()).findByRole("link", { name: "Intercom" });
    expect(screen.queryByRole("link", { name: "Editar o acesso rápido" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar um link" }), {
      target: { value: "pin/puk" },
    });
    expect(links()).toEqual([]);
    cleanup();
    abrir("adm", "adm");
    expect(
      (await screen.findByRole("link", { name: "Editar o acesso rápido" })).getAttribute("href"),
    ).toBe("/admin/acesso-rapido");
  });
});
