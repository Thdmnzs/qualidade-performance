/**
 * Pré-avaliação pela IA, no servidor (06/10/2026).
 *
 * A chave da API (ANTHROPIC_API_KEY, ou API_ANTHROPIC) existe só aqui. Sem ela, a pré-avaliação
 * fica "indisponível" e a ficha funciona normalmente.
 *
 * O servidor busca a conversa DE NOVO no Intercom (nunca confia no texto vindo
 * do navegador), MASCARA os dados sensíveis, monta o pedido, VALIDA a resposta
 * e grava só as sugestões (nunca o texto da conversa).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { textoParaSugerirProcesso, type Mensagem } from "@/lib/intercom";
import { mascarar } from "@/lib/mascarar";
import {
  entradaDaResposta,
  mascararExemplo,
  type ExemploParaIA,
  MODELO,
  problemasDaResposta,
  montarPedido,
  validarResposta,
  type CriterioParaIA,
  type Sugestoes,
} from "@/lib/pre-avaliacao";
import { buscarContato } from "@/server/intercom.server";
import { mensagemSegura } from "@/server/erros-do-banco.server";

export class ErroDaPreAvaliacao extends Error {}

export type ResultadoDaPreAvaliacao =
  | { estado: "indisponivel" }
  | { estado: "pronta"; sugestoes: Sugestoes; reaproveitada: boolean }
  | { estado: "falhou"; motivo: string };

const ESPERA_MAXIMA_MS = 40_000; // abaixo do tempo máximo de uma função na Vercel

export async function preAvaliar(p: {
  chamadorId: string;
  employeeId: string;
  fortnightId: string;
  conversaId: string;
  tipo?: "interacao" | "ticket_n2" | undefined;
}): Promise<ResultadoDaPreAvaliacao> {
  // O nome padrão é ANTHROPIC_API_KEY; a Vercel do projeto tem a chave como API_ANTHROPIC (16/10/2026).
  const chave = process.env["ANTHROPIC_API_KEY"] || process.env["API_ANTHROPIC"];
  if (!chave) return { estado: "indisponivel" };

  // 1. Reaproveitamento (a função também confere se o avaliador pode avaliar este colaborador).
  const ids = {
    _chamador: p.chamadorId,
    _employee_id: p.employeeId,
    _fortnight_id: p.fortnightId,
    _conversa_id: p.conversaId,
  };
  const { data: guardada, error: erroBusca } = await supabaseAdmin.rpc("buscar_pre_avaliacao", ids);
  if (erroBusca) throw new ErroDaPreAvaliacao(mensagemSegura(erroBusca, "pre-avaliacao"));
  if (guardada)
    return { estado: "pronta", sugestoes: guardada as unknown as Sugestoes, reaproveitada: true };

  // 2. A conversa, de novo no Intercom (confere a permissão outra vez).
  const contato = await buscarContato({
    chamadorId: p.chamadorId,
    employeeId: p.employeeId,
    referencia: p.conversaId,
    ...(p.tipo ? { tipo: p.tipo } : {}),
  });

  // 3. Mascaramento: os dados sensíveis e os nomes, antes de qualquer envio.
  const { data: colaborador } = await supabaseAdmin
    .from("employees")
    .select("nome")
    .eq("id", p.employeeId)
    .single();
  const nomes: Record<string, string> = {};
  for (const m of contato.mensagens) {
    if (m.nome && m.autor === "cliente") nomes[m.nome] = "Cliente";
    if (m.nome && (m.autor === "atendente" || m.autor === "nota")) nomes[m.nome] = "Atendente";
  }
  // Num ticket, a conversa com o cliente também entra (e também é mascarada).
  for (const m of contato.ticket?.conversa?.mensagens ?? []) {
    if (m.nome && m.autor === "cliente") nomes[m.nome] = "Cliente";
    if (m.nome && (m.autor === "atendente" || m.autor === "nota")) nomes[m.nome] = "Atendente";
  }
  if (colaborador?.nome) nomes[colaborador.nome] = "Atendente";
  const mensagens: Mensagem[] = contato.mensagens.map((m) => ({
    ...m,
    nome: null,
    texto: mascarar(m.texto, nomes),
  }));
  const conversaDoCliente: Mensagem[] = (contato.ticket?.conversa?.mensagens ?? []).map((m) => ({
    ...m,
    nome: null,
    texto: mascarar(m.texto, nomes),
  }));
  const atributos = contato.atributos.map((a) => ({
    ...a,
    valor: a.valor === null ? null : mascarar(a.valor, nomes),
  }));

  // 4. A ficha vigente, o processo mais provável e o Dicionário de Tags.
  const { data: criterios, error: erroFicha } = await supabaseAdmin
    .from("evaluation_criteria")
    .select("id, ordem, descricao, grupo, permite_medio, orientacao, versao")
    .eq("ativo", true);
  if (erroFicha || !criterios?.length)
    throw new ErroDaPreAvaliacao("Não encontrei a ficha de avaliação.");
  const versao = Math.max(...criterios.map((c) => c.versao));
  const ficha: CriterioParaIA[] = criterios.filter((c) => c.versao === versao);
  const { data: refs } = await supabaseAdmin.rpc("referencias_para_pre_avaliacao", {
    _texto: textoParaSugerirProcesso(contato),
  });
  const ref = refs?.[0];
  const processo =
    ref?.processo_id && ref.conteudo
      ? { codigo: ref.codigo, titulo: ref.titulo ?? "", conteudo: ref.conteudo }
      : null;

  // 4b. Até 2 avaliações exemplares do time (20/10/2026): do mesmo processo, ou do mesmo assunto; nunca da
  // própria pessoa avaliada. Mascaradas como a conversa (inclusive os nomes do time).
  let exemplos: ExemploParaIA[] = [];
  try {
    const { data: brutos } = await supabaseAdmin.rpc("exemplos_para_pre_avaliacao", {
      _processo_id: ref?.processo_id ?? null,
      _assunto: contato.assunto ?? null,
      _excluir_employee: p.employeeId,
    });
    if (Array.isArray(brutos) && brutos.length) {
      const { data: time } = await supabaseAdmin.from("employees").select("nome");
      const nomesDoTime: Record<string, string> = { ...nomes };
      for (const e of time ?? []) {
        if (e.nome) {
          nomesDoTime[e.nome] = "Atendente";
          const primeiro = e.nome.split(" ")[0];
          if (primeiro && primeiro.length > 2) nomesDoTime[primeiro] = "Atendente";
        }
      }
      exemplos = (brutos as unknown as ExemploParaIA[]).map((e) =>
        mascararExemplo(e, (t) => mascarar(t, nomesDoTime)),
      );
    }
  } catch {
    exemplos = []; // sem os exemplos, a pré-avaliação segue normal
  }

  // 5. O pedido ao Claude, com tempo máximo de espera.
  const pedido = montarPedido({
    ficha,
    mensagens,
    atributos,
    processo,
    dicionario: ref?.dicionario ?? null,
    ...(exemplos.length ? { exemplos } : {}),
    ...(p.tipo ? { tipo: p.tipo } : {}),
    ...(conversaDoCliente.length ? { conversaDoCliente } : {}),
  });
  const inicio = Date.now();
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_MAXIMA_MS);
  let resposta: Response;
  try {
    resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(pedido),
      signal: controle.signal,
    });
  } catch {
    return { estado: "falhou", motivo: "A IA demorou demais para responder." };
  } finally {
    clearTimeout(relogio);
  }
  // Nunca repassa o corpo do erro à TELA (pode conter detalhes do pedido). Mas registra, só nos registros do
  // servidor, o tipo e a mensagem do erro (20/10/2026), que dizem o que a Anthropic recusou.
  if (!resposta.ok) {
    let tipo = "";
    let mensagem = "";
    try {
      const erro = ((await resposta.json()) as { error?: { type?: string; message?: string } })
        .error;
      tipo = erro?.type ?? "";
      mensagem = (erro?.message ?? "").slice(0, 300);
    } catch {
      // o corpo não era JSON: fica só o código
    }
    console.error(
      `[pré-avaliação] a Anthropic recusou o pedido (${resposta.status}) ${tipo}: ${mensagem}`,
    );
    return { estado: "falhou", motivo: `A IA não respondeu (código ${resposta.status}).` };
  }
  const corpo = (await resposta.json()) as {
    content?: { type: string; name?: string; input?: unknown; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // A chamada da ferramenta (o normal) ou o objeto de dados no texto (a rede de segurança).
  const entrada = entradaDaResposta(corpo.content);
  const sugestoes = validarResposta(entrada, ficha);
  if (!sugestoes) {
    // Só os nomes dos campos, os tipos dos blocos e o motivo do fim (nunca o texto da conversa).
    console.error(
      `[pré-avaliação] a resposta veio fora do formato. fim: ${corpo.stop_reason ?? "?"}; blocos: ${(corpo.content ?? []).map((b) => b.type).join(",") || "nenhum"}; problemas: ${problemasDaResposta(entrada).slice(0, 8).join(" | ") || "sem os dados"}`,
    );
    return { estado: "falhou", motivo: "A resposta da IA veio num formato inesperado." };
  }

  // 6. Grava só as sugestões (se outra aba gravou antes, vale a que já estava).
  const { data: gravada, error: erroGrava } = await supabaseAdmin.rpc("registrar_pre_avaliacao", {
    ...ids,
    _modelo: MODELO,
    _sugestoes: sugestoes,
    _processo_id: ref?.processo_id ?? null,
    _processo_versao: ref?.versao ?? null,
    _duracao_ms: Date.now() - inicio,
    _tokens_entrada: corpo.usage?.input_tokens ?? null,
    _tokens_saida: corpo.usage?.output_tokens ?? null,
  });
  if (erroGrava) throw new ErroDaPreAvaliacao(mensagemSegura(erroGrava, "pre-avaliacao"));
  return {
    estado: "pronta",
    sugestoes: (gravada as unknown as Sugestoes) ?? sugestoes,
    reaproveitada: false,
  };
}
