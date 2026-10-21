import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { HORA_INICIAL, hojeIso, segundaDaSemana, type Sigla } from "@/lib/escala";
import {
  criarSigla,
  importarSemana,
  lerApelidosDaEscala,
  lerSemanas,
  lerSiglas,
} from "@/lib/escala-api";
import {
  DIAS_DA_PLANILHA,
  lerCsv,
  lerPlanilhaDaEscala,
  ligarApelidos,
  montarSemana,
  type Decisao,
  type PlanilhaLida,
} from "@/lib/importar-escala";

const LIMITE_DO_ARQUIVO = 2 * 1024 * 1024; // 2 MB: uma escala de uma semana tem poucos KB
const PASSOS = [
  "1. O arquivo",
  "2. As pessoas",
  "3. Os pontos a resolver",
  "4. Conferir e importar",
];
const somar = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
type Escolha = "criar" | "folga" | "vazio";

/** O arquivo em linhas: o CSV pela regra própria; o XLSX pela biblioteca (só a primeira aba). */
async function lerArquivo(f: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(f.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(f)) as unknown[][];
  }
  return lerCsv(await textoDoArquivo(f));
}
/** O texto do arquivo, pelo FileReader (o `file.text()` não existe em navegadores mais antigos). */
const textoDoArquivo = (f: Blob) =>
  new Promise<string>((ok, falhou) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result ?? ""));
    leitor.onerror = () => falhou(leitor.error);
    leitor.readAsText(f, "utf-8");
  });

/**
 * A importação da escala (20/10/2026): a planilha da supervisão (CSV ou XLSX) vira a semana, em quatro passos.
 * Ela substitui o rascunho da semana inteira; numa semana publicada, só com a confirmação (e a semana volta para
 * rascunho). Depois, a supervisão confere na montagem e publica, como sempre.
 */
export function ImportarEscala({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const qc = useQueryClient();
  const { data: siglas = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  const { data: guardados = {} } = useQuery({
    queryKey: ["apelidos-da-escala"],
    queryFn: lerApelidosDaEscala,
  });
  const { data: semanas = [] } = useQuery({ queryKey: ["escala-semanas"], queryFn: lerSemanas });
  // O apelido da planilha dos indicadores ("Fran"), para a ligação automática.
  const { data: daPlanilha = {} } = useQuery({
    queryKey: ["nomes-na-planilha"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, nome_na_planilha")
        .eq("status", "ativo");
      return Object.fromEntries((data ?? []).map((e) => [e.id, e.nome_na_planilha])) as Record<
        string,
        string | null
      >;
    },
  });
  const [passo, setPasso] = useState(1);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [lida, setLida] = useState<PlanilhaLida | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [inicio, setInicio] = useState(() => somar(segundaDaSemana(hojeIso()), 7));
  const [escolhidas, setEscolhidas] = useState<Record<string, string>>({}); // apelido → pessoa (as escolhas da supervisora)
  const [decisoes, setDecisoes] = useState<Record<string, Escolha>>({});
  const [dia, setDia] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [importando, setImportando] = useState(false);
  const situacao = semanas.find((s) => s.inicio === inicio)?.situacao ?? null;
  const apelidos = useMemo(
    () => [...new Set((lida?.dias ?? []).flat().map((l) => l.apelido))],
    [lida],
  );
  const automaticas = useMemo(
    () =>
      ligarApelidos(
        apelidos,
        pessoas.map((p) => ({ ...p, nome_na_planilha: daPlanilha[p.id] ?? null })),
        guardados,
      ),
    [apelidos, pessoas, guardados, daPlanilha],
  );
  const ligacoes = { ...automaticas, ...escolhidas };
  const porSigla = new Map<string, Sigla>(siglas.map((s) => [s.sigla.toLowerCase(), s]));
  const folga = porSigla.get("folga");
  const paraMontar: Record<string, Decisao> = Object.fromEntries(
    Object.entries(decisoes).map(([s, d]) => [
      s,
      d === "folga" && folga
        ? { para: folga.id }
        : d === "criar"
          ? { para: `__criar__${s}` }
          : "vazio",
    ]),
  );
  const montagem = lida ? montarSemana({ lida, siglas, ligacoes, decisoes: paraMontar }) : null;
  const desconhecidasTodas = lida ? montarSemana({ lida, siglas, ligacoes }).desconhecidas : [];

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    setErro(null);
    if (!/\.(csv|xlsx)$/i.test(f.name)) return setErro("O arquivo precisa ser CSV ou XLSX.");
    if (f.size > LIMITE_DO_ARQUIVO)
      return setErro("O arquivo é grande demais para uma escala (o limite é de 2 MB).");
    try {
      const l = lerPlanilhaDaEscala(await lerArquivo(f));
      if (l.dias.every((d) => d.length === 0))
        return setErro(
          "Não encontrei nenhum dia (segunda, terça...) com pessoas no arquivo. Ele está no formato da escala?",
        );
      setLida(l);
      setArquivo(f.name);
      setEscolhidas({});
      setDecisoes({});
    } catch {
      setErro("Não consegui ler o arquivo. Confira se ele é a planilha da escala, em CSV ou XLSX.");
    }
  }

  async function importar() {
    if (!lida || !montagem) return;
    setImportando(true);
    try {
      // As siglas novas ("criar"), antes: o id delas entra na semana.
      const criadas: Record<string, Decisao> = { ...paraMontar };
      for (const [s, d] of Object.entries(decisoes))
        if (d === "criar") {
          const original = desconhecidasTodas.find((x) => x.toLowerCase() === s) ?? s;
          criadas[s] = { para: await criarSigla(original, "#FDE4E2", original) };
        }
      const final = montarSemana({ lida, siglas, ligacoes, decisoes: criadas });
      const novos = Object.fromEntries(
        Object.entries(ligacoes).filter(([a, id]) => guardados[a] !== id),
      );
      await importarSemana(inicio, final.dias, novos, situacao === "publicada" && confirmar);
      toast.success(
        `A semana de ${ddmm(inicio)} a ${ddmm(somar(inicio, 6))} foi importada como rascunho. Confira na montagem e publique.`,
      );
      await Promise.all(
        ["escala-semana", "escala-semanas", "escala-siglas", "apelidos-da-escala"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
      setPasso(1);
      setLida(null);
      setArquivo(null);
      setConfirmar(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImportando(false);
    }
  }

  const semDono = montagem?.semDono ?? [];
  const pendentes = desconhecidasTodas.filter((s) => !decisoes[s.toLowerCase()]);
  const pode =
    passo === 1
      ? !!lida
      : passo === 2
        ? semDono.length === 0
        : passo === 3
          ? pendentes.length === 0
          : true;
  const diaSelecionado = lida?.dias[dia] ?? [];

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      aria-label="Importar a escala"
    >
      <p className="font-bold">Importar a escala</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        A semana pela planilha da supervisão (CSV ou XLSX), no lugar de montar à mão.
      </p>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        {PASSOS.map((p, i) => (
          <li
            key={p}
            aria-current={i + 1 === passo ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${i + 1 === passo ? "bg-primary text-primary-foreground" : i + 1 < passo ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
          >
            {i + 1 < passo ? "✓ " : ""}
            {p}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        {passo === 1 && (
          <div className="space-y-4">
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-primary/60 p-6 text-center hover:bg-secondary/50">
              <span className="text-3xl">📄</span>
              <span className="mt-2 block font-bold">
                {arquivo ?? "Escolha o arquivo da escala"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {lida
                  ? `lido: ${lida.dias.filter((d) => d.length).length} dias, ${apelidos.length} pessoas`
                  : "CSV ou XLSX, no formato da planilha da escala"}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                aria-label="O arquivo da escala"
                onChange={(e) => escolherArquivo(e.target.files?.[0])}
              />
            </label>
            {erro && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {erro}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>A semana (a segunda-feira):</b>
              <input
                type="date"
                aria-label="A segunda-feira da semana"
                value={inicio}
                onChange={(e) => e.target.value && setInicio(segundaDaSemana(e.target.value))}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-bold"
              />
              <span className="text-muted-foreground">
                de {ddmm(inicio)} a {ddmm(somar(inicio, 6))}
                {situacao === "publicada"
                  ? " · já publicada"
                  : situacao === "rascunho"
                    ? " · com um rascunho"
                    : " · vazia"}
              </span>
            </div>
          </div>
        )}

        {passo === 2 && (
          <div>
            <p className="text-sm text-muted-foreground">
              O arquivo usa apelidos. Os reconhecidos já estão ligados; ligue os outros uma vez, e o
              CX Hub lembra nas próximas importações.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {apelidos.map((a) => {
                const k = a.toLowerCase();
                return (
                  <label
                    key={a}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${ligacoes[k] ? "border-border" : "border-[#E0A800]"}`}
                  >
                    <b>“{a}”</b>
                    <select
                      aria-label={`A pessoa de ${a}`}
                      value={ligacoes[k] ?? ""}
                      onChange={(e) => setEscolhidas((x) => ({ ...x, [k]: e.target.value }))}
                      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Escolha a pessoa...</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <p
              className={`mt-3 text-xs font-bold ${semDono.length ? "text-[#B7791F]" : "text-primary"}`}
            >
              {semDono.length
                ? `⚠ Falta ligar: ${semDono.map((n) => `“${n}”`).join(", ")}`
                : "✓ Todas as pessoas ligadas"}
            </p>
          </div>
        )}

        {passo === 3 && (
          <div className="space-y-2">
            {desconhecidasTodas.length === 0 && (lida?.problemas.length ?? 0) === 0 && (
              <p className="text-sm text-primary">✓ Nenhum ponto a resolver.</p>
            )}
            {desconhecidasTodas.map((s) => (
              <div key={s} className="rounded-xl border border-[#E0A800] p-3 text-sm">
                <b>A sigla “{s}” não existe no CX Hub</b>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["criar", `Criar a sigla “${s}”`],
                      ["folga", "Tratar como folga"],
                      ["vazio", "Deixar a hora vazia"],
                    ] as [Escolha, string][]
                  ).map(([k, r]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={decisoes[s.toLowerCase()] === k ? "default" : "outline"}
                      onClick={() => setDecisoes((d) => ({ ...d, [s.toLowerCase()]: k }))}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {lida?.problemas.map((p, i) => (
              <div key={i} className="rounded-xl border border-border p-3 text-sm">
                <b>Um “{p.valor}” no lugar de uma sigla</b>{" "}
                <span className="text-muted-foreground">
                  · {p.apelido}, {DIAS_DA_PLANILHA[p.dia]}, {p.hora}h
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  A hora fica vazia. Se não for isso, corrija no arquivo e importe de novo.
                </p>
              </div>
            ))}
          </div>
        )}

        {passo === 4 && lida && (
          <div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="O dia">
              {DIAS_DA_PLANILHA.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={i === dia}
                  onClick={() => setDia(i)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${i === dia ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {n.slice(0, 3)} {ddmm(somar(inicio, i))} · {lida.dias[i]!.length}
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table
                className="border-separate border-spacing-0.5 text-xs"
                aria-label={`A escala de ${DIAS_DA_PLANILHA[dia]}`}
              >
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: 16 }, (_, k) => (
                      <th key={k} className="text-[10px] font-bold text-muted-foreground">
                        {HORA_INICIAL + k}h
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diaSelecionado.map((l) => (
                    <tr key={l.apelido}>
                      <td className="whitespace-nowrap pr-2 font-bold">
                        {pessoas
                          .find((p) => p.id === ligacoes[l.apelido.toLowerCase()])
                          ?.nome.split(" ")[0] ?? l.apelido}
                      </td>
                      {l.siglas.map((s, k) => {
                        const sg = s ? porSigla.get(s.toLowerCase()) : undefined;
                        return (
                          <td key={k} className="min-w-[42px]">
                            {s && (
                              <span
                                className="flex h-[22px] items-center justify-center rounded-md px-1 text-[10px] font-extrabold text-[#111311]"
                                style={{ background: sg?.cor ?? "#FDE4E2" }}
                                title={sg?.significado ?? s}
                              >
                                {s}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">
              {situacao === "publicada" ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[#00700A]"
                    checked={confirmar}
                    onChange={(e) => setConfirmar(e.target.checked)}
                  />
                  <span>
                    A semana de{" "}
                    <b>
                      {ddmm(inicio)} a {ddmm(somar(inicio, 6))}
                    </b>{" "}
                    já está <b>publicada</b> (o time já a vê). Entendo que a importação substitui os
                    7 dias, e que a semana <b>volta para rascunho</b>, para eu publicar de novo.
                  </span>
                </label>
              ) : (
                <span>
                  A importação <b>substitui</b> os 7 dias da semana de{" "}
                  <b>
                    {ddmm(inicio)} a {ddmm(somar(inicio, 6))}
                  </b>
                  , como rascunho. Depois, confira na montagem e publique.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        {passo > 1 ? (
          <Button variant="outline" onClick={() => setPasso((p) => p - 1)}>
            ← Voltar
          </Button>
        ) : (
          <span />
        )}
        {passo < 4 ? (
          <Button disabled={!pode} onClick={() => setPasso((p) => p + 1)}>
            Seguir →
          </Button>
        ) : (
          <Button
            disabled={importando || (situacao === "publicada" && !confirmar)}
            onClick={importar}
          >
            {importando
              ? "Importando..."
              : situacao === "publicada"
                ? "Importar (a semana volta para rascunho)"
                : "Importar a semana"}
          </Button>
        )}
      </div>
    </section>
  );
}
