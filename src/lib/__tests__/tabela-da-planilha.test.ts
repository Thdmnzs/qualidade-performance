import { describe, expect, it } from "vitest";

import {
  classificar,
  gruposDaTabela,
  linhasDosDados,
  tabelaDaAnalise,
} from "../tabela-da-planilha";

const DADOS = [
  "Data",
  "Membro",
  "Conversas atribuídas (total)",
  "Conversas atribuídas (membro da equipe)",
  "Horas ativas",
  "Conv. atribuídas por hora ativa - total",
  "Conv. atribuídas por hora ativa - membro da equipe",
  "Conv. atribuídas por hora ativa - ajustada",
  "CSAT avaliações positivas",
  "CSAT total de avaliações",
  "CSAT %",
  "[B2C] SLA primeira resposta chat (s)",
  "[B2C] SLA primeira resposta email (s)",
  "[B2C] SLA chat (s)",
  "[B2C] SLA email (s)",
  "[B2B] SLA primeira resposta chat (s)",
  "[B2B] SLA primeira resposta email (s)",
  "[B2B] SLA chat (s)",
  "[B2B] SLA email (s)",
];
describe("a tabela da supervisão", () => {
  it("os grupos e os nomes curtos, pelo nome da coluna", () => {
    expect(classificar("Conv. atribuídas por hora ativa - ajustada")).toEqual({
      grupo: "Por hora ativa",
      curto: "Ajustada",
    });
    expect(classificar("[B2C] SLA primeira resposta email (s)")).toEqual({
      grupo: "SLA do B2C (s)",
      curto: "1ª resp. e-mail",
    });
    expect(classificar("[B2B] SLA chat")).toEqual({ grupo: "SLA do B2B", curto: "Chat" }); // a Análise, sem o "(s)"
    expect(classificar("Avaliações CSAT")).toEqual({ grupo: "CSAT", curto: "Avaliações" });
    expect(classificar("Uma coluna nova")).toEqual({ grupo: "Outras", curto: "Uma coluna nova" });
  });
  it("a aba Dados: os grupos na ordem da planilha, e o SLA geral esperando a planilha", () => {
    const g = gruposDaTabela(DADOS);
    expect(g.map((x) => [x.nome, x.colunas.length])).toEqual([
      ["", 2],
      ["Conversas atribuídas", 2],
      ["Horas", 1],
      ["Por hora ativa", 3],
      ["CSAT", 3],
      ["SLA do B2C (s)", 4],
      ["SLA do B2B (s)", 4],
      ["SLA geral (percentil)", 2],
    ]);
    expect(g[g.length - 1]!.aguardando).toBe(true);
    expect(g.flatMap((x) => x.colunas).length).toBe(21);
  });
  it("quando a planilha tiver o SLA geral, ele entra no lugar dela (e não fica esperando)", () => {
    const g = gruposDaTabela([
      ...DADOS,
      "SLA geral chat (percentil)",
      "SLA geral email (percentil)",
    ]);
    expect(g[g.length - 1]).toMatchObject({ nome: "SLA geral (percentil)" });
    expect(g[g.length - 1]!.aguardando).toBeUndefined();
    expect(g[g.length - 1]!.colunas.map((c) => c.indice)).toEqual([19, 20]);
  });
  it("a aba Análise: as informações do período, a tabela, e o fim na linha vazia", () => {
    const a = tabelaDaAnalise([
      ["Métricas individuais do time de CX"],
      ["Período", "Mês atual"],
      ["Data inicial (usada em Personalizado)", "01/10/2026"],
      ["Início do período", "01/10/2026"],
      ["Fim do período", "15/10/2026"],
      ["SLA: estatística", "Média"],
      [],
      ["Membro", "CSAT %", "[B2B] SLA email"],
      ["Katia", "100,0%"], // a linha curta (o Google não envia as células vazias do fim)
      ["TIME", "97,3%", "36:07"],
      [],
      ["Outra coisa", "embaixo"],
    ]);
    expect(a.info).toEqual([
      ["Período", "Mês atual"],
      ["Início do período", "01/10/2026"],
      ["Fim do período", "15/10/2026"],
      ["SLA: estatística", "Média"],
    ]);
    expect(a.linhas).toEqual([
      ["Katia", "100,0%", ""],
      ["TIME", "97,3%", "36:07"],
    ]);
  });
  it("as linhas da Dados, do tamanho do cabeçalho", () => {
    expect(
      linhasDosDados([
        ["Data", "Membro", "X"],
        ["15/10/2026", "Thiago"],
      ]).linhas,
    ).toEqual([["15/10/2026", "Thiago", ""]]);
  });
});

describe("o SLA geral do Intercom, com o padrão [Geral] (20/10/2026)", () => {
  it("as duas colunas da planilha entram no grupo do SLA geral, e nada fica esperando", () => {
    expect(classificar("[Geral] SLA chat (s)")).toEqual({ grupo: "SLA geral (s)", curto: "Chat" });
    expect(classificar("[Geral] SLA email")).toEqual({ grupo: "SLA geral", curto: "E-mail" }); // a Análise, sem o "(s)"
    const g = gruposDaTabela([...DADOS, "[Geral] SLA chat (s)", "[Geral] SLA email (s)"]);
    expect(g.map((x) => x.nome)).toEqual([
      "",
      "Conversas atribuídas",
      "Horas",
      "Por hora ativa",
      "CSAT",
      "SLA do B2C (s)",
      "SLA do B2B (s)",
      "SLA geral (s)",
    ]);
    expect(g.some((x) => x.aguardando)).toBe(false);
    expect(g[g.length - 1]!.colunas.map((c) => c.indice)).toEqual([19, 20]);
  });
  it("na Análise, o [Geral] vem antes do B2C, e os grupos seguem a ordem da planilha", () => {
    const g = gruposDaTabela([
      "Membro",
      "CSAT %",
      "Avaliações CSAT",
      "[Geral] SLA chat",
      "[Geral] SLA email",
      "[B2C] SLA chat",
      "[B2C] SLA email",
    ]);
    expect(g.map((x) => x.nome)).toEqual(["", "CSAT", "SLA geral", "SLA do B2C"]);
  });
});
