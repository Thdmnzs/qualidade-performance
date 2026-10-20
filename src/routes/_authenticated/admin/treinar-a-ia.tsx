import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/useAuth";
import { dataBR, dataHoraBR, hojeEmFortaleza, numeroBR } from "@/lib/format";
import {
  acordoGeral,
  corDoAcordo,
  doMenorAcordo,
  LIMITE_DA_ORIENTACAO,
  MOTIVOS,
  mudancaLegivel,
  percentual,
  PRECISA_DE_ATENCAO,
  textoParaAIA,
  type Motivo,
  type Orientacao,
} from "@/lib/treinar-a-ia";
import {
  lerAvaliacoesParaExemplos,
  lerConcordancia,
  lerOrientacoes,
  lerVersoes,
  marcarExemplar,
  salvarOrientacao,
} from "@/lib/treinar-a-ia-api";

export const Route = createFileRoute("/_authenticated/admin/treinar-a-ia")({
  head: () => ({ meta: [{ title: "Treinar a IA · CX Hub" }] }),
  component: TreinarAIA,
});

const ABAS = [
  ["orientacoes", "As orientações"],
  ["concordancia", "A concordância"],
  ["exemplos", "Os exemplos"],
] as const;
type Aba = (typeof ABAS)[number][0];

/**
 * Treinar a IA (20/10/2026): o ADM e os avaliadores. A IA não é retreinada; o que adapta as sugestões ao
 * estilo do time é o que vai junto de cada pré-avaliação: as orientações de cada critério e até 2 exemplos.
 * A concordância (a sugestão × a decisão do avaliador) mostra onde a orientação precisa melhorar.
 */
function TreinarAIA() {
  const { podeAvaliar, isLoading } = usePermissoes();
  const [aba, setAba] = useState<Aba>("orientacoes");
  const [criterio, setCriterio] = useState<string | null>(null);
  if (isLoading) return null;
  if (!podeAvaliar)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é dos avaliadores e da supervisão." />
    );
  return (
    <div>
      <PageHeader
        titulo="Treinar a IA"
        descricao="A IA não é retreinada: o que adapta as sugestões ao estilo do time é o que vai junto de cada pré-avaliação (as orientações e os exemplos)."
      />
      <div
        className="flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="O treino da IA"
      >
        {ABAS.map(([k, nome]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={`whitespace-nowrap border-b-[3px] px-4 py-2.5 text-sm font-bold ${aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {nome}
          </button>
        ))}
      </div>
      <section className="mt-4" role="tabpanel">
        {aba === "orientacoes" && <AbaOrientacoes criterio={criterio} aoEscolher={setCriterio} />}
        {aba === "concordancia" && (
          <AbaConcordancia
            aoAjustar={(id) => {
              setCriterio(id);
              setAba("orientacoes");
            }}
          />
        )}
        {aba === "exemplos" && <AbaExemplos />}
      </section>
    </div>
  );
}

// ---------- As orientações ----------
function AbaOrientacoes({
  criterio,
  aoEscolher,
}: {
  criterio: string | null;
  aoEscolher: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["orientacoes-da-ia"],
    queryFn: lerOrientacoes,
  });
  const atual = lista.find((c) => c.id === criterio) ?? lista[0];
  const [texto, setTexto] = useState({ sim: "", medio: "", nao: "", exemplo: "" });
  const [salvando, setSalvando] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  useEffect(() => {
    if (atual)
      setTexto({
        sim: atual.sim ?? "",
        medio: atual.medio ?? "",
        nao: atual.nao ?? "",
        exemplo: atual.exemplo ?? "",
      });
    setVerVersoes(false);
  }, [atual?.id, atual?.em]); // eslint-disable-line react-hooks/exhaustive-deps -- troca de critério, ou uma versão nova
  const { data: versoes = [] } = useQuery({
    queryKey: ["versoes-da-orientacao", atual?.id],
    queryFn: () => lerVersoes(atual!.id),
    enabled: verVersoes && !!atual,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a ficha...</p>;
  if (!atual)
    return (
      <EmptyState titulo="Sem critérios" texto="A ficha de avaliação não tem critérios ativos." />
    );
  const mudou = (["sim", "medio", "nao", "exemplo"] as const).some(
    (k) => texto[k].trim() !== (atual[k] ?? ""),
  );
  async function salvar() {
    setSalvando(true);
    try {
      await salvarOrientacao(atual!.id, texto);
      toast.success("Orientação salva. A próxima pré-avaliação já usa ela.");
      await qc.invalidateQueries({ queryKey: ["orientacoes-da-ia"] });
      await qc.invalidateQueries({ queryKey: ["versoes-da-orientacao", atual!.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  const campos: [keyof typeof texto, string, string][] = [
    ["sim", "Conta como SIM", "text-[#157a3a] dark:text-[#3ee07a]"],
    ...(atual.permite_medio
      ? ([["medio", "Conta como MÉDIO", "text-[#b7791f]"]] as [
          keyof typeof texto,
          string,
          string,
        ][])
      : []),
    ["nao", "Conta como NÃO", "text-destructive"],
    ["exemplo", "Um exemplo (opcional)", "text-muted-foreground"],
  ];
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Em cada critério, o que conta como <b>sim</b>, <b>médio</b> e <b>não</b>, com um exemplo. A
        IA lê isso a cada pré-avaliação.
      </p>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <nav className="rounded-2xl border border-border bg-card p-2" aria-label="Os critérios">
          {lista.map((c, i) => (
            <div key={c.id}>
              {(i === 0 || lista[i - 1]!.grupo !== c.grupo) && (
                <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {c.grupo}
                </p>
              )}
              <button
                type="button"
                onClick={() => aoEscolher(c.id)}
                aria-current={c.id === atual.id}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-[13px] ${c.id === atual.id ? "bg-primary/10 font-bold" : "hover:bg-secondary"}`}
              >
                {c.ordem}. {c.descricao} {c.sim || c.nao ? "✍️" : ""}
              </button>
            </div>
          ))}
        </nav>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {atual.grupo}
          </p>
          <p className="mt-1 text-lg font-bold">
            {atual.ordem}. {atual.descricao}
          </p>
          {atual.autor && (
            <p className="mt-1 text-xs text-muted-foreground">
              Escrita por <b>{atual.autor}</b>
              {atual.em ? ` em ${dataHoraBR(atual.em)}` : ""} · {atual.versoes}{" "}
              {atual.versoes === 1 ? "versão" : "versões"}
            </p>
          )}
          <div className="mt-4 grid gap-3">
            {campos.map(([k, rotulo, cor]) => (
              <label key={k} className="block text-sm font-bold">
                <span className={cor}>{rotulo}</span>
                <textarea
                  value={texto[k]}
                  onChange={(e) => setTexto({ ...texto, [k]: e.target.value })}
                  maxLength={LIMITE_DA_ORIENTACAO}
                  rows={2}
                  placeholder={
                    k === "exemplo"
                      ? "Um trecho de conversa e a resposta certa..."
                      : "Em uma ou duas frases..."
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal"
                />
              </label>
            ))}
          </div>
          {!atual.permite_medio && (
            <p className="mt-2 text-xs text-muted-foreground">
              Este critério não aceita Médio (pela ficha), então só o Sim e o Não.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVerVersoes((v) => !v)}
              disabled={atual.versoes === 0}
            >
              <History className="size-4" /> {verVersoes ? "Esconder as versões" : "Ver as versões"}
            </Button>
            <Button onClick={salvar} disabled={!mudou || salvando}>
              {salvando ? "Salvando..." : "Salvar a orientação"}
            </Button>
          </div>
          {verVersoes && (
            <ul className="mt-3 space-y-2" aria-label="As versões">
              {versoes.map((v, i) => (
                <li key={v.em} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <b>{v.autor ?? "—"}</b> · {dataHoraBR(v.em)} {i === 0 ? "· a vigente" : ""}
                    </span>
                    {i > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTexto({
                            sim: v.sim ?? "",
                            medio: v.medio ?? "",
                            nao: v.nao ?? "",
                            exemplo: v.exemplo ?? "",
                          })
                        }
                      >
                        Usar esta versão
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {textoParaAIA(
                      {
                        sim: v.sim ?? "",
                        medio: v.medio ?? "",
                        nao: v.nao ?? "",
                        exemplo: v.exemplo ?? "",
                      },
                      atual.permite_medio,
                    ) || "(vazia)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 text-xs font-bold text-muted-foreground">
            O que a IA recebe, junto da ficha:
          </p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2.5 font-mono text-xs">
            {textoParaAIA(texto, atual.permite_medio) ||
              "(sem orientação: a IA avalia só pela pergunta)"}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---------- A concordância ----------
const PERIODOS = [
  ["30", "Os últimos 30 dias"],
  ["90", "Os últimos 90 dias"],
] as const;
function AbaConcordancia({ aoAjustar }: { aoAjustar: (id: string) => void }) {
  const [dias, setDias] = useState<"30" | "90">("30");
  const ate = hojeEmFortaleza();
  const de = new Date(new Date(`${ate}T12:00:00Z`).getTime() - (Number(dias) - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["concordancia-da-ia", de, ate],
    queryFn: () => lerConcordancia(de, ate),
  });
  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Calculando a concordância...</p>;
  const ordenados = doMenorAcordo(data.criterios);
  const geral = acordoGeral(data.criterios);
  const pior = ordenados.find((c) => percentual(c) != null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Em cada critério, quantas vezes a sugestão da IA foi <b>aceita</b> pelo avaliador.
        </p>
        <select
          value={dias}
          onChange={(e) => setDias(e.target.value as "30" | "90")}
          aria-label="O período"
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-bold"
        >
          {PERIODOS.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Acordo geral</p>
          <p className="text-3xl font-bold">{geral == null ? "—" : `${geral}%`}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Avaliações pré-avaliadas</p>
          <p className="text-3xl font-bold">{data.pre_avaliadas}</p>
          <p className="text-[11px] text-muted-foreground">
            de {data.avaliacoes} avaliações no período
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Critério que mais precisa de atenção</p>
          <p className="text-base font-bold">{pior ? `${pior.ordem}. ${pior.descricao}` : "—"}</p>
          {pior && (
            <p className="text-[11px] text-muted-foreground">{percentual(pior)}% de acordo</p>
          )}
        </div>
      </div>
      {data.criterios.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda não há avaliações pré-avaliadas neste período. A concordância aparece conforme os
          avaliadores usam a pré-avaliação.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-3">Critério</th>
                <th className="p-3">Acordo</th>
                <th className="p-3">A mudança mais comum</th>
                <th className="p-3">Os porquês</th>
                <th className="p-3">Sugestões</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {ordenados.map((c) => {
                const p = percentual(c);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3">
                      <p className="font-bold">
                        {c.ordem}. {c.descricao}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.grupo} · {c.tem_orientacao ? "✍️ tem orientação" : "sem orientação"}
                      </p>
                    </td>
                    <td className="w-48 p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full"
                            style={{ width: `${p ?? 0}%`, background: corDoAcordo(p) }}
                          />
                        </div>
                        <b>{p == null ? "—" : `${p}%`}</b>
                      </div>
                    </td>
                    <td className="p-3">{mudancaLegivel(c.mudanca)}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {c.motivos
                        ? Object.entries(c.motivos)
                            .map(([m, n]) => `${MOTIVOS[m as Motivo] ?? m} (${n})`)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td className="p-3">{c.total}</td>
                    <td className="p-3 text-right">
                      {p != null && p < PRECISA_DE_ATENCAO && (
                        <Button variant="outline" size="sm" onClick={() => aoAjustar(c.id)}>
                          Ajustar a orientação →
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Os exemplos ----------
function AbaExemplos() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["avaliacoes-para-exemplos"],
    queryFn: lerAvaliacoesParaExemplos,
  });
  const [marcando, setMarcando] = useState<string | null>(null);
  async function alternar(id: string, exemplar: boolean, pessoa: string) {
    setMarcando(id);
    try {
      await marcarExemplar(id, exemplar);
      toast.success(
        exemplar
          ? `A avaliação de ${pessoa} virou um exemplo.`
          : `A avaliação de ${pessoa} saiu dos exemplos.`,
      );
      await qc.invalidateQueries({ queryKey: ["avaliacoes-para-exemplos"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMarcando(null);
    }
  }
  if (isLoading)
    return <p className="text-sm text-muted-foreground">Carregando as avaliações...</p>;
  const marcados = lista.filter((a) => a.exemplar).length;
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Marque como <b>exemplares</b> as avaliações bem feitas, com o comentário no tom certo. A
        cada pré-avaliação, vão junto <b>até 2 exemplos</b> do mesmo processo (ou assunto): as
        respostas, as observações e o comentário, <b>mascarados</b> (sem CPF, e-mail ou telefone).
        Nunca vai junto um exemplo da própria pessoa avaliada.
      </p>
      <div className="mb-3 rounded-xl bg-primary/10 px-4 py-3 text-sm">
        <b>O custo:</b> cada exemplo aumenta o tamanho do pedido. Com 2 exemplos, cada pré-avaliação
        fica um pouco mais cara (ainda centavos). É a peça mais forte para passar o{" "}
        <b>tom dos comentários</b>.
      </div>
      {lista.length === 0 ? (
        <EmptyState
          titulo="Nenhuma avaliação ainda"
          texto="As avaliações registradas aparecem aqui, para marcar como exemplo."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-12 p-3" />
                <th className="p-3">A avaliação</th>
                <th className="p-3">O processo</th>
                <th className="p-3">O comentário</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <button
                      type="button"
                      aria-pressed={a.exemplar}
                      aria-label={
                        a.exemplar
                          ? `Tirar a avaliação de ${a.pessoa} dos exemplos`
                          : `Marcar a avaliação de ${a.pessoa} como exemplar`
                      }
                      disabled={marcando === a.id}
                      onClick={() => alternar(a.id, !a.exemplar, a.pessoa)}
                      className={
                        a.exemplar
                          ? "text-[#e0a800]"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    >
                      <Star className={`size-5 ${a.exemplar ? "fill-current" : ""}`} />
                    </button>
                  </td>
                  <td className="p-3">
                    <b>{a.pessoa}</b>
                    <p className="text-[11px] text-muted-foreground">
                      {dataBR(a.data)} · nota {a.nota == null ? "—" : numeroBR(Number(a.nota))}
                    </p>
                  </td>
                  <td className="p-3">{a.processo ?? a.assunto ?? "—"}</td>
                  <td className="p-3 text-[13px]">
                    {a.comentario || (
                      <span className="text-muted-foreground">(sem comentário)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {marcados === 1 ? "1 exemplar marcado." : `${marcados} exemplares marcados.`}
      </p>
    </div>
  );
}

export type { Orientacao };
