// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Ficha } from "@/lib/dados-pessoais";

const rpc = vi.fn(async (_n: string, _a: unknown) => ({ data: null, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (n: string, a: unknown) => rpc(n, a) },
}));
const { CamposDaFicha } = await import("../campos-da-ficha");
const { problemaDaFicha } = await import("@/lib/dados-pessoais");
const { corrigirDadosDe, salvarMeusDados } = await import("@/lib/dados-pessoais-api");
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const FICHA: Ficha = {
  aniversario_dia: null,
  aniversario_mes: null,
  aniversario_visivel: true,
  aniversario_tema: true,
  cep: null,
  rua: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  contato_nome: "Ana Dantas",
  contato_parentesco: "Mãe",
  contato_telefone: "84999990000",
};
let atual: Ficha = FICHA;
function Tela() {
  const [f, setF] = useState<Ficha>(FICHA);
  atual = f;
  return <CamposDaFicha ficha={f} aoMudar={setF} daPessoa />;
}

describe("os contatos de emergência a mais (23/10/2026)", () => {
  it("o botão acrescenta um contato abaixo do principal; os campos e o Remover funcionam", () => {
    render(<Tela />);
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar novo contato" }));
    fireEvent.change(screen.getByLabelText("O nome do contato 2"), {
      target: { value: "José Dantas" },
    });
    fireEvent.change(screen.getByLabelText("O telefone do contato 2"), {
      target: { value: "8433334444" },
    });
    expect(atual.contatos_extras).toEqual([
      { nome: "José Dantas", parentesco: null, telefone: "(84) 3333-4444" },
    ]);
    expect(atual.contato_nome).toBe("Ana Dantas"); // o principal continua
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(atual.contatos_extras).toEqual([]);
  });
  it("no máximo 3 a mais: o botão some", () => {
    render(<Tela />);
    for (let i = 0; i < 3; i++)
      fireEvent.click(screen.getByRole("button", { name: "+ Adicionar novo contato" }));
    expect(screen.getByLabelText("O nome do contato 4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Adicionar novo contato" })).toBeNull();
  });
  it("as regras: o nome obrigatório e o telefone com o DDD; um contato em branco é ignorado", () => {
    expect(
      problemaDaFicha({
        ...FICHA,
        contatos_extras: [{ nome: "", parentesco: null, telefone: "84999990000" }],
      }),
    ).toContain("nome");
    expect(
      problemaDaFicha({
        ...FICHA,
        contatos_extras: [{ nome: "José", parentesco: null, telefone: "9999" }],
      }),
    ).toContain("DDD");
    expect(
      problemaDaFicha({
        ...FICHA,
        contatos_extras: [{ nome: "", parentesco: null, telefone: "" }],
      }),
    ).toBeNull();
  });
  it("o salvar manda os contatos, com o telefone só em números: os da pessoa, e os de outra pelo ADM", async () => {
    const extras = [{ nome: "José", parentesco: "Pai", telefone: "(84) 3333-4444" }];
    await salvarMeusDados({ ...FICHA, contatos_extras: extras });
    expect(rpc).toHaveBeenCalledWith("salvar_contatos_extras", {
      _employee_id: null,
      _contatos: [{ nome: "José", parentesco: "Pai", telefone: "8433334444" }],
    });
    await corrigirDadosDe("e1", { ...FICHA, contatos_extras: extras });
    expect(rpc).toHaveBeenLastCalledWith("salvar_contatos_extras", {
      _employee_id: "e1",
      _contatos: [{ nome: "José", parentesco: "Pai", telefone: "8433334444" }],
    });
  });
});
