export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          acao: string
          contexto: Json | null
          created_at: string
          entidade: string
          id: string
          motivo: string | null
          registro_id: string | null
          usuario_id: string | null
          usuario_nome: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          acao: string
          contexto?: Json | null
          created_at?: string
          entidade: string
          id?: string
          motivo?: string | null
          registro_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          acao?: string
          contexto?: Json | null
          created_at?: string
          entidade?: string
          id?: string
          motivo?: string | null
          registro_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: []
      }
      bonus_eligibility: {
        Row: {
          calculado_em: string
          created_at: string
          elegivel: boolean
          employee_id: string
          fortnight_id: string
          id: string
          motivos: Json
          updated_at: string
          versao_regras: string | null
        }
        Insert: {
          calculado_em?: string
          created_at?: string
          elegivel?: boolean
          employee_id: string
          fortnight_id: string
          id?: string
          motivos?: Json
          updated_at?: string
          versao_regras?: string | null
        }
        Update: {
          calculado_em?: string
          created_at?: string
          elegivel?: boolean
          employee_id?: string
          fortnight_id?: string
          id?: string
          motivos?: Json
          updated_at?: string
          versao_regras?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_eligibility_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_eligibility_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_prizes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          posicao: number
          updated_at: string
          valor: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          posicao: number
          updated_at?: string
          valor?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          posicao?: number
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          chave: string
          created_at: string
          descricao: string | null
          id: string
          pendente: boolean
          titulo: string
          updated_at: string
          valor: Json | null
          versao: number
        }
        Insert: {
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          pendente?: boolean
          titulo: string
          updated_at?: string
          valor?: Json | null
          versao?: number
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          pendente?: boolean
          titulo?: string
          updated_at?: string
          valor?: Json | null
          versao?: number
        }
        Relationships: []
      }
      contestation_messages: {
        Row: {
          autor_id: string | null
          autor_tipo: string
          contestation_id: string
          created_at: string
          id: string
          mensagem: string
        }
        Insert: {
          autor_id?: string | null
          autor_tipo: string
          contestation_id: string
          created_at?: string
          id?: string
          mensagem: string
        }
        Update: {
          autor_id?: string | null
          autor_tipo?: string
          contestation_id?: string
          created_at?: string
          id?: string
          mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "contestation_messages_contestation_id_fkey"
            columns: ["contestation_id"]
            isOneToOne: false
            referencedRelation: "contestations"
            referencedColumns: ["id"]
          },
        ]
      }
      contestations: {
        Row: {
          assunto: string
          alteracoes: Json | null
          created_at: string
          descricao: string
          employee_id: string
          evaluation_id: string | null
          fortnight_id: string
          id: string
          nota_anterior: number | null
          nota_nova: number | null
          resolucao: string | null
          respondida_em: string | null
          responder_ate: string | null
          responsavel_id: string | null
          result_id: string | null
          status: Database["public"]["Enums"]["contestation_status"]
          updated_at: string
        }
        Insert: {
          assunto: string
          alteracoes?: Json | null
          created_at?: string
          descricao: string
          employee_id: string
          evaluation_id?: string | null
          fortnight_id: string
          id?: string
          nota_anterior?: number | null
          nota_nova?: number | null
          resolucao?: string | null
          respondida_em?: string | null
          responder_ate?: string | null
          responsavel_id?: string | null
          result_id?: string | null
          status?: Database["public"]["Enums"]["contestation_status"]
          updated_at?: string
        }
        Update: {
          assunto?: string
          alteracoes?: Json | null
          created_at?: string
          descricao?: string
          employee_id?: string
          evaluation_id?: string | null
          fortnight_id?: string
          id?: string
          nota_anterior?: number | null
          nota_nova?: number | null
          resolucao?: string | null
          respondida_em?: string | null
          responder_ate?: string | null
          responsavel_id?: string | null
          result_id?: string | null
          status?: Database["public"]["Enums"]["contestation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contestations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contestations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contestations_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contestations_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_reports: {
        Row: {
          created_at: string
          enviado_por: string | null
          fortnight_id: string
          id: string
          import_id: string | null
          meta: number
          nome_arquivo: string
          storage_path: string | null
          valor: number | null
        }
        Insert: {
          created_at?: string
          enviado_por?: string | null
          fortnight_id: string
          id?: string
          import_id?: string | null
          meta?: number
          nome_arquivo: string
          storage_path?: string | null
          valor?: number | null
        }
        Update: {
          created_at?: string
          enviado_por?: string | null
          fortnight_id?: string
          id?: string
          import_id?: string | null
          meta?: number
          nome_arquivo?: string
          storage_path?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "csat_reports_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_reports_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      data_imports: {
        Row: {
          created_at: string
          enviado_por: string | null
          erros: Json
          extensao: string
          fortnight_id: string | null
          id: string
          indicador: Database["public"]["Enums"]["indicator_key"] | null
          linhas_total: number | null
          linhas_validas: number | null
          nome_arquivo: string
          preview: Json | null
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enviado_por?: string | null
          erros?: Json
          extensao: string
          fortnight_id?: string | null
          id?: string
          indicador?: Database["public"]["Enums"]["indicator_key"] | null
          linhas_total?: number | null
          linhas_validas?: number | null
          nome_arquivo: string
          preview?: Json | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enviado_por?: string | null
          erros?: Json
          extensao?: string
          fortnight_id?: string | null
          id?: string
          indicador?: Database["public"]["Enums"]["indicator_key"] | null
          linhas_total?: number | null
          linhas_validas?: number | null
          nome_arquivo?: string
          preview?: Json | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_imports_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          email: string
          foto_url: string | null
          id: string
          login: string
          nome: string
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          foto_url?: string | null
          id?: string
          login: string
          nome: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          foto_url?: string | null
          id?: string
          login?: string
          nome?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      evaluation_criteria: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          gravidade: Database["public"]["Enums"]["criterion_severity"]
          grupo: string
          id: string
          ordem: number
          orientacao: string | null
          permite_medio: boolean
          peso: number
          peso_medio: number | null
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          gravidade?: Database["public"]["Enums"]["criterion_severity"]
          grupo: string
          id?: string
          ordem: number
          orientacao?: string | null
          permite_medio?: boolean
          peso: number
          peso_medio?: number | null
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          gravidade?: Database["public"]["Enums"]["criterion_severity"]
          grupo?: string
          id?: string
          ordem?: number
          orientacao?: string | null
          permite_medio?: boolean
          peso?: number
          peso_medio?: number | null
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      evaluation_items: {
        Row: {
          created_at: string
          criterion_id: string
          desconto: number
          evaluation_id: string
          id: string
          observacao: string | null
          resposta: string
        }
        Insert: {
          created_at?: string
          criterion_id: string
          desconto?: number
          evaluation_id: string
          id?: string
          observacao?: string | null
          resposta: string
        }
        Update: {
          created_at?: string
          criterion_id?: string
          desconto?: number
          evaluation_id?: string
          id?: string
          observacao?: string | null
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_items_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_items_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          anulada: boolean
          anulada_em: string | null
          anulada_por: string | null
          assunto: string | null
          avaliador_id: string | null
          comentarios: string | null
          created_at: string
          data_contato: string | null
          employee_id: string
          fortnight_id: string
          id: string
          link_conversa: string | null
          motivo_anulacao: string | null
          nota: number | null
          nota_original: number | null
          ticket: string | null
          tipo: Database["public"]["Enums"]["evaluation_type"]
          updated_at: string
          versao_ficha: number
        }
        Insert: {
          anulada?: boolean
          anulada_em?: string | null
          anulada_por?: string | null
          assunto?: string | null
          avaliador_id?: string | null
          comentarios?: string | null
          created_at?: string
          data_contato?: string | null
          employee_id: string
          fortnight_id: string
          id?: string
          link_conversa?: string | null
          motivo_anulacao?: string | null
          nota?: number | null
          nota_original?: number | null
          ticket?: string | null
          tipo: Database["public"]["Enums"]["evaluation_type"]
          updated_at?: string
          versao_ficha?: number
        }
        Update: {
          anulada?: boolean
          anulada_em?: string | null
          anulada_por?: string | null
          assunto?: string | null
          avaliador_id?: string | null
          comentarios?: string | null
          created_at?: string
          data_contato?: string | null
          employee_id?: string
          fortnight_id?: string
          id?: string
          link_conversa?: string | null
          motivo_anulacao?: string | null
          nota?: number | null
          nota_original?: number | null
          ticket?: string | null
          tipo?: Database["public"]["Enums"]["evaluation_type"]
          updated_at?: string
          versao_ficha?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      fortnights: {
        Row: {
          ano: number
          created_at: string
          data_fim: string
          data_inicio: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          mes: number
          prazo_contestacao_ate: string | null
          publicado_em: string | null
          status: Database["public"]["Enums"]["fortnight_status"]
          tipo: Database["public"]["Enums"]["fortnight_type"]
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          data_fim: string
          data_inicio: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          mes: number
          prazo_contestacao_ate?: string | null
          publicado_em?: string | null
          status?: Database["public"]["Enums"]["fortnight_status"]
          tipo: Database["public"]["Enums"]["fortnight_type"]
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          data_fim?: string
          data_inicio?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          mes?: number
          prazo_contestacao_ate?: string | null
          publicado_em?: string | null
          status?: Database["public"]["Enums"]["fortnight_status"]
          tipo?: Database["public"]["Enums"]["fortnight_type"]
          updated_at?: string
        }
        Relationships: []
      }
      indicators: {
        Row: {
          chave: Database["public"]["Enums"]["indicator_key"]
          created_at: string
          descricao: string | null
          id: string
          meta_operador: string | null
          meta_valor: number | null
          nome: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          chave: Database["public"]["Enums"]["indicator_key"]
          created_at?: string
          descricao?: string | null
          id?: string
          meta_operador?: string | null
          meta_valor?: number | null
          nome: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          chave?: Database["public"]["Enums"]["indicator_key"]
          created_at?: string
          descricao?: string | null
          id?: string
          meta_operador?: string | null
          meta_valor?: number | null
          nome?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          canal: string
          created_at: string
          employee_id: string | null
          enviado_em: string | null
          erro: string | null
          evento: string
          id: string
          payload: Json
        }
        Insert: {
          canal?: string
          created_at?: string
          employee_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          evento: string
          id?: string
          payload?: Json
        }
        Update: {
          canal?: string
          created_at?: string
          employee_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          evento?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          created_at: string
          employee_id: string
          entregue: boolean
          fortnight_id: string
          id: string
          registrado_por: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          entregue?: boolean
          fortnight_id: string
          id?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          entregue?: boolean
          fortnight_id?: string
          id?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_results_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_results_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      rankings: {
        Row: {
          criterios: Json
          employee_id: string
          fortnight_id: string
          gerado_em: string
          id: string
          posicao: number
        }
        Insert: {
          criterios?: Json
          employee_id: string
          fortnight_id: string
          gerado_em?: string
          id?: string
          posicao: number
        }
        Update: {
          criterios?: Json
          employee_id?: string
          fortnight_id?: string
          gerado_em?: string
          id?: string
          posicao?: number
        }
        Relationships: [
          {
            foreignKeyName: "rankings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rankings_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          created_at: string
          dias_trabalhados: number | null
          employee_id: string
          fortnight_id: string
          id: string
          import_id: string | null
          indicador: Database["public"]["Enums"]["indicator_key"]
          origem: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          created_at?: string
          dias_trabalhados?: number | null
          employee_id: string
          fortnight_id: string
          id?: string
          import_id?: string | null
          indicador: Database["public"]["Enums"]["indicator_key"]
          origem?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          created_at?: string
          dias_trabalhados?: number | null
          employee_id?: string
          fortnight_id?: string
          id?: string
          import_id?: string | null
          indicador?: Database["public"]["Enums"]["indicator_key"]
          origem?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "results_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      team_metrics: {
        Row: {
          created_at: string
          fortnight_id: string
          id: string
          indicador: Database["public"]["Enums"]["indicator_key"]
          media: number | null
          meta: number | null
          minimo_elegibilidade: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fortnight_id: string
          id?: string
          indicador: Database["public"]["Enums"]["indicator_key"]
          media?: number | null
          meta?: number | null
          minimo_elegibilidade?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fortnight_id?: string
          id?: string
          indicador?: Database["public"]["Enums"]["indicator_key"]
          media?: number | null
          meta?: number | null
          minimo_elegibilidade?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_metrics_fortnight_id_fkey"
            columns: ["fortnight_id"]
            isOneToOne: false
            referencedRelation: "fortnights"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alterar_status_colaborador: {
        Args: {
          _chamador: string
          _employee_id: string
          _status: Database["public"]["Enums"]["employee_status"]
        }
        Returns: string
      }
      alterar_ciclo_quinzena: {
        Args: { _acao: string; _fortnight_id: string; _motivo?: string }
        Returns: Database["public"]["Enums"]["fortnight_status"]
      }
      contestar_avaliacao: {
        Args: { _descricao: string; _evaluation_id: string }
        Returns: string
      }
      current_employee_id: { Args: never; Returns: string }
      definir_perfil: {
        Args: {
          _employee_id: string
          _perfil: Database["public"]["Enums"]["app_role"]
        }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      excluir_avaliacao: {
        Args: { _evaluation_id: string; _motivo: string }
        Returns: undefined
      }
      excluir_colaborador_definitivo: {
        Args: { _chamador: string; _confirmacao: string; _employee_id: string }
        Returns: string
      }
      fortnight_is_closed: { Args: { _fortnight_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_avaliador: { Args: { _user_id: string }; Returns: boolean }
      listar_avaliaveis: {
        Args: never
        Returns: {
          id: string
          nome: string
          perfil: Database["public"]["Enums"]["app_role"]
        }[]
      }
      listar_avaliacoes_gestao: {
        Args: { _fortnight_id?: string }
        Returns: {
          assunto: string
          avaliado_por: string
          colaborador: string
          created_at: string
          data_contato: string
          employee_id: string
          fortnight_id: string
          id: string
          link_conversa: string
          nota: number
          pode_excluir: boolean
          tipo: Database["public"]["Enums"]["evaluation_type"]
        }[]
      }
      listar_colaboradores: {
        Args: never
        Returns: {
          created_at: string
          email: string
          foto_url: string
          id: string
          login: string
          nome: string
          perfil: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["employee_status"]
          tem_acesso: boolean
          updated_at: string
          user_id: string
        }[]
      }
      meu_perfil: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      pode_atuar_sobre: {
        Args: { _employee_id: string; _uid: string }
        Returns: boolean
      }
      perfil_do_usuario: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      preparar_criacao_acesso: {
        Args: {
          _chamador: string
          _employee_id: string
          _perfil: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      preparar_link_senha: {
        Args: { _chamador: string; _employee_id: string }
        Returns: string
      }
      responder_contestacao: {
        Args: {
          _aceitar: boolean
          _contestation_id: string
          _respostas?: Json
          _resposta: string
        }
        Returns: number
      }
      registrar_avaliacao: {
        Args: {
          _assunto: string
          _comentarios: string
          _data_contato: string
          _employee_id: string
          _fortnight_id: string
          _link_conversa: string
          _respostas: Json
          _tipo: Database["public"]["Enums"]["evaluation_type"]
        }
        Returns: {
          evaluation_id: string
          nota: number
          total_interacao: number
          total_ticket_n2: number
        }[]
      }
      resumo_exclusao_colaborador: {
        Args: { _employee_id: string }
        Returns: {
          avaliacoes: number
          avaliacoes_feitas_para_outros: number
          contestacoes: number
          elegibilidades: number
          quiz: number
          rankings: number
          resultados: number
        }[]
      }
      resumo_exclusao_colaborador_interno: {
        Args: { _employee_id: string }
        Returns: {
          avaliacoes: number
          avaliacoes_feitas_para_outros: number
          contestacoes: number
          elegibilidades: number
          quiz: number
          rankings: number
          resultados: number
        }[]
      }
      validar_gestao_de_acesso: {
        Args: { _chamador: string; _employee_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      vincular_acesso: {
        Args: {
          _chamador: string
          _employee_id: string
          _perfil: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "colaborador" | "avaliador" | "adm"
      contestation_status:
        | "aberta"
        | "em_analise"
        | "respondida"
        | "deferida"
        | "indeferida"
      criterion_severity: "normal" | "gravissimo"
      employee_status: "ativo" | "inativo"
      evaluation_type: "interacao" | "ticket_n2"
      fortnight_status:
        | "aberta"
        | "em_analise"
        | "em_contestacao"
        | "pronta_para_fechamento"
        | "fechada"
      fortnight_type: "primeira" | "segunda"
      import_status: "pendente" | "validado" | "importado" | "erro"
      indicator_key:
        | "qualidade"
        | "produtividade"
        | "csat"
        | "sla_chat"
        | "sla_email"
        | "horas_online"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["colaborador", "avaliador", "adm"],
      contestation_status: [
        "aberta",
        "em_analise",
        "respondida",
        "deferida",
        "indeferida",
      ],
      criterion_severity: ["normal", "gravissimo"],
      employee_status: ["ativo", "inativo"],
      evaluation_type: ["interacao", "ticket_n2"],
      fortnight_status: [
        "aberta",
        "em_analise",
        "em_contestacao",
        "pronta_para_fechamento",
        "fechada",
      ],
      fortnight_type: ["primeira", "segunda"],
      import_status: ["pendente", "validado", "importado", "erro"],
      indicator_key: [
        "qualidade",
        "produtividade",
        "csat",
        "sla_chat",
        "sla_email",
        "horas_online",
      ],
    },
  },
} as const
