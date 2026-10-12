import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MESES } from "@/lib/aparencia";
import {
  mascaraDoCep,
  mascaraDoTelefone,
  PARENTESCOS,
  UFS,
  type Ficha,
} from "@/lib/dados-pessoais";

const Selo = ({ children, privado = false }: { children: ReactNode; privado?: boolean }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${privado ? "bg-[#E0ECFF] text-[#1E40AF] dark:bg-[#13234A] dark:text-[#9CC0FF]" : "bg-primary/10 text-primary"}`}
  >
    {children}
  </span>
);
const Rotulo = ({
  texto,
  children,
  className = "",
}: {
  texto: string;
  children: ReactNode;
  className?: string;
}) => (
  <label className={`block text-sm font-bold ${className}`}>
    {texto}
    <div className="mt-1 font-normal">{children}</div>
  </label>
);
const select = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";

/**
 * Os campos da ficha (o aniversário, o endereço e o contato de emergência), os mesmos
 * para a pessoa e para a correção do ADM. Com `daPessoa`, aparecem as escolhas que só
 * ela faz: mostrar o aniversário para o time, e o tema de festa no dia.
 */
export function CamposDaFicha({
  ficha,
  aoMudar,
  daPessoa,
}: {
  ficha: Ficha;
  aoMudar: (f: Ficha) => void;
  daPessoa: boolean;
}) {
  const mudar = (m: Partial<Ficha>) => aoMudar({ ...ficha, ...m });
  const texto = (
    campo: keyof Ficha,
    max: number,
    extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <Input
      value={(ficha[campo] as string | null) ?? ""}
      maxLength={max}
      onChange={(e) => mudar({ [campo]: e.target.value } as Partial<Ficha>)}
      {...extra}
    />
  );
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">🎂 Aniversário</p>
          <Selo>o time vê só o dia e o mês</Selo>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Rotulo texto="Dia">
            <select
              aria-label="Dia do aniversário"
              className={select}
              value={ficha.aniversario_dia ?? ""}
              onChange={(e) =>
                mudar({ aniversario_dia: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </Rotulo>
          <Rotulo texto="Mês">
            <select
              aria-label="Mês do aniversário"
              className={select}
              value={ficha.aniversario_mes ?? ""}
              onChange={(e) =>
                mudar({ aniversario_mes: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {MESES.slice(1).map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </Rotulo>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Sem o ano: ninguém vê a idade.</p>
        {daPessoa ? (
          <div className="mt-3 space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm">
              Mostrar o meu aniversário para o time
              <Switch
                checked={ficha.aniversario_visivel}
                onCheckedChange={(v) => mudar({ aniversario_visivel: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Deixar o meu perfil com o tema de festa no dia
              <Switch
                checked={ficha.aniversario_tema}
                onCheckedChange={(v) => mudar({ aniversario_tema: v })}
              />
            </label>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            O “mostrar para o time” e o tema de festa são escolhas da pessoa.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">🏠 Endereço</p>
          <Selo privado>🔒 só você e a administração</Selo>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Rotulo texto="CEP">
            <Input
              inputMode="numeric"
              placeholder="00000-000"
              value={mascaraDoCep(ficha.cep)}
              onChange={(e) => mudar({ cep: mascaraDoCep(e.target.value) })}
              maxLength={9}
            />
          </Rotulo>
          <Rotulo texto="Rua" className="col-span-2">
            {texto("rua", 120)}
          </Rotulo>
          <Rotulo texto="Número">{texto("numero", 10)}</Rotulo>
          <Rotulo texto="Complemento" className="col-span-2">
            {texto("complemento", 60, { placeholder: "opcional" })}
          </Rotulo>
          <Rotulo texto="Bairro">{texto("bairro", 60)}</Rotulo>
          <Rotulo texto="Cidade">{texto("cidade", 60)}</Rotulo>
          <Rotulo texto="UF">
            <select
              aria-label="UF"
              className={select}
              value={ficha.uf ?? ""}
              onChange={(e) => mudar({ uf: e.target.value || null })}
            >
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Rotulo>
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">🚨 Contato de emergência</p>
          <Selo privado>🔒 só você e a administração</Selo>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Rotulo texto="Nome" className="col-span-2">
            {texto("contato_nome", 80)}
          </Rotulo>
          <Rotulo texto="Parentesco">
            <select
              aria-label="Parentesco"
              className={select}
              value={ficha.contato_parentesco ?? ""}
              onChange={(e) => mudar({ contato_parentesco: e.target.value || null })}
            >
              <option value="">—</option>
              {PARENTESCOS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Rotulo>
          <Rotulo texto="Telefone">
            <Input
              inputMode="tel"
              placeholder="(84) 90000-0000"
              value={mascaraDoTelefone(ficha.contato_telefone)}
              onChange={(e) => mudar({ contato_telefone: mascaraDoTelefone(e.target.value) })}
              maxLength={16}
            />
          </Rotulo>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Para avisar alguém numa emergência. Só a administração usa.
        </p>
      </section>
    </div>
  );
}
