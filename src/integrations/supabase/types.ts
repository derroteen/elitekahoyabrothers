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
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      loan_repayments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          penalty: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          penalty?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          penalty?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
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
          loan_date: string
          member_id: string
          notes: string | null
          payment_frequency: Database["public"]["Enums"]["payment_frequency"]
          status: Database["public"]["Enums"]["loan_status"]
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
          loan_date?: string
          member_id: string
          notes?: string | null
          payment_frequency?: Database["public"]["Enums"]["payment_frequency"]
          status?: Database["public"]["Enums"]["loan_status"]
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
          loan_date?: string
          member_id?: string
          notes?: string | null
          payment_frequency?: Database["public"]["Enums"]["payment_frequency"]
          status?: Database["public"]["Enums"]["loan_status"]
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
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          loan_balance: number
          loan_payment: number
          member_id: string
          remarks: string | null
          savings: number
          total: number
          treasurer_sign: string | null
          updated_at: string
          withdrawal: number
        }
        Insert: {
          balance?: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          loan_balance?: number
          loan_payment?: number
          member_id: string
          remarks?: string | null
          savings?: number
          total?: number
          treasurer_sign?: string | null
          updated_at?: string
          withdrawal?: number
        }
        Update: {
          balance?: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          loan_balance?: number
          loan_payment?: number
          member_id?: string
          remarks?: string | null
          savings?: number
          total?: number
          treasurer_sign?: string | null
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      ],
      payment_frequency: ["weekly", "biweekly", "monthly", "quarterly"],
    },
  },
} as const
