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

describe("as frases da escala", () => {
  const texto = (r: Partial<Registro>) =>
    fraseDoRegistro({
      acao: "",
      quem: "Admin",
      alvo: null,
      valor_anterior: null,
      valor_novo: null,
      ...r,
    } as Registro)
      .map((p) => p.texto)
      .join("");
  it("a publicação e a mudança depois de publicada", () => {
    expect(texto({ acao: "escala_publicar", valor_novo: { inicio: "2026-10-12" } })).toBe(
      "publicou a escala da semana de 12/10 a 18/10",
    );
    expect(texto({ acao: "escala_mudar_dia", valor_novo: { inicio: "2026-10-12", dia: 2 } })).toBe(
      "mudou a escala de quarta, 14/10, depois de publicada",
    );
  });
  it("as férias, os feriados e a atividade nova", () => {
    expect(
      texto({
        acao: "ferias_marcar",
        alvo: "Ruby Lima",
        valor_novo: { datas: ["2026-11-09", "2026-11-10", "2026-11-13"] },
      }),
    ).toBe("marcou as férias de Ruby Lima: 3 dias (de 09/11 a 13/11)");
    expect(
      texto({ acao: "ferias_tirar", alvo: "Ruby Lima", valor_novo: { datas: ["2026-11-13"] } }),
    ).toBe("tirou as férias de Ruby Lima: o dia 13/11");
    expect(texto({ acao: "feriado_marcar", valor_novo: { data: "2026-10-12" } })).toBe(
      "marcou o feriado de 12/10",
    );
    expect(
      texto({
        acao: "escala_criar_sigla",
        valor_novo: { sigla: "trein", significado: "Treinamento" },
      }),
    ).toBe("criou a atividade trein (Treinamento) na escala");
  });
  it("as férias, sem o nome vindo da lista: usa o nome guardado no registro", () => {
    expect(
      texto({
        acao: "ferias_marcar",
        alvo: null,
        valor_novo: { datas: ["2026-11-09"], colaborador: "Ruby Lima" },
      }),
    ).toBe("marcou as férias de Ruby Lima: o dia 09/11");
  });
  it("os pedidos de férias: o pedido, o cancelamento e as decisões", () => {
    expect(
      texto({ acao: "ferias_pedir", valor_novo: { de: "2026-11-09", ate: "2026-11-13" } }),
    ).toBe("pediu férias: 09/11 a 13/11");
    expect(
      texto({
        acao: "ferias_cancelar_pedido",
        valor_novo: { de: "2026-11-09", ate: "2026-11-09" },
      }),
    ).toBe("cancelou o pedido de férias: o dia 09/11");
    expect(
      texto({
        acao: "ferias_aprovar",
        alvo: null,
        valor_novo: { de: "2026-11-09", ate: "2026-11-13", colaborador: "Ana Colab" },
      }),
    ).toBe("aprovou as férias de Ana Colab: 09/11 a 13/11");
    expect(
      texto({
        acao: "ferias_recusar",
        alvo: null,
        valor_novo: {
          de: "2026-11-09",
          ate: "2026-11-13",
          colaborador: "Ana Colab",
          motivo: "Já há 2 pessoas.",
        },
      }),
    ).toBe("recusou as férias de Ana Colab: 09/11 a 13/11 · motivo: Já há 2 pessoas.");
    expect(categoriaDe("ferias_aprovar")).toBe("Escala");
  });
  it("a correção dos dados pessoais: só as partes, nunca os valores", () => {
    expect(
      texto({
        acao: "dados_pessoais_corrigir",
        alvo: null,
        valor_novo: { partes: ["o endereço", "o contato de emergência"], colaborador: "Ana Colab" },
      }),
    ).toBe("corrigiu o endereço e o contato de emergência de Ana Colab");
    expect(categoriaDe("dados_pessoais_corrigir")).toBe("Acessos e cadastros");
  });
  it("as trocas de escala", () => {
    expect(
      texto({
        acao: "escala_troca_aprovar",
        valor_novo: {
          de: "Thiago Dantas",
          para: "Amanda Lima",
          dias: [2, 3],
          inicio: "2026-10-12",
        },
      }),
    ).toBe(
      "aprovou a troca de escala de Thiago Dantas e Amanda Lima: quarta, 14/10 e quinta, 15/10",
    );
    expect(categoriaDe("escala_troca_recusar")).toBe("Escala");
  });
  it("tudo na categoria Escala", () => {
    for (const a of ["escala_publicar", "escala_mudar_dia", "ferias_marcar", "feriado_tirar"])
      expect(categoriaDe(a)).toBe("Escala");
  });
});
