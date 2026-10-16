import { Check, X } from "lucide-react";

import { REGRAS_SENHA } from "@/lib/senha";
import { TEXTO_DA_SITUACAO, type SituacaoDaSenha } from "@/lib/senha-vazada";

/** A lista das regras da senha e a situação do vazamento (a primeira senha e a troca de senha usam esta). */
export function RegrasDaSenha({
  id,
  senha,
  vazamento,
}: {
  id: string;
  senha: string;
  vazamento: SituacaoDaSenha | null;
}) {
  return (
    <ul id={id} className="space-y-1 text-xs" aria-live="polite">
      {REGRAS_SENHA.map((regra) => {
        const ok = regra.atende(senha);
        return (
          <li
            key={regra.id}
            className={`flex items-center gap-2 ${ok ? "text-primary" : "text-muted-foreground"}`}
          >
            {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {regra.texto}
          </li>
        );
      })}
      {vazamento && (
        <li
          className={`flex items-center gap-2 ${
            vazamento === "segura"
              ? "text-primary"
              : vazamento === "vazada"
                ? "font-medium text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {vazamento === "segura" ? (
            <Check className="size-3.5" />
          ) : vazamento === "vazada" ? (
            <X className="size-3.5" />
          ) : (
            <span className="size-3.5" />
          )}
          {TEXTO_DA_SITUACAO[vazamento]}
        </li>
      )}
    </ul>
  );
}
