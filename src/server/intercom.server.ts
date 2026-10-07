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
} from "@/lib/intercom";

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
  canal: string | null;
  atendenteEscreveu: boolean;
  mensagens: Mensagem[];
  /** Classificação do atendimento (critério 14): só os cinco campos. */
  atributos: Atributo[];
};

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
function erroDoBanco(error: { message?: string } | null) {
  if (error) throw new ErroDoIntercom(error.message || "Não foi possível concluir a operação.");
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

function paraContato(
  c: ConversaIntercom,
  appId: string,
  adminId: string,
  sorteioId: string | null,
  jaEmAberto: boolean,
): Contato {
  const id = String(c.id);
  return {
    sorteioId,
    jaEmAberto,
    conversaId: id,
    link: linkDaConversa(appId, id),
    assunto: assuntoSugerido(c),
    dataContato: c.created_at ? dataDoContato(c.created_at) : null,
    canal: c.source?.type ?? null,
    atendenteEscreveu: atendenteEscreveu(c, adminId),
    mensagens: montarTranscricao(c),
    atributos: atributosDaConversa(c),
  };
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

/** Limites da quinzena em segundos, no fuso de Fortaleza (dia inteiro de início e de fim). */
const limitesDaQuinzena = (inicio: string, fim: string) => ({
  inicio: Math.floor(Date.parse(`${inicio}T00:00:00-03:00`) / 1000),
  fim: Math.floor(Date.parse(`${fim}T23:59:59-03:00`) / 1000),
});

export async function sortearContato(p: {
  chamadorId: string;
  employeeId: string;
  fortnightId: string;
}): Promise<Contato> {
  await exigirAvaliadorSobre(p.chamadorId, p.employeeId);
  const appId = await appIdDoWorkspace();
  const atendente = await atendenteDoColaborador(p.employeeId);

  // Já há um contato em aberto deste avaliador? Mostra o mesmo (não é um sorteio novo).
  const { data: sorteios, error: erroSorteios } = await supabaseAdmin
    .from("sorteios_contato")
    .select("id, conversa_id, link, descartado_em, sorteado_por")
    .eq("employee_id", p.employeeId)
    .eq("fortnight_id", p.fortnightId);
  erroDoBanco(erroSorteios);
  const { data: avaliadas, error: erroAvaliadas } = await supabaseAdmin
    .from("evaluations")
    .select("link_conversa")
    .eq("employee_id", p.employeeId)
    .eq("fortnight_id", p.fortnightId)
    .eq("anulada", false);
  erroDoBanco(erroAvaliadas);
  const linksAvaliados = new Set((avaliadas ?? []).map((e) => e.link_conversa).filter(Boolean));
  const emAberto = (sorteios ?? []).find(
    (s) => s.sorteado_por === p.chamadorId && !s.descartado_em && !linksAvaliados.has(s.link),
  );
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

  const candidatos = await conversasDoPeriodo(atendente.id, inicio, fim);
  const excluir = new Set<string>((sorteios ?? []).map((s) => s.conversa_id));
  for (const l of linksAvaliados) {
    const id = l ? extrairIdDaConversa(l) : null;
    if (id) excluir.add(id);
  }

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
}): Promise<Contato> {
  await exigirAvaliadorSobre(p.chamadorId, p.employeeId);
  const id = extrairIdDaConversa(p.referencia);
  if (!id)
    throw new ErroDoIntercom(
      "Não reconheci o link. Cole o link da conversa do Intercom, ou só o número dela.",
    );
  const [appId, atendente] = await Promise.all([
    appIdDoWorkspace(),
    atendenteDoColaborador(p.employeeId),
  ]);
  const contato = paraContato(await obterConversa(id), appId, atendente.id, null, false);
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
