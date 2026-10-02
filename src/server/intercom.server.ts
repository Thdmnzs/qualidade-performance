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
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cruzarAtendentes, type Atendente } from "@/lib/intercom";

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
