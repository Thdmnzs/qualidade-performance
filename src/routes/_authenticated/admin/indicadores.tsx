import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FiltroDoDia } from "@/components/indicadores/filtro-do-dia";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dataBR, dataHoraBR, hojeEmFortaleza } from "@/lib/format";
import { ontemDe } from "@/lib/indicadores-do-dia";
import { lerPlanilhaAgoraFn } from "@/lib/indicadores.functions";
import { dataDaPlanilha, PLANILHA_DOS_INDICADORES } from "@/lib/planilha-indicadores";
import {
  gruposDaTabela,
  linhasDosDados,
  tabelaDaAnalise,
  type Grupo,
} from "@/lib/tabela-da-planilha";

export const Route = createFileRoute("/_authenticated/admin/indicadores")({
  head: () => ({ meta: [{ title: "Indicadores · CX Hub" }] }),
  component: IndicadoresDaSupervisao,
});

type Copia = { valores: string[][]; dia: string | null; lida_em: string };
type Leitura = {
  id: string;
  lida_em: string;
  origem: string;
  gravadas: number;
  ignoradas: { nome: string; linhas: number }[];
  erro: string | null;
};

/**
 * Os indicadores na visão da supervisão (16/10/2026): a CÓPIA da planilha, arrumada no layout do CX Hub.
 * "Ontem" copia as linhas do dia anterior da aba Dados; "A quinzena", a aba Análise (no período escolhido
 * na própria planilha). Nada é calculado: os valores e a formatação são os da planilha.
 */
function IndicadoresDaSupervisao() {
  const { isAdmin, isLoading } = usePermissoes();
  const qc = useQueryClient();
  const lerAgora = useServerFn(lerPlanilhaAgoraFn);
  const [aba, setAba] = useState<"dia" | "quinzena">("dia");
  // O dia escolhido (20/10/2026; o padrão é ontem), com o mesmo filtro dos colaboradores.
  const ontem = ontemDe(hojeEmFortaleza());
  const [dia, setDia] = useState(ontem);
  const [membro, setMembro] = useState("");
  const [lendo, setLendo] = useState(false);
  const { data: copia } = useQuery({
    queryKey: ["copia-da-planilha"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("copia_da_planilha");
      if (error) throw error;
      return (data ?? {}) as { dados?: Copia; analise?: Copia };
    },
  });
  const { data: leituras = [] } = useQuery({
    queryKey: ["leituras-da-planilha"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leituras_da_planilha_recentes");
      if (error) throw error;
      return (data ?? []) as Leitura[];
    },
  });
  if (isLoading) return null;
  if (!isAdmin)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />
    );

  async function ler() {
    setLendo(true);
    try {
      const r = await lerAgora();
      if (r.ok)
        toast.success(
          `A planilha foi lida: ${r.gravadas} ${r.gravadas === 1 ? "linha gravada" : "linhas gravadas"}.`,
        );
      else toast.error(r.erro);
      await qc.invalidateQueries({ queryKey: ["copia-da-planilha"] });
      await qc.invalidateQueries({ queryKey: ["leituras-da-planilha"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendo(false);
    }
  }
  const ultima = leituras[0];
  const dados = linhasDosDados(copia?.dados?.valores ?? []);
  const analise = tabelaDaAnalise(copia?.analise?.valores ?? []);
  const daQuinzena = aba === "quinzena";
  const cabecalho = daQuinzena ? analise.cabecalho : dados.cabecalho;
  const posMembro = cabecalho.findIndex((c) => c.trim().toLowerCase() === "membro");
  // As linhas do dia escolhido, da cópia da aba Dados inteira (o "dia" da cópia é o último que a planilha tem).
  const posData = dados.cabecalho.findIndex((c) => c.trim().toLowerCase() === "data");
  const linhasDoDia = dados.linhas.filter((l) => dataDaPlanilha(l[posData]) === dia);
  const ultimoDia = copia?.dados?.dia ?? null;
  const todas = daQuinzena ? analise.linhas : linhasDoDia;
  const linhas = todas.filter((l) => !membro || l[posMembro] === membro);
  const nomes = [
    ...new Set(
      [...dados.linhas, ...analise.linhas].map((l, i) =>
        i < dados.linhas.length
          ? l[dados.cabecalho.findIndex((c) => c.trim().toLowerCase() === "membro")]
          : l[0],
      ),
    ),
  ]
    .filter((n): n is string => !!n && n !== "TIME")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pessoas = linhas.filter((l) => l[posMembro] !== "TIME").length;
  return (
    <div>
      <PageHeader
        titulo="Indicadores"
        descricao={
          ultima
            ? `📥 Lida ${dataHoraBR(ultima.lida_em)}, da planilha "CX - Métricas individuais do time" · a próxima leitura automática é às 10h`
            : "📥 A planilha ainda não foi lida. Clique em “Ler agora”."
        }
        acao={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={ler} disabled={lendo}>
              <RefreshCw className={`size-4 ${lendo ? "animate-spin" : ""}`} />{" "}
              {lendo ? "Lendo..." : "Ler agora"}
            </Button>
            <Button variant="outline" asChild>
              <a href={PLANILHA_DOS_INDICADORES.url} target="_blank" rel="noopener noreferrer">
                Abrir a planilha <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        }
      />
      {ultima?.erro && (
        <div
          className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <b>⚠️ A última leitura falhou</b> ({dataHoraBR(ultima.lida_em)}): {ultima.erro}
        </div>
      )}
      {ultima && !ultima.erro && ultima.ignoradas.length > 0 && (
        <NomesSemDono ignoradas={ultima.ignoradas} aoLigar={ler} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border border-border p-1 text-sm font-bold"
          role="tablist"
          aria-label="O período"
        >
          {(
            [
              ["dia", "O dia (aba Dados)"],
              ["quinzena", "A quinzena (aba Análise)"],
            ] as const
          ).map(([k, rotulo]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className={`rounded-md px-3 py-1.5 ${aba === k ? "bg-primary text-primary-foreground" : ""}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <select
          aria-label="O membro"
          value={membro}
          onChange={(e) => setMembro(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-bold"
        >
          <option value="">Todo o time</option>
          <option value="TIME">Só o TIME (o total)</option>
          {nomes.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
          {linhas.some((l) => l[posMembro] === "TIME") ? " e o TIME" : ""}
        </span>
      </div>
      {!daQuinzena && (
        <div className="mt-3">
          <FiltroDoDia
            dia={dia}
            ontem={ontem}
            aoMudar={setDia}
            semDados={dados.cabecalho.length > 0 && linhasDoDia.length === 0}
          />
        </div>
      )}
      {daQuinzena && analise.info.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-secondary px-4 py-2.5 text-sm">
          {analise.info.map(([k, v]) => (
            <span key={k}>
              <span className="text-muted-foreground">{k}:</span> <b>{v}</b>
            </span>
          ))}
          <span className="text-muted-foreground">
            · copiado da aba Análise (o período se escolhe na planilha)
          </span>
        </div>
      )}
      <div className="mt-3 max-h-[calc(100vh-15rem)] min-h-64 overflow-auto rounded-2xl border border-border bg-card">
        {cabecalho.length === 0 || linhas.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {cabecalho.length === 0 ? (
              "Ainda não há uma cópia da planilha. Clique em “Ler agora”."
            ) : !daQuinzena && linhasDoDia.length === 0 ? (
              // Um dia que a planilha ainda não tem (ou que não tem linhas), com a explicação.
              ultimoDia && dia > ultimoDia ? (
                <>
                  A planilha ainda não tem o dia <b>{dataBR(dia)}</b>. A última data coletada é{" "}
                  <b>{dataBR(ultimoDia)}</b>.{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-1"
                    onClick={() => setDia(ultimoDia)}
                  >
                    Ver {dataBR(ultimoDia).slice(0, 5)}
                  </Button>
                </>
              ) : (
                <>
                  A planilha não tem linhas no dia <b>{dataBR(dia)}</b>.
                </>
              )
            ) : (
              "Nenhuma linha para esse filtro."
            )}
          </p>
        ) : (
          <TabelaDaPlanilha
            grupos={gruposDaTabela(cabecalho)}
            linhas={linhas}
            posMembro={posMembro}
            fixas={posMembro + 1}
          />
        )}
      </div>
    </div>
  );
}

/** A tabela: as linhas alternadas, os cabeçalhos agrupados, as primeiras colunas fixas e o TIME em destaque. */
function TabelaDaPlanilha({
  grupos,
  linhas,
  posMembro,
  fixas,
}: {
  grupos: Grupo[];
  linhas: string[][];
  posMembro: number;
  fixas: number;
}) {
  const colunas = grupos.flatMap((g) =>
    g.colunas.map((c, k) => ({
      ...c,
      inicio: k === 0 && g.nome !== "",
      aguardandoGrupo: !!g.aguardando,
    })),
  );
  const LARGURA = [104, 132];
  const esquerda = (i: number) => LARGURA.slice(0, i).reduce((a, b) => a + b, 0);
  const fixa = (i: number) =>
    i < fixas ? `sticky z-[1] ${i === fixas - 1 ? "border-r border-border font-bold" : ""}` : "";
  let par = 0;
  return (
    <table className="min-w-full border-separate border-spacing-0 text-[13px]">
      <thead>
        <tr>
          {grupos.map((g, i) => (
            <th
              key={`${g.nome}-${i}`}
              colSpan={g.colunas.length}
              className={`sticky top-0 z-[3] h-[34px] border-l-2 border-card px-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] ${g.aguardando ? "bg-primary/15" : "bg-muted"} ${i === 0 ? "left-0 z-[5]" : ""}`}
            >
              {g.nome}
              {g.aguardando && (
                <span
                  className="ml-1.5 rounded-full bg-card px-1.5 py-px align-[1px] text-[9.5px] normal-case tracking-normal text-primary"
                  title="As duas colunas aparecem preenchidas quando a planilha as tiver (o percentil calculado pelo Intercom)."
                >
                  aguardando a planilha
                </span>
              )}
            </th>
          ))}
        </tr>
        <tr>
          {colunas.map((c, i) => (
            <th
              key={`${c.nome}-${i}`}
              title={c.nome}
              style={i < fixas ? { left: esquerda(i), minWidth: LARGURA[i] } : undefined}
              className={`sticky top-[34px] z-[2] whitespace-nowrap border-b border-border bg-secondary px-3 py-2 text-[11.5px] font-bold text-muted-foreground ${i < fixas ? "z-[4] text-left" : "text-right"} ${c.inicio ? "border-l-2 border-l-card" : ""}`}
            >
              {c.curto}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, n) => {
          const ehTime = l[posMembro] === "TIME";
          const fundo = ehTime
            ? "bg-primary/10 font-bold"
            : par++ % 2
              ? "bg-secondary/70"
              : "bg-card";
          return (
            <tr key={n} className="group">
              {colunas.map((c, i) => {
                const v = c.indice === null ? "" : (l[c.indice] ?? "");
                return (
                  <td
                    key={i}
                    style={i < fixas ? { left: esquerda(i), minWidth: LARGURA[i] } : undefined}
                    className={`whitespace-nowrap px-3 py-[7px] tabular-nums group-hover:bg-accent ${fundo} ${fixa(i)} ${i < fixas ? "text-left" : "text-right"} ${c.inicio ? "border-l-2 border-l-border" : ""} ${v === "" ? "text-muted-foreground" : ""} ${ehTime && i === fixas - 1 ? "text-primary" : ""} ${c.aguardandoGrupo ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_112_10/5%)_6px_12px)]" : ""}`}
                  >
                    {v === "" ? "—" : v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Os nomes da planilha que não estão ligados a ninguém (a última leitura os ignorou): ligar a uma pessoa. */
function NomesSemDono({
  ignoradas,
  aoLigar,
}: {
  ignoradas: { nome: string; linhas: number }[];
  aoLigar: () => void;
}) {
  const qc = useQueryClient();
  const sem = ignoradas.filter((i) => !i.nome.includes("(números inválidos"));
  const invalidos = ignoradas.filter((i) => i.nome.includes("(números inválidos"));
  const { data: pessoas = [] } = useQuery({
    queryKey: ["pessoas-para-a-planilha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, nome, nome_na_planilha")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  async function ligar(nome: string) {
    const id = escolha[nome];
    if (!id) return;
    const { error } = await supabase.rpc("associar_nome_da_planilha", {
      _employee_id: id,
      _nome: nome,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`“${nome}” ligado. Lendo a planilha de novo...`);
    await qc.invalidateQueries({ queryKey: ["pessoas-para-a-planilha"] });
    aoLigar();
  }
  return (
    <div
      className="mb-3 rounded-xl border border-warning/50 bg-warning/15 px-4 py-3 text-sm"
      role="status"
    >
      {sem.length > 0 && (
        <>
          <p className="font-bold">
            ⚠️{" "}
            {sem.length === 1
              ? "Um nome da planilha não está ligado"
              : `${sem.length} nomes da planilha não estão ligados`}{" "}
            a ninguém do cadastro
          </p>
          <p className="text-xs text-muted-foreground">
            As linhas desses nomes não entram nos indicadores dos colaboradores até serem ligadas.
          </p>
          {sem.map((i) => (
            <div key={i.nome} className="mt-2 flex flex-wrap items-center gap-2">
              <b>“{i.nome}”</b>{" "}
              <span className="text-xs text-muted-foreground">
                ({i.linhas} {i.linhas === 1 ? "linha" : "linhas"})
              </span>
              <select
                aria-label={`A pessoa de ${i.nome}`}
                value={escolha[i.nome] ?? ""}
                onChange={(e) => setEscolha({ ...escolha, [i.nome]: e.target.value })}
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
              >
                <option value="">Escolha a pessoa...</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.nome_na_planilha ? ` (hoje: ${p.nome_na_planilha})` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!escolha[i.nome]} onClick={() => ligar(i.nome)}>
                Ligar
              </Button>
            </div>
          ))}
        </>
      )}
      {invalidos.length > 0 && (
        <p className="mt-2 text-xs">
          <b>Linhas com números inválidos</b> (ignoradas): {invalidos.map((i) => i.nome).join("; ")}
          . Vale conferir na planilha.
        </p>
      )}
    </div>
  );
}
