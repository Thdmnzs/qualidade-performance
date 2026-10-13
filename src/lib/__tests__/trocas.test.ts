import { describe, expect, it } from "vitest";

import type { LinhaDoDia, Sigla } from "../escala";
import { aplicarTroca, papeisDasSiglas, problemaDaTroca, redistribuir } from "../trocas";

const sig = (id: string, sigla: string, extra: Partial<Sigla> = {}): Sigla => ({
  id,
  sigla,
  cor: "#ccc",
  significado: sigla,
  conta_como_trabalho: true,
  em_atendimento: false,
  faixa: false,
  ordem: 5,
  ...extra,
});
const SIGLAS = new Map(
  [
    sig("i", "i", { em_atendimento: true, ordem: 1 }),
    sig("P", "P", { conta_como_trabalho: false, ordem: 2 }),
    sig("cxtech", "cxtech"),
    sig("quali", "quali"),
    sig("rede", "rede"),
    sig("mensal", "mensal"),
    sig("folga", "folga", { conta_como_trabalho: false, faixa: true }),
  ].map((s) => [s.id, s]),
);
const P = papeisDasSiglas(SIGLAS);
const H = (ini: number, ...xs: (string | null)[]) =>
  Array.from({ length: 16 }, (_, k) => xs[k + 6 - ini] ?? null);
const F = () => Array.from({ length: 16 }, () => "folga");
const naHora = (l: (string | null)[] | null | undefined, h: number) => l?.[h - 6] ?? null;
// os mesmos turnos da prévia aprovada
const thiago6 = H(6, "i", "i", "cxtech", "cxtech", "P", "i", "i", "i", "mensal");
const suelen13 = H(13, "i", "mensal", "quali", "quali", "P", "i", "i", "i", "i");
const amanda9 = H(9, "i", "rede", "rede", "i", "P", "mensal", "i", "i", "i");
const L = (id: string, horas: (string | null)[]): LinhaDoDia => ({
  employee_id: id,
  nome: id,
  horas,
});
const pessoa = (id: string) => ({ id, nome: id });

describe("redistribuir (a regra do como fica)", () => {
  it("o Thiago no horário das 13h: o CX Tech vai junto; a pausa e o mensal no lugar certo", () => {
    const { horas, avisos } = redistribuir(suelen13, thiago6, P);
    expect(naHora(horas, 6)).toBeNull();
    expect(horas!.filter((h) => h === "cxtech")).toHaveLength(2);
    expect(horas!.includes("quali")).toBe(false);
    expect(naHora(horas, 17)).toBe("P");
    expect(naHora(horas, 14)).toBe("mensal");
    expect(avisos).toEqual([]);
  });
  it("faltando horas: sai primeiro o atendimento; o N2 só com aviso", () => {
    const janela = [...Array(4).fill("i"), ...Array(12).fill(null)];
    const minhas = ["i", "cxtech", "cxtech", "cxtech", "cxtech", "cxtech", ...Array(10).fill(null)];
    const { horas, avisos } = redistribuir(janela, minhas, P);
    expect(horas!.slice(0, 4)).toEqual(["cxtech", "cxtech", "cxtech", "cxtech"]);
    expect(avisos[0]).toContain("Não cabem 1 hora(s)");
  });
  it("uma folga vai como está", () => expect(redistribuir(F(), thiago6, P).horas).toEqual(F()));
});

describe("aplicarTroca", () => {
  it("os horários da terça: cada um no horário do outro, com o próprio N2", () => {
    const dias = [[], [L("t", thiago6), L("s", suelen13)], [], [], [], [], []];
    const r = aplicarTroca(
      dias,
      { de: pessoa("t"), para: pessoa("s"), dias: [1], tipo: "horarios" },
      SIGLAS,
    );
    const t = r.dias[1]!.find((l) => l.employee_id === "t")!.horas;
    const s = r.dias[1]!.find((l) => l.employee_id === "s")!.horas;
    expect(naHora(t, 13)).toBe("i");
    expect(t.filter((h) => h === "cxtech")).toHaveLength(2);
    expect(s.filter((h) => h === "quali")).toHaveLength(2);
    expect(naHora(s, 10)).toBe("P");
    expect(r.dias[1]!.map((l) => l.employee_id)).toEqual(["t", "s"]); // cada um na sua posição
  });
  it("as folgas: cada um leva as atividades do dia que deixou de trabalhar", () => {
    const dias = [
      [],
      [],
      [L("t", F()), L("a", amanda9)],
      [L("t", thiago6), L("a", F())],
      [],
      [],
      [],
    ];
    const r = aplicarTroca(
      dias,
      { de: pessoa("t"), para: pessoa("a"), dias: [2, 3], tipo: "folgas" },
      SIGLAS,
    );
    expect(
      r.dias[2]!.find((l) => l.employee_id === "t")!.horas.filter((h) => h === "cxtech"),
    ).toHaveLength(2);
    expect(r.dias[2]!.find((l) => l.employee_id === "a")!.horas).toEqual(F());
    expect(
      r.dias[3]!.find((l) => l.employee_id === "a")!.horas.filter((h) => h === "rede"),
    ).toHaveLength(2);
    expect(r.dias[3]!.find((l) => l.employee_id === "t")!.horas).toEqual(F());
  });
  it("o feriado: quem sai sai; quem entra fica na posição dele, só com atendimento", () => {
    const ardson9 = H(9, "i", "cxtech", "i", "i", "P", "mensal", "i", "i", "i");
    const dias = [[L("x", suelen13), L("ar", ardson9), L("y", suelen13)], [], [], [], [], [], []];
    const r = aplicarTroca(
      dias,
      { de: pessoa("ar"), para: pessoa("k"), dias: [0], tipo: "feriado" },
      SIGLAS,
    );
    expect(r.dias[0]!.map((l) => l.employee_id)).toEqual(["x", "k", "y"]);
    const k = r.dias[0]!.find((l) => l.employee_id === "k")!.horas;
    expect(k.includes("cxtech")).toBe(false);
    expect(naHora(k, 13)).toBe("P");
    expect(k.filter((h) => h === "i")).toHaveLength(8);
  });
});

describe("problemaDaTroca (as mesmas regras do banco)", () => {
  const dias = [[L("ar", thiago6)], [L("t", thiago6), L("s", suelen13)], [], [], [], [], []];
  const hoje = "2026-10-12";
  it("os problemas", () => {
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: null, dias: [1], tipo: "horarios" },
        ["2026-10-13"],
        hoje,
      ),
    ).toBe("Escolha com quem trocar.");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "s", dias: [1], tipo: "horarios" },
        ["2026-10-11"],
        hoje,
      ),
    ).toBe("Escolha dias a partir de hoje.");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "s", dias: [2, 2], tipo: "folgas" },
        ["2026-10-14", "2026-10-14"],
        hoje,
      ),
    ).toBe("Escolha dois dias diferentes.");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "s", dias: [2], tipo: "horarios" },
        ["2026-10-14"],
        hoje,
      ),
    ).toBe("Nenhum dos dois está na escala nesse dia.");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "ar", dias: [0], tipo: "feriado" },
        ["2026-10-12"],
        hoje,
      ),
    ).toBe("Você não está na escala desse dia.");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "s", dias: [1], tipo: "feriado" },
        ["2026-10-13"],
        hoje,
      ),
    ).toContain("já está na escala desse dia");
    expect(
      problemaDaTroca(
        dias,
        { de: "t", para: "s", dias: [1], tipo: "horarios" },
        ["2026-10-13"],
        hoje,
      ),
    ).toBeNull();
  });
});
