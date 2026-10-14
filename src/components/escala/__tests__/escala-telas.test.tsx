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
  sig("s-off", "off", "Ausente", { conta_como_trabalho: false, cor: "#E06666" }),
  sig("s-folga", "folga", "Folga", { conta_como_trabalho: false, cor: "#FF9900", faixa: true }),
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
  lerPedidos: vi.fn(async () => [
    {
      id: "p1",
      employee_id: "r",
      nome: "Ruby Lima",
      de: "2026-11-09",
      ate: "2026-11-13",
      observacao: "Viagem.",
      situacao: "aguardando",
      motivo: null,
      criado_em: "2026-10-10T12:00:00Z",
      decidido_em: null,
    },
  ]),
  decidirPedido: vi.fn(async (..._a: unknown[]) => {}),
  // O horário de trabalho (13/10/2026): só a Ruby tem, das 8h às 17h, com a pausa às 12h.
  lerHorariosDeTrabalho: vi.fn(async () => new Map([["r", { entrada: 8, saida: 17, pausa: 12 }]])),
  definirHorarioDeTrabalho: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/escala-api", () => api);
// As folgas fixas (13/10/2026): a Ruby folga na quarta; o Thiago, na segunda.
const trocasApi = {
  lerFolgasFixas: vi.fn(async () => [
    { employee_id: "r", nome: "Ruby Lima", dias: [2], supervisao: false },
    { employee_id: "t", nome: "Thiago Dantas", dias: [0], supervisao: false },
  ]),
  lerTrocasParaAprovar: vi.fn(async () => []),
  aplicarTrocasDaSemana: vi.fn(async () => 0),
};
vi.mock("@/lib/trocas-api", () => trocasApi);
const { MontarSemana } = await import("../montar-semana");
const { MontarFerias } = await import("../montar-ferias");
const { SemanaDoTime } = await import("../semana-do-time");
const { JanelaDePedirFerias } = await import("../pedido-de-ferias");

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

describe("os pedidos de férias", () => {
  it("o ADM vê o pedido, com os avisos, e aprova", async () => {
    abrir(<MontarFerias pessoas={PESSOAS} />);
    expect(await screen.findByText("Pedidos de férias · 1 aguardando")).toBeTruthy();
    expect(screen.getByText("“Viagem.”")).toBeTruthy();
    expect(screen.getAllByTitle(/Pedido aguardando: Ruby Lima/).length).toBe(5); // tracejado nos 5 dias
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(api.decidirPedido).toHaveBeenCalledWith("p1", true, null));
  });
  it("recusar pede um motivo de 10 caracteres, que vai junto", async () => {
    abrir(<MontarFerias pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    const janela = await screen.findByRole("dialog");
    fireEvent.change(within(janela).getByLabelText("O motivo da recusa"), {
      target: { value: "curto" },
    });
    expect(
      (within(janela).getByRole("button", { name: "Recusar" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(within(janela).getByLabelText("O motivo da recusa"), {
      target: { value: "Já há 2 pessoas nessa semana." },
    });
    fireEvent.click(within(janela).getByRole("button", { name: "Recusar" }));
    await waitFor(() =>
      expect(api.decidirPedido).toHaveBeenCalledWith("p1", false, "Já há 2 pessoas nessa semana."),
    );
  });
  const dados = { ano: 2026, eu: "t", feriados: new Set(["2026-11-02"]), porDia: new Map() };
  it("o colaborador: um período no passado não é enviado", () => {
    const enviar = vi.fn(async () => {});
    render(
      <JanelaDePedirFerias
        aberta
        aoFechar={() => {}}
        inicial={{ de: "2026-10-05", ate: "2026-10-07" }}
        dados={dados}
        pedidos={[]}
        eu="t"
        aoEnviar={enviar}
      />,
    );
    expect(screen.getByText("Escolha dias a partir de amanhã.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Enviar o pedido" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("o colaborador: um período válido mostra os avisos e é enviado com a observação", async () => {
    const enviar = vi.fn(async (..._a: unknown[]) => {});
    render(
      <JanelaDePedirFerias
        aberta
        aoFechar={() => {}}
        inicial={{ de: "2026-11-02", ate: "2026-11-06" }}
        dados={dados}
        pedidos={[]}
        eu="t"
        aoEnviar={enviar}
      />,
    );
    expect(screen.getByText(/5 dias/)).toBeTruthy();
    expect(screen.getByText(/Inclui um feriado \(2\/11\)/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/viagem de família/), {
      target: { value: "Viagem marcada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar o pedido" }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith("2026-11-02", "2026-11-06", "Viagem marcada"),
    );
  });
  it("o colaborador: até o fim do segundo ano seguinte (em 2026, até 31/12/2028)", () => {
    render(
      <JanelaDePedirFerias
        aberta
        aoFechar={() => {}}
        inicial={{ de: "2028-12-28", ate: "2029-01-02" }}
        dados={dados}
        pedidos={[]}
        eu="t"
        aoEnviar={vi.fn()}
      />,
    );
    expect(screen.getByText("Você pode pedir férias até 31/12/2028.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Enviar o pedido" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText("Até").getAttribute("max")).toBe("2028-12-31");
  });
  it("o colaborador: um pedido sobrepondo outro que aguarda não é enviado", () => {
    const pedidos = [
      {
        id: "x",
        employee_id: "t",
        nome: "Thiago",
        de: "2026-11-04",
        ate: "2026-11-05",
        observacao: null,
        situacao: "aguardando" as const,
        motivo: null,
        criado_em: "",
        decidido_em: null,
      },
    ];
    render(
      <JanelaDePedirFerias
        aberta
        aoFechar={() => {}}
        inicial={{ de: "2026-11-02", ate: "2026-11-06" }}
        dados={dados}
        pedidos={pedidos}
        eu="t"
        aoEnviar={vi.fn()}
      />,
    );
    expect(screen.getByText("Você já tem um pedido aguardando nesses dias.")).toBeTruthy();
  });
});

describe("as mudanças rápidas (a semana publicada)", () => {
  const preparar = () => {
    semana = {
      inicio: "2026-10-12",
      situacao: "publicada",
      publicada_em: "2026-10-09T12:00:00Z",
      eu: null,
      feriados: [],
      dias: [
        [
          {
            employee_id: "t",
            nome: "Thiago Dantas",
            horas: H("s-i", "s-i", "s-i", "s-i", "s-p", "s-i", "s-i", "s-i", "s-i"),
          },
        ],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };
  };
  const hora = (h: number) =>
    screen.getByRole("button", { name: new RegExp(`^Thiago Dantas, ${h}h:`) });
  const gravadas = () =>
    (
      api.salvarDia.mock.calls.at(-1) as unknown as [
        string,
        number,
        { employee_id: string; horas: (string | null)[] }[],
      ]
    )[2];
  it("arrastar das 11h às 14h, e escolher 'off' uma vez só", async () => {
    preparar();
    abrir(<MontarSemana pessoas={PESSOAS} />);
    await screen.findByRole("button", { name: /^Thiago Dantas, 6h:/ });
    fireEvent.mouseDown(hora(11), { button: 0 });
    for (const h of [12, 13, 14]) fireEvent.mouseEnter(hora(h));
    fireEvent.mouseUp(window);
    expect(await screen.findByText("Thiago · 11h às 15h · 4 horas")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Ausente/ }));
    await waitFor(() => expect(api.salvarDia).toHaveBeenCalled(), { timeout: 2000 });
    expect(gravadas()[0]!.horas.slice(4, 10)).toEqual([
      "s-p",
      "s-off",
      "s-off",
      "s-off",
      "s-off",
      null,
    ]);
    expect(
      document.querySelectorAll("[data-celula].shadow-\\[inset_0_-3px_0_\\#F59E0B\\]").length,
    ).toBe(4); // a marca nas 4 horas
  });
  it("o Shift: clicar numa hora e, com o Shift, em outra", async () => {
    preparar();
    abrir(<MontarSemana pessoas={PESSOAS} />);
    await screen.findByRole("button", { name: /^Thiago Dantas, 6h:/ });
    fireEvent.mouseDown(hora(7), { button: 0 });
    fireEvent.mouseUp(window);
    fireEvent.mouseDown(hora(9), { button: 0, shiftKey: true });
    fireEvent.mouseUp(window);
    expect(await screen.findByText("Thiago · 7h às 10h · 3 horas")).toBeTruthy();
  });
  it("o ⋯: ficar off a partir das 12h", async () => {
    preparar();
    abrir(<MontarSemana pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Thiago Dantas" }));
    fireEvent.change(screen.getByLabelText("A hora em que fica off"), { target: { value: "6" } }); // 12h
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar" })[0]!);
    await waitFor(() => expect(api.salvarDia).toHaveBeenCalled(), { timeout: 2000 });
    expect(gravadas()[0]!.horas.slice(4, 10)).toEqual([
      "s-p",
      "s-i",
      "s-off",
      "s-off",
      "s-off",
      null,
    ]);
  });
  it("o ⋯: substituir pela Ruby (com as mesmas horas)", async () => {
    preparar();
    abrir(<MontarSemana pessoas={PESSOAS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Thiago Dantas" }));
    expect((screen.getByLabelText("Quem entra no lugar") as HTMLSelectElement).value).toBe("r");
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar" })[1]!);
    await waitFor(() => expect(api.salvarDia).toHaveBeenCalled(), { timeout: 2000 });
    expect(gravadas().map((l) => l.employee_id)).toEqual(["r"]);
    expect(gravadas()[0]!.horas[0]).toBe("s-i");
  });
});

describe("atribuir as folgas e os horários", () => {
  it("a folga entra no dia vazio; o dia com horário vira um conflito, com o aviso", async () => {
    semana = {
      inicio: "2026-10-12",
      situacao: "rascunho",
      publicada_em: null,
      eu: null,
      feriados: [],
      dias: [
        [{ employee_id: "t", nome: "Thiago Dantas", horas: H("s-i", "s-i", "s-p") }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    abrir(<MontarSemana pessoas={PESSOAS} />);
    const botao = await screen.findByRole("button", { name: /Atribuir folgas e horários/ });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(api.salvarDias).toHaveBeenCalled());
    const [ini, novos] = api.salvarDias.mock.calls.at(-1) as [
      string,
      Record<string, { employee_id: string; horas: (string | null)[] }[]>,
    ];
    expect(ini).toBe("2026-10-12");
    // a quarta da Ruby (a folga fixa) e os outros dias dela (o horário); a segunda do Thiago tem horário à mão
    expect(Object.keys(novos)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(
      novos["2"]!.find((l) => l.employee_id === "r")!.horas.every((h) => h === "s-folga"),
    ).toBe(true);
    const ruby = novos["1"]!.find((l) => l.employee_id === "r")!.horas;
    expect(ruby.slice(2, 11)).toEqual([
      "s-i",
      "s-i",
      "s-i",
      "s-i",
      "s-p",
      "s-i",
      "s-i",
      "s-i",
      "s-i",
    ]); // das 8h às 17h
    expect(novos["1"]!.some((l) => l.employee_id === "t")).toBe(false); // o Thiago não tem horário: o dia fica vazio
    expect((await screen.findByRole("status")).textContent).toContain(
      "Thiago Dantas ainda não tem horário",
    );
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("1 conflito");
    expect(aviso.textContent).toContain("Thiago Dantas tem horário na segunda");
    fireEvent.click(within(aviso).getByRole("button", { name: "Manter o horário" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("na semana publicada, o botão fica desligado", async () => {
    api.lerSemanas.mockResolvedValueOnce([{ inicio: "2026-10-12", situacao: "publicada" }]);
    semana = {
      inicio: "2026-10-12",
      situacao: "publicada",
      publicada_em: "2026-10-09T12:00:00Z",
      eu: null,
      feriados: [],
      dias: [[], [], [], [], [], [], []],
    };
    abrir(<MontarSemana pessoas={PESSOAS} />);
    const botao = await screen.findByRole("button", { name: /Atribuir folgas e horários/ });
    await waitFor(() => expect(screen.getByText(/Publicada: o time já vê/)).toBeTruthy());
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });
});
