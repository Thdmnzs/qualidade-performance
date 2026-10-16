// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
// A conferência do vazamento: a senha "segura"
vi.mock("@/hooks/use-conferencia-de-vazamento", async () => {
  const { senhaAtendeRegras } = await import("@/lib/senha");
  return {
    useConferenciaDeVazamento: (s: string) => ({
      vazamento: senhaAtendeRegras(s) ? "segura" : null,
      regrasOk: senhaAtendeRegras(s),
      senhaValida: senhaAtendeRegras(s),
    }),
  };
});
const alterar = vi.fn(async (_a: unknown) => ({ ok: true }));
vi.mock("@/lib/senha.functions", () => ({ alterarMinhaSenhaFn: (a: unknown) => alterar(a) }));
const signOut = vi.fn(async (_a: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: (a: unknown) => signOut(a) } },
}));
const { AlterarSenha } = await import("../alterar-senha");
const { toast } = await import("sonner");
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const preencher = (atual: string, nova: string, confirmacao: string) => {
  fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText("Confirme a nova senha"), {
    target: { value: confirmacao },
  });
};
const botao = () => screen.getByRole("button", { name: "Alterar senha" }) as HTMLButtonElement;

describe("alterar a senha, no Editar perfil", () => {
  it("começa fechada; abre com as três senhas e as regras", () => {
    render(<AlterarSenha />);
    fireEvent.click(screen.getByRole("button", { name: /Alterar a senha/ }));
    expect(screen.getByLabelText("Senha atual").getAttribute("type")).toBe("password");
    expect(screen.getByText("Pelo menos 10 caracteres")).toBeTruthy();
    expect(botao().disabled).toBe(true);
  });
  it("o botão só liga com tudo certo: as regras, a confirmação igual e a nova diferente da atual", () => {
    render(<AlterarSenha />);
    fireEvent.click(screen.getByRole("button", { name: /Alterar a senha/ }));
    preencher("Antiga!2025x", "fraca", "fraca");
    expect(botao().disabled).toBe(true);
    preencher("Antiga!2025x", "Nova!Senha2026", "Nova!Senha2027");
    expect(screen.getByText("A confirmação não confere com a nova senha.")).toBeTruthy();
    expect(botao().disabled).toBe(true);
    preencher("Nova!Senha2026", "Nova!Senha2026", "Nova!Senha2026");
    expect(screen.getByText("A nova senha precisa ser diferente da atual.")).toBeTruthy();
    expect(botao().disabled).toBe(true);
    preencher("Antiga!2025x", "Nova!Senha2026", "Nova!Senha2026");
    expect(botao().disabled).toBe(false);
  });
  it("alterar: o servidor recebe a atual e a nova; as outras sessões saem", async () => {
    render(<AlterarSenha />);
    fireEvent.click(screen.getByRole("button", { name: /Alterar a senha/ }));
    preencher("Antiga!2025x", "Nova!Senha2026", "Nova!Senha2026");
    fireEvent.click(botao());
    await waitFor(() =>
      expect(alterar).toHaveBeenCalledWith({
        data: { atual: "Antiga!2025x", nova: "Nova!Senha2026" },
      }),
    );
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "others" }));
    expect(toast.success).toHaveBeenCalled();
  });
  it("a senha atual errada: o aviso do servidor, e as sessões continuam", async () => {
    alterar.mockResolvedValueOnce({ ok: false, erro: "A senha atual não confere." } as never);
    render(<AlterarSenha />);
    fireEvent.click(screen.getByRole("button", { name: /Alterar a senha/ }));
    preencher("Errada!2025x", "Nova!Senha2026", "Nova!Senha2026");
    fireEvent.click(botao());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A senha atual não confere."));
    expect(signOut).not.toHaveBeenCalled();
  });
});
