import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { nomeQuinzena, numeroBR } from "@/lib/format";
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
      { title: "Avaliações de qualidade · Qualidade & Performance" },
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
  const [ticket, setTicket] = useState("");
  const [link, setLink] = useState("");
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
      const { data, error } = await supabase.rpc("registrar_avaliacao", {
        _employee_id: employeeId,
        _fortnight_id: fortnightId,
        _tipo: tipo,
        _ticket: ticket,
        _link_conversa: link,
        _comentarios: comentarios,
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
      setTicket("");
      setLink("");
      setComentarios("");
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-totais"] });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const marcarQuiz = useMutation({
    mutationFn: async ({ emp, entregue }: { emp: string; entregue: boolean }) => {
      const { data: user } = await supabase.auth.getUser();
      const existente = quiz.find((q) => q.employee_id === emp);
      const { error } = existente
        ? await supabase
            .from("quiz_results")
            .update({ entregue, registrado_por: user.user?.id ?? null })
            .eq("id", existente.id)
        : await supabase.from("quiz_results").insert({
            employee_id: emp,
            fortnight_id: fortnightId,
            entregue,
            registrado_por: user.user?.id ?? null,
          });
      if (error) throw error;
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
                <option key={q.id} value={q.id} disabled={q.status === "fechada"}>
                  {nomeQuinzena(q)} {q.status === "fechada" ? "(fechada)" : ""}
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
            <Label htmlFor="tk">Ticket</Label>
            <Input id="tk" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="lk">Link da conversa</Label>
            <Input id="lk" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        </div>

        {totais && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Nesta quinzena:{" "}
            {(Object.keys(AVALIACOES_PREVISTAS) as Array<keyof typeof AVALIACOES_PREVISTAS>).map(
              (t, i) => {
                const acima = totais[t] >= AVALIACOES_PREVISTAS[t];
                return (
                  <span key={t}>
                    {i > 0 && " · "}
                    <span className={acima ? "font-medium text-warning" : "text-foreground"}>
                      {ROTULO_TIPO[t]} {totais[t]}/{AVALIACOES_PREVISTAS[t]}
                    </span>
                  </span>
                );
              },
            )}
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
            <span className="mr-2 text-sm font-normal text-muted-foreground">Prévia da nota</span>
            {numeroBR(nota)}
          </p>
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? "Registrando..." : "Registrar avaliação"}
          </Button>
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

      <h2 className="mb-3 font-display text-lg font-semibold">Avaliações registradas</h2>
      <AvaliacoesPorColaborador
        avaliacoes={avaliacoes}
        quinzenas={quinzenas}
        quinzenaPadrao={fortnightId || quinzenas[0]?.id}
      />
    </div>
  );
}
