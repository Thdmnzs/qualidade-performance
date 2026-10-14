import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { CamposDaFicha } from "@/components/dados-pessoais/campos-da-ficha";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MESES } from "@/lib/aparencia";
import {
  mascaraDoCep,
  mascaraDoTelefone,
  problemaDaFicha,
  soDigitos,
  type Ficha,
} from "@/lib/dados-pessoais";
import { corrigirDadosDe, lerDadosDe } from "@/lib/dados-pessoais-api";
import {
  HORA_INICIAL,
  problemaDoHorario,
  QUANTAS_HORAS,
  type HorarioDeTrabalho,
} from "@/lib/escala";
import { definirHorarioDeTrabalho, lerHorariosDeTrabalho } from "@/lib/escala-api";

const Rotulo = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
    {children}
  </p>
);
const Linha = ({ rotulo, valor }: { rotulo: string; valor: string | null }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{rotulo}</span>
    {valor ? (
      <b className="text-right">{valor}</b>
    ) : (
      <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold">
        não preenchido
      </span>
    )}
  </div>
);
const quando = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });

/** A ficha dos dados pessoais, para o ADM: ver (com o telefone para copiar e ligar) e corrigir. */
export function FichaDoAdm({
  pessoa,
  aoFechar,
}: {
  pessoa: { id: string; nome: string } | null;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dados-pessoais-de", pessoa?.id],
    queryFn: () => lerDadosDe(pessoa!.id),
    enabled: !!pessoa,
  });
  const [corrigindo, setCorrigindo] = useState<Ficha | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setCorrigindo(null), [pessoa?.id]);
  const problema = corrigindo ? problemaDaFicha(corrigindo) : null;

  async function salvar() {
    if (!pessoa || !corrigindo || problema) return;
    setSalvando(true);
    try {
      await corrigirDadosDe(pessoa.id, corrigindo);
      toast.success(
        `Dados de ${pessoa.nome.split(" ")[0]} corrigidos. A correção ficou no Histórico.`,
      );
      setCorrigindo(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dados-pessoais-de", pessoa.id] }),
        qc.invalidateQueries({ queryKey: ["situacao-dos-dados"] }),
      ]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const f = data;
  const tel = soDigitos(f?.contato_telefone);
  return (
    <Sheet open={!!pessoa} onOpenChange={(a) => !a && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <Rotulo>🔒 Dados pessoais · só o ADM vê</Rotulo>
          <SheetTitle>{pessoa?.nome}</SheetTitle>
          <SheetDescription>
            {f?.atualizado_em
              ? `Atualizados em ${quando(f.atualizado_em)}${f.corrigido_pela_adm ? " · corrigido pela administração" : " · pela própria pessoa"}`
              : "A pessoa ainda não preencheu."}
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Carregando...</p>
        ) : error || !f ? (
          <p className="mt-4 text-sm text-destructive">
            {(error as Error)?.message ?? "Não foi possível abrir a ficha."}
          </p>
        ) : corrigindo ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Corrigindo os dados de {pessoa?.nome.split(" ")[0]}. A correção fica no Histórico.
            </p>
            <CamposDaFicha ficha={corrigindo} aoMudar={setCorrigindo} daPessoa={false} />
            {problema && <p className="text-sm font-medium text-destructive">{problema}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCorrigindo(null)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={!!problema || salvando}>
                {salvando ? "Salvando..." : "Salvar a correção"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <Rotulo>🎂 Aniversário</Rotulo>
              <Linha
                rotulo="Dia e mês"
                valor={
                  f.aniversario_dia ? `${f.aniversario_dia} de ${MESES[f.aniversario_mes!]}` : null
                }
              />
              <Linha
                rotulo="Mostra para o time"
                valor={f.aniversario_dia ? (f.aniversario_visivel ? "sim" : "não") : null}
              />
            </div>
            <SecaoDoHorario pessoa={pessoa!} />
            <div>
              <Rotulo>🏠 Endereço</Rotulo>
              <Linha rotulo="CEP" valor={f.cep ? mascaraDoCep(f.cep) : null} />
              <Linha
                rotulo="Rua e número"
                valor={f.rua ? `${f.rua}${f.numero ? `, ${f.numero}` : ""}` : null}
              />
              {f.complemento && <Linha rotulo="Complemento" valor={f.complemento} />}
              <Linha rotulo="Bairro" valor={f.bairro} />
              <Linha
                rotulo="Cidade"
                valor={f.cidade ? `${f.cidade}${f.uf ? ` · ${f.uf}` : ""}` : null}
              />
            </div>
            <div className="rounded-xl border border-border p-3">
              <Rotulo>🚨 Contato de emergência</Rotulo>
              <Linha rotulo="Nome" valor={f.contato_nome} />
              <Linha rotulo="Parentesco" valor={f.contato_parentesco} />
              <Linha rotulo="Telefone" valor={tel ? mascaraDoTelefone(tel) : null} />
              {tel && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(mascaraDoTelefone(tel));
                        toast.success(`Telefone copiado: ${mascaraDoTelefone(tel)}`);
                      } catch {
                        toast.error("Não foi possível copiar. Selecione o número e copie.");
                      }
                    }}
                  >
                    📋 Copiar o telefone
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`tel:+55${tel}`}>📞 Ligar</a>
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setCorrigindo(f)}>✏️ Corrigir</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Uma correção sua fica no Histórico, e a ficha mostra que ela foi feita pela
              administração.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * O horário de trabalho (13/10/2026): a entrada, a saída e a pausa, para todos os dias de trabalho.
 * Fica à parte dos dados pessoais (não é um dado sensível), e é usado pela montagem da escala
 * ("Atribuir folgas e horários"). Salvo na hora, com o Histórico.
 */
function SecaoDoHorario({ pessoa }: { pessoa: { id: string; nome: string } }) {
  const qc = useQueryClient();
  const { data: horarios } = useQuery({
    queryKey: ["horarios-de-trabalho"],
    queryFn: lerHorariosDeTrabalho,
  });
  const atual = horarios?.get(pessoa.id) ?? null;
  const [editando, setEditando] = useState<HorarioDeTrabalho | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setEditando(null), [pessoa.id]);
  const fim = HORA_INICIAL + QUANTAS_HORAS;
  const opcoes = (de: number, ate: number) =>
    Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const problema = editando ? problemaDoHorario(editando) : null;
  async function salvar(h: HorarioDeTrabalho | null) {
    setSalvando(true);
    try {
      await definirHorarioDeTrabalho(pessoa.id, h);
      toast.success(
        h
          ? `${pessoa.nome.split(" ")[0]}: das ${h.entrada}h às ${h.saida}h, com a pausa às ${h.pausa}h.`
          : "Horário apagado.",
      );
      setEditando(null);
      await qc.invalidateQueries({ queryKey: ["horarios-de-trabalho"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  const campo = (rotulo: string, chave: keyof HorarioDeTrabalho, de: number, ate: number) => (
    <label className="text-xs font-bold">
      {rotulo}
      <select
        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
        value={editando![chave]}
        onChange={(e) => setEditando({ ...editando!, [chave]: Number(e.target.value) })}
      >
        {opcoes(de, ate).map((h) => (
          <option key={h} value={h}>
            {h}h
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="rounded-xl border border-border p-3">
      <Rotulo>🕘 Horário de trabalho</Rotulo>
      {editando ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {campo("Entrada", "entrada", HORA_INICIAL, fim - 1)}
            {campo("Saída", "saida", HORA_INICIAL + 1, fim)}
            {campo("Pausa", "pausa", HORA_INICIAL + 1, fim - 2)}
          </div>
          <p
            className={`mt-2 text-xs ${problema ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {problema ??
              `${editando.saida - editando.entrada} horas na escala, com 1 hora de pausa.`}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {atual && (
              <Button
                variant="outline"
                size="sm"
                className="mr-auto text-destructive"
                disabled={salvando}
                onClick={() => salvar(null)}
              >
                Apagar o horário
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => setEditando(null)}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={!!problema || salvando} onClick={() => salvar(editando)}>
              {salvando ? "Salvando..." : "Salvar o horário"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Linha rotulo="Horário" valor={atual ? `${atual.entrada}h às ${atual.saida}h` : null} />
          <Linha rotulo="Pausa" valor={atual ? `às ${atual.pausa}h` : null} />
          <div className="mt-1 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditando(atual ?? { entrada: 8, saida: 17, pausa: 12 })}
            >
              🕘 {atual ? "Editar o horário" : "Preencher o horário"}
            </Button>
          </div>
        </>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Usado pela montagem da escala (“Atribuir folgas e horários”). Vale para todos os dias de
        trabalho.
      </p>
    </div>
  );
}
