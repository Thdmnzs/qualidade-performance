export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Retorno das funções de indicadores por período (aba Indicadores do colaborador). */
type RetornoIndicadoresPeriodo = {
  ate: string;
  avaliacoes: number;
  csat_meu: number | null;
  csat_time: number | null;
  de: string;
  dias_com_dados: number;
  horas_semanais: number | null;
  produtividade: number | null;
  qualidade: number | null;
  sla_chat_s: number | null;
  sla_email_s: number | null;
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      mural_comunicados: {
        Row: {
          canal: string;
          ts: string;
          autor_nome: string | null;
          texto: string;
          respostas: Json;
          qtd_respostas: number;
          reacoes_ok: number;
          apagado: boolean;
          criado_em: string;
          editado_em: string | null;
          atualizado_em: string;
        };
        Insert: {
          canal: string;
          ts: string;
          autor_nome?: string | null;
          texto?: string;
          respostas?: Json;
          qtd_respostas?: number;
          reacoes_ok?: number;
          apagado?: boolean;
          criado_em: string;
          editado_em?: string | null;
          atualizado_em?: string;
        };
        Update: {
          canal?: string;
          ts?: string;
          autor_nome?: string | null;
          texto?: string;
          respostas?: Json;
          qtd_respostas?: number;
          reacoes_ok?: number;
          apagado?: boolean;
          criado_em?: string;
          editado_em?: string | null;
          atualizado_em?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          acao: string;
          contexto: Json | null;
          created_at: string;
          entidade: string;
          id: string;
          motivo: string | null;
          registro_id: string | null;
          usuario_id: string | null;
          usuario_nome: string | null;
          valor_anterior: Json | null;
          valor_novo: Json | null;
        };
        Insert: {
          acao: string;
          contexto?: Json | null;
          created_at?: string;
          entidade: string;
          id?: string;
          motivo?: string | null;
          registro_id?: string | null;
          usuario_id?: string | null;
          usuario_nome?: string | null;
          valor_anterior?: Json | null;
          valor_novo?: Json | null;
        };
        Update: {
          acao?: string;
          contexto?: Json | null;
          created_at?: string;
          entidade?: string;
          id?: string;
          motivo?: string | null;
          registro_id?: string | null;
          usuario_id?: string | null;
          usuario_nome?: string | null;
          valor_anterior?: Json | null;
          valor_novo?: Json | null;
        };
        Relationships: [];
      };
      bonus_eligibility: {
        Row: {
          calculado_em: string;
          created_at: string;
          elegivel: boolean;
          employee_id: string;
          fortnight_id: string;
          id: string;
          motivos: Json;
          updated_at: string;
          versao_regras: string | null;
        };
        Insert: {
          calculado_em?: string;
          created_at?: string;
          elegivel?: boolean;
          employee_id: string;
          fortnight_id: string;
          id?: string;
          motivos?: Json;
          updated_at?: string;
          versao_regras?: string | null;
        };
        Update: {
          calculado_em?: string;
          created_at?: string;
          elegivel?: boolean;
          employee_id?: string;
          fortnight_id?: string;
          id?: string;
          motivos?: Json;
          updated_at?: string;
          versao_regras?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bonus_eligibility_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bonus_eligibility_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      bonus_prizes: {
        Row: {
          created_at: string;
          descricao: string | null;
          id: string;
          posicao: number;
          updated_at: string;
          valor: number | null;
        };
        Insert: {
          created_at?: string;
          descricao?: string | null;
          id?: string;
          posicao: number;
          updated_at?: string;
          valor?: number | null;
        };
        Update: {
          created_at?: string;
          descricao?: string | null;
          id?: string;
          posicao?: number;
          updated_at?: string;
          valor?: number | null;
        };
        Relationships: [];
      };
      business_settings: {
        Row: {
          chave: string;
          created_at: string;
          descricao: string | null;
          id: string;
          pendente: boolean;
          titulo: string;
          updated_at: string;
          valor: Json | null;
          versao: number;
        };
        Insert: {
          chave: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          pendente?: boolean;
          titulo: string;
          updated_at?: string;
          valor?: Json | null;
          versao?: number;
        };
        Update: {
          chave?: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          pendente?: boolean;
          titulo?: string;
          updated_at?: string;
          valor?: Json | null;
          versao?: number;
        };
        Relationships: [];
      };
      escala_siglas: {
        Row: {
          id: string;
          sigla: string;
          cor: string;
          significado: string;
          conta_como_trabalho: boolean;
          em_atendimento: boolean;
          faixa: boolean;
          ordem: number;
          criada_em: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conquistas: {
        Row: {
          ativa: boolean;
          condicao: string;
          dimensao: string;
          nome: string;
          numero: number;
          unica: boolean;
          xp: number;
        };
        Insert: {
          ativa?: boolean;
          condicao: string;
          dimensao: string;
          nome: string;
          numero: number;
          unica?: boolean;
          xp: number;
        };
        Update: {
          ativa?: boolean;
          condicao?: string;
          dimensao?: string;
          nome?: string;
          numero?: number;
          unica?: boolean;
          xp?: number;
        };
        Relationships: [];
      };
      conquistas_ganhas: {
        Row: {
          conquista: number;
          employee_id: string;
          fortnight_id: string;
          ganha_em: string;
          id: string;
          sequencia: number;
          xp: number;
        };
        Insert: {
          conquista: number;
          employee_id: string;
          fortnight_id: string;
          ganha_em?: string;
          id?: string;
          sequencia?: number;
          xp: number;
        };
        Update: {
          conquista?: number;
          employee_id?: string;
          fortnight_id?: string;
          ganha_em?: string;
          id?: string;
          sequencia?: number;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conquistas_ganhas_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      contestation_messages: {
        Row: {
          autor_id: string | null;
          autor_tipo: string;
          contestation_id: string;
          created_at: string;
          id: string;
          mensagem: string;
        };
        Insert: {
          autor_id?: string | null;
          autor_tipo: string;
          contestation_id: string;
          created_at?: string;
          id?: string;
          mensagem: string;
        };
        Update: {
          autor_id?: string | null;
          autor_tipo?: string;
          contestation_id?: string;
          created_at?: string;
          id?: string;
          mensagem?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contestation_messages_contestation_id_fkey";
            columns: ["contestation_id"];
            isOneToOne: false;
            referencedRelation: "contestations";
            referencedColumns: ["id"];
          },
        ];
      };
      contestations: {
        Row: {
          assunto: string;
          alteracoes: Json | null;
          created_at: string;
          descricao: string;
          employee_id: string;
          evaluation_id: string | null;
          fortnight_id: string;
          id: string;
          nota_anterior: number | null;
          nota_nova: number | null;
          resolucao: string | null;
          respondida_em: string | null;
          responder_ate: string | null;
          responsavel_id: string | null;
          result_id: string | null;
          status: Database["public"]["Enums"]["contestation_status"];
          updated_at: string;
        };
        Insert: {
          assunto: string;
          alteracoes?: Json | null;
          created_at?: string;
          descricao: string;
          employee_id: string;
          evaluation_id?: string | null;
          fortnight_id: string;
          id?: string;
          nota_anterior?: number | null;
          nota_nova?: number | null;
          resolucao?: string | null;
          respondida_em?: string | null;
          responder_ate?: string | null;
          responsavel_id?: string | null;
          result_id?: string | null;
          status?: Database["public"]["Enums"]["contestation_status"];
          updated_at?: string;
        };
        Update: {
          assunto?: string;
          alteracoes?: Json | null;
          created_at?: string;
          descricao?: string;
          employee_id?: string;
          evaluation_id?: string | null;
          fortnight_id?: string;
          id?: string;
          nota_anterior?: number | null;
          nota_nova?: number | null;
          resolucao?: string | null;
          respondida_em?: string | null;
          responder_ate?: string | null;
          responsavel_id?: string | null;
          result_id?: string | null;
          status?: Database["public"]["Enums"]["contestation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contestations_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contestations_evaluation_id_fkey";
            columns: ["evaluation_id"];
            isOneToOne: false;
            referencedRelation: "evaluations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contestations_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contestations_result_id_fkey";
            columns: ["result_id"];
            isOneToOne: false;
            referencedRelation: "results";
            referencedColumns: ["id"];
          },
        ];
      };
      csat_reports: {
        Row: {
          created_at: string;
          enviado_por: string | null;
          fortnight_id: string;
          id: string;
          import_id: string | null;
          meta: number;
          nome_arquivo: string;
          storage_path: string | null;
          valor: number | null;
        };
        Insert: {
          created_at?: string;
          enviado_por?: string | null;
          fortnight_id: string;
          id?: string;
          import_id?: string | null;
          meta?: number;
          nome_arquivo: string;
          storage_path?: string | null;
          valor?: number | null;
        };
        Update: {
          created_at?: string;
          enviado_por?: string | null;
          fortnight_id?: string;
          id?: string;
          import_id?: string | null;
          meta?: number;
          nome_arquivo?: string;
          storage_path?: string | null;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "csat_reports_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "csat_reports_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "data_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      data_imports: {
        Row: {
          created_at: string;
          enviado_por: string | null;
          erros: Json;
          extensao: string;
          fortnight_id: string | null;
          id: string;
          indicador: Database["public"]["Enums"]["indicator_key"] | null;
          linhas_total: number | null;
          linhas_validas: number | null;
          nome_arquivo: string;
          preview: Json | null;
          status: Database["public"]["Enums"]["import_status"];
          storage_path: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enviado_por?: string | null;
          erros?: Json;
          extensao: string;
          fortnight_id?: string | null;
          id?: string;
          indicador?: Database["public"]["Enums"]["indicator_key"] | null;
          linhas_total?: number | null;
          linhas_validas?: number | null;
          nome_arquivo: string;
          preview?: Json | null;
          status?: Database["public"]["Enums"]["import_status"];
          storage_path?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enviado_por?: string | null;
          erros?: Json;
          extensao?: string;
          fortnight_id?: string | null;
          id?: string;
          indicador?: Database["public"]["Enums"]["indicator_key"] | null;
          linhas_total?: number | null;
          linhas_validas?: number | null;
          nome_arquivo?: string;
          preview?: Json | null;
          status?: Database["public"]["Enums"]["import_status"];
          storage_path?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "data_imports_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          created_at: string;
          email: string;
          foto_url: string | null;
          id: string;
          login: string;
          nome: string;
          status: Database["public"]["Enums"]["employee_status"];
          turno: string | null;
          updated_at: string;
          user_id: string | null;
          nome_na_planilha: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          foto_url?: string | null;
          id?: string;
          login: string;
          nome: string;
          status?: Database["public"]["Enums"]["employee_status"];
          turno?: string | null;
          updated_at?: string;
          user_id?: string | null;
          nome_na_planilha?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          foto_url?: string | null;
          id?: string;
          login?: string;
          nome?: string;
          status?: Database["public"]["Enums"]["employee_status"];
          turno?: string | null;
          updated_at?: string;
          user_id?: string | null;
          nome_na_planilha?: string | null;
        };
        Relationships: [];
      };
      evaluation_criteria: {
        Row: {
          ativo: boolean;
          created_at: string;
          descricao: string;
          gravidade: Database["public"]["Enums"]["criterion_severity"];
          grupo: string;
          id: string;
          ordem: number;
          orientacao: string | null;
          permite_medio: boolean;
          peso: number;
          peso_medio: number | null;
          updated_at: string;
          versao: number;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          descricao: string;
          gravidade?: Database["public"]["Enums"]["criterion_severity"];
          grupo: string;
          id?: string;
          ordem: number;
          orientacao?: string | null;
          permite_medio?: boolean;
          peso: number;
          peso_medio?: number | null;
          updated_at?: string;
          versao?: number;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          descricao?: string;
          gravidade?: Database["public"]["Enums"]["criterion_severity"];
          grupo?: string;
          id?: string;
          ordem?: number;
          orientacao?: string | null;
          permite_medio?: boolean;
          peso?: number;
          peso_medio?: number | null;
          updated_at?: string;
          versao?: number;
        };
        Relationships: [];
      };
      evaluation_items: {
        Row: {
          created_at: string;
          criterion_id: string;
          desconto: number;
          evaluation_id: string;
          id: string;
          observacao: string | null;
          resposta: string;
        };
        Insert: {
          created_at?: string;
          criterion_id: string;
          desconto?: number;
          evaluation_id: string;
          id?: string;
          observacao?: string | null;
          resposta: string;
        };
        Update: {
          created_at?: string;
          criterion_id?: string;
          desconto?: number;
          evaluation_id?: string;
          id?: string;
          observacao?: string | null;
          resposta?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evaluation_items_criterion_id_fkey";
            columns: ["criterion_id"];
            isOneToOne: false;
            referencedRelation: "evaluation_criteria";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evaluation_items_evaluation_id_fkey";
            columns: ["evaluation_id"];
            isOneToOne: false;
            referencedRelation: "evaluations";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluations: {
        Row: {
          anulada: boolean;
          anulada_em: string | null;
          anulada_por: string | null;
          assunto: string | null;
          avaliador_id: string | null;
          comentarios: string | null;
          created_at: string;
          data_contato: string | null;
          employee_id: string;
          fortnight_id: string;
          id: string;
          link_conversa: string | null;
          motivo_anulacao: string | null;
          nota: number | null;
          nota_original: number | null;
          processo_id: string | null;
          processo_versao: number | null;
          ticket: string | null;
          tipo: Database["public"]["Enums"]["evaluation_type"];
          updated_at: string;
          versao_ficha: number;
        };
        Insert: {
          anulada?: boolean;
          anulada_em?: string | null;
          anulada_por?: string | null;
          assunto?: string | null;
          avaliador_id?: string | null;
          comentarios?: string | null;
          created_at?: string;
          data_contato?: string | null;
          employee_id: string;
          fortnight_id: string;
          id?: string;
          link_conversa?: string | null;
          motivo_anulacao?: string | null;
          nota?: number | null;
          nota_original?: number | null;
          processo_id?: string | null;
          processo_versao?: number | null;
          ticket?: string | null;
          tipo: Database["public"]["Enums"]["evaluation_type"];
          updated_at?: string;
          versao_ficha?: number;
        };
        Update: {
          anulada?: boolean;
          anulada_em?: string | null;
          anulada_por?: string | null;
          assunto?: string | null;
          avaliador_id?: string | null;
          comentarios?: string | null;
          created_at?: string;
          data_contato?: string | null;
          employee_id?: string;
          fortnight_id?: string;
          id?: string;
          link_conversa?: string | null;
          motivo_anulacao?: string | null;
          nota?: number | null;
          nota_original?: number | null;
          processo_id?: string | null;
          processo_versao?: number | null;
          ticket?: string | null;
          tipo?: Database["public"]["Enums"]["evaluation_type"];
          updated_at?: string;
          versao_ficha?: number;
        };
        Relationships: [
          {
            foreignKeyName: "evaluations_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evaluations_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      fortnights: {
        Row: {
          ano: number;
          created_at: string;
          data_fim: string;
          data_inicio: string;
          fechado_em: string | null;
          fechado_por: string | null;
          id: string;
          mes: number;
          prazo_contestacao_ate: string | null;
          publicado_em: string | null;
          status: Database["public"]["Enums"]["fortnight_status"];
          tipo: Database["public"]["Enums"]["fortnight_type"];
          updated_at: string;
        };
        Insert: {
          ano: number;
          created_at?: string;
          data_fim: string;
          data_inicio: string;
          fechado_em?: string | null;
          fechado_por?: string | null;
          id?: string;
          mes: number;
          prazo_contestacao_ate?: string | null;
          publicado_em?: string | null;
          status?: Database["public"]["Enums"]["fortnight_status"];
          tipo: Database["public"]["Enums"]["fortnight_type"];
          updated_at?: string;
        };
        Update: {
          ano?: number;
          created_at?: string;
          data_fim?: string;
          data_inicio?: string;
          fechado_em?: string | null;
          fechado_por?: string | null;
          id?: string;
          mes?: number;
          prazo_contestacao_ate?: string | null;
          publicado_em?: string | null;
          status?: Database["public"]["Enums"]["fortnight_status"];
          tipo?: Database["public"]["Enums"]["fortnight_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      indicadores_diarios: {
        Row: {
          id: string;
          employee_id: string;
          dia: string;
          conversas_atribuidas: number | null;
          autoatribuicoes: number | null;
          tempo_ativo_min: number | null;
          sla_chat_s: number | null;
          sla_email_s: number | null;
          csat_positivas: number | null;
          csat_total: number | null;
          horas_logadas_min: number | null;
          importacao_id: string | null;
          leitura_id: string | null;
          created_at: string;
          updated_at: string;
          sla_b2c_chat_1_s: number | null;
          sla_b2c_email_1_s: number | null;
          sla_b2c_chat_g_s: number | null;
          sla_b2c_email_g_s: number | null;
          sla_b2b_chat_1_s: number | null;
          sla_b2b_email_1_s: number | null;
          sla_b2b_chat_g_s: number | null;
          sla_b2b_email_g_s: number | null;
        };
        Insert: {
          id?: string;
          employee_id: string;
          dia: string;
          conversas_atribuidas?: number | null;
          autoatribuicoes?: number | null;
          tempo_ativo_min?: number | null;
          sla_chat_s?: number | null;
          sla_email_s?: number | null;
          csat_positivas?: number | null;
          csat_total?: number | null;
          horas_logadas_min?: number | null;
          importacao_id?: string | null;
          leitura_id?: string | null;
          created_at?: string;
          updated_at?: string;
          sla_b2c_chat_1_s?: number | null;
          sla_b2c_email_1_s?: number | null;
          sla_b2c_chat_g_s?: number | null;
          sla_b2c_email_g_s?: number | null;
          sla_b2b_chat_1_s?: number | null;
          sla_b2b_email_1_s?: number | null;
          sla_b2b_chat_g_s?: number | null;
          sla_b2b_email_g_s?: number | null;
        };
        Update: {
          id?: string;
          employee_id?: string;
          dia?: string;
          conversas_atribuidas?: number | null;
          autoatribuicoes?: number | null;
          tempo_ativo_min?: number | null;
          sla_chat_s?: number | null;
          sla_email_s?: number | null;
          csat_positivas?: number | null;
          csat_total?: number | null;
          horas_logadas_min?: number | null;
          importacao_id?: string | null;
          leitura_id?: string | null;
          created_at?: string;
          updated_at?: string;
          sla_b2c_chat_1_s?: number | null;
          sla_b2c_email_1_s?: number | null;
          sla_b2c_chat_g_s?: number | null;
          sla_b2c_email_g_s?: number | null;
          sla_b2b_chat_1_s?: number | null;
          sla_b2b_email_1_s?: number | null;
          sla_b2b_chat_g_s?: number | null;
          sla_b2b_email_g_s?: number | null;
        };
        Relationships: [];
      };
      indicators: {
        Row: {
          chave: Database["public"]["Enums"]["indicator_key"];
          created_at: string;
          descricao: string | null;
          id: string;
          meta_operador: string | null;
          meta_valor: number | null;
          nome: string;
          unidade: string | null;
          updated_at: string;
        };
        Insert: {
          chave: Database["public"]["Enums"]["indicator_key"];
          created_at?: string;
          descricao?: string | null;
          id?: string;
          meta_operador?: string | null;
          meta_valor?: number | null;
          nome: string;
          unidade?: string | null;
          updated_at?: string;
        };
        Update: {
          chave?: Database["public"]["Enums"]["indicator_key"];
          created_at?: string;
          descricao?: string | null;
          id?: string;
          meta_operador?: string | null;
          meta_valor?: number | null;
          nome?: string;
          unidade?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      intercom_diagnosticos: {
        Row: {
          criado_em: string;
          criado_por: string | null;
          erro: string | null;
          id: string;
          ok: boolean;
          resumo: Json | null;
        };
        Insert: {
          criado_em?: string;
          criado_por?: string | null;
          erro?: string | null;
          id?: string;
          ok: boolean;
          resumo?: Json | null;
        };
        Update: {
          criado_em?: string;
          criado_por?: string | null;
          erro?: string | null;
          id?: string;
          ok?: boolean;
          resumo?: Json | null;
        };
        Relationships: [];
      };
      perfis_colaborador: {
        Row: {
          atualizado_em: string;
          destaques: number[];
          employee_id: string;
        };
        Insert: {
          atualizado_em?: string;
          destaques?: number[];
          employee_id: string;
        };
        Update: {
          atualizado_em?: string;
          destaques?: number[];
          employee_id?: string;
        };
        Relationships: [];
      };
      processos: {
        Row: {
          ativo: boolean;
          base: string;
          categoria: string | null;
          codigo: string | null;
          created_at: string;
          editado_no_notion: string | null;
          id: string;
          notion_page_id: string;
          revisado: boolean;
          sincronizado_em: string | null;
          subcategoria: string | null;
          titulo: string;
          ultima_revisao: string | null;
          url: string;
          versao_atual: number;
          ordem: number | null;
        };
        Insert: {
          ativo?: boolean;
          base: string;
          categoria?: string | null;
          codigo?: string | null;
          created_at?: string;
          editado_no_notion?: string | null;
          id?: string;
          notion_page_id: string;
          revisado?: boolean;
          sincronizado_em?: string | null;
          subcategoria?: string | null;
          titulo: string;
          ultima_revisao?: string | null;
          url: string;
          versao_atual?: number;
          ordem?: number | null;
        };
        Update: {
          ativo?: boolean;
          base?: string;
          categoria?: string | null;
          codigo?: string | null;
          created_at?: string;
          editado_no_notion?: string | null;
          id?: string;
          notion_page_id?: string;
          revisado?: boolean;
          sincronizado_em?: string | null;
          subcategoria?: string | null;
          titulo?: string;
          ultima_revisao?: string | null;
          url?: string;
          versao_atual?: number;
          ordem?: number | null;
        };
        Relationships: [];
      };
      processos_sincronizacoes: {
        Row: {
          alterados: number;
          concluida_em: string | null;
          erros: Json;
          fila: Json;
          id: string;
          iniciada_em: string;
          iniciada_por: string | null;
          novos: number;
          processados: number;
          resumo: Json | null;
          sem_mudanca: number;
          status: string;
          total: number;
        };
        Insert: {
          alterados?: number;
          concluida_em?: string | null;
          erros?: Json;
          fila?: Json;
          id?: string;
          iniciada_em?: string;
          iniciada_por?: string | null;
          novos?: number;
          processados?: number;
          resumo?: Json | null;
          sem_mudanca?: number;
          status?: string;
          total?: number;
        };
        Update: {
          alterados?: number;
          concluida_em?: string | null;
          erros?: Json;
          fila?: Json;
          id?: string;
          iniciada_em?: string;
          iniciada_por?: string | null;
          novos?: number;
          processados?: number;
          resumo?: Json | null;
          sem_mudanca?: number;
          status?: string;
          total?: number;
        };
        Relationships: [];
      };
      processos_versoes: {
        Row: {
          conteudo: string;
          criado_em: string;
          editado_no_notion: string | null;
          hash: string;
          id: string;
          origem: string;
          processo_id: string;
          versao: number;
        };
        Insert: {
          conteudo: string;
          criado_em?: string;
          editado_no_notion?: string | null;
          hash: string;
          id?: string;
          origem: string;
          processo_id: string;
          versao: number;
        };
        Update: {
          conteudo?: string;
          criado_em?: string;
          editado_no_notion?: string | null;
          hash?: string;
          id?: string;
          origem?: string;
          processo_id?: string;
          versao?: number;
        };
        Relationships: [];
      };
      quiz_results: {
        Row: {
          created_at: string;
          employee_id: string;
          entregue: boolean;
          fortnight_id: string;
          id: string;
          registrado_por: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          entregue?: boolean;
          fortnight_id: string;
          id?: string;
          registrado_por?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          entregue?: boolean;
          fortnight_id?: string;
          id?: string;
          registrado_por?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_results_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_results_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      rankings: {
        Row: {
          criterios: Json;
          employee_id: string;
          fortnight_id: string;
          gerado_em: string;
          id: string;
          posicao: number;
        };
        Insert: {
          criterios?: Json;
          employee_id: string;
          fortnight_id: string;
          gerado_em?: string;
          id?: string;
          posicao: number;
        };
        Update: {
          criterios?: Json;
          employee_id?: string;
          fortnight_id?: string;
          gerado_em?: string;
          id?: string;
          posicao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rankings_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rankings_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      results: {
        Row: {
          created_at: string;
          dias_trabalhados: number | null;
          employee_id: string;
          fortnight_id: string;
          id: string;
          import_id: string | null;
          indicador: Database["public"]["Enums"]["indicator_key"];
          origem: string | null;
          updated_at: string;
          valor: number | null;
        };
        Insert: {
          created_at?: string;
          dias_trabalhados?: number | null;
          employee_id: string;
          fortnight_id: string;
          id?: string;
          import_id?: string | null;
          indicador: Database["public"]["Enums"]["indicator_key"];
          origem?: string | null;
          updated_at?: string;
          valor?: number | null;
        };
        Update: {
          created_at?: string;
          dias_trabalhados?: number | null;
          employee_id?: string;
          fortnight_id?: string;
          id?: string;
          import_id?: string | null;
          indicador?: Database["public"]["Enums"]["indicator_key"];
          origem?: string | null;
          updated_at?: string;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "results_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "results_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      sorteios_contato: {
        Row: {
          conversa_id: string;
          criado_em: string;
          descartado_em: string | null;
          employee_id: string;
          fortnight_id: string;
          id: string;
          link: string;
          motivo_descarte: string | null;
          sorteado_por: string | null;
          tipo: Database["public"]["Enums"]["evaluation_type"];
        };
        Insert: {
          conversa_id: string;
          criado_em?: string;
          descartado_em?: string | null;
          employee_id: string;
          fortnight_id: string;
          id?: string;
          link: string;
          motivo_descarte?: string | null;
          sorteado_por?: string | null;
          tipo: Database["public"]["Enums"]["evaluation_type"];
        };
        Update: {
          conversa_id?: string;
          criado_em?: string;
          descartado_em?: string | null;
          employee_id?: string;
          fortnight_id?: string;
          id?: string;
          link?: string;
          motivo_descarte?: string | null;
          sorteado_por?: string | null;
          tipo?: Database["public"]["Enums"]["evaluation_type"];
        };
        Relationships: [];
      };
      team_metrics: {
        Row: {
          created_at: string;
          fortnight_id: string;
          id: string;
          indicador: Database["public"]["Enums"]["indicator_key"];
          media: number | null;
          meta: number | null;
          minimo_elegibilidade: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          fortnight_id: string;
          id?: string;
          indicador: Database["public"]["Enums"]["indicator_key"];
          media?: number | null;
          meta?: number | null;
          minimo_elegibilidade?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          fortnight_id?: string;
          id?: string;
          indicador?: Database["public"]["Enums"]["indicator_key"];
          media?: number | null;
          meta?: number | null;
          minimo_elegibilidade?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_metrics_fortnight_id_fkey";
            columns: ["fortnight_id"];
            isOneToOne: false;
            referencedRelation: "fortnights";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      alterar_status_colaborador: {
        Args: {
          _chamador: string;
          _employee_id: string;
          _status: Database["public"]["Enums"]["employee_status"];
        };
        Returns: string;
      };
      alterar_ciclo_quinzena: {
        Args: { _acao: string; _fortnight_id: string; _motivo?: string };
        Returns: Database["public"]["Enums"]["fortnight_status"];
      };
      contestar_avaliacao: {
        Args: { _descricao: string; _evaluation_id: string };
        Returns: string;
      };
      buscar_pre_avaliacao: {
        Args: {
          _chamador: string;
          _conversa_id: string;
          _employee_id: string;
          _fortnight_id: string;
        };
        Returns: Json;
      };
      buscar_processos: {
        Args: { _limite?: number; _texto: string };
        Returns: {
          base: string;
          codigo: string | null;
          id: string;
          revisado: boolean;
          titulo: string;
          url: string;
          versao: number;
        }[];
      };
      criar_proxima_quinzena: { Args: never; Returns: string };
      current_employee_id: { Args: never; Returns: string };
      definir_perfil: {
        Args: {
          _employee_id: string;
          _perfil: Database["public"]["Enums"]["app_role"];
        };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      desativar_processos_ausentes: {
        Args: { _bases: string[]; _presentes: string[] };
        Returns: number;
      };
      definir_destaques: { Args: { _conquistas: number[] }; Returns: number[] };
      descartar_sorteio_contato: {
        Args: { _chamador: string; _motivo: string; _sorteio_id: string };
        Returns: undefined;
      };
      avisos_slack_pendentes: { Args: never; Returns: { evento: string; id: string }[] };
      dados_do_aviso_de_contestacao: {
        Args: { _id: string };
        Returns: {
          assunto: string | null;
          avaliador: string | null;
          colaborador: string;
          data_contato: string | null;
          id: string;
          nota_anterior: number | null;
          nota_nova: number | null;
          respondeu: string | null;
          respondida_em: string | null;
          responder_ate: string | null;
          slack_abertura_em: string | null;
          slack_lembrete_em: string | null;
          slack_resposta_em: string | null;
          slack_ts: string | null;
          status: string;
          tipo: string | null;
        }[];
      };
      desfazer_aviso_slack: { Args: { _evento: string; _id: string }; Returns: undefined };
      guardar_mensagem_slack: { Args: { _id: string; _ts: string }; Returns: undefined };
      reservar_aviso_slack: { Args: { _evento: string; _id: string }; Returns: boolean };
      meu_progresso_de_conquistas: {
        Args: never;
        Returns: { quinzenas_com_100: number; quinzenas_avaliadas: number }[];
      };
      acesso_rapido: { Args: never; Returns: Json };
      apagar_humores_antigos: { Args: never; Returns: number };
      funcionalidades_ativas: { Args: never; Returns: Json };
      definir_funcionalidade: { Args: { _chave: string; _ativa: boolean }; Returns: undefined };
      meus_nucleos: { Args: never; Returns: string[] };
      meu_horario: { Args: never; Returns: Json };
      registrar_humor: { Args: { _nivel: number; _comentario: string }; Returns: undefined };
      meus_humores: {
        Args: { _dias: number };
        Returns: { dia: string; nivel: number; comentario: string | null }[];
      };
      humor_do_time: {
        Args: never;
        Returns: {
          employee_id: string;
          hoje: number | null;
          comentario_de_hoje: string | null;
          ultimos: Json;
        }[];
      };
      pode_avisar_troca: { Args: { _id: string; _user_id: string }; Returns: boolean };
      registrar_no_historico: {
        Args: {
          _usuario_id: string;
          _acao: string;
          _entidade: string;
          _registro_id: string | null;
          _valor_novo: Json;
        };
        Returns: undefined;
      };
      guardar_codigos_de_recuperacao: {
        Args: { _user_id: string; _codigos: string[] };
        Returns: undefined;
      };
      usar_codigo_de_recuperacao: { Args: { _user_id: string; _codigo: string }; Returns: boolean };
      apagar_codigos_e_sessoes: { Args: { _user_id: string }; Returns: undefined };
      verificacao_do_time: { Args: never; Returns: Json };
      nucleos_do_time: { Args: never; Returns: Json };
      definir_nucleos: { Args: { _employee_id: string; _nucleos: string[] }; Returns: undefined };
      apelidos_da_escala_do_time: { Args: never; Returns: Json };
      importar_semana_da_escala: {
        Args: { _inicio: string; _dias: Json; _apelidos: Json; _confirmar: boolean };
        Returns: undefined;
      };
      reservar_leitura_do_mural: { Args: { _minutos: number }; Returns: boolean };
      concluir_leitura_do_mural: { Args: never; Returns: undefined };
      orientacoes_para_treinar: { Args: never; Returns: Json };
      versoes_da_orientacao: { Args: { _criterion_id: string }; Returns: Json };
      salvar_orientacao: {
        Args: {
          _criterion_id: string;
          _sim: string;
          _medio: string;
          _nao: string;
          _exemplo: string;
        };
        Returns: undefined;
      };
      registrar_motivos_das_mudancas: {
        Args: { _evaluation_id: string; _motivos: Json };
        Returns: undefined;
      };
      concordancia_da_ia: { Args: { _de: string; _ate: string }; Returns: Json };
      avaliacoes_para_exemplos: { Args: { _limite?: number }; Returns: Json };
      marcar_exemplar: { Args: { _evaluation_id: string; _exemplar: boolean }; Returns: undefined };
      exemplos_para_pre_avaliacao: {
        Args: {
          _processo_id: string | null;
          _assunto: string | null;
          _excluir_employee: string | null;
        };
        Returns: Json;
      };
      meu_resultado_da_quinzena: { Args: { _fortnight_id: string }; Returns: Json };
      gravar_copia_da_planilha: {
        Args: { _aba: string; _valores: Json; _dia: string | null };
        Returns: undefined;
      };
      copia_da_planilha: { Args: never; Returns: Json };
      gravar_leitura_da_planilha: { Args: { _origem: string; _linhas: Json }; Returns: Json };
      registrar_erro_da_leitura: { Args: { _origem: string; _erro: string }; Returns: undefined };
      leituras_da_planilha_recentes: { Args: never; Returns: Json };
      associar_nome_da_planilha: {
        Args: { _employee_id: string; _nome: string };
        Returns: undefined;
      };
      salvar_grupo_de_atalhos: {
        Args: { _id: string | null; _nome: string; _icone: string };
        Returns: string;
      };
      excluir_grupo_de_atalhos: { Args: { _id: string }; Returns: undefined };
      mover_grupo_de_atalhos: { Args: { _id: string; _direcao: number }; Returns: undefined };
      salvar_atalho: {
        Args: {
          _id: string | null;
          _grupo_id: string;
          _nome: string;
          _url: string;
          _sub: string;
          _restrito: boolean;
        };
        Returns: string;
      };
      excluir_atalho: { Args: { _id: string }; Returns: undefined };
      mover_atalho: { Args: { _id: string; _direcao: number }; Returns: undefined };
      minha_aparencia: { Args: never; Returns: Json };
      horarios_de_trabalho: {
        Args: never;
        Returns: {
          employee_id: string;
          entrada: number;
          saida: number;
          pausa: number;
          fds_dias: number[] | null;
          fds_entrada: number | null;
          fds_saida: number | null;
          fds_pausa: number | null;
        }[];
      };
      definir_horario_de_trabalho: {
        Args: {
          _employee_id: string;
          _entrada: number | null;
          _saida: number | null;
          _pausa: number | null;
          _fds_dias: number[] | null;
          _fds_entrada: number | null;
          _fds_saida: number | null;
          _fds_pausa: number | null;
        };
        Returns: undefined;
      };
      consumir_limite_de_uso: {
        Args: { _chave: string; _maximo: number; _janela_em_segundos: number };
        Returns: boolean;
      };
      limpar_limites_de_uso: { Args: never; Returns: number };
      minhas_notificacoes: { Args: never; Returns: Json };
      marcar_notificacoes_lidas: { Args: { _ids: string[] | null }; Returns: undefined };
      limpar_notificacoes_antigas: { Args: never; Returns: number };
      dados_do_aviso_de_troca: { Args: { _id: string }; Returns: Json };
      reservar_aviso_de_troca: { Args: { _id: string; _evento: string }; Returns: boolean };
      desfazer_aviso_de_troca: { Args: { _id: string; _evento: string }; Returns: undefined };
      guardar_mensagem_da_troca: { Args: { _id: string; _ts: string }; Returns: undefined };
      avisos_de_troca_pendentes: { Args: never; Returns: { id: string; evento: string }[] };
      pedir_troca_no_dia: {
        Args: {
          _data: string;
          _tipo: string;
          _com: string;
          _modo: string | null;
          _segundo: string | null;
          _mensagem: string;
        };
        Returns: string;
      };
      folgas_fixas_do_time: {
        Args: never;
        Returns: { employee_id: string; nome: string; dias: number[]; supervisao: boolean }[];
      };
      definir_folga_fixa: { Args: { _employee_id: string; _dias: number[] }; Returns: undefined };
      aplicar_trocas_da_semana: { Args: { _inicio: string }; Returns: number };
      minhas_trocas: { Args: never; Returns: Json };
      trocas_para_aprovar: { Args: never; Returns: Json };
      responder_troca: { Args: { _troca: string; _aceitar: boolean }; Returns: undefined };
      cancelar_troca: { Args: { _troca: string }; Returns: undefined };
      decidir_troca: {
        Args: { _troca: string; _aprovar: boolean; _motivo: string };
        Returns: undefined;
      };
      aniversariantes_de_hoje: {
        Args: never;
        Returns: { employee_id: string; nome: string; sou_eu: boolean; ja_dei: boolean }[];
      };
      proximos_aniversarios: {
        Args: { _dias: number };
        Returns: { employee_id: string; nome: string; dia: number; mes: number; data: string }[];
      };
      dar_parabens: { Args: { _aniversariante: string; _texto: string }; Returns: string };
      meus_parabens: {
        Args: never;
        Returns: { id: string; autor: string; texto: string; criado_em: string }[];
      };
      ocultar_parabens: { Args: { _id: string }; Returns: undefined };
      meus_dados_pessoais: { Args: never; Returns: Json };
      salvar_meus_dados_pessoais: {
        Args: {
          _dia: number | null;
          _mes: number | null;
          _cep: string;
          _rua: string;
          _numero: string;
          _complemento: string;
          _bairro: string;
          _cidade: string;
          _uf: string;
          _contato_nome: string;
          _contato_parentesco: string;
          _contato_telefone: string;
          _visivel: boolean;
          _tema: boolean;
        };
        Returns: undefined;
      };
      dados_pessoais_de: { Args: { _employee_id: string }; Returns: Json };
      corrigir_dados_pessoais: {
        Args: {
          _employee_id: string;
          _dia: number | null;
          _mes: number | null;
          _cep: string;
          _rua: string;
          _numero: string;
          _complemento: string;
          _bairro: string;
          _cidade: string;
          _uf: string;
          _contato_nome: string;
          _contato_parentesco: string;
          _contato_telefone: string;
        };
        Returns: undefined;
      };
      situacao_dos_dados_pessoais: {
        Args: never;
        Returns: { employee_id: string; falta: string[] }[];
      };
      definir_aparencia: {
        Args: {
          _capa: string;
          _moldura: string;
          _capa_da_temporada: boolean;
          _moldura_da_temporada: boolean;
          _capa_temporada_preferida: string | null;
        };
        Returns: undefined;
      };
      molduras_do_time: {
        Args: { _pessoas: string[] };
        Returns: { employee_id: string; moldura: string }[];
      };
      escala_da_semana: { Args: { _inicio: string }; Returns: Json };
      semanas_da_escala: { Args: never; Returns: Json };
      ferias_do_ano: { Args: { _ano: number }; Returns: Json };
      salvar_dia_da_escala: {
        Args: { _inicio: string; _dia: number; _linhas: Json };
        Returns: undefined;
      };
      salvar_semana_da_escala: { Args: { _inicio: string; _dias: Json }; Returns: undefined };
      publicar_semana_da_escala: { Args: { _inicio: string }; Returns: undefined };
      criar_sigla_da_escala: {
        Args: { _sigla: string; _cor: string; _significado: string };
        Returns: string;
      };
      definir_ferias: {
        Args: { _employee_id: string; _datas: string[]; _de_ferias: boolean };
        Returns: number;
      };
      definir_feriado: { Args: { _data: string; _feriado: boolean }; Returns: undefined };
      pedidos_de_ferias: { Args: never; Returns: Json };
      pedir_ferias: { Args: { _de: string; _ate: string; _observacao: string }; Returns: string };
      cancelar_pedido_de_ferias: { Args: { _pedido: string }; Returns: undefined };
      decidir_pedido_de_ferias: {
        Args: { _pedido: string; _aprovar: boolean; _motivo: string };
        Returns: undefined;
      };
      editar_avaliacao: {
        Args: {
          _assunto: string;
          _comentarios: string | null;
          _data_contato: string;
          _evaluation_id: string;
          _processo_id?: string | null;
          _respostas: Json;
        };
        Returns: number;
      };
      excluir_avaliacao: {
        Args: { _evaluation_id: string; _motivo: string };
        Returns: undefined;
      };
      excluir_colaborador_definitivo: {
        Args: { _chamador: string; _confirmacao: string; _employee_id: string };
        Returns: string;
      };
      fortnight_is_closed: { Args: { _fortnight_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_avaliador: { Args: { _user_id: string }; Returns: boolean };
      listar_avaliaveis: {
        Args: never;
        Returns: {
          id: string;
          nome: string;
          perfil: Database["public"]["Enums"]["app_role"];
        }[];
      };
      classificacao_da_quinzena: {
        Args: { _fortnight_id: string };
        Returns: {
          elegivel: boolean;
          employee_id: string;
          horas_semanais: number | null;
          motivos: string[];
          nome: string;
          oficial: boolean;
          posicao: number | null;
          produtividade: number | null;
          qualidade: number | null;
          quiz_entregue: boolean;
          sla_chat: number | null;
          sla_email: number | null;
        }[];
      };
      meus_indicadores: {
        Args: { _ate: string; _de: string };
        Returns: RetornoIndicadoresPeriodo[];
      };
      meus_indicadores_recentes: {
        Args: { _dias: number };
        Returns: RetornoIndicadoresPeriodo[];
      };
      referencias_para_pre_avaliacao: {
        Args: { _texto: string };
        Returns: {
          codigo: string | null;
          conteudo: string | null;
          dicionario: string | null;
          processo_id: string | null;
          titulo: string | null;
          versao: number | null;
        }[];
      };
      registrar_pre_avaliacao: {
        Args: {
          _chamador: string;
          _conversa_id: string;
          _duracao_ms: number | null;
          _employee_id: string;
          _fortnight_id: string;
          _modelo: string;
          _processo_id: string | null;
          _processo_versao: number | null;
          _sugestoes: Json;
          _tokens_entrada: number | null;
          _tokens_saida: number | null;
        };
        Returns: Json;
      };
      produtividade_avaliadores: {
        Args: { _ate: string; _de: string };
        Returns: {
          avaliacoes: number;
          avaliador_user_id: string;
          contadas: number;
          descartes: number;
          minutos: number;
          nome: string;
        }[];
      };
      registrar_abertura_contato: {
        Args: { _chamador: string; _conversa_id: string; _employee_id: string };
        Returns: undefined;
      };
      painel_avaliacoes: {
        Args: { _ate: string; _de: string; _employee_id?: string; _turno?: string };
        Returns: {
          comentarios: string | null;
          data_contato: string | null;
          employee_id: string;
          evaluation_id: string;
          fortnight_id: string;
          itens: Json;
          nome: string;
          nota: number;
          quinzena_inicio: string;
          quinzena_status: string;
          tipo: string;
          turno: string | null;
        }[];
      };
      painel_metricas: {
        Args: { _ate: string; _de: string; _employee_id?: string; _turno?: string };
        Returns: {
          csat: number | null;
          elegivel: boolean | null;
          employee_id: string;
          fortnight_id: string;
          horas_semanais: number | null;
          nome: string;
          oficial: boolean | null;
          posicao: number | null;
          premio: number | null;
          produtividade: number | null;
          qualidade: number | null;
          quinzena_inicio: string;
          quinzena_status: string;
          quiz_entregue: boolean | null;
          sla_chat: number | null;
          sla_email: number | null;
          turno: string | null;
        }[];
      };
      podio_da_quinzena: {
        Args: { _fortnight_id: string };
        Returns: {
          destaques: number[];
          employee_id: string;
          nome: string;
          oficial: boolean;
          posicao: number;
        }[];
      };
      listar_auditoria: {
        Args: {
          _acoes?: string[] | null;
          _busca?: string | null;
          _deslocamento?: number;
          _dias?: number | null;
          _limite?: number;
          _quem?: string | null;
        };
        Returns: {
          acao: string;
          alvo: string | null;
          criado_em: string;
          entidade: string;
          id: string;
          quem: string;
          total: number;
          valor_anterior: Json | null;
          valor_novo: Json | null;
        }[];
      };
      listar_avaliacoes_gestao: {
        Args: { _fortnight_id?: string };
        Returns: {
          assunto: string;
          avaliado_por: string;
          colaborador: string;
          created_at: string;
          data_contato: string;
          employee_id: string;
          fortnight_id: string;
          id: string;
          link_conversa: string;
          nota: number;
          nota_original: number | null;
          pode_excluir: boolean;
          processo_codigo: string | null;
          processo_versao: number | null;
          tipo: Database["public"]["Enums"]["evaluation_type"];
        }[];
      };
      listar_colaboradores: {
        Args: never;
        Returns: {
          created_at: string;
          email: string;
          foto_url: string;
          id: string;
          login: string;
          nome: string;
          perfil: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["employee_status"];
          tem_acesso: boolean;
          updated_at: string;
          user_id: string;
        }[];
      };
      meu_perfil: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      pode_atuar_sobre: {
        Args: { _employee_id: string; _uid: string };
        Returns: boolean;
      };
      perfil_do_usuario: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      preparar_criacao_acesso: {
        Args: {
          _chamador: string;
          _employee_id: string;
          _perfil: Database["public"]["Enums"]["app_role"];
        };
        Returns: string;
      };
      preparar_link_senha: {
        Args: { _chamador: string; _employee_id: string };
        Returns: string;
      };
      registrar_versao_processo: {
        Args: {
          _base: string;
          _categoria: string;
          _codigo: string;
          _conteudo: string;
          _editado_no_notion: string;
          _notion_page_id: string;
          _origem: string;
          _revisado: boolean;
          _subcategoria: string;
          _titulo: string;
          _ultima_revisao: string;
          _url: string;
        };
        Returns: string;
      };
      registrar_quiz: {
        Args: { _employee_id: string; _entregue: boolean; _fortnight_id: string };
        Returns: boolean;
      };
      registrar_sorteio_contato: {
        Args: {
          _chamador: string;
          _conversa_id: string;
          _employee_id: string;
          _fortnight_id: string;
          _link: string;
          _tipo: Database["public"]["Enums"]["evaluation_type"];
        };
        Returns: string;
      };
      responder_contestacao: {
        Args: {
          _aceitar: boolean;
          _contestation_id: string;
          _respostas?: Json;
          _resposta: string;
        };
        Returns: number;
      };
      qualidade_da_quinzena: {
        Args: { _fortnight_id: string };
        Returns: {
          media_time: number;
          minha_nota: number;
          minhas_avaliacoes: number;
          pessoas_avaliadas: number;
        }[];
      };
      registrar_avaliacao: {
        Args: {
          _assunto: string;
          _comentarios: string;
          _data_contato: string;
          _employee_id: string;
          _fortnight_id: string;
          _link_conversa: string;
          _processo_id?: string | null;
          _respostas: Json;
          _tipo: Database["public"]["Enums"]["evaluation_type"];
        };
        Returns: {
          evaluation_id: string;
          nota: number;
          total_interacao: number;
          total_ticket_n2: number;
        }[];
      };
      resumo_exclusao_colaborador: {
        Args: { _employee_id: string };
        Returns: {
          avaliacoes: number;
          avaliacoes_feitas_para_outros: number;
          contestacoes: number;
          elegibilidades: number;
          quiz: number;
          rankings: number;
          resultados: number;
        }[];
      };
      resumo_exclusao_colaborador_interno: {
        Args: { _employee_id: string };
        Returns: {
          avaliacoes: number;
          avaliacoes_feitas_para_outros: number;
          contestacoes: number;
          elegibilidades: number;
          quiz: number;
          rankings: number;
          resultados: number;
        }[];
      };
      validar_gestao_de_acesso: {
        Args: { _chamador: string; _employee_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      vincular_acesso: {
        Args: {
          _chamador: string;
          _employee_id: string;
          _perfil: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "colaborador" | "avaliador" | "adm";
      contestation_status: "aberta" | "em_analise" | "respondida" | "deferida" | "indeferida";
      criterion_severity: "normal" | "gravissimo";
      employee_status: "ativo" | "inativo";
      evaluation_type: "interacao" | "ticket_n2";
      fortnight_status:
        "aberta" | "em_analise" | "em_contestacao" | "pronta_para_fechamento" | "fechada";
      fortnight_type: "primeira" | "segunda";
      import_status: "pendente" | "validado" | "importado" | "erro";
      indicator_key:
        "qualidade" | "produtividade" | "csat" | "sla_chat" | "sla_email" | "horas_online";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["colaborador", "avaliador", "adm"],
      contestation_status: ["aberta", "em_analise", "respondida", "deferida", "indeferida"],
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
} as const;
