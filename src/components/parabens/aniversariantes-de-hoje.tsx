import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FotoDePerfil } from "@/components/foto-de-perfil";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIAS_POR_EXTENSO } from "@/lib/escala";
import {
  darParabens,
  lerAniversariantesDeHoje,
  lerProximosAniversarios,
  type Aniversariante,
} from "@/lib/parabens-api";

const SUGESTOES = [
  "🎉 Feliz aniversário!",
  "🎂 Parabéns, que seu dia seja incrível!",
  "💚 Muitas felicidades!",
  "🥳 Tudo de bom pra você!",
];
const primeiro = (nome: string) => nome.split(" ")[0];
const diaDaSemana = (iso: string) =>
  DIAS_POR_EXTENSO[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];

/**
 * "Aniversariantes de hoje", na Visão geral (do time e do ADM). Só aparece quando há alguém
 * fazendo aniversário (e que escolheu mostrar). Sem nenhuma contagem de parabéns: os números
 * viram comparação entre as pessoas.
 */
export function AniversariantesDeHoje() {
  const { data: hoje = [] } = useQuery({
    queryKey: ["aniversariantes-de-hoje"],
    queryFn: lerAniversariantesDeHoje,
    refetchInterval: 30 * 60_000,
  });
  const { data: proximos = [] } = useQuery({
    queryKey: ["proximos-aniversarios"],
    queryFn: () => lerProximosAniversarios(7),
  });
  const [para, setPara] = useState<Aniversariante | null>(null);
  if (!hoje.length) return null;
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3B0764] via-[#6D28D9] to-[#BE185D] p-5 text-[#FDF4FF]">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FBCFE8]">
        🎂 Aniversariantes de hoje
      </p>
      <ul className="mt-3 space-y-3">
        {hoje.map((a) => (
          <li key={a.employee_id} className="flex flex-wrap items-center gap-4">
            <FotoDePerfil
              employeeId={a.employee_id}
              nome={a.nome}
              tamanho="pequena"
              moldura="festa"
            />
            <div className="min-w-[180px] flex-1">
              <p className="font-display text-lg font-bold">
                {a.sou_eu ? "Hoje é o seu aniversário! 🎉" : `Hoje é o aniversário de ${a.nome}!`}
              </p>
              <p className="text-sm text-[#F5D0FE]">
                {a.sou_eu
                  ? "O time deixou recados para você. Veja no seu perfil."
                  : `Deixe um recado: só ${primeiro(a.nome)} vai ver.`}
              </p>
            </div>
            {a.sou_eu ? null : a.ja_dei ? (
              <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
                ✓ Você deu os parabéns
              </span>
            ) : (
              <Button
                className="rounded-full bg-white text-[#BE185D] hover:bg-white/90"
                onClick={() => setPara(a)}
              >
                🎉 Dar os parabéns
              </Button>
            )}
          </li>
        ))}
      </ul>
      {proximos.length > 0 && (
        <p className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-xs">
          <b>Próximos aniversários:</b>{" "}
          {proximos
            .map(
              (p) =>
                `${primeiro(p.nome)} (${diaDaSemana(p.data)}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")})`,
            )
            .join(" · ")}
        </p>
      )}
      <JanelaDosParabens para={para} aoFechar={() => setPara(null)} />
    </section>
  );
}

function JanelaDosParabens({
  para,
  aoFechar,
}: {
  para: Aniversariante | null;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fechar = () => {
    setTexto("");
    aoFechar();
  };
  async function enviar() {
    if (!para) return;
    setEnviando(true);
    try {
      await darParabens(para.employee_id, texto.trim());
      toast.success(`Parabéns enviados! ${primeiro(para.nome)} vai ver o seu recado no perfil.`);
      await qc.invalidateQueries({ queryKey: ["aniversariantes-de-hoje"] });
      fechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Dialog open={!!para} onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dar os parabéns a {para ? primeiro(para.nome) : ""}</DialogTitle>
          <DialogDescription>
            Só {para ? primeiro(para.nome) : "a pessoa"} e você veem o recado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {SUGESTOES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTexto(t)}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:border-[#F43F5E]"
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={200}
          rows={3}
          aria-label="O recado"
          placeholder="Escreva um recado (até 200 caracteres)"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-right text-[11px] text-muted-foreground">{texto.length}/200</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            className="bg-[#F43F5E] text-white hover:bg-[#E11D48]"
            disabled={texto.trim().length < 2 || enviando}
            onClick={enviar}
          >
            {enviando ? "Enviando..." : "🎉 Enviar os parabéns"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
