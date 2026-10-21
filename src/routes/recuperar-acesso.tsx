import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { destinoSeguro, MolduraDaVerificacao } from "@/components/verificacao/moldura";
import { supabase } from "@/integrations/supabase/client";
import { usarCodigoDeRecuperacaoFn } from "@/lib/verificacao.functions";

export const Route = createFileRoute("/recuperar-acesso")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ para: destinoSeguro(s["para"]) }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Recuperar o acesso · CX Hub" }] }),
  component: Recuperar,
});

/**
 * Perdi o celular (21/10/2026): um código de recuperação desliga o aplicativo antigo (e o código deixa de valer),
 * e a pessoa cadastra o celular novo em seguida. Até 5 tentativas a cada 15 minutos.
 */
function Recuperar() {
  const { para } = Route.useSearch();
  const usar = useServerFn(usarCodigoDeRecuperacaoFn);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const ok = await usar({ data: { codigo } });
      if (!ok) return setErro("Este código não vale (ou já foi usado). Confira e tente de novo.");
      await supabase.auth.refreshSession(); // a sessão passa a saber que o aplicativo antigo saiu
      setAceito(true);
    } catch (e) {
      setErro((e as Error).message || "Não foi possível conferir o código agora.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <MolduraDaVerificacao>
      {aceito ? (
        <div className="text-center">
          <p className="text-3xl">✅</p>
          <h2 className="mt-2 font-display text-xl font-bold">Código aceito</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O aplicativo antigo foi desligado, e este código não vale mais. Agora, cadastre o
            celular novo (e guarde os códigos novos).
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() =>
              window.location.assign(`/proteger-a-conta?para=${encodeURIComponent(para)}`)
            }
          >
            Cadastrar o celular novo
          </Button>
        </div>
      ) : (
        <form onSubmit={confirmar} className="text-center">
          <p className="text-3xl">🗝️</p>
          <h2 className="mt-2 font-display text-xl font-bold">Usar um código de recuperação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite um dos códigos que você guardou no cadastro. Ele desliga o aplicativo antigo, e
            você cadastra o celular novo em seguida.
          </p>
          <Input
            autoFocus
            aria-label="O código de recuperação"
            placeholder="XXXX-XXXX"
            maxLength={12}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="mt-5 h-12 text-center font-mono text-lg font-bold"
          />
          {erro && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {erro}
            </p>
          )}
          <Button
            type="submit"
            className="mt-4 w-full"
            disabled={codigo.replace(/[^A-Z0-9]/g, "").length !== 8 || enviando}
          >
            {enviando ? "Conferindo..." : "Usar o código"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Por segurança, são até 5 tentativas a cada 15 minutos.
          </p>
        </form>
      )}
    </MolduraDaVerificacao>
  );
}
