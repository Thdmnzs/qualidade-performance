/**
 * O limite de uso (13/10/2026): conta mais um uso da ação pela pessoa, no banco, e diz se ainda
 * está dentro do limite. Só no servidor (usa a chave de serviço).
 *
 * Se o PRÓPRIO contador falhar (o banco fora do ar por um instante), a função segue, e o erro vai
 * para o registro: bloquear faria um problema no contador parar o sistema inteiro. Numa
 * ferramenta interna, com login obrigatório em tudo, seguir é o equilíbrio certo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function consumirLimite(
  chave: string,
  maximo: number,
  janelaEmSegundos: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("consumir_limite_de_uso", {
    _chave: chave,
    _maximo: maximo,
    _janela_em_segundos: janelaEmSegundos,
  });
  if (error) {
    console.error("[limite de uso] o contador falhou (a função segue):", error.message);
    return true;
  }
  return data !== false;
}
