import { describe, expect, it } from "vitest";
import { areaDoEndereco, destinoAposLogin, itensDoMenu, trocaDeArea } from "../areas";

describe("destinoAposLogin", () => {
  it("avaliador entra na área que escolheu (multiacesso)", () => {
    expect(destinoAposLogin("avaliador", "avaliador")).toEqual({
      para: "/admin/avaliacoes",
      aviso: null,
    });
    expect(destinoAposLogin("avaliador", "colaborador")).toEqual({ para: "/painel", aviso: null });
  });

  it("colaborador vai para a própria área e é avisado se escolheu a de avaliador", () => {
    expect(destinoAposLogin("colaborador", "colaborador")).toEqual({
      para: "/painel",
      aviso: null,
    });
    expect(destinoAposLogin("colaborador", "avaliador")).toEqual({
      para: "/painel",
      aviso: "Seu acesso não inclui a área de avaliador.",
    });
  });

  it("ADM sempre vai para a gestão", () => {
    expect(destinoAposLogin("adm", "avaliador").para).toBe("/admin");
    expect(destinoAposLogin("adm", "colaborador").aviso).toContain("apenas a área de gestão");
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
  it("avaliador na gestão vê só avaliações e contestações (nunca ranking)", () => {
    const itens = itensDoMenu("avaliador", "gestao");
    expect(itens).toEqual(["/admin/avaliacoes", "/admin/contestacoes"]);
    expect(itens).not.toContain("/ranking");
  });

  it("avaliador na área de colaborador vê o mesmo que um colaborador", () => {
    expect(itensDoMenu("avaliador", "colaborador")).toEqual(
      itensDoMenu("colaborador", "colaborador"),
    );
  });

  it("colaborador nunca vê itens de gestão, em nenhuma área", () => {
    for (const area of ["colaborador", "gestao"] as const) {
      expect(
        itensDoMenu("colaborador", area).some((r) => r.startsWith("/admin") || r === "/ranking"),
      ).toBe(false);
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
  it("tem Visão geral, Minhas avaliações e Minhas contestações, nesta ordem", () => {
    expect(itensDoMenu("colaborador", "colaborador")).toEqual([
      "/painel",
      "/minhas-avaliacoes",
      "/contestacoes",
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
