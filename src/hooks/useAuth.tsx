import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Perfil = Database["public"]["Enums"]["app_role"];

export function useSessionUser() {
  return useQuery({
    queryKey: ["session-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 30_000,
  });
}

export function useCurrentEmployee() {
  return useQuery({
    queryKey: ["current-employee"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

/**
 * Perfil efetivo do usuário logado, lido de user_roles (mesma fonte usada pelo RLS).
 * Só serve para decidir o que MOSTRAR; quem decide o que pode ser lido/gravado é o banco.
 */
export function useMeuPerfil() {
  return useQuery({
    queryKey: ["meu-perfil"],
    queryFn: async (): Promise<Perfil> => {
      const { data, error } = await supabase.rpc("meu_perfil");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useIsManager() {
  const { data: employee, isLoading: carregandoEmp } = useCurrentEmployee();
  const { data: perfil, isLoading: carregandoPerfil } = useMeuPerfil();
  return {
    isLoading: carregandoEmp || carregandoPerfil,
    isManager: perfil === "gestor" || perfil === "adm",
    isAdmin: perfil === "adm",
    perfil,
    employee,
  };
}
