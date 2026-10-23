/**
 * Integração com o Intercom. SÓ RODA NO SERVIDOR (sufixo .server.ts).
 *
 * O token (INTERCOM_ACCESS_TOKEN) fica nas variáveis da Vercel, marcado como
 * Sensitive, e nunca vai para o navegador. Tudo aqui é LEITURA.
 *
 * A verificação testa cada permissão separadamente (para dizer exatamente qual
 * falta) e NÃO guarda nenhuma conversa nem dado de cliente: das buscas de
 * conversas e tickets, guarda só a contagem.
 */
import { randomInt } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cruzarAtendentes,
  assuntoSugerido,
  atendenteEscreveu,
  dataDoContato,
  escolherAleatorio,
  extrairIdDaConversa,
  linkDaConversa,
  montarTranscricao,
  normalizarEmailIntercom,
  type ConversaIntercom,
  type Atendente,
  type Mensagem,
  atributosDaConversa,
  type Atributo,
  notasDoLead,
  type NotaDoIntercom,
  type NotaDoLead,
  separarAtendentes,
  type AtendenteDaConversa,
} from "@/lib/intercom";
import {
  assuntoDoTicket,
  camposDoTicket,
  conversaDeOrigem,
  criadorDoTicket,
  estadoDoTicket,
  historicoDoTicket,
  mensagensDoTicket,
  nucleoDoTipo,
  nucleosDe,
  ROTULO_DO_NUCLEO,
  tipoEntraNoSorteio,
  tituloDoTicket,
  type Nucleo,
  type TicketIntercom,
  type TipoDeTicket,
} from "@/lib/tickets";
import { canalDaConversa, type Canal } from "@/lib/canal";
import { mensagemSegura } from "@/server/erros-do-banco.server";
import { limiteAtingido } from "@/lib/avaliacao";

/** Versão atual da API (2.16, de julho de 2026). */
const VERSAO_API = "2.16";

/** Erro com mensagem segura para mostrar ao usuário. */
export class ErroDoIntercom extends Error {}

type Resposta<T> = { ok: true; dados: T } | { ok: false; status: number };

function configuracao() {
  const token = process.env["INTERCOM_ACCESS_TOKEN"];
  if (!token) {
    throw new ErroDoIntercom(
      "O token do Intercom não está configurado no servidor. Cadastre INTERCOM_ACCESS_TOKEN na Vercel e faça um novo deploy.",
    );
  }
  // Workspaces na Europa e na Austrália usam outro endereço.
  return { token, base: process.env["INTERCOM_API_BASE"] ?? "https://api.intercom.io" };
}

async function chamar<T>(caminho: string, corpo?: unknown): Promise<Resposta<T>> {
  const { token, base } = configuracao();
  let r: Response;
  try {
    r = await fetch(`${base}${caminho}`, {
      method: corpo ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Intercom-Version": VERSAO_API,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
  } catch (erro) {
    console.error("[intercom] falha de rede:", caminho, erro);
    throw new ErroDoIntercom(
      "Não foi possível falar com o Intercom. Tente novamente em alguns minutos.",
    );
  }
  if (!r.ok) {
    // O corpo de erro do Intercom não traz dado de cliente; registramos para diagnóstico.
    console.error("[intercom]", caminho, r.status, await r.text().catch(() => ""));
    return { ok: false, status: r.status };
  }
  return { ok: true, dados: (await r.json()) as T };
}

const motivo = (status: number) =>
  status === 401
    ? "token recusado"
    : status === 403
      ? "sem permissão"
      : status === 429
        ? "limite de pedidos atingido"
        : `erro ${status}`;

export type ResultadoDaVerificacao = {
  workspace: string | null;
  permissoes: { admins: boolean; conversas: boolean; tickets: boolean };
  atendentes: number;
  ligados: number;
  semCadastro: number;
  semIntercom: number;
};

/** Só o ADM ativo pode verificar a integração. */
async function exigirAdmin(chamadorId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: chamadorId });
  if (error || !data)
    throw new ErroDoIntercom("Apenas administradores podem verificar a integração com o Intercom.");
}

export async function verificarIntercom(chamadorId: string): Promise<ResultadoDaVerificacao> {
  await exigirAdmin(chamadorId);
  const registrar = (ok: boolean, resumo: unknown, erro: string | null) =>
    supabaseAdmin
      .from("intercom_diagnosticos")
      .insert({ criado_por: chamadorId, ok, resumo: resumo as never, erro });

  try {
    // 1) O token é válido? (/me não exige permissão específica)
    const eu = await chamar<{
      app?: { name?: string; region?: string; timezone?: string; id_code?: string };
    }>("/me");
    if (!eu.ok) {
      const msg =
        eu.status === 401
          ? "O Intercom recusou o token (inválido ou revogado). Regenere o token no Developer Hub e atualize na Vercel."
          : `O Intercom respondeu com ${motivo(eu.status)} ao validar o token.`;
      await registrar(false, null, msg);
      throw new ErroDoIntercom(msg);
    }

    // 2) Cada permissão, separadamente.
    const umMesAtras = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const busca = {
      query: { field: "created_at", operator: ">", value: String(umMesAtras) },
      pagination: { per_page: 1 },
    };
    const [admins, conversas, tickets] = await Promise.all([
      chamar<{ admins?: Atendente[] }>("/admins"),
      chamar<{ total_count?: number }>("/conversations/search", busca),
      chamar<{ total_count?: number }>("/tickets/search", busca),
    ]);

    // 3) Cruzamento dos atendentes com os cadastros ativos (pelo e-mail).
    const { data: cadastros, error } = await supabaseAdmin
      .from("employees")
      .select("id, nome, email")
      .eq("status", "ativo");
    if (error) throw error;
    const atendentes = admins.ok ? (admins.dados.admins ?? []) : [];
    const cruz = cruzarAtendentes(atendentes, cadastros ?? []);

    const permissoes = { admins: admins.ok, conversas: conversas.ok, tickets: tickets.ok };
    const faltando = [
      !admins.ok && `Read admins (${motivo(admins.status)})`,
      !conversas.ok && `Read conversations (${motivo(conversas.status)})`,
      !tickets.ok && `Read tickets (${motivo(tickets.status)})`,
    ].filter(Boolean);

    const resumo = {
      versao_api: VERSAO_API,
      workspace: {
        nome: eu.dados.app?.name ?? null,
        regiao: eu.dados.app?.region ?? null,
        fuso: eu.dados.app?.timezone ?? null,
      },
      permissoes,
      // Só contagens: nenhuma conversa ou ticket é guardado.
      conversas_ultimos_30_dias: conversas.ok ? (conversas.dados.total_count ?? null) : null,
      tickets_ultimos_30_dias: tickets.ok ? (tickets.dados.total_count ?? null) : null,
      atendentes: atendentes.length,
      ligados: cruz.ligados.map((l) => ({ nome: l.cadastro.nome, email: l.cadastro.email })),
      sem_cadastro: cruz.semCadastro.map((a) => ({ nome: a.name ?? null, email: a.email ?? null })),
      sem_intercom: cruz.semIntercom.map((c) => ({ nome: c.nome, email: c.email })),
    };
    await registrar(
      faltando.length === 0,
      resumo,
      faltando.length ? `Permissões com problema: ${faltando.join("; ")}` : null,
    );

    return {
      workspace: resumo.workspace.nome,
      permissoes,
      atendentes: atendentes.length,
      ligados: cruz.ligados.length,
      semCadastro: cruz.semCadastro.length,
      semIntercom: cruz.semIntercom.length,
    };
  } catch (erro) {
    if (erro instanceof ErroDoIntercom) throw erro;
    console.error("[intercom] erro inesperado:", erro);
    await registrar(false, null, "Erro inesperado na verificação.");
    throw new ErroDoIntercom("Erro inesperado ao verificar o Intercom. Tente novamente.");
  }
}

/* ======================= Contatos para avaliação ======================= */

export type Contato = {
  sorteioId: string | null;
  /** true quando o avaliador já tinha este contato em aberto (não é um sorteio novo). */
  jaEmAberto: boolean;
  conversaId: string;
  link: string;
  assunto: string | null;
  dataContato: string | null;
  /** Por onde o cliente falou (app Android ou iOS, WhatsApp, e-mail ou site). */
  canal: Canal | null;
  atendenteEscreveu: boolean;
  mensagens: Mensagem[];
  /**
   * Os atendentes que escreveram na conversa (22/10/2026): num contato com vários, cada um é avaliado
   * separadamente, só pela parte dele (as mensagens dele vêm marcadas com "doAvaliado").
   */
  atendentes?: AtendenteDaConversa[];
  /** Classificação do atendimento (critério 14): só os cinco campos. Num ticket, os campos do ticket. */
  atributos: Atributo[];
  /**
   * As notas do lead (20/10/2026): as notas do contato no Intercom (o CNPJ, os links do painel e do Wave...).
   * null quando o Intercom não as entregou (por exemplo, o token sem a permissão de ler os contatos).
   */
  notasDoLead?: NotaDoLead[] | null;
  /** Só nos tickets de back-office (o tipo `ticket_n2`). */
  ticket?: {
    numero: string | null;
    tipo: string | null;
    estado: string | null;
    titulo: string;
    criador: string | null;
    historico: { quando: number | null; texto: string }[];
    conversaDeOrigem: string | null;
    /** A conversa com o cliente, avaliada junto com o ticket (07/10/2026). */
    conversa: { link: string; canal: Canal; mensagens: Mensagem[] } | null;
  };
};

export type TipoDoContato = "interacao" | "ticket_n2";

/** Até quantas páginas de 150 conversas listar por sorteio (1.500 por quinzena é muito acima do normal). */
const MAX_PAGINAS = 10;
/** Quantas conversas sorteadas tentar até achar uma em que o atendente escreveu. */
const MAX_TENTATIVAS = 8;

async function exigir<T>(r: Resposta<T>, oQue: string): Promise<T> {
  if (r.ok) return r.dados;
  throw new ErroDoIntercom(
    r.status === 401
      ? "O Intercom recusou o token. Verifique a conexão na tela de Colaboradores."
      : `Não foi possível ${oQue} no Intercom (${motivo(r.status)}).`,
  );
}

/** Mensagem do banco (as nossas são claras) ou uma genérica. */
function erroDoBanco(error: { code?: string; message?: string } | null) {
  // Só as mensagens das regras vão para a tela; o resto vira a genérica (o detalhe fica no registro).
  if (error) throw new ErroDoIntercom(mensagemSegura(error, "intercom"));
}

async function exigirAvaliadorSobre(chamadorId: string, employeeId: string) {
  const { data: pode, error } = await supabaseAdmin.rpc("pode_atuar_sobre", {
    _uid: chamadorId,
    _employee_id: employeeId,
  });
  if (error || !pode) throw new ErroDoIntercom("Você não pode buscar contatos deste colaborador.");
}

/**
 * A hora em que o avaliador abriu o contato (vale a primeira), para medir o
 * ritmo. Nunca atrapalha o carregamento: se falhar, só aquela avaliação fica
 * sem o tempo medido.
 */
async function registrarAbertura(chamadorId: string, employeeId: string, conversaId: string) {
  const { error } = await supabaseAdmin.rpc("registrar_abertura_contato", {
    _chamador: chamadorId,
    _employee_id: employeeId,
    _conversa_id: conversaId,
  });
  if (error) console.error("[intercom] não registrou a abertura:", error.message);
}

async function appIdDoWorkspace(): Promise<string> {
  const eu = await exigir(
    await chamar<{ app?: { id_code?: string } }>("/me"),
    "identificar o workspace",
  );
  if (!eu.app?.id_code) throw new ErroDoIntercom("O Intercom não informou o código do workspace.");
  return eu.app.id_code;
}

/** O atendente do Intercom que corresponde ao colaborador (pelo e-mail). */
async function atendenteDoColaborador(employeeId: string): Promise<{ id: string; nome: string }> {
  const { data: emp, error } = await supabaseAdmin
    .from("employees")
    .select("nome, email")
    .eq("id", employeeId)
    .single();
  if (error || !emp) throw new ErroDoIntercom("Colaborador não encontrado.");
  const dados = await exigir(
    await chamar<{ admins?: Atendente[] }>("/admins"),
    "listar os atendentes",
  );
  const a = (dados.admins ?? []).find(
    (x) => normalizarEmailIntercom(x.email) === normalizarEmailIntercom(emp.email),
  );
  if (!a?.id) {
    throw new ErroDoIntercom(
      `${emp.nome} não tem conta no Intercom com o e-mail ${emp.email ?? "(sem e-mail)"}. Ajuste o e-mail no cadastro ou no Intercom.`,
    );
  }
  return { id: String(a.id), nome: emp.nome };
}

async function obterConversa(id: string): Promise<ConversaIntercom> {
  return exigir(
    await chamar<ConversaIntercom>(`/conversations/${encodeURIComponent(id)}`),
    "abrir a conversa",
  );
}

async function paraContato(
  c: ConversaIntercom,
  appId: string,
  adminId: string,
  sorteioId: string | null,
  jaEmAberto: boolean,
): Promise<Contato> {
  const id = String(c.id);
  return {
    sorteioId,
    jaEmAberto,
    conversaId: id,
    link: linkDaConversa(appId, id),
    assunto: assuntoSugerido(c),
    dataContato: c.created_at ? dataDoContato(c.created_at) : null,
    canal: canalDaConversa(c.source),
    atendenteEscreveu: atendenteEscreveu(c, adminId),
    ...(() => {
      const { mensagens, atendentes } = separarAtendentes(montarTranscricao(c), String(adminId));
      return { mensagens, atendentes };
    })(),
    atributos: atributosDaConversa(c),
    notasDoLead: await notasDoContato(c),
  };
}

/** As notas do contato da conversa (as "Notas do lead"). Uma falha não atrapalha a ficha: vira null. */
async function notasDoContato(c: ConversaIntercom): Promise<NotaDoLead[] | null> {
  const contato = c.contacts?.contacts?.[0]?.id;
  if (!contato) return [];
  try {
    const r = await chamar<{ data?: NotaDoIntercom[] }>(
      `/contacts/${encodeURIComponent(String(contato))}/notes`,
    );
    if (!r.ok) return null;
    return notasDoLead(r.dados.data).slice(0, 20);
  } catch {
    return null;
  }
}

/** Conversas ENCERRADAS atribuídas ao atendente no período (todas as páginas, para o sorteio ser justo). */
async function conversasDoPeriodo(adminId: string, inicio: number, fim: number): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await exigir(
      await chamar<{
        conversations?: { id: string | number }[];
        pages?: { next?: { starting_after?: string } };
      }>("/conversations/search", {
        query: {
          operator: "AND",
          value: [
            { field: "admin_assignee_id", operator: "=", value: Number(adminId) },
            { field: "state", operator: "=", value: "closed" },
            { field: "created_at", operator: ">", value: String(inicio) },
            { field: "created_at", operator: "<", value: String(fim) },
          ],
        },
        pagination: { per_page: 150, ...(cursor ? { starting_after: cursor } : {}) },
      }),
      "buscar as conversas",
    );
    ids.push(...(r.conversations ?? []).map((c) => String(c.id)));
    cursor = r.pages?.next?.starting_after;
    if (!cursor) break;
  }
  return ids;
}

// ---------- Tickets de back-office ----------

// Os tipos de ticket do Intercom, guardados por 10 minutos (não pergunta a cada sorteio).
let tiposGuardados: { tipos: TipoDeTicket[]; ate: number } | null = null;
/** Os tipos que entram no sorteio, só dos núcleos de quem sorteia. */
async function tiposDoSorteio(nucleos: Nucleo[]): Promise<string[]> {
  if (!tiposGuardados || tiposGuardados.ate <= Date.now()) {
    const r = await exigir(
      await chamar<{ data?: TipoDeTicket[] }>("/ticket_types"),
      "listar os tipos de ticket",
    );
    tiposGuardados = { tipos: r.data ?? [], ate: Date.now() + 10 * 60_000 };
  }
  return tiposGuardados.tipos
    .filter((t) => !t.archived && tipoEntraNoSorteio(t.name, nucleos))
    .map((t) => String(t.id));
}

/** Os núcleos de back-office de quem sorteia: todos para o ADM; os da tabela para a avaliadora. */
async function nucleosDoChamador(chamadorId: string): Promise<Nucleo[]> {
  const [{ data: adm }, { data: eu }] = await Promise.all([
    supabaseAdmin.rpc("is_admin", { _user_id: chamadorId }),
    supabaseAdmin.from("employees").select("email").eq("user_id", chamadorId).maybeSingle(),
  ]);
  return nucleosDe(eu?.email ?? null, !!adm);
}
const listaDeNucleos = (n: Nucleo[]) => n.map((x) => ROTULO_DO_NUCLEO[x]).join(", ");

async function obterTicket(id: string): Promise<TicketIntercom> {
  return exigir(
    await chamar<TicketIntercom>(`/tickets/${encodeURIComponent(id)}`),
    "abrir o ticket",
  );
}

/** Tickets dos tipos do sorteio criados no período (todas as páginas). */
async function ticketsDoPeriodo(
  tipos: string[],
  inicio: number,
  fim: number,
): Promise<TicketIntercom[]> {
  const todos: TicketIntercom[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await exigir(
      await chamar<{ tickets?: TicketIntercom[]; pages?: { next?: { starting_after?: string } } }>(
        "/tickets/search",
        {
          query: {
            operator: "AND",
            value: [
              {
                operator: "OR",
                value: tipos.map((id) => ({ field: "ticket_type_id", operator: "=", value: id })),
              },
              { field: "created_at", operator: ">", value: String(inicio) },
              { field: "created_at", operator: "<", value: String(fim) },
            ],
          },
          pagination: { per_page: 150, ...(cursor ? { starting_after: cursor } : {}) },
        },
      ),
      "buscar os tickets",
    );
    todos.push(...(r.tickets ?? []));
    cursor = r.pages?.next?.starting_after;
    if (!cursor) break;
  }
  return todos;
}

/** Garante o histórico de cada ticket (a busca pode não trazê-lo), em lotes de 8, em paralelo. */
async function comHistorico(tickets: TicketIntercom[]): Promise<TicketIntercom[]> {
  const prontos: TicketIntercom[] = [];
  for (let i = 0; i < tickets.length; i += 8) {
    prontos.push(
      ...(await Promise.all(
        tickets
          .slice(i, i + 8)
          .map((t) => (t.ticket_parts?.ticket_parts?.length ? t : obterTicket(String(t.id)))),
      )),
    );
  }
  return prontos;
}

async function paraContatoDoTicket(
  t: TicketIntercom,
  appId: string,
  adminId: string,
  sorteioId: string | null,
  jaEmAberto: boolean,
): Promise<Contato> {
  const id = String(t.id);
  const criador = criadorDoTicket(t);
  const origem = conversaDeOrigem(t);
  // A conversa com o cliente, avaliada junto com o ticket. Se não carregar, o ticket aparece mesmo assim.
  let conversa: NonNullable<Contato["ticket"]>["conversa"] = null;
  let atendentesDaConversa: AtendenteDaConversa[] = [];
  if (origem) {
    const r = await chamar<ConversaIntercom>(`/conversations/${encodeURIComponent(origem)}`);
    if (r.ok)
      conversa = {
        link: linkDaConversa(appId, origem),
        canal: canalDaConversa(r.dados.source),
        mensagens: (() => {
          const separado = separarAtendentes(montarTranscricao(r.dados), String(adminId));
          atendentesDaConversa = separado.atendentes;
          return separado.mensagens;
        })(),
      };
  }
  return {
    atendentes: atendentesDaConversa,
    sorteioId,
    jaEmAberto,
    conversaId: id,
    link: linkDaConversa(appId, id),
    assunto: assuntoDoTicket(t),
    dataContato: t.created_at ? dataDoContato(t.created_at) : null,
    canal: { tipo: "ticket", rotulo: "Ticket de back-office" },
    // Num ticket, "o colaborador participou" quer dizer: foi ele quem criou.
    atendenteEscreveu: criador?.id === String(adminId),
    mensagens: mensagensDoTicket(t),
    atributos: camposDoTicket(t),
    ticket: {
      numero: t.ticket_id != null ? String(t.ticket_id) : null,
      tipo: t.ticket_type?.name ?? null,
      estado: estadoDoTicket(t),
      titulo: tituloDoTicket(t),
      criador: criador?.nome ?? null,
      historico: historicoDoTicket(t),
      conversaDeOrigem: origem ? linkDaConversa(appId, origem) : null,
      conversa,
    },
  };
}

/** Limites da quinzena em segundos, no fuso de Fortaleza (dia inteiro de início e de fim). */
const limitesDaQuinzena = (inicio: string, fim: string) => ({
  inicio: Math.floor(Date.parse(`${inicio}T00:00:00-03:00`) / 1000),
  fim: Math.floor(Date.parse(`${fim}T23:59:59-03:00`) / 1000),
});

/**
 * O sorteio em aberto do avaliador para o colaborador, na quinzena e no tipo
 * (sorteado, não descartado e ainda não avaliado), e as avaliações válidas.
 * É a regra única usada pelo sorteio, pela busca pelo link e pela abertura do cartão.
 */
async function situacaoDoSorteio(
  chamadorId: string,
  employeeId: string,
  fortnightId: string,
  tipo: TipoDoContato,
) {
  const { data: sorteios, error: erroSorteios } = await supabaseAdmin
    .from("sorteios_contato")
    .select("id, conversa_id, link, descartado_em, sorteado_por, tipo")
    .eq("employee_id", employeeId)
    .eq("fortnight_id", fortnightId);
  erroDoBanco(erroSorteios);
  const { data: avaliadas, error: erroAvaliadas } = await supabaseAdmin
    .from("evaluations")
    .select("link_conversa, tipo")
    .eq("employee_id", employeeId)
    .eq("fortnight_id", fortnightId)
    .eq("anulada", false);
  erroDoBanco(erroAvaliadas);
  const linksAvaliados = new Set((avaliadas ?? []).map((e) => e.link_conversa).filter(Boolean));
  // Um sorteio em aberto POR TIPO: uma conversa aberta não volta quando se sorteia um ticket.
  const emAberto =
    (sorteios ?? []).find(
      (s) =>
        s.sorteado_por === chamadorId &&
        s.tipo === tipo &&
        !s.descartado_em &&
        !linksAvaliados.has(s.link),
    ) ?? null;
  // Os números das conversas e dos tickets já avaliados (cada um no seu tipo).
  const idsAvaliados = (t: string) =>
    new Set(
      (avaliadas ?? [])
        .filter((e) => e.tipo === t)
        .map((e) => (e.link_conversa ? extrairIdDaConversa(e.link_conversa) : null))
        .filter((x): x is string => !!x),
    );
  return {
    sorteios: sorteios ?? [],
    linksAvaliados,
    totalAvaliadas: (avaliadas ?? []).length,
    emAberto,
    conversasAvaliadas: idsAvaliados("interacao"),
    ticketsAvaliados: idsAvaliados("ticket_n2"),
  };
}

/** O contato do sorteio em aberto, para o cartão mostrar ao abrir (ou null). */
export async function contatoEmAberto(p: {
  chamadorId: string;
  employeeId: string;
  fortnightId: string;
  tipo?: TipoDoContato | undefined;
}): Promise<Contato | null> {
  const tipo = p.tipo ?? "interacao";
  await exigirAvaliadorSobre(p.chamadorId, p.employeeId);
  const { emAberto } = await situacaoDoSorteio(p.chamadorId, p.employeeId, p.fortnightId, tipo);
  if (!emAberto) return null;
  const [appId, atendente] = await Promise.all([
    appIdDoWorkspace(),
    atendenteDoColaborador(p.employeeId),
  ]);
  return tipo === "ticket_n2"
    ? paraContatoDoTicket(
        await obterTicket(emAberto.conversa_id),
        appId,
        atendente.id,
        emAberto.id,
        true,
      )
    : await paraContato(
        await obterConversa(emAberto.conversa_id),
        appId,
        atendente.id,
        emAberto.id,
        true,
      );
}

export async function sortearContato(p: {
  chamadorId: string;
  employeeId: string;
  fortnightId: string;
  tipo?: TipoDoContato | undefined;
}): Promise<Contato> {
  const tipo = p.tipo ?? "interacao";
  await exigirAvaliadorSobre(p.chamadorId, p.employeeId);
  const appId = await appIdDoWorkspace();
  const atendente = await atendenteDoColaborador(p.employeeId);

  // Já há um contato em aberto deste avaliador? Mostra o mesmo (não é um sorteio novo).
  const {
    sorteios,
    linksAvaliados,
    totalAvaliadas,
    emAberto,
    conversasAvaliadas,
    ticketsAvaliados,
  } = await situacaoDoSorteio(p.chamadorId, p.employeeId, p.fortnightId, tipo);
  // O limite de 10: sem vaga, não há o que sortear (nem um sorteio em aberto serviria).
  const limite = limiteAtingido(totalAvaliadas);
  if (limite) throw new ErroDoIntercom(limite);
  if (emAberto && tipo === "ticket_n2") {
    return paraContatoDoTicket(
      await obterTicket(emAberto.conversa_id),
      appId,
      atendente.id,
      emAberto.id,
      true,
    );
  }
  if (emAberto) {
    return paraContato(
      await obterConversa(emAberto.conversa_id),
      appId,
      atendente.id,
      emAberto.id,
      true,
    );
  }

  const { data: q, error: erroQ } = await supabaseAdmin
    .from("fortnights")
    .select("data_inicio, data_fim")
    .eq("id", p.fortnightId)
    .single();
  if (erroQ || !q) throw new ErroDoIntercom("Quinzena não encontrada.");
  const { inicio, fim } = limitesDaQuinzena(q.data_inicio, q.data_fim);

  const excluir = new Set<string>((sorteios ?? []).map((s) => s.conversa_id));
  for (const l of linksAvaliados) {
    const id = l ? extrairIdDaConversa(l) : null;
    if (id) excluir.add(id);
  }

  if (tipo === "ticket_n2") {
    const nucleos = await nucleosDoChamador(p.chamadorId);
    if (!nucleos.length) {
      throw new ErroDoIntercom(
        "Você ainda não tem núcleos de back-office definidos para avaliar. Complete as 10 com avaliações de atendimento.",
      );
    }
    const tipos = await tiposDoSorteio(nucleos);
    if (!tipos.length) {
      throw new ErroDoIntercom(
        "Nenhum tipo de ticket de back-office dos núcleos foi encontrado no Intercom.",
      );
    }
    const tickets = await comHistorico(await ticketsDoPeriodo(tipos, inicio, fim));
    let semCriador = 0;
    const dele = tickets.filter((t) => {
      const criador = criadorDoTicket(t);
      if (!criador) {
        semCriador++; // sem um atendente identificado com segurança: fora do sorteio
        return false;
      }
      // A conversa do ticket já foi avaliada como atendimento? O ticket também sai.
      const conversa = conversaDeOrigem(t);
      return (
        criador.id === String(atendente.id) &&
        !excluir.has(String(t.id)) &&
        !(conversa && conversasAvaliadas.has(conversa))
      );
    });
    const escolhido = escolherAleatorio(
      dele.map((t) => String(t.id)),
      new Set<string>(),
      () => randomInt(0, 1_000_000) / 1_000_000,
    );
    if (!escolhido) {
      throw new ErroDoIntercom(
        `Não há tickets de back-office criados por ${atendente.nome}, dos seus núcleos (${listaDeNucleos(nucleos)}), disponíveis para sortear nesta quinzena. Complete as 10 com avaliações de atendimento.` +
          (semCriador
            ? ` ${semCriador} ticket(s) da quinzena ficaram de fora porque não foi possível identificar quem os criou.`
            : ""),
      );
    }
    const ticket = dele.find((t) => String(t.id) === escolhido)!;
    const { data: sorteioId, error } = await supabaseAdmin.rpc("registrar_sorteio_contato", {
      _chamador: p.chamadorId,
      _employee_id: p.employeeId,
      _fortnight_id: p.fortnightId,
      _tipo: "ticket_n2",
      _conversa_id: escolhido,
      _link: linkDaConversa(appId, escolhido),
    });
    erroDoBanco(error);
    return paraContatoDoTicket(ticket, appId, atendente.id, sorteioId as string, false);
  }

  // As conversas ligadas aos tickets já avaliados (foram avaliadas junto com eles) saem.
  const ligadas = await Promise.all(
    [...ticketsAvaliados].map(async (id) => {
      const r = await chamar<TicketIntercom>(`/tickets/${encodeURIComponent(id)}`);
      return r.ok ? conversaDeOrigem(r.dados) : null;
    }),
  );
  for (const c of ligadas) if (c) excluir.add(c);

  // Só o sorteio de conversas busca as conversas da quinzena.
  const candidatos = await conversasDoPeriodo(atendente.id, inicio, fim);
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    // Gerador criptográfico: imprevisível, ninguém consegue "escolher" o resultado.
    const id = escolherAleatorio(candidatos, excluir, () => randomInt(0, 1_000_000) / 1_000_000);
    if (!id) break;
    const c = await obterConversa(id);
    if (!atendenteEscreveu(c, atendente.id)) {
      excluir.add(id); // atribuída ao atendente, mas sem resposta dele: não serve para avaliar
      continue;
    }
    const link = linkDaConversa(appId, id);
    const { data: sorteioId, error } = await supabaseAdmin.rpc("registrar_sorteio_contato", {
      _chamador: p.chamadorId,
      _employee_id: p.employeeId,
      _fortnight_id: p.fortnightId,
      _tipo: "interacao",
      _conversa_id: id,
      _link: link,
    });
    erroDoBanco(error);
    return paraContato(c, appId, atendente.id, sorteioId as string, false);
  }
  throw new ErroDoIntercom(
    `Não há conversas encerradas de ${atendente.nome} disponíveis para sortear nesta quinzena (com resposta dele e ainda não avaliadas).`,
  );
}

/** Inserção manual: busca a conversa pelo link ou número (sem registrar sorteio). */
export async function buscarContato(p: {
  chamadorId: string;
  employeeId: string;
  referencia: string;
  tipo?: TipoDoContato | undefined;
  /** Com a quinzena, a busca respeita o sorteio em aberto (a tela sempre manda). */
  fortnightId?: string | undefined;
}): Promise<Contato> {
  await exigirAvaliadorSobre(p.chamadorId, p.employeeId);
  const id = extrairIdDaConversa(p.referencia);
  if (!id)
    throw new ErroDoIntercom(
      "Não reconheci o link. Cole o link da conversa do Intercom, ou só o número dela.",
    );
  // Com um contato sorteado em aberto, outro só entra depois do descarte (com o motivo).
  if (p.fortnightId) {
    const { emAberto } = await situacaoDoSorteio(
      p.chamadorId,
      p.employeeId,
      p.fortnightId,
      p.tipo ?? "interacao",
    );
    if (emAberto && emAberto.conversa_id !== id) {
      throw new ErroDoIntercom(
        "Você tem um contato sorteado em aberto para este colaborador. Para avaliar outro pelo link, use “Inserir link”: o sorteado é descartado, com o motivo.",
      );
    }
  }
  const [appId, atendente] = await Promise.all([
    appIdDoWorkspace(),
    atendenteDoColaborador(p.employeeId),
  ]);
  let contato: Contato;
  if (p.tipo === "ticket_n2") {
    const ticket = await obterTicket(id);
    // Só os tickets dos núcleos de quem avalia (o ADM, todos).
    const nucleos = await nucleosDoChamador(p.chamadorId);
    const nucleo = nucleoDoTipo(ticket.ticket_type?.name);
    if (!nucleo || !nucleos.includes(nucleo)) {
      throw new ErroDoIntercom(
        nucleo
          ? `Este ticket é do núcleo ${ROTULO_DO_NUCLEO[nucleo]}, que não está entre os seus${nucleos.length ? ` (${listaDeNucleos(nucleos)})` : ""}.`
          : "Este tipo de ticket não entra na avaliação de back-office.",
      );
    }
    const criador = criadorDoTicket(ticket);
    // Quem é avaliado é quem criou: um ticket de outra pessoa é recusado.
    if (criador && criador.id !== String(atendente.id)) {
      throw new ErroDoIntercom(
        `Este ticket foi criado por ${criador.nome ?? "outra pessoa"}, e não por ${atendente.nome}.`,
      );
    }
    contato = await paraContatoDoTicket(ticket, appId, atendente.id, null, false);
  } else {
    contato = await paraContato(await obterConversa(id), appId, atendente.id, null, false);
  }
  await registrarAbertura(p.chamadorId, p.employeeId, contato.conversaId);
  return contato;
}

export async function descartarContato(p: {
  chamadorId: string;
  sorteioId: string;
  motivo: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("descartar_sorteio_contato", {
    _chamador: p.chamadorId,
    _sorteio_id: p.sorteioId,
    _motivo: p.motivo,
  });
  erroDoBanco(error);
}
