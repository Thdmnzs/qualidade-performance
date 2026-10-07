import { describe, expect, it } from "vitest";
import { lerCodigoDoLink, montarLinkDeAcesso } from "../link-de-acesso";

const CODIGO = "pkce_3f9a2b7c1d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0e";

describe("montarLinkDeAcesso", () => {
  it("o código vai no fragmento (depois do #), que não sai do navegador", () => {
    const link = montarLinkDeAcesso("https://qh.vercel.app/definir-senha", CODIGO, "invite");
    expect(link).toBe(`https://qh.vercel.app/definir-senha#token_hash=${CODIGO}&type=invite`);
    expect(new URL(link).search).toBe("");
  });
});

describe("lerCodigoDoLink", () => {
  it("lê o código e o tipo (convite e nova senha)", () => {
    expect(lerCodigoDoLink(`#token_hash=${CODIGO}&type=invite`)).toEqual({
      codigo: CODIGO,
      tipo: "invite",
    });
    expect(lerCodigoDoLink(`token_hash=${CODIGO}&type=recovery`)).toEqual({
      codigo: CODIGO,
      tipo: "recovery",
    });
  });
  it("o link antigo (com a sessão no fragmento) não é confundido com o novo", () => {
    expect(lerCodigoDoLink("#access_token=abc&type=invite")).toBeNull();
  });
  it("tipo desconhecido ou código estranho: recusado", () => {
    expect(lerCodigoDoLink(`#token_hash=${CODIGO}&type=signup`)).toBeNull();
    expect(lerCodigoDoLink("#token_hash=<script>&type=invite")).toBeNull();
    expect(lerCodigoDoLink("")).toBeNull();
  });
});
