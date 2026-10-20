// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A elegibilidade real do Thiago na quinzena de 01 a 15/10 (a prévia)
let ELEG: unknown = {
  oficial: false,
  elegivel: false,
  motivos: [
    "Sem avaliações de qualidade na quinzena",
    "Horas online abaixo do mínimo (14,8 h/semana)",
    "Quiz não entregue",
  ],
};
const NOTAS: Record<string, unknown> = {
  q1: { minha_nota: 96.4, minhas_avaliacoes: 4 },
  q0: { minha_nota: 92.1, minhas_avaliacoes: 3 },
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (n: string, a: { _fortnight_id: string }) =>
      n === "meu_resultado_da_quinzena"
        ? { data: ELEG, error: null }
        : { data: [NOTAS[a._fortnight_id]], error: null },
  },
}));
const { NotaDeQualidade } = await import("../nota-de-qualidade");
const Q = (id: string, status: string, mes: number, tipo: string) => ({
  id,
  status,
  ano: 2026,
  mes,
  tipo,
});
const abrir = (qs: ReturnType<typeof Q>[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaDeQualidade quinzenas={qs} employeeId="e1" />
    </QueryClientProvider>,
  );
afterEach(cleanup);

describe("a nota de qualidade, nas Minhas avaliações", () => {
  it("a nota da última quinzena publicada, o nível, as avaliações e a anterior; e o aviso da quinzena em andamento", async () => {
    abrir([
      Q("q2", "aberta", 10, "segunda"),
      Q("q1", "em_contestacao", 10, "primeira"),
      Q("q0", "fechada", 9, "segunda"),
    ]);
    expect(await screen.findByText("96,40")).toBeTruthy();
    expect(screen.getByText("1ª quinzena · Outubro/2026 · nível 4,5G · 4 avaliações")).toBeTruthy(); // o nível pela regra do CX Hub
    expect(await screen.findByText("92,10")).toBeTruthy(); // a anterior
    expect(screen.getByText(/A nota da quinzena em andamento/)).toBeTruthy();
    expect(document.querySelector(".cartao-ind.ok")).not.toBeNull(); // 96,40 ≥ 91
  });
  it("sem nenhuma quinzena publicada, o cartão não aparece", () => {
    const { container } = abrir([Q("q2", "aberta", 10, "segunda")]);
    expect(container.textContent).toBe("");
  });
});

describe("a elegibilidade, ao lado da nota (20/10/2026)", () => {
  it("a prévia (em contestação): não elegível, com os motivos", async () => {
    abrir([Q("q1", "em_contestacao", 10, "primeira")]);
    const e = await screen.findByLabelText("A elegibilidade");
    expect(e.textContent).toContain("⚠ Não elegível");
    expect(e.textContent).toContain("prévia · em contestação");
    expect(e.querySelectorAll("li")).toHaveLength(3);
    expect(e.textContent).toContain("Horas online abaixo do mínimo (14,8 h/semana)");
  });
  it("o oficial (fechada): elegível, sem motivos", async () => {
    ELEG = { oficial: true, elegivel: true, motivos: [] };
    abrir([Q("q1", "fechada", 10, "primeira")]);
    const e = await screen.findByLabelText("A elegibilidade");
    expect(e.textContent).toContain("✓ Elegível");
    expect(e.textContent).toContain("oficial");
    expect(e.querySelectorAll("li")).toHaveLength(0);
  });
});
