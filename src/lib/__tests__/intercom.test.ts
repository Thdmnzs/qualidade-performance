import { describe, expect, it } from "vitest";
import { cruzarAtendentes } from "../intercom";

const cadastros = [
  { id: "c1", nome: "Thiago Dantas", email: "thiago@fluke.com" },
  { id: "c2", nome: "Rachel Kivel", email: "  Rachel@Fluke.com " },
  { id: "c3", nome: "Sem Conta", email: "semconta@fluke.com" },
  { id: "c4", nome: "Sem E-mail", email: null },
];
const atendentes = [
  { id: 1, name: "Thiago", email: "THIAGO@fluke.com" },
  { id: 2, name: "Rachel", email: "rachel@fluke.com" },
  { id: 3, name: "Bot", email: "" },
  { id: 4, name: "Ex-funcionário", email: "ex@fluke.com" },
];

describe("cruzarAtendentes", () => {
  const r = cruzarAtendentes(atendentes, cadastros);

  it("liga pelo e-mail, sem diferença de maiúsculas e espaços", () => {
    expect(r.ligados.map((l) => l.cadastro.id)).toEqual(["c1", "c2"]);
  });
  it("atendente do Intercom sem cadastro aparece separado (atendentes sem e-mail são ignorados)", () => {
    expect(r.semCadastro.map((a) => a.id)).toEqual([4]);
  });
  it("cadastro sem conta no Intercom, inclusive sem e-mail", () => {
    expect(r.semIntercom.map((c) => c.id)).toEqual(["c3", "c4"]);
  });
  it("listas vazias não quebram", () => {
    expect(cruzarAtendentes([], [])).toEqual({ ligados: [], semCadastro: [], semIntercom: [] });
  });
});
