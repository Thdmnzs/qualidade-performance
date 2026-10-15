import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { extrairIdDaConversa, linkSeguroDoIntercom } from "@/lib/intercom";
import { aplicarSugestoes, retirarSugestoes, type Sugestoes } from "@/lib/pre-avaliacao";
import { preAvaliarFn } from "@/lib/pre-avaliacao.functions";
import { hojeEmFortaleza, nomeQuinzena, numeroBR } from "@/lib/format";
import {
  aceitaAvaliacoes,
  quinzenaPadraoParaAvaliar,
  quinzenasEmAndamento,
  ROTULO_STATUS_QUINZENA,
  type StatusQuinzena,
} from "@/lib/quinzena";
import {
  calcularNota,
  LIMITE_DE_AVALIACOES,
  limiteAtingido,
  ROTULO_TIPO,
  type AvaliacaoDaGestao,
  type Resposta,
} from "@/lib/avaliacao";

export const Route = createFileRoute("/_authenticated/admin/avaliacoes")({
  head: () => ({
    meta: [
      { title: "Avaliações de qualidade · CX Hub" },
      {
        name: "description",
        content: "Formulário de qualidade com 14 critérios e registro de quiz por quinzena.",
      },
    ],
  }),
  component: Avaliacoes,
});

function Avaliacoes() {
  const { podeAvaliar, isAdmin } = usePermissoes();
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
  // Editando uma avaliação registrada (07/10/2026): a ficha carrega a avaliação.
  const [editando, setEditando] = useState<AvaliacaoDaGestao | null>(null);
  // Os critérios "Sim" com o campo da dica aberto.
  const [dicas, setDicas] = useState<Record<string, boolean>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  // Pré-avaliação pela IA: o estado, e o que ela marcou (para os selos).
  const [pre, setPre] = useState<{
    estado: "nenhum" | "analisando" | "pronta" | "indisponivel" | "falhou";
    motivo?: string;
    sugestoes?: Sugestoes;
    sugeridos: string[];
  }>({ estado: "nenhum", sugeridos: [] });
  // O estado mais recente da ficha (a sugestão chega segundos depois e não pode sobrescrever o avaliador).
  const fichaAtual = useRef({ respostas, observacoes, comentarios });
  fichaAtual.current = { respostas, observacoes, comentarios };
  // Cada pedido ganha um número; uma resposta de um contato anterior é ignorada.
  const pedidoDaPre = useRef(0);

  function pedirPreAvaliacao(linkDaConversa: string) {
    const conversaId = extrairIdDaConversa(linkDaConversa);
    if (!conversaId || !employeeId || !fortnightId) return;
    const numero = ++pedidoDaPre.current;
    // Contato novo: as sugestões do contato anterior que o avaliador não mexeu saem.
    if (pre.sugestoes && pre.sugeridos.length) {
      const limpo = retirarSugestoes(fichaAtual.current, pre.sugestoes, pre.sugeridos);
      fichaAtual.current = limpo;
      setRespostas(limpo.respostas);
      setObservacoes(limpo.observacoes);
      setComentarios(limpo.comentarios);
    }
    setPre({ estado: "analisando", sugeridos: [] });
    preAvaliarFn({ data: { employeeId, fortnightId, conversaId, tipo } })
      .then((r) => {
        if (numero !== pedidoDaPre.current) return;
        if (r.estado !== "pronta") {
          setPre({
            estado: r.estado,
            ...(r.estado === "falhou" ? { motivo: r.motivo } : {}),
            sugeridos: [],
          });
          return;
        }
        const aplicado = aplicarSugestoes(fichaAtual.current, r.sugestoes);
        setRespostas(aplicado.respostas);
        setObservacoes(aplicado.observacoes);
        setComentarios(aplicado.comentarios);
        setPre({ estado: "pronta", sugestoes: r.sugestoes, sugeridos: aplicado.sugeridos });
      })
      .catch(() => {
        if (numero === pedidoDaPre.current)
          setPre({
            estado: "falhou",
            motivo: "Não foi possível pedir a pré-avaliação.",
            sugeridos: [],
          });
      });
  }

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
          // Qualquer resposta guarda a observação (no Sim, é uma dica); só o Não a exige.
          observacao: observacoes[c.id]?.trim() ? observacoes[c.id] : null,
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
      pedidoDaPre.current++;
      setPre({ estado: "nenhum", sugeridos: [] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-gestao"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes-totais"] });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  function limparFicha() {
    setRespostas({});
    setObservacoes({});
    setDicas({});
    setAssunto("");
    setRodada((r) => r + 1);
    setProcesso(null);
    setTextoDoContato("");
    setDataContato("");
    setLink("");
    setComentarios("");
    pedidoDaPre.current++;
    setPre({ estado: "nenhum", sugeridos: [] });
  }

  /** Carrega uma avaliação registrada na ficha, para editar. */
  async function iniciarEdicao(a: AvaliacaoDaGestao) {
    const [{ data: ev, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      supabase
        .from("evaluations")
        .select("comentarios, processo_id, processo_versao")
        .eq("id", a.id)
        .single(),
      supabase
        .from("evaluation_items")
        .select("criterion_id, resposta, observacao")
        .eq("evaluation_id", a.id),
    ]);
    if (e1 || e2 || !ev) {
      toast.error("Não foi possível abrir a avaliação para editar.");
      return;
    }
    let proc: ProcessoEscolhido | null = null;
    if (ev.processo_id) {
      const { data: p } = await supabase
        .from("processos")
        .select("id, codigo, titulo")
        .eq("id", ev.processo_id)
        .maybeSingle();
      if (p)
        proc = { id: p.id, codigo: p.codigo, titulo: p.titulo, versao: ev.processo_versao ?? 0 };
    }
    pedidoDaPre.current++; // uma pré-avaliação em andamento não preenche a edição
    setPre({ estado: "nenhum", sugeridos: [] });
    setEmployeeId(a.employee_id);
    setFortnightId(a.fortnight_id);
    setTipo(a.tipo);
    setAssunto(a.assunto ?? "");
    setDataContato(a.data_contato ?? "");
    setLink(a.link_conversa ?? "");
    setComentarios(ev.comentarios ?? "");
    setProcesso(proc);
    setRespostas(
      Object.fromEntries((itens ?? []).map((i) => [i.criterion_id, i.resposta as Resposta])),
    );
    setObservacoes(
      Object.fromEntries(
        (itens ?? []).filter((i) => i.observacao).map((i) => [i.criterion_id, i.observacao!]),
      ),
    );
    setDicas({});
    setEditando(a);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const salvarEdicao = useMutation({
    // O banco confere quem pode editar (quem fez, ou o ADM) e se a quinzena está aberta.
    mutationFn: async () => {
      if (!editando) throw new Error("Nenhuma avaliação em edição.");
      const { data, error } = await supabase.rpc("editar_avaliacao", {
        _evaluation_id: editando.id,
        _assunto: assunto,
        _data_contato: dataContato,
        _comentarios: comentarios,
        _processo_id: processo?.id ?? null,
        _respostas: ficha.map((c) => ({
          criterio_id: c.id,
          resposta: respostas[c.id],
          observacao: observacoes[c.id]?.trim() ? observacoes[c.id] : null,
        })),
      });
      if (error) throw new Error(error.message);
      return Number(data);
    },
    onSuccess: (novaNota) => {
      toast.success(`Alterações salvas. Nota: ${numeroBR(novaNota)}.`);
      setEditando(null);
      limparFicha();
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
          if (editando) {
            salvarEdicao.mutate();
            return;
          }
          // O limite de 10 (o banco recusa de qualquer forma).
          const limite = totais ? limiteAtingido(totais.interacao + totais.ticket_n2) : null;
          if (limite) {
            toast.error(limite);
            return;
          }
          salvar.mutate();
        }}
        className="mb-8 space-y-5 rounded-2xl border border-border bg-card p-5"
      >
        {editando && (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm" role="status">
            <b>
              Editando a avaliação de {editando.colaborador}
              {editando.data_contato
                ? `, do contato de ${editando.data_contato.split("-").reverse().join("/")}`
                : ""}
            </b>{" "}
            ({ROTULO_TIPO[editando.tipo]}). O colaborador, a quinzena, o tipo e o link do contato
            não mudam; a nota é recalculada, e a auditoria registra o antes e o depois.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="q">Quinzena</Label>
            <select
              id="q"
              disabled={!!editando}
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
              disabled={!!editando}
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
              disabled={!!editando}
              className={select}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
            >
              <option value="interacao">Interação</option>
              <option value="ticket_n2">Ticket de back-office</option>
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
            {editando ? (
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide">Contato desta avaliação</p>
                {linkSeguroDoIntercom(link) ? (
                  <a
                    href={linkSeguroDoIntercom(link)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block font-bold text-primary hover:underline"
                  >
                    Abrir no Intercom
                  </a>
                ) : (
                  <p className="mt-2">Sem link do Intercom.</p>
                )}
              </div>
            ) : (
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
                  pedirPreAvaliacao(c.link);
                }}
              />
            )}
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
                <span
                  className={
                    totais.interacao + totais.ticket_n2 >= LIMITE_DE_AVALIACOES
                      ? "font-bold text-destructive"
                      : "font-medium text-foreground"
                  }
                >
                  {totais.interacao + totais.ticket_n2}/{LIMITE_DE_AVALIACOES} avaliações
                </span>{" "}
                ({totais.interacao} de {ROTULO_TIPO.interacao.toLowerCase()} · {totais.ticket_n2} de{" "}
                {ROTULO_TIPO.ticket_n2.toLowerCase()})
              </p>
            )}
            {!editando && totais && limiteAtingido(totais.interacao + totais.ticket_n2) && (
              <p
                className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
                role="alert"
              >
                {limiteAtingido(totais.interacao + totais.ticket_n2)}
              </p>
            )}

            {pre.estado !== "nenhum" && (
              <p
                className={`rounded-xl px-4 py-3 text-sm ${pre.estado === "pronta" ? "bg-[#eee8ff] text-[#3d2a8a] dark:bg-[#2a2347] dark:text-[#d9cffd]" : "bg-secondary"}`}
                role="status"
              >
                {pre.estado === "analisando" && (
                  <>
                    <b>Analisando o atendimento...</b> As sugestões aparecem em alguns segundos.
                    Você já pode ir preenchendo.
                  </>
                )}
                {pre.estado === "pronta" && (
                  <>
                    <b>Pré-avaliação da IA:</b> {pre.sugeridos.length} de {ficha.length} critérios
                    marcados
                    {(() => {
                      const alterados = pre.sugeridos.filter(
                        (id) => respostas[id] !== pre.sugestoes?.criterios[id]?.resposta,
                      ).length;
                      return alterados ? ` · ${alterados} alterado(s) por você` : "";
                    })()}
                    . <b>Revise cada critério e os textos antes de registrar:</b> eles vão para o
                    colaborador como seus.
                  </>
                )}
                {pre.estado === "indisponivel" && (
                  <>
                    <b>Pré-avaliação indisponível.</b> Preencha a ficha normalmente.
                  </>
                )}
                {pre.estado === "falhou" && (
                  <>
                    <b>A pré-avaliação não funcionou desta vez</b>
                    {pre.motivo ? ` (${pre.motivo})` : ""}. Preencha a ficha normalmente.
                  </>
                )}
              </p>
            )}

            <div className="divide-y divide-border rounded-xl border border-border">
              {ficha.map((c) => (
                <div key={c.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {c.ordem}. {c.descricao}
                        {pre.estado === "pronta" && pre.sugeridos.includes(c.id) && (
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              respostas[c.id] === pre.sugestoes?.criterios[c.id]?.resposta
                                ? "bg-[#eee8ff] text-[#5b3cc4] dark:bg-[#2a2347] dark:text-[#cbbdfb]"
                                : "bg-secondary text-foreground"
                            }`}
                          >
                            {respostas[c.id] === pre.sugestoes?.criterios[c.id]?.resposta
                              ? "sugerido pela IA"
                              : "alterado por você"}
                          </span>
                        )}
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
                              const antes = respostas[c.id];
                              setRespostas({ ...respostas, [c.id]: r });
                              // A justificativa de um Não/Médio não vira dica de um Sim.
                              if (r === "sim" && antes && antes !== "sim") {
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
                  {pre.estado === "pronta" &&
                    !respostas[c.id] &&
                    pre.sugestoes?.criterios[c.id]?.motivo && (
                      <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs">
                        {pre.sugestoes.criterios[c.id]!.motivo}
                      </p>
                    )}
                  {respostas[c.id] === "sim" && !dicas[c.id] && !observacoes[c.id] && (
                    <button
                      type="button"
                      onClick={() => setDicas({ ...dicas, [c.id]: true })}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      + Adicionar dica
                    </button>
                  )}
                  {respostas[c.id] === "sim" && (dicas[c.id] || !!observacoes[c.id]) && (
                    <div className="mt-3 space-y-1.5 rounded-lg border border-border p-3">
                      <Label htmlFor={`obs-${c.id}`} className="text-xs">
                        Dica para o colaborador (opcional)
                      </Label>
                      <Textarea
                        maxLength={2000}
                        id={`obs-${c.id}`}
                        rows={2}
                        placeholder="Uma dica, mesmo com o critério atendido…"
                        value={observacoes[c.id] ?? ""}
                        onChange={(e) => setObservacoes({ ...observacoes, [c.id]: e.target.value })}
                      />
                    </div>
                  )}
                  {(respostas[c.id] === "nao" || respostas[c.id] === "medio") && (
                    <div
                      className={`mt-3 space-y-1.5 rounded-lg border p-3 ${
                        respostas[c.id] === "nao"
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-warning/30 bg-warning/5"
                      }`}
                    >
                      <Label htmlFor={`obs-${c.id}`} className="text-xs">
                        Feedback do avaliador (
                        {respostas[c.id] === "nao" ? "obrigatório" : "opcional"})
                      </Label>
                      <Textarea
                        maxLength={2000}
                        id={`obs-${c.id}`}
                        rows={2}
                        placeholder={
                          respostas[c.id] === "nao"
                            ? "Explique o motivo da marcação “Não” neste item…"
                            : "Explique o que faltou para este item ser “Sim”…"
                        }
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
                maxLength={4000}
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
              {editando ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={salvarEdicao.isPending}
                    onClick={() => {
                      setEditando(null);
                      limparFicha();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={salvarEdicao.isPending}>
                    {salvarEdicao.isPending ? "Salvando..." : "Salvar alterações"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="submit"
                  disabled={
                    salvar.isPending ||
                    (!!totais && !!limiteAtingido(totais.interacao + totais.ticket_n2))
                  }
                >
                  {salvar.isPending ? "Registrando..." : "Registrar avaliação"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Desde 07/10/2026, só o ADM registra o quiz (o banco também confere). */}
      {fortnightId && isAdmin && (
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
        onEditar={(a) => void iniciarEdicao(a)}
        avaliacoes={avaliacoesEmAndamento}
        quinzenas={emAndamento}
        quinzenaPadrao={
          emAndamento.some((q) => q.id === fortnightId) ? fortnightId : emAndamento[0]?.id
        }
      />
    </div>
  );
}
