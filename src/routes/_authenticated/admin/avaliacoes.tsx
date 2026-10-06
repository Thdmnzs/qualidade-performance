import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { usePermissoes } from "@/hooks/useAuth";
import { fetchAvaliacoesGestao, fetchAvaliaveis, fetchQuinzenas } from "@/lib/queries";
import { AvaliacoesPorColaborador } from "@/components/avaliacoes-por-colaborador";
import { ContatoIntercom } from "@/components/contato-intercom";
import { ProcessoRelacionado, type ProcessoEscolhido } from "@/components/processo-relacionado";
import { linkSeguroDoIntercom } from "@/lib/intercom";
import { hojeEmFortaleza, nomeQuinzena, numeroBR } from "@/lib/format";
import {
  aceitaAvaliacoes,
  quinzenaPadraoParaAvaliar,
  quinzenasEmAndamento,
  ROTULO_STATUS_QUINZENA,
  type StatusQuinzena,
} from "@/lib/quinzena";
import {
  AVALIACOES_PREVISTAS,
  avisoDeQuantidade,
  calcularNota,
  ROTULO_TIPO,
  type Resposta,
} from "@/lib/avaliacao";

export const Route = createFileRoute("/_authenticated/admin/avaliacoes")({
  head: () => ({
    meta: [
      { title: "Avaliações de qualidade · QualityHUB" },
      {
        name: "description",
        content: "Formulário de qualidade com 14 critérios e registro de quiz por quinzena.",
      },
    ],
  }),
  component: Avaliacoes,
});

function Avaliacoes() {
  const { podeAvaliar } = usePermissoes();
  const qc = useQueryClient();

  const [employeeId, setEmployeeId] = useState("");
  const [fortnightId, setFortnightId] = useState("");
  const [tipo, setTipo] = useState<"interacao" | "ticket_n2">("interacao");
  const [assunto, setAssunto] = useState("");
  const [dataContato, setDataContato] = useState("");
  const [link, setLink] = useState("");
  // Muda a cada avaliação registrada, para o painel do contato recomeçar.
  const [rodada, setRodada] = useState(0);
  // Processo da Flukepédia usado (opcional) e o texto do contato para sugerir.
  const [processo, setProcesso] = useState<ProcessoEscolhido | null>(null);
  const [textoDoContato, setTextoDoContato] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});

  // O banco devolve só quem este usuário pode avaliar: nunca ele mesmo; o
  // avaliador recebe só colaboradores; o ADM, colaboradores e avaliadores.
  const { data: avaliaveis = [] } = useQuery({
    queryKey: ["avaliaveis"],
    queryFn: fetchAvaliaveis,
    enabled: podeAvaliar,
  });
  const { data: quinzenas = [] } = useQuery({
    queryKey: ["quinzenas"],
    queryFn: fetchQuinzenas,
    enabled: podeAvaliar,
  });
  // Pré-seleciona a quinzena mais recente aberta (menos risco de avaliar na quinzena errada).
  useEffect(() => {
    if (!fortnightId) {
      const padrao = quinzenaPadraoParaAvaliar(quinzenas);
      if (padrao) setFortnightId(padrao.id);
    }
  }, [quinzenas, fortnightId]);
  const { data: criterios = [] } = useQuery({
    queryKey: ["criterios"],
    enabled: podeAvaliar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_criteria")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: avaliacoes = [] } = useQuery({
    // Todas as quinzenas: cada bloco filtra a sua.
    queryKey: ["avaliacoes-gestao"],
    queryFn: () => fetchAvaliacoesGestao(),
    enabled: podeAvaliar,
  });
  const { data: quiz = [] } = useQuery({
    queryKey: ["quiz", fortnightId],
    enabled: podeAvaliar && !!fortnightId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_results")
        .select("*")
        .eq("fortnight_id", fortnightId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mesma regra do banco: vale a maior versão com critérios ativos.
  const versao = criterios.reduce((max, c) => Math.max(max, c.versao), 0) || 1;
  const ficha = useMemo(() => criterios.filter((c) => c.versao === versao), [criterios, versao]);

  // "Avaliações registradas" mostra só as quinzenas não fechadas (apenas exibição).
  const emAndamento = useMemo(() => quinzenasEmAndamento(quinzenas), [quinzenas]);
  const avaliacoesEmAndamento = useMemo(() => {
    const ids = new Set(emAndamento.map((q) => q.id));
    return avaliacoes.filter((a) => ids.has(a.fortnight_id));
  }, [avaliacoes, emAndamento]);
  // Só prévia: a nota oficial é calculada pelo banco ao registrar.
  const nota = useMemo(() => calcularNota(ficha, respostas), [ficha, respostas]);
  const completa = ficha.length > 0 && ficha.every((c) => respostas[c.id]);

  const { data: totais } = useQuery({
    queryKey: ["avaliacoes-totais", employeeId, fortnightId],
    enabled: podeAvaliar && !!employeeId && !!fortnightId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("tipo")
        .eq("employee_id", employeeId)
        .eq("fortnight_id", fortnightId)
        .eq("anulada", false);
      if (error) throw error;
      return {
        interacao: data.filter((a) => a.tipo === "interacao").length,
        ticket_n2: data.filter((a) => a.tipo === "ticket_n2").length,
      };
    },
  });

  const salvar = useMutation({
    // O banco valida, calcula a nota e grava avaliação + itens numa transação.
    mutationFn: async () => {
      // Só links do Intercom: um endereço digitado à mão nunca vira link para fora.
      if (link.trim() && !linkSeguroDoIntercom(link)) {
        throw new Error(
          "O link da conversa precisa ser do Intercom (https://app.intercom.com/...).",
        );
      }
      const { data, error } = await supabase.rpc("registrar_avaliacao", {
        _employee_id: employeeId,
        _fortnight_id: fortnightId,
        _tipo: tipo,
        _assunto: assunto,
        _data_contato: dataContato,
        _link_conversa: link,
        _comentarios: comentarios,
        _processo_id: processo?.id ?? null,
        _respostas: ficha.map((c) => ({
          criterio_id: c.id,
          resposta: respostas[c.id],
          observacao: respostas[c.id] === "nao" ? (observacoes[c.id] ?? "") : null,
        })),
      });
      if (error) throw new Error(error.message);
      const registrada = data?.[0];
      if (!registrada)
        throw new Error(
          "O banco não confirmou o registro. Confira a lista antes de tentar de novo.",
        );
      return registrada;
    },
    onSuccess: (registrada) => {
      toast.success(`Avaliação registrada. Nota: ${numeroBR(Number(registrada.nota))}.`);
      setRespostas({});
      setObservacoes({});
      setAssunto("");
      setRodada((r) => r + 1);
      setProcesso(null);
      setTextoDoContato("");
      setDataContato("");
      setLink("");
      setComentarios("");
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-totais"] });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const marcarQuiz = useMutation({
    // O banco confere quem pode registrar, recusa quinzena fechada, grava quem
    // registrou e audita (antes, a tela gravava direto e informava o responsável).
    mutationFn: async ({ emp, entregue }: { emp: string; entregue: boolean }) => {
      const { error } = await supabase.rpc("registrar_quiz", {
        _employee_id: emp,
        _fortnight_id: fortnightId,
        _entregue: entregue,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", fortnightId] }),
    onError: (e: Error) => toast.error(`Não foi possível registrar o quiz: ${e.message}`),
  });

  if (!podeAvaliar)
    return (
      <EmptyState
        titulo="Acesso restrito"
        texto="Área exclusiva de avaliadores e administradores."
      />
    );

  const select = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div>
      <PageHeader
        titulo="Avaliações"
        descricao={`Ficha de qualidade versão ${versao} · nota = 100 − descontos`}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Estas checagens só antecipam o que o banco valida de qualquer forma.
          if (!completa) {
            toast.error("Responda todos os critérios. Fichas em branco não são válidas.");
            return;
          }
          const semFeedback = ficha.find(
            (c) => respostas[c.id] === "nao" && !observacoes[c.id]?.trim(),
          );
          if (semFeedback) {
            toast.error(
              `Justifique o critério "${semFeedback.ordem}. ${semFeedback.descricao}" marcado como Não.`,
            );
            return;
          }
          // Avisar, mas permitir (regra de negócio): acima do previsto, pede confirmação.
          const aviso = totais ? avisoDeQuantidade(tipo, totais[tipo]) : null;
          if (aviso && !confirm(`${aviso}\n\nRegistrar mesmo assim?`)) return;
          salvar.mutate();
        }}
        className="mb-8 space-y-5 rounded-2xl border border-border bg-card p-5"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="q">Quinzena</Label>
            <select
              id="q"
              required
              className={select}
              value={fortnightId}
              onChange={(e) => setFortnightId(e.target.value)}
            >
              <option value="">Selecione</option>
              {quinzenas.map((q) => (
                <option key={q.id} value={q.id} disabled={!aceitaAvaliacoes(q)}>
                  {nomeQuinzena(q)}{" "}
                  {aceitaAvaliacoes(q)
                    ? ""
                    : `(${ROTULO_STATUS_QUINZENA[q.status as StatusQuinzena]?.toLowerCase()})`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c">Colaborador</Label>
            <select
              id="c"
              required
              className={select}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Selecione</option>
              {avaliaveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.perfil === "avaliador" ? " (avaliador)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t">Tipo</Label>
            <select
              id="t"
              className={select}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
            >
              <option value="interacao">Interação</option>
              <option value="ticket_n2">Ticket N2</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="as">Assunto</Label>
            <Input
              id="as"
              required
              maxLength={200}
              placeholder="Ex.: Portabilidade"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dc">Data do contato</Label>
            <Input
              id="dc"
              type="date"
              required
              max={hojeEmFortaleza()}
              value={dataContato}
              onChange={(e) => setDataContato(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lk">Link da conversa</Label>
            <Input id="lk" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        </div>

        {/* Lado a lado: o avaliador lê a conversa e marca a ficha ao mesmo tempo.
            Em telas pequenas, um embaixo do outro. */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* Coluna fixa limitada à altura da tela, rolando por dentro: assim a
              classificação do atendimento, abaixo da conversa, nunca fica escondida. */}
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            <ContatoIntercom
              employeeId={employeeId}
              fortnightId={fortnightId}
              tipo={tipo}
              limparQuando={rodada}
              onContato={(c) => {
                // Preenche o que veio do Intercom; o avaliador pode ajustar o assunto.
                setLink(c.link);
                if (c.dataContato) setDataContato(c.dataContato);
                if (c.assunto) setAssunto(c.assunto);
                // Contato novo: sugestões novas, e nenhum processo marcado.
                setTextoDoContato(c.textoDoContato);
                setProcesso(null);
              }}
            />
            <ProcessoRelacionado
              consulta={textoDoContato || assunto}
              escolhido={processo}
              onEscolher={setProcesso}
            />
          </div>
          <div className="space-y-5">
            {totais && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Nesta quinzena:{" "}
                {(
                  Object.keys(AVALIACOES_PREVISTAS) as Array<keyof typeof AVALIACOES_PREVISTAS>
                ).map((t, i) => {
                  const acima = totais[t] >= AVALIACOES_PREVISTAS[t];
                  return (
                    <span key={t}>
                      {i > 0 && " · "}
                      <span className={acima ? "font-medium text-warning" : "text-foreground"}>
                        {ROTULO_TIPO[t]} {totais[t]}/{AVALIACOES_PREVISTAS[t]}
                      </span>
                    </span>
                  );
                })}
              </p>
            )}

            <div className="divide-y divide-border rounded-xl border border-border">
              {ficha.map((c) => (
                <div key={c.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {c.ordem}. {c.descricao}
                        {c.gravidade === "gravissimo" && (
                          <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                            gravíssimo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.grupo} · peso {numeroBR(Number(c.peso), 0)}
                        {c.permite_medio ? ` · médio ${numeroBR(Number(c.peso_medio), 0)}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {(["sim", ...(c.permite_medio ? ["medio"] : []), "nao"] as Resposta[]).map(
                        (r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setRespostas({ ...respostas, [c.id]: r });
                              if (r !== "nao") {
                                const { [c.id]: _removida, ...resto } = observacoes;
                                setObservacoes(resto);
                              }
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              respostas[c.id] === r
                                ? r === "nao"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {r === "sim" ? "Sim" : r === "medio" ? "Médio" : "Não"}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  {respostas[c.id] === "nao" && (
                    <div className="mt-3 space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <Label htmlFor={`obs-${c.id}`} className="text-xs">
                        Feedback do avaliador (obrigatório)
                      </Label>
                      <Textarea
                        id={`obs-${c.id}`}
                        rows={2}
                        placeholder="Explique o motivo da marcação “Não” neste item…"
                        value={observacoes[c.id] ?? ""}
                        onChange={(e) => setObservacoes({ ...observacoes, [c.id]: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cm">Comentários / feedback</Label>
              <Textarea
                id="cm"
                rows={3}
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="font-display text-2xl font-bold text-primary">
                <span className="mr-2 text-sm font-normal text-muted-foreground">
                  Prévia da nota
                </span>
                {numeroBR(nota)}
              </p>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Registrando..." : "Registrar avaliação"}
              </Button>
            </div>
          </div>
        </div>
      </form>

      {fortnightId && (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold">Quiz da quinzena</h2>
          <div className="mb-8 grid gap-2 md:grid-cols-2">
            {avaliaveis.map((c) => {
              const entregue = quiz.find((q) => q.employee_id === c.id)?.entregue;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2"
                >
                  <span className="text-sm">{c.nome}</span>
                  <div className="flex gap-1">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => marcarQuiz.mutate({ emp: c.id, entregue: v })}
                        className={`rounded-md px-3 py-1 text-xs ${
                          entregue === v
                            ? v
                              ? "bg-primary text-primary-foreground"
                              : "bg-destructive text-destructive-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {v ? "Entregue" : "Não entregue"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="font-display text-lg font-semibold">Avaliações registradas</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Quinzenas fechadas não aparecem aqui. As avaliações delas continuam guardadas, e o
        colaborador segue vendo as dele em "Minhas avaliações".
      </p>
      <AvaliacoesPorColaborador
        avaliacoes={avaliacoesEmAndamento}
        quinzenas={emAndamento}
        quinzenaPadrao={
          emAndamento.some((q) => q.id === fortnightId) ? fortnightId : emAndamento[0]?.id
        }
      />
    </div>
  );
}
