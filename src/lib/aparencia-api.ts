/** O que a aparência do perfil pede ao banco (11/10/2026). O banco confere o que está liberado. */
import { supabase } from "@/integrations/supabase/client";
import type { MinhaAparencia } from "@/lib/aparencia";

export async function lerMinhaAparencia(): Promise<MinhaAparencia> {
  const { data, error } = await supabase.rpc("minha_aparencia");
  if (error) throw new Error(error.message);
  const r = data as unknown as MinhaAparencia;
  return {
    ...r,
    capas_liberadas: r.capas_liberadas ?? [],
    molduras_liberadas: r.molduras_liberadas ?? [],
  };
}

export async function salvarAparencia(
  a: Pick<
    MinhaAparencia,
    "capa" | "moldura" | "capa_da_temporada" | "moldura_da_temporada" | "capa_temporada_preferida"
  >,
) {
  const { error } = await supabase.rpc("definir_aparencia", {
    _capa: a.capa,
    _moldura: a.moldura,
    _capa_da_temporada: a.capa_da_temporada,
    _moldura_da_temporada: a.moldura_da_temporada,
    _capa_temporada_preferida: a.capa_temporada_preferida,
  });
  if (error) throw new Error(error.message);
}

/** A moldura que vale agora para cada pessoa (para o Ranking). */
export async function lerMoldurasDoTime(pessoas: string[]): Promise<Map<string, string>> {
  if (!pessoas.length) return new Map();
  const { data, error } = await supabase.rpc("molduras_do_time", { _pessoas: pessoas });
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { employee_id: string; moldura: string }[]).map((x) => [
      x.employee_id,
      x.moldura,
    ]),
  );
}
