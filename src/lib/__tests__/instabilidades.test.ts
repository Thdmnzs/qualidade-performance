import { describe, expect, it } from "vitest";

import { lerAviso, quadroDeInstabilidades } from "../instabilidades";

// Os avisos reais do #instabilidade (o Pagar.me Status), como o servidor os guarda
const URL_PIX = "https://status.pagar.me/incidents/8dp250w89vlc";
const aviso = (etapa: string, situacao: string, corpo: string) =>
  `*Incident: ${etapa}*\n*<${URL_PIX}|Instabilidade: Transacional - PIX>*\n${corpo}\n${situacao}\nhttps://dka575ofm4ao0.cloudfront.net/assets/slack_assets/x.png\nTransacional - Transacional - PIX\nBotão View all updates\n<https://www.atlassian.com/software/statuspage|Powered by Atlassian Statuspage>  |  <https://status.pagar.me/?unsubscribe=b|Unsubscribe>`;
const IDENTIFICADO = aviso(
  "Identified",
  "major_outage",
  "Identificamos às 00:54 uma instabilidade no componente Transacional - PIX.",
);
const MONITORANDO = aviso(
  "Monitoring",
  "degraded_performance",
  "Desde 01h00 estamos com nosso ambiente estável.",
);
const RESOLVIDO = aviso(
  "Resolved",
  "operational",
  "Entre 00:54 e 01:35 passamos por uma instabilidade no componente Transacional - PIX.",
);
const MANUTENCAO =
  "*Maintenance: Scheduled*\n*<https://status.pagar.me/incidents/7x9q|Manutenção Programada de Infraestrutura>*\nNo dia 22 de outubro ocorrerá uma manutenção no provedor de pix Stone.\n*Duration*\n22 Oct 2026 03:00 -03 to 22 Oct 2026 05:00 -03\noperational\nhttps://x.io/a.png\nTransacional - Transacional - PIX";
const msg = (ts: string, texto: string, criado_em: string, autor_nome = "Pagarme Status") => ({
  ts,
  autor_nome,
  texto,
  respostas: [],
  criado_em,
});

describe("as instabilidades: um aviso", () => {
  it("o incidente identificado: a etapa, a gravidade, o título, o endereço, o sistema e o corpo (sem o lixo)", () => {
    expect(lerAviso(IDENTIFICADO)).toEqual({
      tipo: "incidente",
      etapa: "Identificado",
      encerra: false,
      emAndamento: false,
      gravidade: "major",
      titulo: "Instabilidade: Transacional - PIX",
      url: URL_PIX,
      sistema: "Transacional - PIX",
      corpo: "Identificamos às 00:54 uma instabilidade no componente Transacional - PIX.",
      janela: null,
    });
  });
  it("a manutenção programada, com a janela", () => {
    const m = lerAviso(MANUTENCAO)!;
    expect(m).toMatchObject({ tipo: "manutencao", etapa: "Agendada", encerra: false });
    expect(m.janela).toEqual({ de: "2026-10-22T06:00:00.000Z", ate: "2026-10-22T08:00:00.000Z" });
  });
  it("uma mensagem de pessoa não é um aviso", () => {
    expect(lerAviso("o PIX caiu de novo?")).toBeNull();
  });
});

describe("as instabilidades: o quadro", () => {
  const AGORA = new Date("2026-10-20T20:00:00-03:00").getTime();
  const MENSAGENS = [
    msg("1", IDENTIFICADO, "2026-10-19T04:10:35Z"),
    msg("2", MONITORANDO, "2026-10-19T04:13:50Z"),
    msg("3", RESOLVIDO, "2026-10-19T04:38:43Z"),
    msg("4", MANUTENCAO, "2026-10-16T15:30:38Z"),
    msg("5", "o PIX caiu de novo?", "2026-10-19T04:12:00Z", "Kaio"),
  ];
  it("as três etapas viram um incidente resolvido, com a linha do tempo; nada ativo", () => {
    const q = quadroDeInstabilidades(MENSAGENS, AGORA);
    expect(q.ativos).toEqual([]);
    expect(q.resolvidos).toHaveLength(1);
    expect(q.resolvidos[0]).toMatchObject({
      titulo: "Instabilidade: Transacional - PIX",
      fonte: "Pagarme",
      sistema: "Transacional - PIX",
      etapaAtual: "Resolvido",
      gravidade: "degraded",
      fim: "2026-10-19T04:38:43Z",
    });
    expect(q.resolvidos[0]!.etapas.map((e) => e.etapa)).toEqual([
      "Identificado",
      "Monitorando",
      "Resolvido",
    ]);
  });
  it("a manutenção por vir, e a mensagem da pessoa", () => {
    const q = quadroDeInstabilidades(MENSAGENS, AGORA);
    expect(q.manutencoes.map((m) => m.titulo)).toEqual(["Manutenção Programada de Infraestrutura"]);
    expect(q.pessoas.map((m) => m.autor_nome)).toEqual(["Kaio"]);
  });
  it("um incidente ainda aberto fica ativo, com a gravidade da última etapa", () => {
    const q = quadroDeInstabilidades(MENSAGENS.slice(0, 2), AGORA);
    expect(q.ativos).toHaveLength(1);
    expect(q.ativos[0]).toMatchObject({
      etapaAtual: "Monitorando",
      gravidade: "degraded",
      fim: null,
    });
  });
  it("depois de 7 dias, o resolvido e a mensagem saem; e a manutenção que já passou também", () => {
    const depois = new Date("2026-10-27T12:00:00-03:00").getTime();
    const q = quadroDeInstabilidades(MENSAGENS, depois);
    expect(q.resolvidos).toEqual([]);
    expect(q.pessoas).toEqual([]);
    expect(q.manutencoes).toEqual([]);
  });
});

describe("o período real de um incidente (23/10/2026)", () => {
  it("o período que o próprio aviso informa", async () => {
    const { minutosEntre, periodoInformado } = await import("../instabilidades");
    expect(
      periodoInformado(
        "Entre 00:54 e 01:35 passamos por uma instabilidade no componente Transacional - PIX.",
      ),
    ).toEqual({ de: "00:54", ate: "01:35" });
    expect(periodoInformado("entre às 9h05 e às 10h40 o PIX ficou lento")).toEqual({
      de: "09:05",
      ate: "10:40",
    });
    expect(periodoInformado("Identificamos uma instabilidade.")).toBeNull();
    expect(periodoInformado("Entre 25:00 e 26:00")).toBeNull();
    expect(minutosEntre("00:54", "01:35")).toBe(41);
    expect(minutosEntre("23:50", "00:10")).toBe(20); // passando da meia-noite
  });
});
