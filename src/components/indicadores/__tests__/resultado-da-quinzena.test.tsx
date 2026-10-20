// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Os números reais do Thiago na quinzena de 01 a 15/10 (iguais aos da aba Análise), e a parcial da seguinte
const pedidos: { _de: string; _ate: string }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (_n: string, a: { _de: string; _ate: string }) => {
      pedidos.push(a);
      return {
        data: [
          a._de === "2026-10-01"
            ? { produtividade: 9.91, sla_chat_s: 130, sla_email_s: 273, csat_time: 97.3 }
            : { produtividade: 7.44, sla_chat_s: 85, sla_email_s: 130, csat_time: 88.2 },
        ],
        error: null,
      };
    },
  },
}));
const { ResultadoDaQuinzena } = await import("../resultado-da-quinzena");
const METAS = {
  produtividade: { meta: 6, unidade: "tickets/h", sentido: "minimo", escopo: "individual" },
  sla_chat: { meta: 5, unidade: "min", sentido: "maximo", escopo: "individual" },
  sla_email: { meta: 15, unidade: "min", sentido: "maximo", escopo: "individual" },
  csat: { meta: 97, unidade: "%", sentido: "minimo", escopo: "time" },
} as never;
const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResultadoDaQuinzena hoje="2026-10-20" metas={METAS} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  pedidos.length = 0;
});

describe("o resultado da quinzena, nas Minhas métricas", () => {
  it("o padrão é a quinzena em andamento: parcial, até ontem", async () => {
    abrir();
    expect(await screen.findByText(/parcial, até 19\/10/)).toBeTruthy();
    await waitFor(() => expect(pedidos).toContainEqual({ _de: "2026-10-16", _ate: "2026-10-19" }));
  });
  it("a quinzena anterior: os quatro números da planilha, com a meta", async () => {
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "01/10 a 15/10" }));
    expect(await screen.findByText("9,91")).toBeTruthy();
    expect(screen.getByText("2m 10s")).toBeTruthy(); // 130 s
    expect(screen.getByText("4m 33s")).toBeTruthy(); // 273 s
    expect(screen.getByText("97,3%")).toBeTruthy();
    expect(screen.getAllByText("✓ dentro")).toHaveLength(4);
    expect(screen.queryByText(/parcial/)).toBeNull();
    expect(pedidos).toContainEqual({ _de: "2026-10-01", _ate: "2026-10-15" });
  });
});
