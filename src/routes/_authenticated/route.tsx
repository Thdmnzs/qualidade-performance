import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { VigiaDaSessao } from "@/components/vigia-da-sessao";
import { apagarRegistros, lerRegistro, situacaoDaSessao } from "@/lib/expiracao-da-sessao";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // O prazo da sessão, ANTES de qualquer página aparecer (inclusive ao reabrir o navegador).
    const s = situacaoDaSessao(Date.now(), lerRegistro(data.user.id));
    if (s.estado === "expirada") {
      apagarRegistros();
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/auth", search: { motivo: s.motivo } });
    }
    return { user: data.user };
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
