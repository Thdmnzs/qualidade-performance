/**
 * A verificação em duas etapas no servidor (21/10/2026): os códigos de recuperação, a recuperação pelo código e o
 * desligamento pelo ADM (com a senha dele). O aplicativo (o TOTP) é do Supabase Auth; aqui, só o que é do CX Hub.
 */
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gerarCodigos, normalizarCodigo } from "@/lib/verificacao";

export class ErroDaVerificacao extends Error {}
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Os fatores (o aplicativo) de uma pessoa, apagados: ela cadastra de novo na próxima entrada. */
async function apagarFatores(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new ErroDaVerificacao("Não foi possível ler a verificação da pessoa.");
  for (const f of data.factors ?? []) {
    const { error: e } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (e) throw new ErroDaVerificacao("Não foi possível desligar a verificação.");
  }
}
async function registrar(
  usuarioId: string,
  acao: string,
  registroId: string | null,
  valorNovo: Record<string, unknown>,
) {
  const { data: eu } = await supabaseAdmin
    .from("employees")
    .select("nome")
    .eq("user_id", usuarioId)
    .maybeSingle();
  await supabaseAdmin.from("audit_logs").insert({
    usuario_id: usuarioId,
    usuario_nome: eu?.nome ?? null,
    acao,
    entidade: "verificacao",
    registro_id: registroId,
    valor_novo: valorNovo as never,
  });
}

/** Os 10 códigos novos (os antigos deixam de valer). Só numa sessão que acabou de confirmar o aplicativo (aal2). */
export async function gerarCodigosDeRecuperacao(p: {
  userId: string;
  aal: unknown;
}): Promise<string[]> {
  if (p.aal !== "aal2")
    throw new ErroDaVerificacao(
      "Confirme o código do aplicativo antes de gerar os códigos de recuperação.",
    );
  const codigos = gerarCodigos(aleatorio);
  const { error } = await supabaseAdmin.rpc("guardar_codigos_de_recuperacao", {
    _user_id: p.userId,
    _codigos: codigos,
  });
  if (error) throw new ErroDaVerificacao("Não foi possível guardar os códigos de recuperação.");
  await registrar(p.userId, "verificacao_codigos_gerados", null, {});
  return codigos;
}

/** A recuperação: um código válido desliga o aplicativo antigo (e o código deixa de valer). */
export async function usarCodigoDeRecuperacao(p: {
  userId: string;
  codigo: string;
}): Promise<boolean> {
  const codigo = normalizarCodigo(p.codigo);
  if (!codigo) return false;
  const { data: vale, error } = await supabaseAdmin.rpc("usar_codigo_de_recuperacao", {
    _user_id: p.userId,
    _codigo: codigo,
  });
  if (error) throw new ErroDaVerificacao("Não foi possível conferir o código.");
  if (!vale) return false;
  await apagarFatores(p.userId);
  await registrar(p.userId, "verificacao_recuperada", null, {});
  return true;
}

/**
 * O desligamento pelo ADM: só um ADM com a verificação em dia (aal2), e confirmando com a SENHA dele (conferida
 * numa sessão separada, que não guarda nada). Os códigos da pessoa deixam de valer, e as sessões dela se encerram.
 */
export async function desligarVerificacao(p: {
  admId: string;
  admEmail: string | undefined;
  aal: unknown;
  senha: string;
  employeeId: string;
}) {
  const { data: adm } = await supabaseAdmin.rpc("is_admin", { _user_id: p.admId });
  if (!adm)
    throw new ErroDaVerificacao("Apenas administradores podem desligar a verificação de alguém.");
  if (p.aal !== "aal2") throw new ErroDaVerificacao("Confirme o código do seu aplicativo antes.");
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !chave || !p.admEmail)
    throw new ErroDaVerificacao("Não foi possível conferir a sua senha agora.");
  const separada = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: entrou, error } = await separada.auth.signInWithPassword({
    email: p.admEmail,
    password: p.senha,
  });
  await separada.auth.signOut({ scope: "local" }).catch(() => {});
  if (error || entrou.user?.id !== p.admId)
    throw new ErroDaVerificacao(
      error?.code === "over_request_rate_limit"
        ? "Muitas tentativas. Espere alguns minutos."
        : "A sua senha está incorreta.",
    );
  const { data: alvo } = await supabaseAdmin
    .from("employees")
    .select("user_id, nome")
    .eq("id", p.employeeId)
    .maybeSingle();
  if (!alvo?.user_id) throw new ErroDaVerificacao("Esta pessoa ainda não tem um acesso.");
  if (alvo.user_id === p.admId)
    throw new ErroDaVerificacao(
      "Você não pode desligar a sua própria verificação. Peça a outro ADM.",
    );
  await apagarFatores(alvo.user_id);
  const { error: e } = await supabaseAdmin.rpc("apagar_codigos_e_sessoes", {
    _user_id: alvo.user_id,
  });
  if (e)
    throw new ErroDaVerificacao(
      "A verificação foi desligada, mas as sessões da pessoa não foram encerradas.",
    );
  await registrar(p.admId, "verificacao_desligada", p.employeeId, { colaborador: alvo.nome });
}

/** Quem do time tem a verificação ativa (só o ADM): { id do cadastro: quando foi ativada }. */
export async function verificacaoDoTime(admId: string): Promise<Record<string, string>> {
  const { data: adm } = await supabaseAdmin.rpc("is_admin", { _user_id: admId });
  if (!adm) throw new ErroDaVerificacao("Apenas administradores.");
  const [{ data: ativas }, { data: pessoas }] = await Promise.all([
    supabaseAdmin.rpc("verificacao_do_time"),
    supabaseAdmin.from("employees").select("id, user_id").not("user_id", "is", null),
  ]);
  const porUsuario = (ativas ?? {}) as Record<string, string>;
  return Object.fromEntries(
    (pessoas ?? [])
      .filter((e) => e.user_id && porUsuario[e.user_id])
      .map((e) => [e.id, porUsuario[e.user_id!]!]),
  );
}
