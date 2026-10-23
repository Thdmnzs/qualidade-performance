import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { EMAIL, SENHAS, segredo } from "./ajudantes";

// A etapa 2 da verificação (21/10/2026): uma sessão SÓ COM A SENHA não lê nada do banco, nem chamando direto.
test("uma sessão só com a senha não lê nada do banco", async () => {
  const supabase = createClient(
    segredo("E2E_SUPABASE_URL"),
    segredo("E2E_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  let entrou = false;
  for (const senha of SENHAS()) {
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL(), password: senha });
    if (!error) {
      entrou = true;
      break;
    }
  }
  expect(entrou, "a conta de teste entrou com a senha").toBe(true);
  const { data, error } = await supabase.from("employees").select("id").limit(5);
  expect(data ?? [], "nenhum cadastro com uma sessão só com a senha").toHaveLength(0);
  expect(error?.message ?? "", "o banco recusou, pedindo o código").toMatch(/código do celular/);
  const { data: perfil, error: erroDoPerfil } = await supabase.rpc("meu_perfil");
  expect(erroDoPerfil, "a consulta do próprio perfil (a do login) continua liberada").toBeNull();
  expect(perfil).toBe("adm");
  await supabase.auth.signOut();
});
