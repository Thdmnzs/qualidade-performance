// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({ options: opcoes }),
}));
vi.mock("@/components/parabens/aniversariantes-de-hoje", () => ({
  AniversariantesDeHoje: () => null,
}));
vi.mock("@/hooks/useAuth", () => ({
  useCurrentEmployee: () => ({ data: { id: "e1", nome: "Thiago Dantas" }, isLoading: false }),
  usePermissoes: () => ({ temAreaDeColaborador: true, isLoading: false }),
}));
let QUINZENAS: unknown[] = [];
vi.mock("@/lib/queries", async (original) => ({
  ...(await original<object>()),
  fetchQuinzenas: async () => QUINZENAS,
  fetchMetas: async () => ({
    produtividade: { meta: 6, unidade: "tickets/h", sentido: "minimo", escopo: "individual" },
    sla_chat: { meta: 5, unidade: "min", sentido: "maximo", escopo: "individual" },
    sla_email: { meta: 15, unidade: "min", sentido: "maximo", escopo: "individual" },
    csat: { meta: 97, unidade: "%", sentido: "minimo", escopo: "time" },
    horas_online: { meta: 20, unidade: "h", sentido: "minimo", escopo: "individual" },
  }),
}));
const RESULTADOS: Record<string, unknown> = {
  q2: {
    oficial: false,
    elegivel: false,
    motivos: ["Horas online abaixo do mínimo (18,2 h/semana)"],
    produtividade: 6.75,
    sla_chat: 4.5,
    sla_email: 12,
    horas_semanais: 18.2,
    quiz: true,
    csat_time: 95.3,
  },
  q1: {
    oficial: true,
    elegivel: true,
    motivos: [],
    produtividade: 7.9,
    sla_chat: 3.2,
    sla_email: 9,
    horas_semanais: 21,
    quiz: true,
    csat_time: 97.8,
  },
};
const rpc = vi.fn(async (nome: string, a: { _fortnight_id: string }) => {
  if (nome === "meu_resultado_da_quinzena")
    return { data: RESULTADOS[a._fortnight_id] ?? null, error: null };
  if (nome === "qualidade_da_quinzena")
    return {
      data: [{ minha_nota: 95, media_time: 94, minhas_avaliacoes: 4, pessoas_avaliadas: 12 }],
      error: null,
    };
  return { data: null, error: null };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (n: string, a: { _fortnight_id: string }) => rpc(n, a) },
}));
const { Route } = await import("../_authenticated/painel");
const Tela = (Route as unknown as { options: { component: ComponentType } }).options.component;
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tela />
    </QueryClientProvider>,
  );
const quinzena = (
  id: string,
  status: string,
  mes: number,
  tipo: string,
  de: string,
  ate: string,
) => ({
  id,
  status,
  ano: 2026,
  mes,
  tipo,
  data_inicio: de,
  data_fim: ate,
  prazo_contestacao_ate: null,
});
afterEach(cleanup);

describe("a Visão geral: o resultado na publicação", () => {
  it("em contestação: a prévia (os números, a elegibilidade e a marca)", async () => {
    QUINZENAS = [
      quinzena("q2", "em_contestacao", 10, "primeira", "2026-10-01", "2026-10-15"),
      quinzena("q1", "fechada", 9, "segunda", "2026-09-16", "2026-09-30"),
    ];
    abrir();
    expect((await screen.findByText(/Prévia:/)).textContent).toBe("Prévia: Não elegível");
    expect(screen.getByText("• Horas online abaixo do mínimo (18,2 h/semana)")).toBeTruthy();
    expect(screen.getByText(/uma contestação aceita pode mudar a sua nota/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByText("prévia: o oficial sai no fechamento").length).toBe(5),
    ); // os 5 indicadores (a qualidade não)
    expect(document.querySelectorAll(".cartao-ind .valor:not(.aguardando)").length).toBe(6); // nada "aguardando o resultado"
  });
  it("fechada: o oficial, sem a marca de prévia", async () => {
    QUINZENAS = [quinzena("q1", "fechada", 9, "segunda", "2026-09-16", "2026-09-30")];
    abrir();
    expect(await screen.findByText("Elegível")).toBeTruthy();
    expect(screen.queryByText(/Prévia/)).toBeNull();
    expect(screen.queryByText("prévia: o oficial sai no fechamento")).toBeNull();
  });
});
