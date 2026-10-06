import { Moon, Sun } from "lucide-react";

import { definirTema, proximoTema, useTema } from "@/lib/tema";

/** Alterna entre claro e escuro a cada clique. O ícone mostra para onde o botão leva. */
export function BotaoTema() {
  const tema = useTema();
  const acao = tema === "claro" ? "Ativar modo escuro" : "Ativar modo claro";
  return (
    <button
      type="button"
      onClick={() => definirTema(proximoTema(tema))}
      aria-label={acao}
      title={acao}
      className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary"
    >
      {tema === "claro" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
