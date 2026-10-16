// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("os indicadores do colaborador, em abas", () => {
  it("as quatro abas; a Produtividade com os três cartões (a ajustada, com a meta)", async () => {
    abrir();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Produtividade",
      "SLA",
      "Qualidade",
      "CSAT",
    ]);
    expect(await screen.findByText("6,75")).toBeTruthy(); // a ajustada, do banco
    expect(rotulos()).toEqual([
      "Por hora ativa: total",
      "Por hora ativa: membro da equipe",
      "Por hora ativa: ajustada",
    ]);
    const painel = screen.getByRole("tabpanel");
    expect(painel.querySelectorAll(".cartao-ind.info")).toHaveLength(2); // o total e o membro: informativos
    expect(within(painel).getByText("dentro da meta")).toBeTruthy();
    expect(within(painel).getByText("6,25")).toBeTruthy(); // o total na quinzena: (60 + 40) ÷ 16 h
    expect(within(painel).getByText("5,00")).toBeTruthy(); // e o de ontem: 40 ÷ 8 h
  });
  it("o SLA: os dois gerais e os oito tempos", async () => {
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
    expect(screen.getByRole("tabpanel").querySelectorAll(".cartao-ind.info")).toHaveLength(4); // a 1ª resposta: informativa
    expect(
      (await within(screen.getByRole("tabpanel")).findAllByText("4m 00s")).length,
    ).toBeGreaterThan(0); // o geral do chat: 240 s
  });
  it("a Qualidade, na publicação; e o CSAT, só o do time", async () => {
    abrir();
    fireEvent.click(screen.getByRole("tab", { name: "Qualidade" }));
    expect(await screen.findByText("aparece na publicação da quinzena")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ver minhas avaliações/ }).getAttribute("href")).toBe(
      "/minhas-avaliacoes",
    );
    fireEvent.click(screen.getByRole("tab", { name: "CSAT" }));
    expect(rotulos()).toEqual(["CSAT do time"]);
    expect(screen.getByRole("tabpanel").querySelector(".cartao-ind.escuro")).not.toBeNull(); // 95,3% < 97%: o vermelho claro
  });
});
