import { describe, expect, it } from "vitest";
import { canalDaConversa } from "../canal";

describe("canalDaConversa: como os ícones do Intercom", () => {
  it("WhatsApp e e-mail, pelo tipo da origem", () => {
    expect(canalDaConversa({ type: "whatsapp" })).toEqual({ tipo: "whatsapp", rotulo: "WhatsApp" });
    expect(canalDaConversa({ type: "email" })).toEqual({ tipo: "email", rotulo: "E-mail" });
  });
  it("o chat com o endereço da página: site", () => {
    expect(canalDaConversa({ type: "conversation", url: "https://fluke.com.br/planos" })).toEqual({
      tipo: "site",
      rotulo: "Site",
    });
  });
  it("o chat sem página: o app (sem distinguir Android e iOS)", () => {
    expect(canalDaConversa({ type: "conversation", url: null })).toEqual({
      tipo: "app",
      rotulo: "App",
    });
    expect(canalDaConversa({ type: "conversation" })).toEqual({ tipo: "app", rotulo: "App" });
  });
  it("um canal não previsto aparece com o nome técnico", () => {
    expect(canalDaConversa({ type: "telegram" })).toEqual({ tipo: "outro", rotulo: "telegram" });
    expect(canalDaConversa({ type: "phone_call" })).toEqual({ tipo: "outro", rotulo: "Ligação" });
    expect(canalDaConversa(null)).toEqual({ tipo: "outro", rotulo: "canal não informado" });
  });
});
