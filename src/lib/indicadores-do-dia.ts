/**
 * Os indicadores pela planilha (15/10/2026): as regras que as telas do ADM e do colaborador usam.
 * Puro, para ser testado. Os SLA vêm do banco em SEGUNDOS, e as metas são em minutos.
 */
import { atingiuMeta, QUALIDADE_MINIMA, type Metas } from "@/lib/indicadores";

/** A quinzena de um dia (de 1 a 15, ou de 16 ao fim do mês). */
export function quinzenaDoDia(dia: string): { de: string; ate: string } {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return d <= 15
    ? { de: `${a}-${mm}-01`, ate: `${a}-${mm}-15` }
    : { de: `${a}-${mm}-16`, ate: `${a}-${mm}-${fim}` };
}
export const ontemDe = (hoje: string) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
/** Os dias que faltam para a quinzena acabar, contando hoje. */
export const diasQueFaltam = (hoje: string, ate: string) =>
  Math.max(
    0,
    Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000) + 1,
  );

export const emMinutos = (segundos: number | null | undefined) =>
  segundos == null ? null : segundos / 60;

/** Na meta? (null = sem dado) */
export function naMeta(
  metas: Metas,
  chave: keyof Metas,
  valor: number | null | undefined,
): boolean | null {
  const m = metas[chave];
  return valor == null || !m ? null : atingiuMeta(m, valor);
}

/** Os riscos de ficar fora da elegibilidade, até agora (a qualidade, a produtividade, as horas, o quiz). */
export function riscosDaElegibilidade(
  p: {
    qualidade: number | null;
    produtividade: number | null;
    horas_semanais: number | null;
    quiz: boolean | null;
  },
  metas: Metas,
): string[] {
  const r: string[] = [];
  if (p.qualidade != null && p.qualidade < QUALIDADE_MINIMA) r.push("qualidade");
  if (naMeta(metas, "produtividade", p.produtividade) === false) r.push("produtividade");
  if (naMeta(metas, "horas_online", p.horas_semanais) === false) r.push("horas");
  if (p.quiz === false || p.quiz === null) r.push("quiz");
  return r;
}
