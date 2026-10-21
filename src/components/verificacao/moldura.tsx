import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { apagarRegistros } from "@/lib/expiracao-da-sessao";

/** A moldura das telas da verificação (21/10/2026), como a da definição da senha; e o "Sair", sempre à mão. */
export function MolduraDaVerificacao({ children }: { children: ReactNode }) {
  async function sair() {
    apagarRegistros();
    await supabase.auth.signOut({ scope: "local" });
    window.location.assign("/auth");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">CX Hub</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-glow">{children}</div>
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={sair}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O destino depois do código: só um caminho DENTRO do CX Hub (contra um link que mande para outro site). */
export function destinoSeguro(para: unknown): string {
  return typeof para === "string" && /^\/(?![/\\])/.test(para) ? para : "/painel";
}
