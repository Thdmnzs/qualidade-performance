/**
 * A troca de senha pela própria pessoa (16/10/2026), feita no servidor:
 *   1. a senha ATUAL é conferida numa sessão separada (que não mexe na sessão do navegador);
 *   2. só se ela conferir, a senha é trocada POR ESSA sessão (a política do Supabase continua valendo:
 *      uma senha fraca é recusada lá também);
 *   3. a sessão separada é encerrada, e a troca vai para o Histórico (sem nenhuma senha).
 * Assim, quem pegar um computador com a sessão aberta não troca a senha sem saber a atual.
 */
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { problemaDaTroca } from "@/lib/senha";

export class ErroDaTroca extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

export async function alterarSenha(p: {
  userId: string;
  email: string;
  atual: string;
  nova: string;
}): Promise<void> {
  const problema = problemaDaTroca({ atual: p.atual, nova: p.nova, confirmacao: p.nova });
  if (problema)
    throw new ErroDaTroca(
      problema.includes("diferente")
        ? "same_password"
        : problema.includes("regras")
          ? "weak_password"
          : "senha_atual",
    );
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !chave) throw new ErroDaTroca("configuracao");
  // Uma sessão separada, só para esta troca (nada é guardado).
  const separada = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await separada.auth.signInWithPassword({
    email: p.email,
    password: p.atual,
  });
  if (error || data.user?.id !== p.userId)
    throw new ErroDaTroca(error?.code === "over_request_rate_limit" ? "limite" : "senha_atual");
  // A sessão separada serve SÓ para conferir a senha atual (22/10/2026): ela não tem o código do celular, e o
  // Supabase recusa trocar a senha de quem tem a verificação em duas etapas por uma sessão assim. A senha nova é
  // gravada pelo servidor, para a própria pessoa (a sessão DELA, que chamou esta função, já passou pelo código).
  await separada.auth.signOut({ scope: "local" }).catch(() => {});
  const { error: erroDaTroca } = await supabaseAdmin.auth.admin.updateUserById(p.userId, {
    password: p.nova,
  });
  if (erroDaTroca) {
    console.error(
      "[troca de senha] a senha nova não foi gravada:",
      erroDaTroca.code ?? erroDaTroca.message,
    );
    throw new ErroDaTroca(erroDaTroca.code ?? "erro");
  }
  const { data: eu } = await supabaseAdmin
    .from("employees")
    .select("id, nome")
    .eq("user_id", p.userId)
    .maybeSingle();
  // O Histórico pela função do banco (21/10/2026): o servidor não grava direto na tabela, e o registro era recusado.
  const { error: erroDoHistorico } = await supabaseAdmin.rpc("registrar_no_historico", {
    _usuario_id: p.userId,
    _acao: "senha_alterada",
    _entidade: "auth",
    _registro_id: eu?.id ?? null,
    _valor_novo: { colaborador: eu?.nome ?? null },
  });
  if (erroDoHistorico)
    console.error("[troca de senha] o Histórico não foi registrado:", erroDoHistorico.message);
}
