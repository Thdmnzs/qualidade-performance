import type { HorarioDeTrabalho } from "../escala";
import { describe, expect, it } from "vitest";
import {
  adicionarAoDia,
  anosDasFerias,
  ultimoDiaDosPedidos,
  avisosDoPedido,
  avisoDaPessoa,
  blocosDoDia,
  celulasDaLinha,
  copiarDia,
  corDoTexto,
  datasDaSelecao,
  datasDoPeriodo,
  definirHora,
  horasDeTrabalho,
  moverNoDia,
  nomeCurto,
  onlinePorHora,
  periodoDaSemana,
  periodosDasDatas,
  segundaDaSemana,
  textoDoPeriodo,
  tirarDoDia,
  type LinhaDoDia,
  type Sigla,
} from "../escala";

const sig = (id: string, sigla: string, extra: Partial<Sigla> = {}): Sigla => ({
  id,
  sigla,
  cor: "#C9DAF8",
  significado: sigla,
  conta_como_trabalho: true,
  em_atendimento: false,
  faixa: false,
  ordem: 1,
  ...extra,
});
const SIGLAS = new Map(
  [
    sig("i", "i", { em_atendimento: true }),
    sig("p", "P", { conta_como_trabalho: false }),
    sig("m", "mensal"),
    sig("f", "folga", { conta_como_trabalho: false, faixa: true }),
  ].map((s) => [s.id, s]),
);
const H = (...xs: (string | null)[]) => [...xs, ...Array(16 - xs.length).fill(null)];
const L = (nome: string, horas: (string | null)[]): LinhaDoDia => ({
  employee_id: nome,
  nome,
  horas,
});

describe("as contas da escala", () => {
  const thiago = H("i", "i", "i", "i", "p", "i", "i", "i", "m");
  it("as horas de trabalho: sem a pausa e sem a folga (as reuniões contam)", () => {
    expect(horasDeTrabalho(thiago, SIGLAS)).toBe(8);
    expect(horasDeTrabalho(H("f", "f", "f"), SIGLAS)).toBe(0);
  });
  it("o Online: só quem está em atendimento, em cada hora", () => {
    const o = onlinePorHora(
      [
        L("Thiago", thiago),
        L("Ruby", H("f", "f", "f", "f", "f")),
        L("Fran", H(null, "i", "i", "i", "i")),
      ],
      SIGLAS,
    );
    expect(o.slice(0, 6)).toEqual([1, 2, 2, 2, 1, 1]); // às 10h, o Thiago está em pausa
  });
  it("os avisos: sem pausa, e mais de 8 horas", () => {
    expect(avisoDaPessoa(H("i", "i", "i", "i", "i", "i"), SIGLAS)).toBe("sem pausa");
    expect(avisoDaPessoa(thiago, SIGLAS)).toBeNull();
    expect(avisoDaPessoa(H("i", "i", "i", "i", "p", "i", "i", "i", "i", "i"), SIGLAS)).toBe(
      "mais de 8 h",
    );
  });
  it("a faixa da folga numa célula só", () => {
    const c = celulasDaLinha(H("f", "f", "f", "i"), SIGLAS);
    expect(c.slice(0, 2)).toEqual([
      { sigla: "f", colunas: 3, inicio: 0 },
      { sigla: "i", colunas: 1, inicio: 3 },
    ]);
  });
  it("o Meu dia em blocos", () => {
    expect(blocosDoDia(thiago).slice(0, 3)).toEqual([
      { sigla: "i", de: 6, ate: 10 },
      { sigla: "p", de: 10, ate: 11 },
      { sigla: "i", de: 11, ate: 14 },
    ]);
  });
});

describe("a montagem (o ADM)", () => {
  const dia = [L("Ruby", H("f")), L("Thiago", H("i")), L("Fran", H("i"))];
  it("preencher uma hora não muda o dia de antes (uma cópia nova)", () => {
    const novo = definirHora(dia, 1, 1, "p");
    expect(novo[1]!.horas[1]).toBe("p");
    expect(dia[1]!.horas[1]).toBeNull();
  });
  it("tirar do dia, e adicionar no FIM (a ordem livre)", () => {
    const sem = tirarDoDia(dia, 0);
    expect(sem.map((l) => l.nome)).toEqual(["Thiago", "Fran"]);
    expect(adicionarAoDia(sem, { employee_id: "Ruby", nome: "Ruby" }).map((l) => l.nome)).toEqual([
      "Thiago",
      "Fran",
      "Ruby",
    ]);
    expect(adicionarAoDia(dia, { employee_id: "Ruby", nome: "Ruby" })).toHaveLength(3); // sem duplicar
  });
  it("as setinhas: subir e descer (sem passar das pontas)", () => {
    expect(moverNoDia(dia, 2, -1).map((l) => l.nome)).toEqual(["Ruby", "Fran", "Thiago"]);
    expect(moverNoDia(dia, 0, -1).map((l) => l.nome)).toEqual(["Ruby", "Thiago", "Fran"]);
  });
  it("copiar a segunda para a terça e a quarta (os outros dias ficam como estão)", () => {
    const semana = [dia, [], [L("Kaio", H("i"))], [], [], [], []];
    const r = copiarDia(semana, 0, [1, 2]);
    expect(r[1]!.map((l) => l.nome)).toEqual(["Ruby", "Thiago", "Fran"]);
    expect(r[2]!.map((l) => l.nome)).toEqual(["Ruby", "Thiago", "Fran"]); // substituída
    expect(r[3]).toEqual([]);
    r[1]![0]!.horas[0] = "i";
    expect(semana[0]![0]!.horas[0]).toBe("f"); // a cópia é independente
  });
});

describe("as datas", () => {
  it("a segunda-feira de qualquer dia da semana", () => {
    expect(segundaDaSemana("2026-10-14")).toBe("2026-10-12");
    expect(segundaDaSemana("2026-10-18")).toBe("2026-10-12"); // o domingo é da semana que começou na segunda
    expect(segundaDaSemana("2026-10-12")).toBe("2026-10-12");
    expect(periodoDaSemana("2026-10-12")).toBe("12/10 a 18/10");
  });
  it("a seleção arrastando: só os dias que existem no mês", () => {
    expect(datasDaSelecao(2026, 10, 13, 9)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(datasDaSelecao(2026, 1, 27, 31)).toEqual(["2026-02-27", "2026-02-28"]);
  });
  it("um período atravessando os meses", () => {
    expect(datasDoPeriodo("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(datasDoPeriodo("2026-11-02", "2026-10-30")).toEqual([]);
  });
  it("os períodos de uma pessoa, em texto (um período não atravessa o mês)", () => {
    const p = periodosDasDatas([
      "2026-11-10",
      "2026-11-09",
      "2026-11-11",
      "2026-07-11",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(p.map(textoDoPeriodo)).toEqual([
      "11 de julho",
      "31 de outubro",
      "1 de novembro",
      "9 a 11 de novembro",
    ]);
  });
});

describe("os nomes e as cores", () => {
  it("o nome curto (e a inicial, com dois iguais)", () => {
    const todos = ["Thiago Dantas", "Thiago Teste Real", "Rachel Kivel"];
    expect(nomeCurto("Rachel Kivel", todos)).toBe("Rachel");
    expect(nomeCurto("Thiago Dantas", todos)).toBe("Thiago D.");
    expect(nomeCurto("Thiago Teste Real", todos)).toBe("Thiago R.");
  });
  it("a letra escura nas cores claras, e branca no azul do quali", () => {
    expect(corDoTexto("#C9DAF8")).toBe("#0D0F0D");
    expect(corDoTexto("#1C5BD9")).toBe("#FFFFFF");
  });
});

describe("os avisos do pedido de férias", () => {
  const dados = {
    feriados: new Set(["2026-11-02"]),
    porDia: new Map([
      ["2026-11-04", [{ employee_id: "a" }, { employee_id: "b" }]],
      ["2026-11-05", [{ employee_id: "a" }, { employee_id: "eu" }]],
    ]),
  };
  const ds = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  it("o feriado, e os dias com 2 pessoas (sem contar a própria)", () => {
    const a = avisosDoPedido(ds, dados, "eu", "2026-10-11");
    expect(a.feriados).toEqual(["2026-11-02"]);
    expect(a.cheios).toEqual(["2026-11-04"]); // no dia 5, a outra pessoa é só uma
    expect(a.jaDeFerias).toBe(false);
    expect(a.passado).toBe(false);
  });
  it("o passado (e o próprio dia de hoje)", () => {
    expect(avisosDoPedido(["2026-10-11"], dados, "eu", "2026-10-11").passado).toBe(true);
  });
  it("já de férias em todos os dias", () => {
    expect(avisosDoPedido(["2026-11-05"], dados, "eu", "2026-10-11").jaDeFerias).toBe(true);
  });
});

describe("os anos das férias", () => {
  it("em 2026, até 2028; em 2027, até 2029", () => {
    expect(anosDasFerias("2026-10-11")).toEqual([2026, 2027, 2028]);
    expect(anosDasFerias("2027-01-01")).toEqual([2027, 2028, 2029]);
  });
  it("o ADM vê também o ano anterior", () =>
    expect(anosDasFerias("2026-10-11", true)).toEqual([2025, 2026, 2027, 2028]));
  it("o último dia que pode ser pedido", () =>
    expect(ultimoDiaDosPedidos("2026-10-11")).toBe("2028-12-31"));
});

describe("as mudanças rápidas", () => {
  const dia = [
    L("Thiago", H("i", "i", "i", "i", "p", "i", "i", "i", "m")),
    L("Amanda", H(null, null, null, "i", "i")),
  ];
  it("várias horas de uma vez (na ordem que for)", async () => {
    const { definirHoras, intervaloDeHoras } = await import("../escala");
    expect(intervaloDeHoras(8, 5)).toEqual([5, 6, 7, 8]);
    const r = definirHoras(dia, 0, intervaloDeHoras(5, 8), "off");
    expect(r[0]!.horas.slice(4, 10)).toEqual(["p", "off", "off", "off", "off", null]);
    expect(dia[0]!.horas[5]).toBe("i"); // o dia de antes não mudou
  });
  it("ficar off a partir de uma hora (as vazias continuam vazias)", async () => {
    const { ficarOffAPartirDe } = await import("../escala");
    const r = ficarOffAPartirDe(dia, 0, 6, "off");
    expect(r[0]!.horas.slice(4, 10)).toEqual(["p", "i", "off", "off", "off", null]);
  });
  it("substituir: entra no lugar, com as mesmas horas; e não duplica quem já está", async () => {
    const { substituirNoDia } = await import("../escala");
    const r = substituirNoDia(dia, 1, { employee_id: "Kaio", nome: "Kaio" });
    expect(r.map((l) => l.nome)).toEqual(["Thiago", "Kaio"]);
    expect(r[1]!.horas).toEqual(dia[1]!.horas);
    expect(
      substituirNoDia(dia, 1, { employee_id: "Thiago", nome: "Thiago" }).map((l) => l.nome),
    ).toEqual(["Thiago", "Amanda"]);
  });
  it("limpar o dia da pessoa, e a jornada", async () => {
    const { limparDiaDaPessoa, jornada } = await import("../escala");
    expect(limparDiaDaPessoa(dia, 0)[0]!.horas.every((h) => h === null)).toBe(true);
    expect(jornada(dia[1]!.horas)).toEqual({ de: 3, ate: 4 });
    expect(jornada(H())).toBeNull();
  });
});

describe("quem entra na escala", () => {
  it("toda pessoa ativa, inclusive a supervisão (que só fica fora das trocas); os inativos, não", async () => {
    const { pessoasDaEscala } = await import("../escala");
    // Os cadastros vêm com o perfil: a supervisão (o ADM) entra mesmo assim.
    const cadastros = [
      { id: "1", nome: "Vitor de Almeida", status: "ativo", perfil: "adm" },
      { id: "2", nome: "Ana Lima", status: "ativo", perfil: "colaborador" },
      { id: "3", nome: "Carol Confort", status: "ativo", perfil: "adm" },
      { id: "4", nome: "Ivo Inativo", status: "inativo", perfil: "colaborador" },
    ];
    const r = pessoasDaEscala(cadastros);
    expect(r.map((p) => p.nome)).toEqual(["Ana Lima", "Carol Confort", "Vitor de Almeida"]);
  });
});

describe("atribuir as folgas e os horários", async () => {
  const { atribuirFolgasEHorarios, horasVazias, horasDoHorario, problemaDoHorario } =
    await import("../escala");
  const SIG = [
    { id: "i", sigla: "i", conta_como_trabalho: true, em_atendimento: true, ordem: 1 },
    { id: "P", sigla: "P", conta_como_trabalho: false, em_atendimento: false, ordem: 2 },
    { id: "cxtech", sigla: "cxtech", conta_como_trabalho: true, em_atendimento: false, ordem: 3 },
    { id: "folga", sigla: "folga", conta_como_trabalho: false, em_atendimento: false, ordem: 4 },
    { id: "ferias", sigla: "férias", conta_como_trabalho: false, em_atendimento: false, ordem: 5 },
  ] as never[];
  const vazia = () =>
    Array.from(
      { length: 7 },
      () => [] as { employee_id: string; nome: string; horas: (string | null)[] }[],
    );
  const pessoas = [
    { id: "r", nome: "Rachel" },
    { id: "k", nome: "Kaio" },
    { id: "t", nome: "Thiago" },
  ];
  const base = (dias = vazia()) => ({
    inicio: "2026-10-19",
    dias,
    pessoas,
    siglas: SIG,
    folgas: new Map([
      ["r", [2, 6]],
      ["k", [0, 6]],
      ["t", [2, 6]],
    ]),
    horarios: new Map([
      ["r", { entrada: 8, saida: 17, pausa: 12 }],
      ["t", { entrada: 6, saida: 15, pausa: 10 }],
    ]),
    emFerias: () => false,
    protegidos: new Set<string>(),
  });
  const linha = (
    r: { dias: { employee_id: string; horas: (string | null)[] }[][] },
    d: number,
    id: string,
  ) => r.dias[d]!.find((l) => l.employee_id === id)?.horas;
  it("o horário: o atendimento, com a pausa na hora dela", () => {
    const h = horasDoHorario({ entrada: 8, saida: 17, pausa: 12 }, "i", "P");
    expect(h.slice(0, 2)).toEqual([null, null]); // 6h e 7h
    expect(h.slice(2, 11)).toEqual(["i", "i", "i", "i", "P", "i", "i", "i", "i"]); // das 8h às 17h, a pausa às 12h
    expect(h.slice(11)).toEqual([null, null, null, null, null]);
  });
  it("as regras do horário (as mesmas do banco)", () => {
    expect(problemaDoHorario({ entrada: 8, saida: 17, pausa: 12 })).toBeNull();
    expect(problemaDoHorario({ entrada: 15, saida: 9, pausa: 12 })).toContain("depois da entrada");
    expect(problemaDoHorario({ entrada: 6, saida: 17, pausa: 10 })).toContain("até 10 horas");
    expect(problemaDoHorario({ entrada: 8, saida: 17, pausa: 16 })).toContain("A pausa");
    expect(problemaDoHorario({ entrada: 14, saida: 23, pausa: 18 })).toContain("das 6h às 22h");
  });
  it("numa semana vazia: as folgas nos dias de folga, e os horários nos outros", () => {
    const r = atribuirFolgasEHorarios(base());
    expect(linha(r, 2, "r")!.every((h) => h === "folga")).toBe(true);
    expect(linha(r, 0, "r")).toEqual(
      horasDoHorario({ entrada: 8, saida: 17, pausa: 12 }, "i", "P"),
    );
    expect(r.folgas).toBe(3); // as quartas da Rachel e do Thiago, e a segunda do Kaio (no domingo, quem folga fica fora)
    expect(r.dias[6]!.some((l) => ["r", "k", "t"].includes(l.employee_id))).toBe(false);
    expect(r.horarios).toBe(10); // a Rachel e o Thiago: 5 dias de trabalho cada
    expect(r.semHorario).toEqual([{ employee_id: "k", nome: "Kaio" }]); // o Kaio não tem horário
    expect(linha(r, 1, "k")).toBeUndefined(); // e os dias de trabalho dele ficam vazios
  });
  it("o que já foi montado fica; e o dia de folga com horário vira um conflito", () => {
    const dias = vazia();
    const montado = horasVazias().map((_, k) => (k < 2 ? "cxtech" : null));
    dias[0]!.push({ employee_id: "t", nome: "Thiago", horas: montado }); // a segunda do Thiago, à mão
    dias[2]!.push({
      employee_id: "r",
      nome: "Rachel",
      horas: horasDoHorario({ entrada: 8, saida: 17, pausa: 12 }, "i", "P"),
    });
    const r = atribuirFolgasEHorarios(base(dias));
    expect(linha(r, 0, "t")).toEqual(montado);
    expect(r.conflitos).toEqual([{ employee_id: "r", nome: "Rachel", dia: 2 }]);
  });
  it("as férias e a troca aplicada têm prioridade; a linha sem horas é preenchida", () => {
    const dias = vazia();
    dias[1]!.push({ employee_id: "t", nome: "Thiago", horas: horasVazias() });
    const r = atribuirFolgasEHorarios({
      ...base(dias),
      emFerias: (id, data) => id === "r" && data === "2026-10-20",
      protegidos: new Set(["t:2"]),
    });
    expect(linha(r, 1, "r")).toBeUndefined(); // a terça de férias da Rachel
    expect(linha(r, 2, "t")).toBeUndefined(); // a quarta da troca do Thiago
    expect(linha(r, 1, "t")).toEqual(
      horasDoHorario({ entrada: 6, saida: 15, pausa: 10 }, "i", "P"),
    );
  });
  it("de novo, na mesma semana: nada a fazer", () => {
    const uma = atribuirFolgasEHorarios(base());
    const duas = atribuirFolgasEHorarios(base(uma.dias));
    expect(duas.mudados).toEqual([]);
    expect(duas.folgas + duas.horarios).toBe(0);
  });
});

describe("nos fins de semana e nos feriados, quem folga fica fora da escala", async () => {
  const { atribuirFolgasEHorarios, horasVazias, diaSemFolgaNaEscala, linhaSoDeFolga } =
    await import("../escala");
  const SIG = [
    { id: "i", sigla: "i", conta_como_trabalho: true, em_atendimento: true, ordem: 1 },
    { id: "P", sigla: "P", conta_como_trabalho: false, em_atendimento: false, ordem: 2 },
    { id: "folga", sigla: "folga", conta_como_trabalho: false, em_atendimento: false, ordem: 3 },
    { id: "ferias", sigla: "férias", conta_como_trabalho: false, em_atendimento: false, ordem: 4 },
  ] as never[];
  const vazia = () =>
    Array.from(
      { length: 7 },
      () => [] as { employee_id: string; nome: string; horas: (string | null)[] }[],
    );
  const F = () => horasVazias().map(() => "folga");
  it("os dias: o sábado, o domingo e os feriados", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => diaSemFolgaNaEscala("2026-10-19", d))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(diaSemFolgaNaEscala("2026-10-19", 3, new Set(["2026-10-22"]))).toBe(true); // a quinta, feriado
    expect(linhaSoDeFolga(F(), "folga")).toBe(true);
    expect(
      linhaSoDeFolga(
        horasVazias().map(() => "ferias"),
        "folga",
      ),
    ).toBe(false); // as férias não são folga
  });
  it("o botão tira as linhas de folga do sábado, do domingo e do feriado (e deixa as férias)", () => {
    const dias = vazia();
    dias[5]!.push({ employee_id: "a", nome: "Ana", horas: F() });
    dias[6]!.push({ employee_id: "b", nome: "Beto", horas: horasVazias().map(() => "ferias") });
    dias[3]!.push({ employee_id: "a", nome: "Ana", horas: F() });
    dias[2]!.push({ employee_id: "a", nome: "Ana", horas: F() });
    const r = atribuirFolgasEHorarios({
      inicio: "2026-10-19",
      dias,
      pessoas: [],
      siglas: SIG,
      folgas: new Map(),
      horarios: new Map(),
      emFerias: () => false,
      protegidos: new Set(),
      feriados: new Set(["2026-10-22"]),
    });
    expect(r.dias[5]).toEqual([]); // o sábado
    expect(r.dias[3]).toEqual([]); // o feriado
    expect(r.dias[2]).toHaveLength(1); // a quarta (um dia de semana) fica
    expect(r.dias[6]).toHaveLength(1); // as férias de domingo ficam
    expect(r.retiradas).toBe(2);
    expect(r.mudados).toEqual([3, 5]);
  });
});

describe("a ordem pelos horários", async () => {
  const { atribuirFolgasEHorarios, horasDoHorario, horasVazias, ordenarPeloHorario } =
    await import("../escala");
  const SIG = [
    { id: "i", sigla: "i", conta_como_trabalho: true, em_atendimento: true, ordem: 1 },
    { id: "P", sigla: "P", conta_como_trabalho: false, em_atendimento: false, ordem: 2 },
    { id: "folga", sigla: "folga", conta_como_trabalho: false, em_atendimento: false, ordem: 3 },
    { id: "ferias", sigla: "férias", conta_como_trabalho: false, em_atendimento: false, ordem: 4 },
  ] as never[];
  const h = (entrada: number, saida: number, pausa: number) =>
    horasDoHorario({ entrada, saida, pausa }, "i", "P");
  it("primeiro quem entra mais cedo; na mesma entrada, quem sai primeiro; quem não trabalha, no fim", () => {
    const linhas = [
      { employee_id: "a", nome: "Amanda", horas: h(9, 18, 13) },
      { employee_id: "z", nome: "Zé", horas: horasVazias().map(() => "ferias") },
      { employee_id: "k", nome: "Kaio", horas: h(13, 22, 17) },
      { employee_id: "t", nome: "Thiago", horas: h(6, 15, 10) },
      { employee_id: "b", nome: "Bia", horas: h(6, 12, 9) },
      { employee_id: "r", nome: "Rachel", horas: h(9, 18, 13) },
    ];
    expect(ordenarPeloHorario(linhas, new Set(["i"]), "P").map((l) => l.nome)).toEqual([
      "Bia",
      "Thiago",
      "Amanda",
      "Rachel",
      "Kaio",
      "Zé",
    ]);
  });
  it("o botão deixa a semana nessa ordem (e não na alfabética)", () => {
    const r = atribuirFolgasEHorarios({
      inicio: "2026-10-19",
      dias: Array.from({ length: 7 }, () => []),
      pessoas: [
        { id: "a", nome: "Amanda" },
        { id: "k", nome: "Kaio" },
        { id: "t", nome: "Thiago" },
      ],
      folgas: new Map(),
      horarios: new Map([
        ["a", { entrada: 9, saida: 18, pausa: 13 }],
        ["k", { entrada: 13, saida: 22, pausa: 17 }],
        ["t", { entrada: 6, saida: 15, pausa: 10 }],
      ]),
      siglas: SIG,
      emFerias: () => false,
      protegidos: new Set(),
    });
    expect(r.dias[0]!.map((l) => l.nome)).toEqual(["Thiago", "Amanda", "Kaio"]);
  });
  it("uma semana já em ordem: nada a gravar", () => {
    const dias = Array.from(
      { length: 7 },
      () => [] as { employee_id: string; nome: string; horas: (string | null)[] }[],
    );
    dias[0] = [
      { employee_id: "t", nome: "Thiago", horas: h(6, 15, 10) },
      { employee_id: "a", nome: "Amanda", horas: h(9, 18, 13) },
    ];
    const r = atribuirFolgasEHorarios({
      inicio: "2026-10-19",
      dias,
      pessoas: [],
      folgas: new Map(),
      horarios: new Map(),
      siglas: SIG,
      emFerias: () => false,
      protegidos: new Set(),
    });
    expect(r.mudados).toEqual([]);
  });
});

describe("quem folga fica na posição do seu horário", async () => {
  const { atribuirFolgasEHorarios, horasDoHorario, horasVazias, ordenarPeloHorario } =
    await import("../escala");
  const SIG = [
    { id: "i", sigla: "i", conta_como_trabalho: true, em_atendimento: true, ordem: 1 },
    { id: "P", sigla: "P", conta_como_trabalho: false, em_atendimento: false, ordem: 2 },
    { id: "folga", sigla: "folga", conta_como_trabalho: false, em_atendimento: false, ordem: 3 },
    { id: "ferias", sigla: "férias", conta_como_trabalho: false, em_atendimento: false, ordem: 4 },
  ] as never[];
  const HOR = new Map([
    ["ru", { entrada: 6, saida: 15, pausa: 10 }],
    ["t", { entrada: 6, saida: 15, pausa: 10 }],
    ["a", { entrada: 9, saida: 18, pausa: 13 }],
    ["k", { entrada: 13, saida: 22, pausa: 17 }],
  ]);
  it("a Ruby (6h) e o Kaio (13h) de folga ficam na posição dos seus horários; sem horário, no fim", () => {
    const F = () => horasVazias().map(() => "folga");
    const linhas = [
      { employee_id: "k", nome: "Kaio", horas: F() },
      { employee_id: "x", nome: "Xica", horas: F() }, // sem horário cadastrado
      {
        employee_id: "a",
        nome: "Amanda",
        horas: horasDoHorario({ entrada: 9, saida: 18, pausa: 13 }, "i", "P"),
      },
      {
        employee_id: "t",
        nome: "Thiago",
        horas: horasDoHorario({ entrada: 6, saida: 15, pausa: 10 }, "i", "P"),
      },
      { employee_id: "ru", nome: "Ruby", horas: F() },
    ];
    expect(ordenarPeloHorario(linhas, new Set(["i"]), "P", HOR).map((l) => l.nome)).toEqual([
      "Ruby",
      "Thiago",
      "Amanda",
      "Kaio",
      "Xica",
    ]);
  });
  it("o botão: na segunda, a Ruby e o Kaio de folga, cada um na posição do seu horário", () => {
    const r = atribuirFolgasEHorarios({
      inicio: "2026-10-19",
      dias: Array.from({ length: 7 }, () => []),
      pessoas: [
        { id: "a", nome: "Amanda" },
        { id: "k", nome: "Kaio" },
        { id: "ru", nome: "Ruby" },
        { id: "t", nome: "Thiago" },
      ],
      folgas: new Map([
        ["ru", [0]],
        ["k", [0]],
      ]),
      horarios: HOR,
      siglas: SIG,
      emFerias: () => false,
      protegidos: new Set(),
    });
    const segunda = r.dias[0]!;
    expect(segunda.map((l) => l.nome)).toEqual(["Ruby", "Thiago", "Amanda", "Kaio"]);
    expect(segunda[0]!.horas.every((h) => h === "folga")).toBe(true); // a Ruby, às 6h, com a folga
    expect(segunda[3]!.horas.every((h) => h === "folga")).toBe(true); // o Kaio, às 13h, com a folga
  });
});

describe("o horário do fim de semana", async () => {
  const { atribuirFolgasEHorarios, horarioDoDia, horasDoHorario } = await import("../escala");
  const SIG = [
    { id: "i", sigla: "i", conta_como_trabalho: true, em_atendimento: true, ordem: 1 },
    { id: "P", sigla: "P", conta_como_trabalho: false, em_atendimento: false, ordem: 2 },
    { id: "folga", sigla: "folga", conta_como_trabalho: false, em_atendimento: false, ordem: 3 },
  ] as never[];
  // O Kaio entra às 13h na semana, e às 6h no sábado; a Amanda, às 9h todos os dias.
  const kaio = {
    entrada: 13,
    saida: 22,
    pausa: 17,
    fimDeSemana: { dias: [5], entrada: 6, saida: 15, pausa: 10 },
  };
  it("o horário de cada dia", () => {
    expect(horarioDoDia(kaio, 0)).toEqual({ entrada: 13, saida: 22, pausa: 17 }); // a segunda
    expect(horarioDoDia(kaio, 5)).toEqual({ entrada: 6, saida: 15, pausa: 10 }); // o sábado
    expect(horarioDoDia(kaio, 6)).toEqual({ entrada: 13, saida: 22, pausa: 17 }); // o domingo (não escolhido)
  });
  it("o botão usa o horário do dia, e a ordem do sábado segue o horário do sábado", () => {
    const r = atribuirFolgasEHorarios({
      inicio: "2026-10-19",
      dias: Array.from({ length: 7 }, () => []),
      pessoas: [
        { id: "a", nome: "Amanda" },
        { id: "k", nome: "Kaio" },
      ],
      folgas: new Map(),
      horarios: new Map<string, HorarioDeTrabalho>([
        ["a", { entrada: 9, saida: 18, pausa: 13 }],
        ["k", kaio],
      ]),
      siglas: SIG,
      emFerias: () => false,
      protegidos: new Set(),
    });
    expect(r.dias[0]!.map((l) => l.nome)).toEqual(["Amanda", "Kaio"]); // a segunda: 9h, depois 13h
    expect(r.dias[5]!.map((l) => l.nome)).toEqual(["Kaio", "Amanda"]); // o sábado: o Kaio às 6h, primeiro
    expect(r.dias[5]![0]!.horas).toEqual(
      horasDoHorario({ entrada: 6, saida: 15, pausa: 10 }, "i", "P"),
    );
    expect(r.dias[1]!.find((l) => l.employee_id === "k")!.horas).toEqual(
      horasDoHorario({ entrada: 13, saida: 22, pausa: 17 }, "i", "P"),
    );
  });
});
