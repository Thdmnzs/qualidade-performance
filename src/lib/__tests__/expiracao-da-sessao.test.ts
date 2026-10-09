// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  apagarRegistros,
  lerRegistro,
  registrarAtividade,
  situacaoDaSessao,
} from "../expiracao-da-sessao";

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 9, 9, 11, 0); // 08h em Fortaleza

describe("situacaoDaSessao: 30 minutos sem uso, e no máximo 9 horas", () => {
  it("em uso, dentro dos prazos: ativa", () => {
    expect(situacaoDaSessao(T0 + 10 * MIN, { inicio: T0, atividade: T0 + 5 * MIN })).toEqual({
      estado: "ativa",
    });
  });
  it("29 minutos sem uso: o aviso de inatividade (1 minuto antes)", () => {
    expect(situacaoDaSessao(T0 + 29.5 * MIN, { inicio: T0, atividade: T0 })).toMatchObject({
      estado: "aviso",
      motivo: "inatividade",
    });
  });
  it("30 minutos sem uso: expirada por inatividade (o caso do navegador fechado)", () => {
    expect(situacaoDaSessao(T0 + 30 * MIN, { inicio: T0, atividade: T0 })).toEqual({
      estado: "expirada",
      motivo: "inatividade",
    });
  });
  it("mesmo em uso contínuo, 9 horas depois do login: expirada pelo limite", () => {
    expect(situacaoDaSessao(T0 + 9 * H, { inicio: T0, atividade: T0 + 9 * H - MIN })).toEqual({
      estado: "expirada",
      motivo: "limite",
    });
  });
  it("o aviso do limite, no último minuto das 9 horas", () => {
    expect(
      situacaoDaSessao(T0 + 9 * H - 30_000, { inicio: T0, atividade: T0 + 9 * H - 40_000 }),
    ).toMatchObject({ estado: "aviso", motivo: "limite" });
  });
  it("sem registro: ativa (o registro começa agora)", () =>
    expect(situacaoDaSessao(T0, null)).toEqual({ estado: "ativa" }));
});

describe("o registro no navegador", () => {
  beforeEach(() => window.localStorage.clear());
  it("o primeiro uso marca o início; os seguintes, só a atividade", () => {
    registrarAtividade("u1", T0);
    registrarAtividade("u1", T0 + 10 * MIN);
    expect(lerRegistro("u1")).toEqual({ inicio: T0, atividade: T0 + 10 * MIN });
  });
  it("cada usuário tem o seu registro, e sair apaga todos", () => {
    registrarAtividade("u1", T0);
    registrarAtividade("u2", T0 + MIN);
    expect(lerRegistro("u2")?.inicio).toBe(T0 + MIN);
    apagarRegistros();
    expect(lerRegistro("u1")).toBeNull();
    expect(lerRegistro("u2")).toBeNull();
  });
  it("um registro corrompido é ignorado (e não quebra a tela)", () => {
    window.localStorage.setItem("qh:sessao:u1", "{lixo");
    expect(lerRegistro("u1")).toBeNull();
  });
});
