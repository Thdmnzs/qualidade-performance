// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({ options: opcoes }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/hooks/useAuth", () => ({
  usePermissoes: () => ({ employee: { id: "e1" }, isLoading: false }),
}));
vi.mock("@/lib/format", async (original) => ({
  ...(await original<object>()),
  hojeEmFortaleza: () => "2026-10-16",
}));
vi.mock("@/lib/queries", () => ({
  fetchMetas: async () => ({
    produtividade: { meta: 6, unidade: "tickets/h", sentido: "minimo", escopo: "individual" },
    sla_chat: { meta: 5, unidade: "min", sentido: "maximo", escopo: "individual" },
    sla_email: { meta: 15, unidade: "min", sentido: "maximo", escopo: "individual" },
    csat: { meta: 97, unidade: "%", sentido: "minimo", escopo: "time" },
    horas_online: { meta: 20, unidade: "h", sentido: "minimo", escopo: "individual" },
  }),
}));
// Hoje é 16/10: ontem é 15/10, e a quinzena é a de 01 a 15/10.
const DIA = (dia: string, extra = {}) => ({
  dia,
  conversas_atribuidas: 60,
  autoatribuicoes: 6,
  tempo_ativo_min: 480,
  sla_chat_s: 240,
  sla_email_s: 900,
  sla_b2c_chat_1_s: 150,
  sla_b2c_email_1_s: 400,
  sla_b2c_chat_g_s: 220,
  sla_b2c_email_g_s: 800,
  sla_b2b_chat_1_s: 190,
  sla_b2b_email_1_s: null,
  sla_b2b_chat_g_s: 260,
  sla_b2b_email_g_s: 1000,
  ...extra,
});
const DIAS = [
  DIA("2026-10-14"),
  DIA("2026-10-15", { conversas_atribuidas: 40, autoatribuicoes: 4 }),
];
const consulta = (dados: unknown) => {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order"]) c[m] = () => c;
  c["maybeSingle"] = async () => ({ data: dados, error: null });
  c["then"] = (ok: (v: unknown) => void) => ok({ data: dados, error: null });
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (_n: string, a: { _de: string }) => ({
      data: [
        a._de === "2026-10-01"
          ? {
              qualidade: null,
              avaliacoes: 0,
              produtividade: 6.75,
              csat_time: 95.3,
              horas_semanais: 22,
            }
          : {
              qualidade: 96.4,
              avaliacoes: 4,
              produtividade: 6.31,
              csat_time: 97.1,
              horas_semanais: 21,
            },
      ],
      error: null,
    }),
    from: (t: string) =>
      consulta(
        t === "indicadores_diarios" ? DIAS : t === "fortnights" ? { id: "q1" } : { entregue: true },
      ),
  },
}));
const { Route } = await import("../_authenticated/indicadores");
const Tela = (Route as unknown as { options: { component: ComponentType } }).options.component;
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tela />
    </QueryClientProvider>,
  );
const rotulos = () =>
  [...screen.getByRole("tabpanel").querySelectorAll(".rotulo")].map((r) => r.textContent);
afterEach(cleanup);

describe("os indicadores do colaborador: o dia escolhido em destaque", () => {
  it("o padrão é ontem: só o número do dia, sem a média da quinzena", async () => {
    abrir();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Produtividade",
      "SLA",
      "Qualidade",
      "CSAT",
    ]);
    expect((await screen.findAllByText("em qui 15/10")).length).toBe(3);
    expect(rotulos()).toEqual([
      "Por hora ativa: total",
      "Por hora ativa: membro da equipe",
      "Por hora ativa: ajustada",
    ]);
    const painel = screen.getByRole("tabpanel");
    const valores = () =>
      [...painel.querySelectorAll(".cartao-ind .valor")].map((v) => v.textContent);
    await waitFor(() => expect(valores()).toEqual(["5,00", "0,50", "4,50"])); // 15/10: 40 conversas, 4 dele mesmo, em 8 h
    expect(painel.querySelectorAll(".cartao-ind.escuro")).toHaveLength(1); // a ajustada do dia (4,50) ficou abaixo da meta
    expect(painel.textContent).not.toMatch(/Na quinzena/); // a média da quinzena só sai na Visão geral, na publicação
  });
  it("o SLA do dia, em minutos e segundos", async () => {
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "SLA" }));
    expect(await screen.findByText("SLA geral do chat")).toBeTruthy();
    expect(rotulos()).toEqual([
      "SLA geral do chat",
      "SLA geral do e-mail",
      "1ª resposta",
      "Geral",
      "1ª resposta",
      "Geral",
      "1ª resposta",
      "Geral",
      "1ª resposta",
      "Geral",
    ]);
    const geral = screen.getByRole("tabpanel").querySelector(".cartao-ind .valor")!;
    await waitFor(() => expect(geral.textContent).toBe("4m 00s")); // o SLA geral do chat em 15/10: 240 s
  });
  it("o filtro: a seta volta um dia; um dia sem dados avisa; o Ontem volta", async () => {
    abrir();
    await screen.findAllByText("em qui 15/10");
    fireEvent.click(screen.getByRole("button", { name: "O dia anterior" }));
    expect((await screen.findAllByText("em qua 14/10")).length).toBe(3);
    expect(screen.getByRole("tabpanel").querySelector(".cartao-ind .valor")!.textContent).toBe(
      "7,50",
    ); // 14/10: 60 em 8 h
    expect(
      (screen.getByRole("button", { name: "O dia seguinte" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Escolher o dia"), { target: { value: "2026-10-10" } });
    expect((await screen.findAllByText("sem dados neste dia")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ontem" }));
    expect((await screen.findAllByText("em qui 15/10")).length).toBe(3);
    expect(
      (screen.getByRole("button", { name: "O dia seguinte" }) as HTMLButtonElement).disabled,
    ).toBe(true); // não passa de ontem
  });
  it("o Para concorrer continua no topo; a Qualidade, na publicação; e o CSAT do time, o do dia", async () => {
    abrir();
    expect(
      await screen.findByText(/Para concorrer nesta quinzena|no caminho para concorrer/),
    ).toBeTruthy();
    cleanup();
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "Qualidade" }));
    expect(await screen.findByText("aparece na publicação da quinzena")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "CSAT" }));
    expect(rotulos()).toEqual(["CSAT do time"]);
    await waitFor(() =>
      expect(screen.getByRole("tabpanel").querySelector(".cartao-ind .valor")!.textContent).toBe(
        "97,1%",
      ),
    ); // o do dia
  });
});
