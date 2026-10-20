import { describe, expect, it } from "vitest";
import {
  areaDoEndereco,
  destinoAposLogin,
  inicioDoPerfil,
  itensDoMenu,
  trocaDeArea,
} from "../areas";

describe("destinoAposLogin: a aba errada bloqueia o login (desde 08/10/2026)", () => {
  it("avaliador entra na área que escolheu (multiacesso)", () => {
    expect(destinoAposLogin("avaliador", "avaliador")).toEqual({
      para: "/admin/avaliacoes",
      bloqueio: null,
    });
    expect(destinoAposLogin("avaliador", "colaborador")).toEqual({
      para: "/painel",
      bloqueio: null,
    });
  });
  it("colaborador entra pela aba Colaborador; pela de Avaliador, é bloqueado e orientado", () => {
    expect(destinoAposLogin("colaborador", "colaborador")).toEqual({
      para: "/painel",
      bloqueio: null,
    });
    expect(destinoAposLogin("colaborador", "avaliador")).toEqual({
      para: null,
      bloqueio: "Este acesso é de colaborador. Escolha a aba Colaborador para entrar.",
    });
  });
  it("ADM entra pela aba Avaliador (a gestão); pela de Colaborador, é bloqueado", () => {
    expect(destinoAposLogin("adm", "avaliador")).toEqual({ para: "/admin", bloqueio: null });
    expect(destinoAposLogin("adm", "colaborador")).toEqual({
      para: null,
      bloqueio: "O perfil ADM entra pela aba Avaliador.",
    });
  });
  it("quem já está logado vai para o início do perfil", () => {
    expect(inicioDoPerfil("adm")).toBe("/admin");
    expect(inicioDoPerfil("avaliador")).toBe("/painel");
    expect(inicioDoPerfil("colaborador")).toBe("/painel");
  });
});

describe("areaDoEndereco: o Ranking existe nas duas áreas", () => {
  it("o avaliador que abre o Ranking pela área de colaborador continua nela", () => {
    expect(areaDoEndereco("/ranking", "colaborador")).toBe("colaborador");
  });
  it("vindo da gestão, continua na gestão", () => {
    expect(areaDoEndereco("/ranking", "gestao")).toBe("gestao");
  });
  it("aberto direto (sem área anterior): a gestão, como antes", () => {
    expect(areaDoEndereco("/ranking")).toBe("gestao");
  });
  it("as outras páginas decidem pelo endereço, venha de onde vier", () => {
    expect(areaDoEndereco("/admin/avaliacoes", "colaborador")).toBe("gestao");
    expect(areaDoEndereco("/painel", "gestao")).toBe("colaborador");
    expect(areaDoEndereco("/rankingx", "colaborador")).toBe("colaborador");
  });
});

describe("areaDoEndereco", () => {
  it.each([
    ["/painel", "colaborador"],
    ["/contestacoes", "colaborador"],
    ["/admin", "gestao"],
    ["/admin/avaliacoes", "gestao"],
    ["/admin/contestacoes", "gestao"],
    ["/ranking", "gestao"],
  ])("%s é da área %s", (caminho, area) => {
    expect(areaDoEndereco(caminho)).toBe(area);
  });
});

describe("itensDoMenu", () => {
  it("ADM vê o Painel logo depois da Visão geral (desde 07/10/2026)", () => {
    expect(itensDoMenu("adm", "gestao").slice(0, 3)).toEqual([
      "/admin",
      "/admin/painel",
      "/admin/avaliacoes",
    ]);
  });

  it("o Painel é só do ADM: nem o avaliador nem o colaborador o veem", () => {
    expect(itensDoMenu("avaliador", "gestao")).not.toContain("/admin/painel");
    expect(itensDoMenu("colaborador", "colaborador")).not.toContain("/admin/painel");
  });

  it("avaliador na gestão vê avaliações, contestações, o treino da IA, a escala e o ranking", () => {
    expect(itensDoMenu("avaliador", "gestao")).toEqual([
      "/admin/avaliacoes",
      "/admin/contestacoes",
      "/admin/treinar-a-ia", // 20/10/2026: os avaliadores também treinam a IA
      "/escala",
      "/ranking",
    ]);
  });

  it("a Escala está nas duas áreas, e mantém a área de quem a abre (como o Ranking)", () => {
    expect(itensDoMenu("adm", "gestao")).toContain("/escala");
    expect(areaDoEndereco("/escala", "colaborador")).toBe("colaborador");
    expect(areaDoEndereco("/escala", "gestao")).toBe("gestao");
  });

  it("avaliador na área de colaborador vê o mesmo que um colaborador", () => {
    expect(itensDoMenu("avaliador", "colaborador")).toEqual(
      itensDoMenu("colaborador", "colaborador"),
    );
  });

  it("colaborador nunca vê itens de gestão, em nenhuma área", () => {
    for (const area of ["colaborador", "gestao"] as const) {
      expect(itensDoMenu("colaborador", area).some((r) => r.startsWith("/admin"))).toBe(false);
    }
  });

  it("ADM vê a gestão completa e não tem área de colaborador", () => {
    expect(itensDoMenu("adm", "gestao")).toContain("/ranking");
    expect(itensDoMenu("adm", "gestao")).not.toContain("/painel");
  });
});

describe("trocaDeArea", () => {
  it("só o avaliador troca de área", () => {
    expect(trocaDeArea("avaliador", "gestao")?.para).toBe("/painel");
    expect(trocaDeArea("avaliador", "colaborador")?.para).toBe("/admin/avaliacoes");
    expect(trocaDeArea("colaborador", "colaborador")).toBeNull();
    expect(trocaDeArea("adm", "gestao")).toBeNull();
  });
});

describe("área do colaborador", () => {
  it("tem Visão geral, Minhas avaliações, Minhas contestações, Indicadores, Escala, Ranking (só o pódio) e Meu perfil, nesta ordem", () => {
    expect(itensDoMenu("colaborador", "colaborador")).toEqual([
      "/painel",
      "/minhas-avaliacoes",
      "/contestacoes",
      "/indicadores",
      "/escala",
      "/ranking",
      "/perfil",
    ]);
  });
  it("Minhas avaliações é da área do colaborador, e não da gestão", () => {
    expect(areaDoEndereco("/minhas-avaliacoes")).toBe("colaborador");
  });
});

describe("aba Indicadores", () => {
  it("aparece só para o ADM, entre Contestações e Ranking", () => {
    const itens = itensDoMenu("adm", "gestao");
    expect(itens.indexOf("/admin/indicadores")).toBe(itens.indexOf("/admin/contestacoes") + 1);
    expect(itensDoMenu("avaliador", "gestao")).not.toContain("/admin/indicadores");
    expect(itensDoMenu("colaborador", "colaborador")).not.toContain("/admin/indicadores");
  });
});

describe("aba Processos", () => {
  it("só o ADM vê, logo depois de Indicadores", () => {
    const itens = itensDoMenu("adm", "gestao");
    expect(itens.indexOf("/admin/processos")).toBe(itens.indexOf("/admin/indicadores") + 1);
    expect(itensDoMenu("avaliador", "gestao")).not.toContain("/admin/processos");
  });
});

describe("Meu perfil", () => {
  it("fica na área do colaborador (inclusive para o avaliador), por último", () => {
    expect(itensDoMenu("colaborador", "colaborador").at(-1)).toBe("/perfil");
    expect(itensDoMenu("avaliador", "colaborador")).toContain("/perfil");
    expect(itensDoMenu("adm", "gestao")).not.toContain("/perfil");
  });
});

describe("aba Histórico", () => {
  it("só o ADM vê, logo depois de Processos e do Treinar a IA", () => {
    const itens = itensDoMenu("adm", "gestao");
    expect(itens.indexOf("/admin/treinar-a-ia")).toBe(itens.indexOf("/admin/processos") + 1);
    expect(itens.indexOf("/admin/historico")).toBe(itens.indexOf("/admin/treinar-a-ia") + 1);
    expect(itensDoMenu("avaliador", "gestao")).not.toContain("/admin/historico");
  });
});
