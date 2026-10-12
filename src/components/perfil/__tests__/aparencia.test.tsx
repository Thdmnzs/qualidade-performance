// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
  },
}));
const { toast } = await import("sonner");
const { arteDaCapa, CODIGOS_COM_ARTE } = await import("../artes");
const { JanelaDaCapa, JanelaDaMoldura } = await import("../escolher-aparencia");
const { FotoDePerfil } = await import("@/components/foto-de-perfil");
const { CAPAS, MOLDURAS } = await import("@/lib/aparencia");

const APARENCIA = {
  capa: "faixas",
  moldura: "nenhuma",
  capa_da_temporada: false,
  moldura_da_temporada: false,
  capa_temporada_preferida: null,
  mes: 10,
  nivel: 6,
  capas_liberadas: [
    "sinal",
    "ondas",
    "brilho",
    "faixas",
    "aurora",
    "pilula",
    "fibra",
    "bruxas",
    "rosa",
  ],
  molduras_liberadas: ["nenhuma", "verde", "prata"],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("as artes das capas", () => {
  it("toda capa do catálogo tem um desenho", () => {
    for (const c of CAPAS) expect(CODIGOS_COM_ARTE).toContain(c.id);
  });
  it("os identificadores levam o sufixo (sem misturar desenhos repetidos na tela)", () => {
    expect(arteDaCapa("ondas", "a-1")).toContain('id="oga1"');
    expect(arteDaCapa("ondas", "b-2")).toContain('id="ogb2"');
  });
  it("nenhum desenho tem código embutido", () => {
    for (const id of CODIGOS_COM_ARTE)
      expect(arteDaCapa(id, "x")).not.toMatch(/<script|on\w+=|javascript:/i);
  });
  it("um código que não existe vira a Sinal", () =>
    expect(arteDaCapa("qualquer", "x")).toBe(arteDaCapa("sinal", "x")));
});

describe("Mudar capa", () => {
  const abrir = (aoMudar = vi.fn()) => {
    render(<JanelaDaCapa aberta aoFechar={() => {}} aparencia={APARENCIA} aoMudar={aoMudar} />);
    return aoMudar;
  };
  it("as 20 capas, em dois grupos, e a chave da temporada (há temporada em outubro)", () => {
    abrir();
    expect(
      screen.getAllByRole("button", { pressed: false }).length +
        screen.getAllByRole("button", { pressed: true }).length,
    ).toBe(20);
    expect(screen.getByText(/Usar a capa da temporada/)).toBeTruthy();
  });
  it("uma capa liberada da Fluke é salva (e a da temporada é desligada)", () => {
    const aoMudar = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Fibra Óptica/ }));
    expect(aoMudar).toHaveBeenCalledWith({ capa: "fibra", capa_da_temporada: false });
  });
  it("uma bloqueada só avisa o que falta", () => {
    const aoMudar = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Torre de Sinal/ }));
    expect(aoMudar).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("Para desbloquear: Nível 10.");
  });
  it("uma sazonal deste mês vira a capa da temporada preferida", () => {
    const aoMudar = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Outubro Rosa/ }));
    expect(aoMudar).toHaveBeenCalledWith({
      capa_da_temporada: true,
      capa_temporada_preferida: "rosa",
    });
  });
  it("uma sazonal de outro mês mostra só a prévia", () => {
    const aoMudar = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Carnaval/ }));
    expect(aoMudar).not.toHaveBeenCalled();
    expect(screen.getByText("Só uma prévia: disponível em fevereiro")).toBeTruthy();
  });
});

describe("Trocar moldura", () => {
  it("as de sempre e a da temporada (em outubro, a Noite das Bruxas)", () => {
    const aoMudar = vi.fn();
    render(
      <JanelaDaMoldura
        aberta
        aoFechar={() => {}}
        aparencia={APARENCIA}
        aoMudar={aoMudar}
        iniciais="TD"
      />,
    );
    expect(
      screen.getAllByRole("button", {
        name: /Sem moldura|Verde Fluke|Prata|Ouro|Lendária|FLUKER|Noite das Bruxas/,
      }),
    ).toHaveLength(MOLDURAS.length);
    fireEvent.click(screen.getByRole("button", { name: /Ouro/ }));
    expect(aoMudar).not.toHaveBeenCalled(); // bloqueada (nível 10)
    fireEvent.click(screen.getByRole("button", { name: /Prata/ }));
    expect(aoMudar).toHaveBeenCalledWith({ moldura: "prata", moldura_da_temporada: false });
    fireEvent.click(screen.getByRole("button", { name: /Noite das Bruxas/ }));
    expect(aoMudar).toHaveBeenLastCalledWith({ moldura_da_temporada: true });
  });
  it("num mês sem moldura da temporada, ela não aparece", () => {
    render(
      <JanelaDaMoldura
        aberta
        aoFechar={() => {}}
        aparencia={{ ...APARENCIA, mes: 3 }}
        aoMudar={vi.fn()}
        iniciais="TD"
      />,
    );
    expect(screen.queryByRole("button", { name: /Noite das Bruxas/ })).toBeNull();
    expect(screen.queryByText(/Usar a moldura da temporada/)).toBeNull();
  });
});

describe("o lápis da foto", () => {
  it("Enviar foto e Trocar moldura (o Remover só aparece com uma foto)", async () => {
    const aoTrocarMoldura = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FotoDePerfil
          employeeId="e1"
          nome="Thiago Dantas"
          editavel
          moldura="prata"
          aoTrocarMoldura={aoTrocarMoldura}
        />
      </QueryClientProvider>,
    );
    const lapis = screen.getByRole("button", { name: "Mudar a foto ou a moldura" });
    fireEvent.keyDown(lapis, { key: "Enter" }); // o menu também abre pelo teclado
    expect(await screen.findByRole("menuitem", { name: "Enviar foto" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Remover foto" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Trocar moldura" }));
    expect(aoTrocarMoldura).toHaveBeenCalled();
    expect(document.querySelector(".moldura-prata")).toBeTruthy();
  });
});
