/**
 * Os dados pessoais (12/10/2026): o aniversário, o endereço e o contato de emergência.
 * Puro, para ser testado. As MESMAS conferências valem no banco (que é quem decide);
 * aqui, a tela avisa antes de enviar.
 */
export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export const PARENTESCOS = [
  "Mãe",
  "Pai",
  "Cônjuge",
  "Irmão ou irmã",
  "Filho ou filha",
  "Outro",
] as const;

export type Ficha = {
  nome?: string;
  aniversario_dia: number | null;
  aniversario_mes: number | null;
  aniversario_visivel: boolean;
  aniversario_tema: boolean;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  contato_nome: string | null;
  contato_parentesco: string | null;
  contato_telefone: string | null;
  atualizado_em?: string | null;
  corrigido_pela_adm?: boolean;
};

export const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");
/** 59150000 → 59150-000 (enquanto digita, também). */
export function mascaraDoCep(t: string | null | undefined): string {
  const d = soDigitos(t).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
/** 84999990000 → (84) 99999-0000; 8433330000 → (84) 3333-0000. */
export function mascaraDoTelefone(t: string | null | undefined): string {
  const d = soDigitos(t).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

/** O que impede de salvar (as mesmas conferências do banco), ou nada. */
export function problemaDaFicha(f: Ficha): string | null {
  const { aniversario_dia: dia, aniversario_mes: mes } = f;
  if ((dia == null) !== (mes == null)) return "Escolha o dia e o mês do aniversário.";
  if (
    dia != null &&
    mes != null &&
    new Date(Date.UTC(2024, mes - 1, dia)).getUTCMonth() !== mes - 1
  )
    return "Esse dia não existe nesse mês.";
  if (soDigitos(f.cep) && soDigitos(f.cep).length !== 8) return "O CEP precisa ter 8 números.";
  const tel = soDigitos(f.contato_telefone);
  if (tel && (tel.length < 10 || tel.length > 11))
    return "O telefone precisa ter o DDD e o número.";
  if (tel && !(f.contato_nome ?? "").trim()) return "Escreva o nome do contato de emergência.";
  return null;
}

/** O que falta na ficha (para a lista do ADM), sem mostrar os dados. */
export function textoDoQueFalta(falta: string[]): string | null {
  if (!falta.length) return null;
  if (falta.includes("tudo")) return "não preenchidos";
  return `falta: ${falta.join(" e ")}`;
}
