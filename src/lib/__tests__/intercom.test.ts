import { describe, expect, it } from "vitest";
import {
  assuntoSugerido,
  atendenteEscreveu,
  atributosDaConversa,
  cruzarAtendentes,
  dataDoContato,
  escolherAleatorio,
  extrairIdDaConversa,
  htmlParaTexto,
  linkDaConversa,
  linkSeguroDoIntercom,
  montarTranscricao,
} from "../intercom";

const cadastros = [
  { id: "c1", nome: "Thiago Dantas", email: "thiago@fluke.com" },
  { id: "c2", nome: "Rachel Kivel", email: "  Rachel@Fluke.com " },
  { id: "c3", nome: "Sem Conta", email: "semconta@fluke.com" },
  { id: "c4", nome: "Sem E-mail", email: null },
];
const atendentes = [
  { id: 1, name: "Thiago", email: "THIAGO@fluke.com" },
  { id: 2, name: "Rachel", email: "rachel@fluke.com" },
  { id: 3, name: "Bot", email: "" },
  { id: 4, name: "Ex-funcionário", email: "ex@fluke.com" },
];

describe("cruzarAtendentes", () => {
  const r = cruzarAtendentes(atendentes, cadastros);

  it("liga pelo e-mail, sem diferença de maiúsculas e espaços", () => {
    expect(r.ligados.map((l) => l.cadastro.id)).toEqual(["c1", "c2"]);
  });
  it("atendente do Intercom sem cadastro aparece separado (atendentes sem e-mail são ignorados)", () => {
    expect(r.semCadastro.map((a) => a.id)).toEqual([4]);
  });
  it("cadastro sem conta no Intercom, inclusive sem e-mail", () => {
    expect(r.semIntercom.map((c) => c.id)).toEqual(["c3", "c4"]);
  });
  it("listas vazias não quebram", () => {
    expect(cruzarAtendentes([], [])).toEqual({ ligados: [], semCadastro: [], semIntercom: [] });
  });
});

describe("extrairIdDaConversa e linkDaConversa", () => {
  it("aceita o número, o link da caixa de entrada e o link antigo", () => {
    expect(extrairIdDaConversa(" 215471234567890 ")).toBe("215471234567890");
    expect(
      extrairIdDaConversa(
        "https://app.intercom.com/a/inbox/abc123/inbox/conversation/215471234567890",
      ),
    ).toBe("215471234567890");
    expect(
      extrairIdDaConversa(
        "https://app.intercom.com/a/apps/abc123/conversations/215471234567890?x=1",
      ),
    ).toBe("215471234567890");
    expect(extrairIdDaConversa("qualquer coisa")).toBeNull();
  });
  it("monta sempre o mesmo link, qualquer que tenha sido o formato colado", () => {
    expect(linkDaConversa("abc123", "9")).toBe(
      "https://app.intercom.com/a/inbox/abc123/inbox/conversation/9",
    );
  });
});

describe("htmlParaTexto (proteção contra XSS)", () => {
  it("transforma código malicioso em texto inofensivo", () => {
    const t = htmlParaTexto('<p>oi</p><script>roubar()</script><img src=x onerror="roubar()">');
    expect(t).not.toMatch(/<|script|onerror/);
    expect(t).toBe("oi\n[imagem]");
  });
  it("mantém parágrafos, quebras e listas, e decodifica acentos", () => {
    expect(
      htmlParaTexto(
        "<p>Olá, tudo bem?</p><p>Seu chip &amp; pacote:</p><ul><li>5GB</li><li>SMS</li></ul>",
      ),
    ).toBe("Olá, tudo bem?\nSeu chip & pacote:\n- 5GB\n- SMS");
    expect(htmlParaTexto("linha 1<br>linha 2&nbsp;&#233;")).toBe("linha 1\nlinha 2 é");
  });
  it("vazio continua vazio", () => {
    expect(htmlParaTexto(null)).toBe("");
  });
});

const conversa = {
  id: "1",
  created_at: 1788620400, // 05/09/2026 12:00 em Fortaleza
  title: null,
  source: {
    author: { type: "user", id: "u1", name: "Cliente" },
    body: "<p>minha internet não funciona</p>",
    subject: "",
  },
  conversation_parts: {
    conversation_parts: [
      {
        part_type: "assignment",
        author: { type: "admin", id: 42, name: "Thiago" },
        body: null,
        created_at: 1788620460,
      },
      {
        part_type: "comment",
        author: { type: "bot", id: "b", name: "Fin" },
        body: "<p>Posso ajudar?</p>",
        created_at: 1788620470,
      },
      {
        part_type: "note",
        author: { type: "admin", id: 42, name: "Thiago" },
        body: "<p>cliente sem saldo</p>",
        created_at: 1788620500,
      },
      {
        part_type: "comment",
        author: { type: "admin", id: 42, name: "Thiago" },
        body: "<p>vou verificar</p>",
        created_at: 1788620520,
      },
    ],
  },
};

describe("montarTranscricao", () => {
  it("cliente, bot, nota interna e atendente, sem eventos do sistema", () => {
    expect(montarTranscricao(conversa).map((m) => `${m.autor}:${m.texto}`)).toEqual([
      "cliente:minha internet não funciona",
      "bot:Posso ajudar?",
      "nota:cliente sem saldo",
      "atendente:vou verificar",
    ]);
  });
});

describe("atendenteEscreveu", () => {
  it("só conta resposta escrita, não atribuição nem nota", () => {
    expect(atendenteEscreveu(conversa, 42)).toBe(true);
    const soAtribuida = {
      ...conversa,
      conversation_parts: {
        conversation_parts: conversa.conversation_parts.conversation_parts.slice(0, 3),
      },
    };
    expect(atendenteEscreveu(soAtribuida, 42)).toBe(false);
    expect(atendenteEscreveu(conversa, "99")).toBe(false);
  });
});

describe("escolherAleatorio", () => {
  it("exclui os já usados e escolhe pela posição sorteada", () => {
    const ids = ["a", "b", "c", "d"];
    expect(escolherAleatorio(ids, new Set(["b"]), () => 0)).toBe("a");
    expect(escolherAleatorio(ids, new Set(["b"]), () => 0.999)).toBe("d");
    expect(escolherAleatorio(ids, new Set(ids), () => 0.5)).toBeNull();
  });
  it("cada candidato tem a mesma chance (distribuição uniforme)", () => {
    const contagem = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++)
      contagem[escolherAleatorio(["a", "b", "c"], new Set(), () => i / 3000) as "a"]++;
    expect(contagem).toEqual({ a: 1000, b: 1000, c: 1000 });
  });
});

describe("dataDoContato e assuntoSugerido", () => {
  it("data no fuso de Fortaleza", () => {
    expect(dataDoContato(1788620400)).toBe("2026-09-05");
    expect(dataDoContato(1788663599)).toBe("2026-09-05"); // 23:59:59 em Fortaleza
    expect(dataDoContato(1788663600)).toBe("2026-09-06"); // 00:00 do dia seguinte
  });
  it("título, ou assunto do e-mail, ou nada", () => {
    expect(assuntoSugerido({ id: 1, title: "Portabilidade" })).toBe("Portabilidade");
    expect(assuntoSugerido({ id: 1, title: null, source: { subject: "<b>Fatura</b>" } })).toBe(
      "Fatura",
    );
    expect(assuntoSugerido({ id: 1 })).toBeNull();
  });
});

describe("linkSeguroDoIntercom (só o Intercom vira link clicável)", () => {
  it("aceita os endereços oficiais do Intercom", () => {
    expect(linkSeguroDoIntercom("https://app.intercom.com/a/inbox/abc/inbox/conversation/1")).toBe(
      "https://app.intercom.com/a/inbox/abc/inbox/conversation/1",
    );
    expect(linkSeguroDoIntercom("https://app.eu.intercom.com/a/inbox/x")).not.toBeNull();
  });
  it("recusa os disfarces mais comuns", () => {
    expect(linkSeguroDoIntercom("https://app.intercom.com.golpe.io/conversation/1")).toBeNull(); // subdomínio falso
    expect(linkSeguroDoIntercom("https://golpe.io/app.intercom.com/conversation/1")).toBeNull(); // Intercom no caminho
    expect(linkSeguroDoIntercom("https://app.intercom.com@golpe.io/x")).toBeNull(); // usuário falso antes do @
    expect(linkSeguroDoIntercom("http://app.intercom.com/x")).toBeNull(); // sem https
    expect(linkSeguroDoIntercom("javascript:alert(1)")).toBeNull(); // código no lugar do link
    expect(linkSeguroDoIntercom("https://intercom.com/x")).toBeNull(); // site institucional, não a caixa de entrada
  });
  it("vazio ou inválido", () => {
    expect(linkSeguroDoIntercom(null)).toBeNull();
    expect(linkSeguroDoIntercom("não é link")).toBeNull();
  });
});

describe("classificação do atendimento", () => {
  const classificada = {
    id: 1,
    custom_attributes: {
      Natureza: "Problema/Reclamação",
      Assunto: "Aquisição",
      Detalhe: "Aquisição: Número Virtual",
      Jornada: "B2B",
      Conclusão: "Resolvido",
      "Nota interna": "",
      Prioridade: 2,
      Urgente: false,
      Lista: ["x"],
    },
  };

  it("só os cinco campos, na ordem; os outros atributos ficam de fora (minimização)", () => {
    expect(atributosDaConversa(classificada)).toEqual([
      { nome: "Natureza", valor: "Problema/Reclamação" },
      { nome: "Assunto", valor: "Aquisição" },
      { nome: "Detalhe", valor: "Aquisição: Número Virtual" },
      { nome: "Jornada", valor: "B2B" },
      { nome: "Conclusão", valor: "Resolvido" },
    ]);
  });
  it("dados do cliente em outros atributos nunca saem (como o Resumo do Cliente, com CPF)", () => {
    const comResumo = {
      id: 1,
      custom_attributes: { Natureza: "Dúvida", "Resumo do Cliente": "CPF: 000.000.000-00" },
    };
    expect(JSON.stringify(atributosDaConversa(comResumo))).not.toContain("CPF");
  });
  it("campo principal vazio aparece como não preenchido (null)", () => {
    const r = atributosDaConversa({
      id: 1,
      custom_attributes: { Natureza: "Dúvida", Detalhe: "  " },
    });
    expect(r.map((a) => `${a.nome}=${a.valor}`)).toEqual([
      "Natureza=Dúvida",
      "Assunto=null",
      "Detalhe=null",
      "Jornada=null",
      "Conclusão=null",
    ]);
    expect(atributosDaConversa({ id: 1 }).every((a) => a.valor === null)).toBe(true);
  });
  it("sem título, o assunto do formulário vem do Detalhe", () => {
    expect(assuntoSugerido(classificada)).toBe("Aquisição: Número Virtual");
    expect(assuntoSugerido({ ...classificada, title: "Título" })).toBe("Título");
    expect(assuntoSugerido({ id: 1, custom_attributes: { Assunto: "Fatura" } })).toBe("Fatura");
  });
});
