import { hojeIso } from "@/lib/escala";
import { abaixoDoHabitual, diasComHumor, nivelDoHumor } from "@/lib/humor";
import type { HumorDaPessoa as Humor } from "@/lib/perfil-api";

/**
 * O humor de uma pessoa, na tela de Colaboradores do ADM (21/10/2026): o de hoje (com o comentário), os últimos 14
 * dias, e o aviso discreto quando a pessoa vem registrando um humor abaixo do habitual dela.
 */
export function HumorDaPessoa({ humor }: { humor: Humor | undefined }) {
  const hoje = nivelDoHumor(humor?.hoje);
  const ultimos = humor?.ultimos ?? [];
  return (
    <div
      className="w-full rounded-xl bg-secondary/60 px-3 py-2 text-xs sm:w-auto"
      aria-label="O humor"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          🌡️ Hoje:{" "}
          {hoje ? (
            <b>
              {hoje.emoji} {hoje.nome}
            </b>
          ) : (
            <span className="text-muted-foreground">ainda não registrou</span>
          )}
        </span>
        <span className="flex gap-0.5" aria-label="Os últimos 14 dias" title="Os últimos 14 dias">
          {diasComHumor(hojeIso(), 14, ultimos).map((d) => (
            <span key={d.dia} title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)}`}>
              {nivelDoHumor(d.nivel)?.emoji ?? <span className="text-muted-foreground">·</span>}
            </span>
          ))}
        </span>
        {abaixoDoHabitual(ultimos) && (
          <span className="font-bold text-[#B7791F]">↘ abaixo do habitual nos últimos dias</span>
        )}
      </div>
      {humor?.comentario_de_hoje && (
        <p className="mt-1 text-muted-foreground">“{humor.comentario_de_hoje}”</p>
      )}
    </div>
  );
}
