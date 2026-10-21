import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { destinoSeguro, MolduraDaVerificacao } from "@/components/verificacao/moldura";
import { supabase } from "@/integrations/supabase/client";
import { destinoDaVerificacao } from "@/lib/verificacao";

export const Route = createFileRoute("/verificar")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ para: destinoSeguro(s["para"]) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const d = destinoDaVerificacao(nivel);
    if (d === "ok") throw redirect({ href: search.para });
    if (d === "cadastrar")
      throw redirect({ to: "/proteger-a-conta", search: { para: search.para } });
  },
  head: () => ({ meta: [{ title: "O código do celular · CX Hub" }] }),
  component: Verificar,
});

/** A entrada (21/10/2026): depois da senha, o código de 6 dígitos do aplicativo autenticador. */
function Verificar() {
  const { para } = Route.useSearch();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { data: fatores } = await supabase.auth.mfa.listFactors();
      const fator = fatores?.totp.find((f) => f.status === "verified");
      if (!fator)
        return window.location.assign(`/proteger-a-conta?para=${encodeURIComponent(para)}`);
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: fator.id,
        code: codigo,
      });
      if (error) {
        setErro(
          "O código não confere. Confira o horário do celular e digite o código que está aparecendo agora.",
        );
        setCodigo("");
        return;
      }
      window.location.assign(para);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <MolduraDaVerificacao>
      <form onSubmit={confirmar} className="text-center">
        <p className="text-3xl">📱</p>
        <h2 className="mt-2 font-display text-xl font-bold">O código do seu celular</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra o aplicativo autenticador e digite o código da conta <b>CX Hub</b>.
        </p>
        <Input
          autoFocus
          aria-label="O código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          className="mt-5 h-12 text-center text-2xl font-bold tracking-[0.5em]"
        />
        {erro && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {erro}
          </p>
        )}
        <Button type="submit" className="mt-4 w-full" disabled={codigo.length !== 6 || enviando}>
          {enviando ? "Conferindo..." : "Entrar"}
        </Button>
        <Link
          to="/recuperar-acesso"
          search={{ para }}
          className="mt-4 block text-sm font-bold text-primary hover:underline"
        >
          Perdi o celular: usar um código de recuperação
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Sem o celular e sem os códigos? Peça a um ADM para desligar a sua verificação.
        </p>
      </form>
    </MolduraDaVerificacao>
  );
}
