// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const sig = (id: string, sigla: string, significado: string, extra = {}) => ({
  id,
  sigla,
  cor: "#C9DAF8",
  significado,
  conta_como_trabalho: true,
  em_atendimento: false,
  faixa: false,
  ordem: 1,
  ...extra,
});
const SIGLAS = [
  sig("s-i", "i", "Intercom (atendimento)", { em_atendimento: true }),
  sig("s-p", "P", "Pausa", { conta_como_trabalho: false, cor: "#D9D9D9" }),
];
const H = (...xs: (string | null)[]) => [...xs, ...Array(16 - xs.length).fill(null)];
let semana: Record<string, unknown>;
const api = {
  lerSiglas: vi.fn(async () => SIGLAS),
  lerSemanas: vi.fn(async () => [{ inicio: "2026-10-12", situacao: "rascunho" }]),
  lerSemana: vi.fn(async () => semana),
  lerFerias: vi.fn(async () => ({
    ano: 2026,
    eu: null,
    feriados: new Set(["2026-10-12"]),
    porDia: new Map([["2026-11-12", [{ employee_id: "t", nome: "Thiago Dantas" }]]]),
  })),
  salvarDia: vi.fn(async (..._a: unknown[]) => {}),
  salvarDias: vi.fn(async (..._a: unknown[]) => {}),
  publicarSemana: vi.fn(async (..._a: unknown[]) => {}),
  criarSigla: vi.fn(async (..._a: unknown[]) => "s-novo"),
  definirFerias: vi.fn(async (..._a: unknown[]) => {}),
  definirFeriado: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/escala-api", () => api);
const { MontarSemana } = await import("../montar-semana");
const { MontarFerias } = await import("../montar-ferias");
const { SemanaDoTime } = await import("../semana-do-time");

const PESSOAS = [
  { id: "r", nome: "Ruby Lima" },
  { id: "t", nome: "Thiago Dantas" },
];
const abrir = (el: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {el}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z")); // segunda, 12/10 (o feriado)
  semana = {
    inicio: "2026-10-12",
    situacao: "rascunho",
    publicada_em: null,
    eu: null,
    feriados: ["2026-10-12"],
    dias: [[{ employee_id: "t", nome: "Thiago Dantas", horas: H() }], [], [], [], [], [], []],
  };
  Object.values(api).forEach((f) => f.mockClear());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const linhasGravadas = () =>
  (
    api.salvarDia.mock.calls.at(-1) as unknown as [
      string,
      number,
      { employee_id: string; horas: (string | null)[] }[],
    ]
  )[2];

describe("a montagem da semana (o ADM)", () => {
  it("clicar numa hora abre a lista; escolher grava o dia, um instante depois", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Thiago Dantas, 6h: vazio" }));
    fireEvent.click(screen.getByRole("option", { name: /Intercom/ }));
    await waitFor(() => expect(api.salvarDia).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(api.salvarDia.mock.calls[0]![0]).toBe("2026-10-12");
    expect(linhasGravadas()[0]!.horas[0]).toBe("s-i");
  });
  it("o aviso de feriado, com a equipe reduzida", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    expect(await screen.findByText(/segunda, 12\/10, é feriado/)).toBeTruthy();
  });
  it("tirar do dia (✕), e adicionar no fim", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    await screen.findByRole("button", { name: "Thiago Dantas, 6h: vazio" }); // espera a semana carregar
    fireEvent.click(await screen.findByRole("button", { name: "+ Ruby" }));
    await waitFor(() => expect(api.salvarDia).toHaveBeenCalled(), { timeout: 2000 });
    expect(linhasGravadas().map((l) => l.employee_id)).toEqual(["t", "r"]); // a Ruby entrou no fim
    fireEvent.click(screen.getByRole("button", { name: "Tirar Thiago Dantas deste dia" }));
    await waitFor(() => expect(linhasGravadas().map((l) => l.employee_id)).toEqual(["r"]), {
      timeout: 2000,
    });
  });
  it("a atividade nova: criada no cadastro, e usada na hora", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Thiago Dantas, 6h: vazio" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Nova atividade" }));
    fireEvent.change(screen.getByPlaceholderText(/Sigla/), { target: { value: "trein" } });
    fireEvent.change(screen.getByPlaceholderText(/O que é/), { target: { value: "Treinamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar e usar nesta hora" }));
    await waitFor(() =>
      expect(api.criarSigla).toHaveBeenCalledWith("trein", "#B4A7D6", "Treinamento"),
    );
    await waitFor(() => expect(linhasGravadas()[0]!.horas[0]).toBe("s-novo"), { timeout: 2000 });
  });
  it("a sigla repetida é recusada na própria lista (sem chamar o banco)", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Thiago Dantas, 6h: vazio" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Nova atividade" }));
    fireEvent.change(screen.getByPlaceholderText(/Sigla/), { target: { value: "I" } });
    fireEvent.change(screen.getByPlaceholderText(/O que é/), { target: { value: "Outro" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar e usar nesta hora" }));
    expect(await screen.findByText(/A sigla "I" já existe/)).toBeTruthy();
    expect(api.criarSigla).not.toHaveBeenCalled();
  });
  it("publicar: o resumo (o feriado e os dias vazios), e a publicação", async () => {
    abrir(<MontarSemana pessoas={PESSOAS} />);
    await screen.findByRole("button", { name: "Thiago Dantas, 6h: vazio" }); // espera a semana carregar
    fireEvent.click(await screen.findByRole("button", { name: "Publicar para o time" }));
    const janela = await screen.findByRole("dialog");
    expect(within(janela).getByText(/SEG 12\/10 é feriado: 1 pessoa escalada/)).toBeTruthy();
    expect(within(janela).getByText(/7 dias estão vazios/)).toBeTruthy(); // o Thiago está no dia, mas sem nenhuma hora
    fireEvent.click(within(janela).getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(api.publicarSemana).toHaveBeenCalledWith("2026-10-12"));
  });
});

describe("as férias (o ADM)", () => {
  it("arrastar do 9 ao 13 de novembro, e marcar a pessoa nos 5 dias de uma vez", async () => {
    abrir(<MontarFerias pessoas={PESSOAS} />);
    const dia = (d: number) => screen.getAllByTitle(new RegExp(`^${d}/11:`))[0]!;
    await screen.findAllByTitle(/^9\/11:/);
    fireEvent.mouseDown(dia(9));
    for (const d of [10, 11, 12, 13]) fireEvent.mouseEnter(dia(d));
    fireEvent.mouseUp(window);
    expect(await screen.findByText("9 a 13 de novembro · 5 dias")).toBeTruthy();
    const thiago = screen.getByRole("checkbox", { name: /Thiago Dantas/ }) as HTMLInputElement;
    expect(thiago.indeterminate).toBe(true); // ele já tem o dia 12
    fireEvent.click(screen.getByRole("checkbox", { name: /Ruby Lima/ }));
    await waitFor(() =>
      expect(api.definirFerias).toHaveBeenCalledWith(
        "r",
        ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"],
        true,
      ),
    );
  });
  it("num dia só, a caixinha do feriado", async () => {
    abrir(<MontarFerias pessoas={PESSOAS} />);
    const dia = (await screen.findAllByTitle(/^12\/10:/))[0]!;
    fireEvent.mouseDown(dia);
    fireEvent.mouseUp(window);
    const feriado = (await screen.findByRole("checkbox", { name: "Feriado" })) as HTMLInputElement;
    expect(feriado.checked).toBe(true);
    fireEvent.click(feriado);
    await waitFor(() => expect(api.definirFeriado).toHaveBeenCalledWith("2026-10-12", false));
  });
});

describe("a semana como o time vê", () => {
  const S = new Map(SIGLAS.map((s) => [s.id, s]));
  const dias = [
    [{ employee_id: "t", nome: "Thiago Dantas", horas: H("s-i", "s-i", "s-p", "s-i") }],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  it("o feriado avisa a equipe reduzida, e o '(você)' marca a própria linha", () => {
    render(
      <SemanaDoTime inicio="2026-10-12" dias={dias} feriados={["2026-10-12"]} eu="t" siglas={S} />,
    );
    expect(screen.getByText(/é feriado\./)).toBeTruthy();
    expect(screen.getByText("(você)")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // 4 horas na escala, menos a pausa
  });
  it("quem não está escalado no feriado vê o recado no 'Meu dia'", () => {
    render(
      <SemanaDoTime
        inicio="2026-10-12"
        dias={[
          [{ employee_id: "r", nome: "Ruby", horas: H("s-i") }],
          [{ employee_id: "t", nome: "Thiago", horas: H("s-i") }],
          [],
          [],
          [],
          [],
          [],
        ]}
        feriados={["2026-10-12"]}
        eu="t"
        siglas={S}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Meu dia" }));
    expect(screen.getByText("Você não está escalado(a) neste feriado.")).toBeTruthy();
  });
});

describe("a trava enquanto a semana carrega", () => {
  it("antes de a semana carregar, nada da montagem funciona (nem grava um dia incompleto)", async () => {
    let liberar: () => void = () => {};
    api.lerSemana.mockImplementationOnce(() => new Promise((r) => (liberar = () => r(semana))));
    abrir(<MontarSemana pessoas={PESSOAS} />);
    expect(await screen.findByText("Carregando a semana...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Ruby" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Publicar para o time" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    liberar();
    expect(await screen.findByRole("button", { name: "+ Ruby" })).toBeTruthy();
    expect(api.salvarDia).not.toHaveBeenCalled();
  });
});
