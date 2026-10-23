import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { VigiaDaSessao } from "@/components/vigia-da-sessao";
import { apagarRegistros, lerRegistro, situacaoDaSessao } from "@/lib/expiracao-da-sessao";
import { esquecerAConferencia, usuarioLogado } from "@/lib/usuario-logado";
import { destinoDaVerificacao } from "@/lib/verificacao";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // A sessão lida no navegador, e conferida no servidor de login no máximo a cada 5 minutos (23/10/2026).
    const user = await usuarioLogado();
    if (!user) throw redirect({ to: "/auth" });
    // O prazo da sessão, ANTES de qualquer página aparecer (inclusive ao reabrir o navegador).
    const s = situacaoDaSessao(Date.now(), lerRegistro(user.id));
    if (s.estado === "expirada") {
      esquecerAConferencia();
      apagarRegistros();
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/auth", search: { motivo: s.motivo } });
    }
    // A verificação em duas etapas (21/10/2026), obrigatória para todos: sem o aplicativo, o cadastro; com ele,
    // mas sem o código nesta sessão, o código. A pessoa volta para onde ia, depois.
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const destino = destinoDaVerificacao(nivel);
    if (destino !== "ok")
      throw redirect({
        to: destino === "cadastrar" ? "/proteger-a-conta" : "/verificar",
        search: { para: location.href },
      });
    return { user };
  },
  component: Logado,
});

function Logado() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell>
      <VigiaDaSessao userId={user.id} />
      <Outlet />
    </AppShell>
  );
}
