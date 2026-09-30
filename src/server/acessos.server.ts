/**
 * Operações de acesso que exigem a chave de serviço do Supabase.
 *
 * SÓ RODA NO SERVIDOR (sufixo .server.ts). A chave de serviço ignora o RLS,
 * então toda regra de permissão é validada pelas funções SQL da migration
 * 20261001000000_ciclo_de_acesso.sql, que recebem o `chamadorId` já verificado
 * a partir do token da sessão (nunca de um dado enviado pelo navegador).
 */
import { getRequest } from "@tanstack/react-start/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type Perfil = Database["public"]["Enums"]["app_role"];

/** Erro com mensagem segura para mostrar ao usuário. */
export class ErroDeAcesso extends Error {}

/** Bloqueio "permanente" no Supabase Auth (100 anos). */
const BLOQUEIO_PERMANENTE = "876000h";

/**
 * Códigos que as NOSSAS funções SQL usam no `raise exception`. Só a mensagem
 * desses erros é repassada; qualquer outro erro vira mensagem genérica, para
 * não expor detalhes internos do banco.
 */
const CODIGOS_DE_REGRA = new Set(["P0001", "P0002", "42501"]);

function traduzirErroDoBanco(error: PostgrestError, contexto: string): never {
  if (CODIGOS_DE_REGRA.has(error.code)) throw new ErroDeAcesso(error.message);
  console.error(`[acessos] ${contexto}:`, error);
  throw new ErroDeAcesso("Erro inesperado ao acessar o banco. Tente novamente.");
}

/**
 * Endereço de retorno do link (a página /definir-senha deste site).
 * Mesmo que alguém forje o cabeçalho Host, o Supabase só aceita destinos da
 * lista "Redirect URLs"; qualquer outro é trocado pela "Site URL".
 */
function urlDefinirSenha(): string {
  const request = getRequest();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocolo =
    request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origem = host ? `${protocolo}://${host}` : new URL(request.url).origin;
  return `${origem}/definir-senha`;
}

export async function criarAcesso(params: {
  employeeId: string;
  perfil: Perfil;
  chamadorId: string;
}): Promise<{ link: string }> {
  const { employeeId, perfil, chamadorId } = params;

  // Fase 1: o banco valida tudo ANTES de criar qualquer coisa no Auth.
  const { data: email, error: erroPreparo } = await supabaseAdmin.rpc("preparar_criacao_acesso", {
    _employee_id: employeeId,
    _perfil: perfil,
    _chamador: chamadorId,
  });
  if (erroPreparo) traduzirErroDoBanco(erroPreparo, "preparar_criacao_acesso");

  // Cria o usuário no Auth e gera o link de convite (não envia e-mail).
  const { data: convite, error: erroConvite } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: urlDefinirSenha() },
  });
  if (erroConvite) {
    if (erroConvite.code === "email_exists") {
      throw new ErroDeAcesso(
        "Já existe um usuário com este e-mail no Supabase Auth, sem vínculo com um colaborador. " +
          "Remova-o em Authentication → Users no painel do Supabase e tente de novo.",
      );
    }
    console.error("[acessos] generateLink(invite):", erroConvite);
    throw new ErroDeAcesso("Não foi possível gerar o convite. Tente novamente.");
  }

  // Fase 2: vincula e define o perfil numa transação. Se falhar, desfaz o
  // usuário criado no Auth (compensação), para não sobrar um usuário órfão.
  const { error: erroVinculo } = await supabaseAdmin.rpc("vincular_acesso", {
    _employee_id: employeeId,
    _user_id: convite.user.id,
    _perfil: perfil,
    _chamador: chamadorId,
  });
  if (erroVinculo) {
    const { error: erroDesfazer } = await supabaseAdmin.auth.admin.deleteUser(convite.user.id);
    if (erroDesfazer) {
      console.error("[acessos] falha ao desfazer usuário órfão:", convite.user.id, erroDesfazer);
    }
    traduzirErroDoBanco(erroVinculo, "vincular_acesso");
  }

  return { link: convite.properties.action_link };
}

export async function gerarLinkDeSenha(params: {
  employeeId: string;
  chamadorId: string;
}): Promise<{ link: string }> {
  const { data: email, error } = await supabaseAdmin.rpc("preparar_link_senha", {
    _employee_id: params.employeeId,
    _chamador: params.chamadorId,
  });
  if (error) traduzirErroDoBanco(error, "preparar_link_senha");

  const { data, error: erroLink } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: urlDefinirSenha() },
  });
  if (erroLink) {
    console.error("[acessos] generateLink(recovery):", erroLink);
    throw new ErroDeAcesso("Não foi possível gerar o link de senha. Tente novamente.");
  }
  return { link: data.properties.action_link };
}

export async function alterarStatus(params: {
  employeeId: string;
  ativo: boolean;
  chamadorId: string;
}): Promise<void> {
  const novo = params.ativo ? "ativo" : "inativo";
  const anterior = params.ativo ? "inativo" : "ativo";

  // 1) Status no banco: é ele que corta o acesso aos DADOS na hora
  //    (is_admin e current_employee_id exigem colaborador ativo).
  const { data: userId, error } = await supabaseAdmin.rpc("alterar_status_colaborador", {
    _employee_id: params.employeeId,
    _status: novo,
    _chamador: params.chamadorId,
  });
  if (error) traduzirErroDoBanco(error, "alterar_status_colaborador");

  // Sem acesso criado, não há login para bloquear.
  if (!userId) return;

  // 2) Login no Auth: impede novas entradas e renovação de sessão.
  const { error: erroBloqueio } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: params.ativo ? "none" : BLOQUEIO_PERMANENTE,
  });
  if (erroBloqueio) {
    console.error("[acessos] updateUserById(ban):", erroBloqueio);
    // Compensação: volta o status, para banco e Auth não ficarem divergentes.
    await supabaseAdmin.rpc("alterar_status_colaborador", {
      _employee_id: params.employeeId,
      _status: anterior,
      _chamador: params.chamadorId,
    });
    throw new ErroDeAcesso(
      params.ativo
        ? "Não foi possível liberar o login. Nada foi alterado; tente novamente."
        : "Não foi possível bloquear o login. Nada foi alterado; tente novamente.",
    );
  }
}
