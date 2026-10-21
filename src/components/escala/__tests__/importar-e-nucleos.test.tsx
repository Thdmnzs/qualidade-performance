// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/escala", async (original) => ({
  ...(await original<object>()),
  hojeIso: () => "2026-10-14",
})); // a próxima semana: 19/10
const CSV = readFileSync(
  `${process.cwd()}/src/lib/__tests__/fixtures/escala-19-a-25-10.csv`,
  "utf8",
);
let SEMANAS = [{ inicio: "2026-10-19", situacao: "rascunho" }];
const api = {
  lerSiglas: vi.fn(async () =>
    [
      "i",
      "P",
      "rede",
      "cx",
      "cxtech",
      "auto",
      "quali",
      "log",
      "F&R",
      "cob B2B",
      "1:1",
      "folga",
      "férias",
      "off",
    ].map((s) => ({ id: `id-${s}`, sigla: s, cor: "#eee", significado: s })),
  ),
  lerApelidosDaEscala: vi.fn(async () => ({})),
  lerSemanas: vi.fn(async () => SEMANAS),
  importarSemana: vi.fn(async (..._a: unknown[]) => {}),
  criarSigla: vi.fn(async () => "id-eleicoes"),
  lerNucleos: vi.fn(async () => ({ katia: ["log"] })),
  definirNucleos: vi.fn(async (..._a: unknown[]) => {}),
  NUCLEOS: ["rede", "cxtech", "quali", "log", "F&R", "cob B2B", "auto"],
};
vi.mock("@/lib/escala-api", () => api);
// O cadastro: o apelido da planilha dos indicadores (a Franciele é a "Fran"; o Luiz, o "Luiz Fernando")
vi.mock("@/integrations/supabase/client", () => {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) c[m] = () => c;
  c["then"] = (ok: (v: unknown) => void) =>
    ok({
      data: [
        { id: "Franciele Rezende", nome_na_planilha: "Fran" },
        { id: "Luiz Oliveira", nome_na_planilha: "Luiz Fernando" },
      ],
      error: null,
    });
  return { supabase: { from: () => c } };
});
const { ImportarEscala } = await import("../importar-escala");
const { NucleosDoTime } = await import("../nucleos");
const PESSOAS = [
  "Amanda Silva",
  "Ardson Lopes",
  "Carol Confort",
  "Franciele Rezende",
  "Kaio Luiz",
  "Katia Tchu",
  "Luiz Oliveira",
  "Rachel Kivel",
  "Rubia Lopes",
  "Simone Silva",
  "Suelen Rocha",
  "Thiago Dantas",
  "Virmaud Junior",
  "Vitor de Almeida",
].map((nome) => ({ id: nome === "Katia Tchu" ? "katia" : nome, nome }));
const abrir = (el: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
const seguir = () => fireEvent.click(screen.getByRole("button", { name: "Seguir →" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  SEMANAS = [{ inicio: "2026-10-19", situacao: "rascunho" }];
});
async function ateAConferencia() {
  abrir(<ImportarEscala pessoas={PESSOAS} />);
  await waitFor(() => expect(api.lerSemanas).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("O arquivo da escala"), {
    target: { files: [new File([CSV], "escala_cx_-_19_a_25_10.csv", { type: "text/csv" })] },
  });
  expect(await screen.findByText(/lido: 7 dias, 14 pessoas/)).toBeTruthy();
  seguir();
  expect(screen.getByText(/Falta ligar: “Ruby”/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Seguir →" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("A pessoa de Ruby"), { target: { value: "Rubia Lopes" } });
  seguir();
  expect(screen.getByText("A sigla “eleições” não existe no CX Hub")).toBeTruthy();
  expect(screen.getByText(/Thiago, sábado, 7h/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tratar como folga" }));
  seguir();
}

describe("a importação da escala, com o arquivo real", () => {
  it("os quatro passos, e o envio dos 7 dias com o apelido novo", async () => {
    await ateAConferencia();
    expect(
      within(screen.getByRole("table", { name: "A escala de segunda" })).getAllByRole("row"),
    ).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Importar a semana" }));
    await waitFor(() => expect(api.importarSemana).toHaveBeenCalled());
    const [inicio, dias, apelidos, confirmar] = api.importarSemana.mock.calls[0]!;
    expect(inicio).toBe("2026-10-19");
    expect(Object.values(dias as Record<string, unknown[]>).map((d) => d.length)).toEqual([
      14, 14, 14, 14, 14, 5, 4,
    ]);
    expect(apelidos).toMatchObject({ ruby: "Rubia Lopes" });
    expect(confirmar).toBe(false);
  });
  it("numa semana publicada, só importa com a confirmação (e avisa que ela volta para rascunho)", async () => {
    SEMANAS = [{ inicio: "2026-10-19", situacao: "publicada" }];
    await ateAConferencia();
    const botao = screen.getByRole("button", {
      name: "Importar (a semana volta para rascunho)",
    }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(botao);
    await waitFor(() => expect(api.importarSemana).toHaveBeenCalled());
    expect(api.importarSemana.mock.calls[0]![3]).toBe(true);
  });
  it("um arquivo que não é CSV nem XLSX é recusado", async () => {
    abrir(<ImportarEscala pessoas={PESSOAS} />);
    fireEvent.change(screen.getByLabelText("O arquivo da escala"), {
      target: { files: [new File(["x"], "foto.png")] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("CSV ou XLSX");
  });
});

describe("o XLSX (21/10/2026): a leitura sem o trabalhador em segundo plano", () => {
  const XLSX = () =>
    readFileSync(`${process.cwd()}/src/lib/__tests__/fixtures/escala-19-a-25-10.xlsx`);
  /**
   * Um XLSX com uma segunda aba de 5 MB de texto: a tela lê a primeira aba e ignora a outra. (A prova de que nenhum
   * trabalhador em segundo plano é criado, com a fflate do navegador, está em src/lib/__tests__/ler-xlsx.test.ts.)
   */
  async function xlsxGrande() {
    const { strToU8, unzipSync, zipSync } = await import("fflate");
    const partes = unzipSync(new Uint8Array(XLSX()));
    const linha = (r: number) =>
      `<row r="${r}">${Array.from({ length: 30 }, (_, k) => `<c r="${String.fromCharCode(65 + (k % 26))}${r}" t="inlineStr"><is><t>histórico da semana ${r}</t></is></c>`).join("")}</row>`;
    const aba2 = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${Array.from({ length: 2500 }, (_, r) => linha(r + 1)).join("")}</sheetData></worksheet>`;
    return zipSync({ ...partes, "xl/worksheets/sheet2.xml": strToU8(aba2) });
  }
  /** Como a CSP do navegador faz: o trabalhador é CRIADO sem erro, mas nunca carrega nem responde. */
  function comOTrabalhadorBloqueado() {
    const original = { Worker: globalThis.Worker, url: URL.createObjectURL };
    globalThis.Worker = class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
      addEventListener() {}
    } as unknown as typeof Worker;
    URL.createObjectURL = () => "blob:bloqueado";
    return () => {
      globalThis.Worker = original.Worker;
      URL.createObjectURL = original.url;
    };
  }
  it("um XLSX com uma aba grande a mais é lido (só a primeira aba)", async () => {
    const desfazer = comOTrabalhadorBloqueado();
    try {
      const bytes = await xlsxGrande();
      expect(bytes.length).toBeGreaterThan(100 * 1024);
      const { lerArquivo } = await import("../importar-escala");
      const { lerPlanilhaDaEscala } = await import("@/lib/importar-escala");
      const lida = lerPlanilhaDaEscala(await lerArquivo(new File([bytes], "escala.xlsx")));
      expect(lida.dias.map((d) => d.length)).toEqual([14, 14, 14, 14, 14, 5, 4]);
      expect(lida.dias[0]![1]!.siglas.slice(0, 7)).toEqual([
        "i",
        "i",
        "i",
        "i",
        "P",
        "i",
        "cob B2B",
      ]);
      expect(lida.problemas).toEqual([
        { tipo: "celula", dia: 5, apelido: "Thiago", hora: 7, valor: "," },
      ]);
    } finally {
      desfazer();
    }
  });
  it("na tela: o XLSX grande lido mostra os dias e as pessoas", async () => {
    const desfazer = comOTrabalhadorBloqueado();
    try {
      abrir(<ImportarEscala pessoas={PESSOAS} />);
      fireEvent.change(screen.getByLabelText("O arquivo da escala"), {
        target: { files: [new File([await xlsxGrande()], "escala.xlsx")] },
      });
      expect(
        await screen.findByText(/lido: 7 dias, 14 pessoas/, {}, { timeout: 8000 }),
      ).toBeTruthy();
    } finally {
      desfazer();
    }
  }, 15000);
});

describe("o tamanho do arquivo (21/10/2026)", () => {
  it("um arquivo de 5 MB passa; um de mais de 20 MB é recusado", async () => {
    abrir(<ImportarEscala pessoas={PESSOAS} />);
    const grande = (mb: number) => {
      const f = new File([CSV], "escala.csv", { type: "text/csv" });
      Object.defineProperty(f, "size", { value: mb * 1024 * 1024 });
      return f;
    };
    fireEvent.change(screen.getByLabelText("O arquivo da escala"), {
      target: { files: [grande(5)] },
    });
    expect(await screen.findByText(/lido: 7 dias, 14 pessoas/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("O arquivo da escala"), {
      target: { files: [grande(21)] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("o limite é de 20 MB");
  });
});

describe("os núcleos", () => {
  it("as marcas de cada pessoa, e marcar grava os núcleos (mais de um)", async () => {
    abrir(<NucleosDoTime pessoas={PESSOAS} />);
    const log = (await screen.findByLabelText(
      "Katia Tchu no núcleo Logística",
    )) as HTMLInputElement;
    expect(log.checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Katia Tchu no núcleo Fraude e Risco"));
    await waitFor(() => expect(api.definirNucleos).toHaveBeenCalledWith("katia", ["log", "F&R"]));
  });
});
