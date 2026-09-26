// GERADO AUTOMATICAMENTE — não edite à mão.
//
// Reproduza com `npm run db:types`, que aplica supabase/migrations/ num
// Postgres descartável e lê o schema resultante. Se este arquivo divergir
// do banco remoto, a causa é uma migration não aplicada lá — não edite
// este arquivo para "consertar".

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          input: NonNullable<Json>;
          kind: Database["public"]["Enums"]["ai_job_kind"];
          model: string | null;
          notified_at: string | null;
          provider_interaction_id: string | null;
          result: Json | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["ai_job_status"];
          user_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input?: NonNullable<Json>;
          kind: Database["public"]["Enums"]["ai_job_kind"];
          model?: string | null;
          notified_at?: string | null;
          provider_interaction_id?: string | null;
          result?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["ai_job_status"];
          user_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input?: NonNullable<Json>;
          kind?: Database["public"]["Enums"]["ai_job_kind"];
          model?: string | null;
          notified_at?: string | null;
          provider_interaction_id?: string | null;
          result?: Json | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["ai_job_status"];
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          archived_at: string | null;
          color: string;
          created_at: string;
          icon: string | null;
          id: string;
          kind: Database["public"]["Enums"]["entry_kind"];
          name: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["entry_kind"];
          name: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["entry_kind"];
          name?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          amount_cents: number;
          category_id: string | null;
          created_at: string;
          description: string;
          id: string;
          installment_number: number | null;
          installment_total: number | null;
          is_settled: boolean;
          kind: Database["public"]["Enums"]["entry_kind"];
          notes: string | null;
          occurred_on: string;
          occurrence_key: string | null;
          settled_on: string | null;
          source: Database["public"]["Enums"]["entry_source"];
          source_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category_id?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          installment_number?: number | null;
          installment_total?: number | null;
          is_settled?: boolean;
          kind: Database["public"]["Enums"]["entry_kind"];
          notes?: string | null;
          occurred_on: string;
          occurrence_key?: string | null;
          settled_on?: string | null;
          source?: Database["public"]["Enums"]["entry_source"];
          source_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          category_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          installment_number?: number | null;
          installment_total?: number | null;
          is_settled?: boolean;
          kind?: Database["public"]["Enums"]["entry_kind"];
          notes?: string | null;
          occurred_on?: string;
          occurrence_key?: string | null;
          settled_on?: string | null;
          source?: Database["public"]["Enums"]["entry_source"];
          source_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entries_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_contributions: {
        Row: {
          amount_cents: number;
          created_at: string;
          entry_id: string | null;
          goal_id: string;
          id: string;
          note: string | null;
          occurred_on: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          entry_id?: string | null;
          goal_id: string;
          id?: string;
          note?: string | null;
          occurred_on: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          entry_id?: string | null;
          goal_id?: string;
          id?: string;
          note?: string | null;
          occurred_on?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_contributions_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_progress";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      goals: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          monthly_contribution_cents: number | null;
          name: string;
          target_amount_cents: number;
          target_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          monthly_contribution_cents?: number | null;
          name: string;
          target_amount_cents: number;
          target_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          monthly_contribution_cents?: number | null;
          name?: string;
          target_amount_cents?: number;
          target_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      installment_plans: {
        Row: {
          category_id: string | null;
          created_at: string;
          description: string;
          first_due_on: string;
          id: string;
          installments_count: number;
          total_amount_cents: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          description: string;
          first_due_on: string;
          id?: string;
          installments_count: number;
          total_amount_cents: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          description?: string;
          first_due_on?: string;
          id?: string;
          installments_count?: number;
          total_amount_cents?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installment_plans_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          invited_by: string;
          label: string | null;
          status: Database["public"]["Enums"]["invite_status"];
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          label?: string | null;
          status?: Database["public"]["Enums"]["invite_status"];
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          label?: string | null;
          status?: Database["public"]["Enums"]["invite_status"];
        };
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          ai_insights_enabled: boolean;
          ai_model: string | null;
          ai_notifications_enabled: boolean;
          created_at: string;
          display_name: string;
          id: string;
          opening_balance_cents: number;
          opening_balance_on: string;
          role: Database["public"]["Enums"]["app_role"];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          ai_insights_enabled?: boolean;
          ai_model?: string | null;
          ai_notifications_enabled?: boolean;
          created_at?: string;
          display_name?: string;
          id: string;
          opening_balance_cents?: number;
          opening_balance_on?: string;
          role?: Database["public"]["Enums"]["app_role"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          ai_insights_enabled?: boolean;
          ai_model?: string | null;
          ai_notifications_enabled?: boolean;
          created_at?: string;
          display_name?: string;
          id?: string;
          opening_balance_cents?: number;
          opening_balance_on?: string;
          role?: Database["public"]["Enums"]["app_role"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth_secret: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth_secret: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth_secret?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      recurring_rules: {
        Row: {
          amount_cents: number;
          category_id: string | null;
          created_at: string;
          day_of_month: number | null;
          description: string;
          ends_on: string | null;
          frequency: Database["public"]["Enums"]["recurrence_freq"];
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["entry_kind"];
          starts_on: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category_id?: string | null;
          created_at?: string;
          day_of_month?: number | null;
          description: string;
          ends_on?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_freq"];
          id?: string;
          is_active?: boolean;
          kind: Database["public"]["Enums"]["entry_kind"];
          starts_on: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          category_id?: string | null;
          created_at?: string;
          day_of_month?: number | null;
          description?: string;
          ends_on?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_freq"];
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["entry_kind"];
          starts_on?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      scenario_entries: {
        Row: {
          amount_cents: number;
          category_id: string | null;
          created_at: string;
          description: string;
          id: string;
          kind: Database["public"]["Enums"]["entry_kind"];
          occurs_on: string;
          scenario_id: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category_id?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          kind: Database["public"]["Enums"]["entry_kind"];
          occurs_on: string;
          scenario_id: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          category_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["entry_kind"];
          occurs_on?: string;
          scenario_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenario_entries_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scenario_entries_scenario_id_fkey";
            columns: ["scenario_id"];
            isOneToOne: false;
            referencedRelation: "scenarios";
            referencedColumns: ["id"];
          },
        ];
      };
      scenario_overrides: {
        Row: {
          amount_cents_override: number | null;
          created_at: string;
          date_override: string | null;
          id: string;
          is_included: boolean;
          occurrence_key: string | null;
          scenario_id: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["override_target"];
          user_id: string;
        };
        Insert: {
          amount_cents_override?: number | null;
          created_at?: string;
          date_override?: string | null;
          id?: string;
          is_included?: boolean;
          occurrence_key?: string | null;
          scenario_id: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["override_target"];
          user_id: string;
        };
        Update: {
          amount_cents_override?: number | null;
          created_at?: string;
          date_override?: string | null;
          id?: string;
          is_included?: boolean;
          occurrence_key?: string | null;
          scenario_id?: string;
          target_id?: string;
          target_type?: Database["public"]["Enums"]["override_target"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenario_overrides_scenario_id_fkey";
            columns: ["scenario_id"];
            isOneToOne: false;
            referencedRelation: "scenarios";
            referencedColumns: ["id"];
          },
        ];
      };
      scenarios: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          is_active: boolean;
          name: string;
          opening_balance_cents: number;
          starts_on: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          is_active?: boolean;
          name: string;
          opening_balance_cents?: number;
          starts_on: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          opening_balance_cents?: number;
          starts_on?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_category_breakdown: {
        Row: {
          category_color: string | null;
          category_id: string | null;
          category_name: string | null;
          kind: Database["public"]["Enums"]["entry_kind"] | null;
          month: string | null;
          total_cents: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "entries_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      v_goal_progress: {
        Row: {
          goal_id: string | null;
          name: string | null;
          pct: number | null;
          remaining_cents: number | null;
          saved_cents: number | null;
          target_amount_cents: number | null;
          target_date: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_installment_progress: {
        Row: {
          description: string | null;
          installments_count: number | null;
          next_due_on: string | null;
          paid_count: number | null;
          plan_id: string | null;
          remaining_cents: number | null;
          total_amount_cents: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_monthly_summary: {
        Row: {
          expense_cents: number | null;
          income_cents: number | null;
          month: string | null;
          net_cents: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      activate_scenario: { Args: { p_scenario_id: string }; Returns: undefined };
      create_installment_plan: {
        Args: {
          p_category_id?: string;
          p_description: string;
          p_first_due_on: string;
          p_installments: Json;
          p_installments_count: number;
          p_total_amount_cents: number;
        };
        Returns: string;
      };
      delete_installment_plan: { Args: { p_plan_id: string }; Returns: number };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      materialize_recurring_occurrence: {
        Args: { p_occurs_on: string; p_rule_id: string; p_settled?: boolean };
        Returns: string;
      };
      set_scenario_override: {
        Args: {
          p_amount_cents?: number;
          p_date_override?: string;
          p_is_included?: boolean;
          p_occurrence_key?: string;
          p_scenario_id: string;
          p_target_id: string;
          p_target_type: Database["public"]["Enums"]["override_target"];
        };
        Returns: string;
      };
    };
    Enums: {
      ai_job_kind: "interpret" | "apply" | "insights";
      ai_job_status: "queued" | "running" | "completed" | "failed" | "canceled";
      app_role: "admin" | "member";
      entry_kind: "expense" | "income";
      entry_source: "manual" | "recurring" | "installment" | "goal";
      invite_status: "pending" | "accepted" | "revoked";
      override_target: "entry" | "recurring_rule" | "installment_plan" | "goal";
      recurrence_freq: "monthly" | "weekly" | "yearly";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_job_kind: ["interpret", "apply", "insights"],
      ai_job_status: ["queued", "running", "completed", "failed", "canceled"],
      app_role: ["admin", "member"],
      entry_kind: ["expense", "income"],
      entry_source: ["manual", "recurring", "installment", "goal"],
      invite_status: ["pending", "accepted", "revoked"],
      override_target: ["entry", "recurring_rule", "installment_plan", "goal"],
      recurrence_freq: ["monthly", "weekly", "yearly"],
    },
  },
} as const;
