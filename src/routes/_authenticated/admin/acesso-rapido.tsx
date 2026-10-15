import { createFileRoute } from "@tanstack/react-router";

import { EditorDoAcessoRapido } from "@/components/acesso-rapido-editor";
import { EmptyState } from "@/components/page-header";
import { usePermissoes } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/admin/acesso-rapido")({
  head: () => ({ meta: [{ title: "Acesso rápido · CX Hub" }] }),
  component: AcessoRapidoDoAdm,
});

/** A edição do acesso rápido (14/10/2026): só do ADM (o banco confere de novo). */
function AcessoRapidoDoAdm() {
  const { isAdmin, isLoading } = usePermissoes();
  if (isLoading) return null;
  if (!isAdmin)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />
    );
  return <EditorDoAcessoRapido />;
}
