import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/page-header";
import { AniversariantesDeHoje } from "@/components/parabens/aniversariantes-de-hoje";
import { MeuDiaNaVisaoGeral } from "@/components/visao-geral/meu-dia";
import { MuralDoCx } from "@/components/visao-geral/mural-do-cx";
import { QuadroDeInstabilidades } from "@/components/visao-geral/quadro-de-instabilidades";
import { useCurrentEmployee, usePermissoes } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Visão geral · CX Hub" },
      { name: "description", content: "O seu dia na escala e o mural do CX." },
    ],
  }),
  component: VisaoGeral,
});

const SAUDACAO = (h: number) => (h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");

/**
 * A Visão geral (20/10/2026, a nova versão): a tela inicial do colaborador, com o "Meu dia" da escala e o
 * mural do CX (os comunicados do #cx_mural do Slack, ao vivo), com as instabilidades (o #instabilidade) acima dele.
 */
function VisaoGeral() {
  const { data: employee, isLoading: carregandoEmp } = useCurrentEmployee();
  const { temAreaDeColaborador, isLoading: carregandoPerfil } = usePermissoes();
  if (carregandoEmp || carregandoPerfil)
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador) {
    return (
      <EmptyState
        titulo="Área do colaborador"
        texto="O perfil ADM não tem a área do colaborador. Use a gestão para acompanhar o time."
      />
    );
  }
  if (!employee) {
    return (
      <EmptyState
        titulo="Cadastro não vinculado"
        texto="Seu acesso ainda não está vinculado a um colaborador. Procure a administração."
      />
    );
  }
  const hora = Number(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Fortaleza",
    }),
  );
  return (
    <div>
      <PageHeader
        titulo={`${SAUDACAO(hora)}, ${employee.nome.split(" ")[0]}!`}
        descricao="O seu dia na escala, e os comunicados do time."
      />
      <AniversariantesDeHoje />
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <MeuDiaNaVisaoGeral />
        </div>
        <div className="min-w-0 space-y-4">
          <QuadroDeInstabilidades />
          <MuralDoCx pessoa={employee.id} />
        </div>
      </div>
    </div>
  );
}
