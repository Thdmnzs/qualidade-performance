import { describe, expect, it } from "vitest";
import {
  adicionarAoDia,
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
