import { describe, expect, it } from "vitest";

import { textoDoAviso, textoDoFim, type DadosDoAvisoDeTroca } from "../avisos-trocas";

const base: DadosDoAvisoDeTroca = {
  tipo: "folgas",
  modo: "um",
  situacao: "aguardando_supervisao",
  aplicada: false,
  de: "Thiago Dantas",
  para: "Amanda Lima",
  datas: ["2026-10-14", "2026-10-15"],
  folgas_de: ["2026-10-14"],
  folgas_para: ["2026-10-15"],
  horario_de: null,
  horario_para: null,
  decidida_por: null,
};
const URL = "https://qualidade-performance.vercel.app";

describe("o aviso (no formato combinado)", () => {
  it("a folga de um dia, exatamente como na prévia", () => {
    expect(textoDoAviso(base, URL)).toBe(
      [
        "🔁 *TROCA DE ESCALA PARA APROVAR*",
        "*Quem pediu*: Thiago Dantas",
        "*Com quem*: Amanda Lima",
        "*A troca*: As folgas: quarta, 14/10, e quinta, 15/10",
        "*Como fica*: Thiago folga na quinta; Amanda, na quarta",
        "<https://qualidade-performance.vercel.app/escala|Aprovar ou recusar no QualityHUB>",
      ].join("\n"),
    );
  });
  it("os dois dias de folga (com o sábado e o domingo)", () => {
    const t = textoDoAviso(
      {
        ...base,
        modo: "dois",
        datas: ["2026-10-21", "2026-10-22", "2026-10-24", "2026-10-25"],
        folgas_de: ["2026-10-21", "2026-10-25"],
        folgas_para: ["2026-10-22", "2026-10-24"],
      },
      URL,
    );
    expect(t).toContain(
      "*A troca*: As folgas (os dois dias): quarta, 21/10, quinta, 22/10, sábado, 24/10 e domingo, 25/10",
    );
    expect(t).toContain(
      "*Como fica*: Thiago folga na quinta e no sábado; Amanda, na quarta e no domingo",
    );
  });
  it("os horários (com e sem a escala publicada) e o feriado", () => {
    expect(
      textoDoAviso(
        {
          ...base,
          tipo: "horarios",
          modo: null,
          datas: ["2026-10-20"],
          horario_de: "6h às 15h",
          horario_para: "13h às 22h",
        },
        URL,
      ),
    ).toContain("*Como fica*: Thiago fica das 13h às 22h; Amanda, das 6h às 15h");
    expect(
      textoDoAviso({ ...base, tipo: "horarios", modo: null, datas: ["2026-10-27"] }, URL),
    ).toContain("*Como fica*: Thiago fica com o horário de Amanda, e Amanda com o de Thiago");
    const f = textoDoAviso({ ...base, tipo: "feriado", modo: null, datas: ["2026-11-02"] }, URL);
    expect(f).toContain("*A troca*: Sair da escala no feriado: segunda, 02/11");
    expect(f).toContain("*Como fica*: Amanda entra no lugar de Thiago");
  });
});

describe("o fim, na conversa", () => {
  it("aprovada (aplicada ou ao montar), recusada sem o motivo, e cancelada", () => {
    expect(
      textoDoFim({ ...base, situacao: "aprovada", aplicada: true, decidida_por: "Vitor Lima" }),
    ).toBe("🟢 *Aprovada* por Vitor Lima. A escala já mudou.");
    expect(textoDoFim({ ...base, situacao: "aprovada", decidida_por: "Vitor Lima" })).toContain(
      "quando a semana for montada",
    );
    expect(textoDoFim({ ...base, situacao: "recusada", decidida_por: "Carol Souza" })).toBe(
      "🔴 *Recusada* por Carol Souza.",
    );
    expect(textoDoFim({ ...base, situacao: "cancelada" })).toBe(
      "↩️ *Thiago cancelou o pedido*, antes da decisão da supervisão.",
    );
    expect(textoDoFim(base)).toBeNull();
  });
});
