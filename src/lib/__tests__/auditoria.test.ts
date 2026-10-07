import { describe, expect, it } from "vitest";
import { categoriaDe, detalhesDoRegistro, fraseDoRegistro, type Registro } from "../auditoria";

const reg = (acao: string, extra: Partial<Registro> = {}): Registro => ({
  acao,
  quem: "Rachel Kivel",
  alvo: null,
  valor_anterior: null,
  valor_novo: null,
  ...extra,
});
const frase = (r: Registro) =>
  fraseDoRegistro(r)
    .map((p) => (p.negrito ? `*${p.texto}*` : p.texto))
    .join("");

describe("fraseDoRegistro", () => {
  it("avaliação: quem foi avaliado em negrito, tipo, assunto e nota", () => {
    const r = reg("registrar_avaliacao", {
      alvo: "Thiago Dantas",
      valor_novo: { tipo: "interacao", assunto: "Portabilidade", nota: 100 },
    });
    expect(frase(r)).toBe(
      "registrou uma avaliação de *Thiago Dantas* · Interação · Portabilidade · nota 100",
    );
  });
  it("quinzena, contestação, quiz e descarte", () => {
    expect(frase(reg("quinzena_publicar", { alvo: "1ª quinzena de outubro/2026" }))).toBe(
      "publicou a *1ª quinzena de outubro/2026* para contestação",
    );
    expect(
      frase(reg("aceitar_contestacao", { alvo: "Thiago Dantas", valor_novo: { nota: 100 } })),
    ).toBe("aceitou a contestação de *Thiago Dantas* · nova nota 100");
    expect(frase(reg("registrar_quiz", { alvo: "Ana", valor_novo: { entregue: false } }))).toBe(
      "registrou o quiz de *Ana*: não entregue",
    );
    expect(frase(reg("descartar_contato", { alvo: "Ana" }))).toBe(
      "descartou um contato sorteado de *Ana*",
    );
  });
  it("sem o nome no registro, usa o colaborador guardado no detalhe", () => {
    expect(
      frase(reg("sortear_contato", { valor_novo: { colaborador: "Ana", tipo: "ticket_n2" } })),
    ).toBe("sorteou um contato de *Ana* · Ticket de back-office");
  });
  it("ação desconhecida ganha uma frase genérica, sem quebrar", () => {
    expect(frase(reg("acao_nova", { alvo: "X" }))).toBe('registrou a ação "acao_nova" sobre *X*');
  });
  it("o texto de quem escreveu nunca vira código: sai como pedaço de texto", () => {
    const r = reg("criar_acesso", {
      valor_novo: { email: "<img src=x onerror=alert(1)>", perfil: "colaborador" },
    });
    const pedacos = fraseDoRegistro(r);
    expect(pedacos.some((p) => p.texto === "<img src=x onerror=alert(1)>")).toBe(true);
  });
});

describe("detalhesDoRegistro", () => {
  it("quinzena: situação e prazo, com o antes e o depois; e o motivo", () => {
    const r = reg("quinzena_reabrir", {
      valor_anterior: { status: "em_contestacao", prazo_contestacao_ate: "2026-10-08" },
      valor_novo: { status: "aberta", prazo_contestacao_ate: null, motivo: "Avaliação faltando" },
    });
    expect(detalhesDoRegistro(r)).toEqual([
      { rotulo: "Situação", antes: "em contestação", depois: "aberta" },
      { rotulo: "Motivo", antes: null, depois: "Avaliação faltando" },
    ]);
  });
  it("quiz: antes e depois; avaliação: data e processo", () => {
    expect(
      detalhesDoRegistro(
        reg("registrar_quiz", {
          valor_anterior: { entregue: true },
          valor_novo: { entregue: false },
        }),
      ),
    ).toEqual([{ rotulo: "Quiz", antes: "entregue", depois: "não entregue" }]);
    expect(
      detalhesDoRegistro(
        reg("registrar_avaliacao", {
          valor_novo: {
            data_contato: "2026-09-05",
            processo: "B2C-CNT-INT-02",
            processo_versao: 1,
          },
        }),
      ),
    ).toEqual([
      { rotulo: "Data do contato", antes: null, depois: "05/09/2026" },
      { rotulo: "Processo", antes: null, depois: "B2C-CNT-INT-02 (versão 1)" },
    ]);
  });
  it("exclusão de colaborador: só o que foi apagado de fato", () => {
    const r = reg("excluir_colaborador", {
      valor_novo: { registros_apagados: { avaliacoes: 3, contestacoes: 1, quiz: 0 } },
    });
    expect(detalhesDoRegistro(r)).toEqual([
      { rotulo: "Registros apagados", antes: null, depois: "avaliacoes: 3, contestacoes: 1" },
    ]);
  });
  it("sem nada a mostrar, lista vazia", () => {
    expect(detalhesDoRegistro(reg("gerar_link_senha"))).toEqual([]);
  });
});

describe("categoriaDe", () => {
  it("cada ação na sua categoria", () => {
    expect(categoriaDe("registrar_quiz")).toBe("Avaliações");
    expect(categoriaDe("quinzena_fechar")).toBe("Quinzenas");
    expect(categoriaDe("excluir_colaborador")).toBe("Acessos e cadastros");
    expect(categoriaDe("acao_nova")).toBe("Outras");
  });
});
