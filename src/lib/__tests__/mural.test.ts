import { describe, expect, it } from "vitest";

import { lerComunicado, limpar, linhasDe } from "../mural";

describe("o mural do CX: o texto do Slack", () => {
  it("um alinhamento real: o tipo, o título, a criticidade, o tempo de leitura e o para quem", () => {
    const c = lerComunicado(
      "<!here> *[alinhamento] pedido de cancelamento nos primeiros 30 dias: reembolso só quando o cliente pede*\ncriticidade: média\ntempo de leitura: 1 min",
    );
    expect(c).toEqual({
      tipo: "alinhamento",
      titulo: "Pedido de cancelamento nos primeiros 30 dias: reembolso só quando o cliente pede",
      criticidade: "média",
      leitura: "1 min",
      para: "@aqui",
      corpo: "",
    });
  });
  it("um comunicado sem o padrão: a menção vira o para quem, e o texto é o corpo", () => {
    const c = lerComunicado(
      "<!subteam^S08C07AL3RT> o pix já está disponível novamente!\n\n:large_yellow_circle: *[chip-B2C] migração*",
    );
    expect(c.titulo).toBeNull();
    expect(c.para).toBe("@time");
    expect(c.corpo).toBe(
      "o pix já está disponível novamente!\n\n:large_yellow_circle: *[chip-B2C] migração*",
    );
  });
  it("as menções e os emojis (os desconhecidos somem)", () => {
    expect(limpar("<!here> oi <@U032Y777M0B|Vitor> e <@U1> :green_heart: :waveparrot:")).toBe(
      "@aqui oi @Vitor e @alguém 💚 ",
    );
    expect(limpar("<!subteam^S08C07AL3RT|@cx-time> atenção")).toBe("@cx-time atenção");
  });
  it("o negrito, o itálico, o riscado, o código e os links (só os seguros)", () => {
    const [l] = linhasDe(
      "*NÃO DELETEM* o pacote _congelado_ ~antigo~ `F5` <https://fluke.com|o site> <javascript:alert(1)|clique> &amp; &lt;ok&gt;",
    );
    expect(l!.partes).toEqual([
      { t: "negrito", v: "NÃO DELETEM" },
      { t: "texto", v: " o pacote " },
      { t: "italico", v: "congelado" },
      { t: "texto", v: " " },
      { t: "riscado", v: "antigo" },
      { t: "texto", v: " " },
      { t: "codigo", v: "F5" },
      { t: "texto", v: " " },
      { t: "link", v: "o site", url: "https://fluke.com" },
      { t: "texto", v: " " },
      { t: "texto", v: "clique" },
      { t: "texto", v: " & <ok>" },
    ]);
  });
  it("as listas", () => {
    const ls = linhasDe("como agir:\n• primeiro, tente reter\n- se não der, cancele");
    expect(ls.map((l) => l.lista)).toEqual([false, true, true]);
    expect(ls[1]!.partes).toEqual([{ t: "texto", v: "primeiro, tente reter" }]);
  });
});
