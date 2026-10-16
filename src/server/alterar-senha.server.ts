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
  try {
    const { error: erroDaTroca } = await separada.auth.updateUser({ password: p.nova });
    if (erroDaTroca) throw new ErroDaTroca(erroDaTroca.code ?? "erro");
  } finally {
    await separada.auth.signOut({ scope: "local" });
  }
  const { data: eu } = await supabaseAdmin
    .from("employees")
    .select("id, nome")
    .eq("user_id", p.userId)
    .maybeSingle();
  await supabaseAdmin.from("audit_logs").insert({
    usuario_id: p.userId,
    usuario_nome: eu?.nome ?? null,
    acao: "senha_alterada",
    entidade: "auth",
    registro_id: eu?.id ?? null,
    valor_anterior: null,
    valor_novo: { colaborador: eu?.nome ?? null },
  });
}
