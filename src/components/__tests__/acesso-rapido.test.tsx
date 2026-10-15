// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AcessoRapido } from "../acesso-rapido";

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
  it("o Atendimento começa aberto; os outros grupos e os slides, recolhidos; os links numa aba nova", () => {
    render(<AcessoRapido perfil="colaborador" pessoa="ana" />);
    expect(links()).toContain("Intercom");
    expect(links()).not.toContain("Gmail"); // a Comunicação começa recolhida
    const intercom = within(nav()).getByRole("link", { name: "Intercom" }) as HTMLAnchorElement;
    expect(intercom.target).toBe("_blank");
    expect(intercom.rel).toContain("noopener");
    fireEvent.click(within(nav()).getByRole("button", { name: /Material de apoio/ }));
    expect(links()).toContain("Dicionário de tags");
    expect(links()).not.toContain("Portabilidade"); // os slides, recolhidos
    fireEvent.click(within(nav()).getByRole("button", { name: /^Slides/ }));
    expect(links()).toContain("Portabilidade");
  });
  it("a estrela fixa em Meus atalhos, e fica guardada para a mesma pessoa", () => {
    const { unmount } = render(<AcessoRapido perfil="colaborador" pessoa="ana" />);
    fireEvent.click(within(nav()).getByRole("button", { name: "Fixar Dash B2C nos atalhos" }));
    expect(within(nav()).getByText("Meus atalhos")).toBeTruthy();
    unmount();
    render(<AcessoRapido perfil="colaborador" pessoa="ana" />);
    expect(within(nav()).getByText("Meus atalhos")).toBeTruthy(); // continua depois de recarregar
    cleanup();
    render(<AcessoRapido perfil="colaborador" pessoa="vera" />);
    expect(within(nav()).queryByText("Meus atalhos")).toBeNull(); // os da Ana não são da Vera
  });
  it("a busca, e os restritos só para o ADM", () => {
    render(<AcessoRapido perfil="colaborador" pessoa="ana" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar um link" }), {
      target: { value: "pin/puk" },
    });
    expect(links()).toEqual([]);
    cleanup();
    render(<AcessoRapido perfil="adm" pessoa="adm" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar um link" }), {
      target: { value: "pin/puk" },
    });
    expect(links()).toHaveLength(2);
    expect(within(nav()).getAllByText("restrito")).toHaveLength(2);
  });
});
