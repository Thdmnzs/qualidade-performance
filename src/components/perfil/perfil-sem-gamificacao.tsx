import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EditarPerfil } from "@/components/dados-pessoais/editar-perfil";
import { FotoDePerfil } from "@/components/foto-de-perfil";
import { PageHeader } from "@/components/page-header";
import { MuralDosParabens } from "@/components/parabens/mural";
import { Capa } from "@/components/perfil/aparencia";
import { MinhaSemanaEFerias } from "@/components/perfil/minha-semana";
import { SobreMim } from "@/components/perfil/sobre-mim";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lerMinhaAparencia, salvarAparencia } from "@/lib/aparencia-api";
import { lerMinhaFolgaFixa } from "@/lib/perfil-api";

/** As capas livres (as que não dependem da gamificação). */
const CAPAS_LIVRES = [
  ["sinal", "Sinal"],
  ["ondas", "Ondas"],
  ["brilho", "Brilho"],
  ["faixas", "Faixas"],
  ["aurora", "Aurora"],
] as const;

/**
 * O Meu perfil com a gamificação em espera (21/10/2026): a capa (só as livres), a foto e o nome; o "Sobre mim" com o
 * termômetro do humor; a semana e as férias; e o mural dos parabéns. O perfil com o nível, o XP e as conquistas
 * continua no código, e volta quando a supervisão ligar a gamificação.
 */
export function PerfilSemGamificacao({
  employee,
}: {
  employee: { id: string; nome: string; turno?: string | null };
}) {
  const qc = useQueryClient();
  const { data: aparencia } = useQuery({
    queryKey: ["minha-aparencia"],
    queryFn: lerMinhaAparencia,
  });
  const { data: folga = [] } = useQuery({
    queryKey: ["minha-folga-fixa", employee.id],
    queryFn: () => lerMinhaFolgaFixa(employee.id),
  });
  const [editando, setEditando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const capa = CAPAS_LIVRES.some(([id]) => id === aparencia?.capa) ? aparencia!.capa : "sinal";
  async function trocarCapa(id: string) {
    if (!aparencia) return;
    try {
      await salvarAparencia({ ...aparencia, capa: id, moldura: "nenhuma" });
      await qc.invalidateQueries({ queryKey: ["minha-aparencia"] });
      setEscolhendo(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader titulo="Meu perfil" descricao="Você, a sua semana e as suas férias." />
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <Capa id={capa} sufixo="perfil">
          <button
            type="button"
            onClick={() => setEscolhendo(true)}
            disabled={!aparencia}
            className="absolute left-3 top-3 rounded-full bg-black/65 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm hover:bg-black/80"
          >
            🖼 Mudar capa
          </button>
        </Capa>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
          <div className="-mt-12 rounded-full bg-card p-1">
            <FotoDePerfil employeeId={employee.id} nome={employee.nome} editavel />
          </div>
          <div className="pb-1">
            <h2 className="font-display text-2xl font-bold">{employee.nome}</h2>
            {aparencia?.aniversario_hoje && (
              <p className="text-sm font-bold text-[#F43F5E]">
                🎂 Hoje é o seu aniversário! Feliz aniversário!
              </p>
            )}
          </div>
          <Button variant="outline" className="ml-auto" onClick={() => setEditando(true)}>
            Editar perfil
          </Button>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <SobreMim employeeId={employee.id} />
        <MinhaSemanaEFerias employeeId={employee.id} folgaFixa={folga} />
      </div>
      <MuralDosParabens employeeId={employee.id} aniversarioHoje={!!aparencia?.aniversario_hoje} />
      <EditarPerfil aberto={editando} aoFechar={() => setEditando(false)} />
      <Dialog open={escolhendo} onOpenChange={setEscolhendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolha a capa</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CAPAS_LIVRES.map(([id, nome]) => (
              <button
                key={id}
                type="button"
                onClick={() => trocarCapa(id)}
                aria-pressed={capa === id}
                className={`overflow-hidden rounded-xl border-2 text-left ${capa === id ? "border-primary" : "border-transparent"}`}
              >
                <div className="pointer-events-none h-16 overflow-hidden">
                  <Capa id={id} sufixo={`escolha-${id}`} />
                </div>
                <p className="px-2 py-1 text-xs font-bold">{nome}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
