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
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      benevolent_entries: {
        Row: {
          balance: number
          contribution: number
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          member_id: string
          source: string
          transaction_type: string
          updated_at: string
          weekly_entry_id: string | null
          withdrawal: number
        }
        Insert: {
          balance?: number
          contribution?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          member_id: string
          source?: string
          transaction_type?: string
          updated_at?: string
          weekly_entry_id?: string | null
          withdrawal?: number
        }
        Update: {
          balance?: number
          contribution?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          member_id?: string
          source?: string
          transaction_type?: string
          updated_at?: string
          weekly_entry_id?: string | null
          withdrawal?: number
        }
        Relationships: [
          {
            foreignKeyName: "benevolent_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benevolent_entries_weekly_entry_id_fkey"
            columns: ["weekly_entry_id"]
            isOneToOne: true
            referencedRelation: "weekly_collection_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_fines: {
        Row: {
          amount: number
          amount_paid: number
          created_at: string
          fine_date: string
          id: string
          loan_id: string
          reason: string
          schedule_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_paid?: number
          created_at?: string
          fine_date?: string
          id?: string
          loan_id: string
          reason?: string
          schedule_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          created_at?: string
          fine_date?: string
          id?: string
          loan_id?: string
          reason?: string
          schedule_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_fines_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_fines_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "loan_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          fine_paid: number
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          penalty: number
          principal_paid: number
          source: string
          weekly_entry_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          fine_paid?: number
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          penalty?: number
          principal_paid?: number
          source?: string
          weekly_entry_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          fine_paid?: number
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          penalty?: number
          principal_paid?: number
          source?: string
          weekly_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_weekly_entry_id_fkey"
            columns: ["weekly_entry_id"]
            isOneToOne: true
            referencedRelation: "weekly_collection_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_schedule: {
        Row: {
          amount_paid: number
          balance_remaining: number
          created_at: string
          due_date: string
          expected_amount: number
          fine_amount: number
          fine_paid: number
          id: string
          loan_id: string
          payment_date: string | null
          period_number: number
          prepaid: boolean
          remarks: string | null
          status: string
        }
        Insert: {
          amount_paid?: number
          balance_remaining?: number
          created_at?: string
          due_date: string
          expected_amount?: number
          fine_amount?: number
          fine_paid?: number
          id?: string
          loan_id: string
          payment_date?: string | null
          period_number: number
          prepaid?: boolean
          remarks?: string | null
          status?: string
        }
        Update: {
          amount_paid?: number
          balance_remaining?: number
          created_at?: string
          due_date?: string
          expected_amount?: number
          fine_amount?: number
          fine_paid?: number
          id?: string
          loan_id?: string
          payment_date?: string | null
          period_number?: number
          prepaid?: boolean
          remarks?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_schedule_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount_borrowed: number
          amount_paid: number
          balance: number
          created_at: string
          created_by: string | null
          id: string
          insurance: number
          interest_rate: number
          last_interest_year: number | null
          loan_date: string
          loan_term_months: number
          member_id: string
          notes: string | null
          outstanding_fines: number
          payment_frequency: Database["public"]["Enums"]["payment_frequency"]
          period_payment: number
          status: Database["public"]["Enums"]["loan_status"]
          total_fines_charged: number
          total_fines_paid: number
          total_interest_added: number
          total_repayable: number
          updated_at: string
        }
        Insert: {
          amount_borrowed: number
          amount_paid?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          insurance?: number
          interest_rate?: number
          last_interest_year?: number | null
          loan_date?: string
          loan_term_months?: number
          member_id: string
          notes?: string | null
          outstanding_fines?: number
          payment_frequency?: Database["public"]["Enums"]["payment_frequency"]
          period_payment?: number
          status?: Database["public"]["Enums"]["loan_status"]
          total_fines_charged?: number
          total_fines_paid?: number
          total_interest_added?: number
          total_repayable?: number
          updated_at?: string
        }
        Update: {
          amount_borrowed?: number
          amount_paid?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          insurance?: number
          interest_rate?: number
          last_interest_year?: number | null
          loan_date?: string
          loan_term_months?: number
          member_id?: string
          notes?: string | null
          outstanding_fines?: number
          payment_frequency?: Database["public"]["Enums"]["payment_frequency"]
          period_payment?: number
          status?: Database["public"]["Enums"]["loan_status"]
          total_fines_charged?: number
          total_fines_paid?: number
          total_interest_added?: number
          total_repayable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_opening_balances: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          member_id: string
          notes: string | null
          opening_benevolent: number
          opening_fine: number
          opening_insurance: number
          opening_loan: number
          opening_savings: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          member_id: string
          notes?: string | null
          opening_benevolent?: number
          opening_fine?: number
          opening_insurance?: number
          opening_loan?: number
          opening_savings?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          member_id?: string
          notes?: string | null
          opening_benevolent?: number
          opening_fine?: number
          opening_insurance?: number
          opening_loan?: number
          opening_savings?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_opening_balances_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      passbook_entries: {
        Row: {
          balance: number
          bonus: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          loan_balance: number
          loan_payment: number
          member_id: string
          reason: string | null
          remarks: string | null
          savings: number
          source: string
          total: number
          treasurer_sign: string | null
          updated_at: string
          weekly_entry_id: string | null
          withdrawal: number
        }
        Insert: {
          balance?: number
          bonus?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          id?: string
          loan_balance?: number
          loan_payment?: number
          member_id: string
          reason?: string | null
          remarks?: string | null
          savings?: number
          source?: string
          total?: number
          treasurer_sign?: string | null
          updated_at?: string
          weekly_entry_id?: string | null
          withdrawal?: number
        }
        Update: {
          balance?: number
          bonus?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          loan_balance?: number
          loan_payment?: number
          member_id?: string
          reason?: string | null
          remarks?: string | null
          savings?: number
          source?: string
          total?: number
          treasurer_sign?: string | null
          updated_at?: string
          weekly_entry_id?: string | null
          withdrawal?: number
        }
        Relationships: [
          {
            foreignKeyName: "passbook_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_entries_weekly_entry_id_fkey"
            columns: ["weekly_entry_id"]
            isOneToOne: true
            referencedRelation: "weekly_collection_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          date_joined: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          membership_no: string | null
          must_change_password: boolean
          phone: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_joined?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          membership_no?: string | null
          must_change_password?: boolean
          phone?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_joined?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          membership_no?: string | null
          must_change_password?: boolean
          phone?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      savings_entries: {
        Row: {
          amount: number
          balance: number
          bonus: number
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          member_id: string
          notes: string | null
          passbook_entry_id: string | null
          total: number
          withdrawal: number
        }
        Insert: {
          amount?: number
          balance?: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          member_id: string
          notes?: string | null
          passbook_entry_id?: string | null
          total?: number
          withdrawal?: number
        }
        Update: {
          amount?: number
          balance?: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          member_id?: string
          notes?: string | null
          passbook_entry_id?: string | null
          total?: number
          withdrawal?: number
        }
        Relationships: [
          {
            foreignKeyName: "savings_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_entries_passbook_entry_id_fkey"
            columns: ["passbook_entry_id"]
            isOneToOne: true
            referencedRelation: "passbook_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          development_mode: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          development_mode?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          development_mode?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      weekly_collection_entries: {
        Row: {
          benevolent_fund: number
          collection_id: string
          created_at: string
          fine: number
          id: string
          insurance: number
          loan_refund: number
          member_id: string
          remarks: string | null
          savings: number
          total: number
        }
        Insert: {
          benevolent_fund?: number
          collection_id: string
          created_at?: string
          fine?: number
          id?: string
          insurance?: number
          loan_refund?: number
          member_id: string
          remarks?: string | null
          savings?: number
          total?: number
        }
        Update: {
          benevolent_fund?: number
          collection_id?: string
          created_at?: string
          fine?: number
          id?: string
          insurance?: number
          loan_refund?: number
          member_id?: string
          remarks?: string | null
          savings?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_collection_entries_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "weekly_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_collections: {
        Row: {
          banked_by: string | null
          banked_in_advance: number
          cash_in_hand: number
          collection_date: string
          created_at: string
          created_by: string | null
          id: string
          locked: boolean
          notes: string | null
          recorded_by: string | null
          treasurer_name: string | null
          updated_at: string
          week_number: number
        }
        Insert: {
          banked_by?: string | null
          banked_in_advance?: number
          cash_in_hand?: number
          collection_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked?: boolean
          notes?: string | null
          recorded_by?: string | null
          treasurer_name?: string | null
          updated_at?: string
          week_number: number
        }
        Update: {
          banked_by?: string | null
          banked_in_advance?: number
          cash_in_hand?: number
          collection_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked?: boolean
          notes?: string | null
          recorded_by?: string | null
          treasurer_name?: string | null
          updated_at?: string
          week_number?: number
        }
        Relationships: []
      }
      weekly_expenditures: {
        Row: {
          amount: number
          created_at: string
          expenditure_date: string
          id: string
          notes: string | null
          particulars: string
          quantity: number | null
          recorded_by: string | null
          updated_at: string
          week_number: number
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          expenditure_date: string
          id?: string
          notes?: string | null
          particulars: string
          quantity?: number | null
          recorded_by?: string | null
          updated_at?: string
          week_number?: number
          year?: number
        }
        Update: {
          amount?: number
          created_at?: string
          expenditure_date?: string
          id?: string
          notes?: string | null
          particulars?: string
          quantity?: number | null
          recorded_by?: string | null
          updated_at?: string
          week_number?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_annual_interest: { Args: { _loan_id?: string }; Returns: number }
      apply_loan_fines: { Args: { _loan_id?: string }; Returns: number }
      can_view_all: { Args: { _user_id: string }; Returns: boolean }
      email_for_membership_no: {
        Args: { _membership_no: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      next_membership_no: { Args: never; Returns: string }
      recompute_benevolent_balances: {
        Args: { _member: string }
        Returns: undefined
      }
      recompute_passbook_balances: {
        Args: { _member: string }
        Returns: undefined
      }
      recompute_savings_balances: {
        Args: { _member: string }
        Returns: undefined
      }
      record_loan_repayment:
        | {
            Args: {
              _amount: number
              _loan_id: string
              _notes?: string
              _payment_date?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _amount: number
              _loan_id: string
              _notes?: string
              _payment_date?: string
              _payment_method?: string
              _source?: string
              _weekly_entry_id?: string
            }
            Returns: Json
          }
      reset_membership_seq: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "auditor" | "member"
      loan_status:
        | "pending"
        | "approved"
        | "active"
        | "closed"
        | "defaulted"
        | "rejected"
        | "completed"
        | "completed_with_fine"
        | "overdue"
      payment_frequency: "weekly" | "biweekly" | "monthly" | "quarterly"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["super_admin", "admin", "auditor", "member"],
      loan_status: [
        "pending",
        "approved",
        "active",
        "closed",
        "defaulted",
        "rejected",
        "completed",
        "completed_with_fine",
        "overdue",
      ],
      payment_frequency: ["weekly", "biweekly", "monthly", "quarterly"],
    },
  },
} as const
