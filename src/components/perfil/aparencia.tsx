import type { ReactNode } from "react";

import { arteDaCapa, ENFEITE_DAS_BRUXAS } from "@/components/perfil/artes";

/**
 * A capa: a faixa acompanha a proporção do desenho (4 por 1), até 240 px, para nada
 * ser cortado em tela cheia. O desenho é fixo (ver artes.ts): por isso pode entrar pronto.
 */
export function Capa({
  id,
  sufixo,
  className = "",
  children,
}: {
  id: string;
  sufixo: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative aspect-[4/1] max-h-[240px] w-full overflow-hidden [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full ${className}`}
    >
      <div
        className="absolute inset-0 [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: arteDaCapa(id, sufixo) }}
      />
      {children}
    </div>
  );
}

/** A moldura em volta da foto (o anel, e o enfeite da temporada). */
export function ComMoldura({
  id,
  espessura = 6,
  children,
}: {
  id: string;
  espessura?: number;
  children: ReactNode;
}) {
  if (id === "nenhuma") return <>{children}</>;
  return (
    // O anel ABRAÇA a foto: ela entra 1 px por baixo dele (uma folga mostraria o fundo do cartão,
    // e até a borda exata deixa um fio claro, pelo arredondamento).
    <div
      className="relative inline-flex shrink-0 rounded-full"
      style={{ padding: Math.max(espessura - 1, 1) }}
    >
      {children}
      <span
        className={`moldura-anel moldura-${id}`}
        style={{ ["--espessura" as string]: `${espessura}px` }}
        aria-hidden="true"
      />
      {id === "bruxas" && (
        <span
          className="pointer-events-none absolute inset-0 [&>svg]:size-full"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ENFEITE_DAS_BRUXAS }}
        />
      )}
    </div>
  );
}
