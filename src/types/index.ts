export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Supabase Database type (inline — required for PostgREST type inference) ──

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          currency: string
          locale: string
          role: 'admin' | 'user'
          created_by: string | null
          created_at: string
          updated_at: string
          google_access_token: string | null
          google_refresh_token: string | null
          google_token_expiry: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          currency?: string
          locale?: string
          role?: 'admin' | 'user'
          created_by?: string | null
          created_at?: string
          updated_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
        }
        Update: {
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          currency?: string
          locale?: string
          role?: 'admin' | 'user'
          created_by?: string | null
          updated_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
        }
        Relationships: never[]
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'wallet' | 'other'
          balance: number
          initial_balance: number
          color: string | null
          icon: string | null
          is_active: boolean
          include_in_total: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'wallet' | 'other'
          balance: number
          initial_balance: number
          color?: string | null
          icon?: string | null
          is_active?: boolean
          include_in_total?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          type?: 'checking' | 'savings' | 'credit_card' | 'investment' | 'wallet' | 'other'
          balance?: number
          color?: string | null
          icon?: string | null
          is_active?: boolean
          include_in_total?: boolean
          updated_at?: string
        }
        Relationships: never[]
      }
      categories: {
        Row: {
          id: string
          user_id: string | null
          name: string
          type: 'income' | 'expense'
          color: string | null
          icon: string | null
          parent_id: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          type: 'income' | 'expense'
          color?: string | null
          icon?: string | null
          parent_id?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          type?: 'income' | 'expense'
          color?: string | null
          icon?: string | null
          parent_id?: string | null
          is_default?: boolean
          updated_at?: string
        }
        Relationships: never[]
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          type: 'income' | 'expense' | 'transfer'
          amount: number
          description: string | null
          notes: string | null
          date: string
          status: 'pending' | 'completed' | 'cancelled'
          recurring_rule_id: string | null
          destination_account_id: string | null
          transfer_amount: number | null
          tags: string[] | null
          attachments: string[] | null
          import_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          type: 'income' | 'expense' | 'transfer'
          amount: number
          description?: string | null
          notes?: string | null
          date: string
          status?: 'pending' | 'completed' | 'cancelled'
          recurring_rule_id?: string | null
          destination_account_id?: string | null
          transfer_amount?: number | null
          tags?: string[] | null
          attachments?: string[] | null
          import_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          category_id?: string | null
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          description?: string | null
          notes?: string | null
          date?: string
          status?: 'pending' | 'completed' | 'cancelled'
          destination_account_id?: string | null
          transfer_amount?: number | null
          tags?: string[] | null
          attachments?: string[] | null
          import_hash?: string | null
          updated_at?: string
        }
        Relationships: never[]
      }
      recurring_rules: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          type: 'income' | 'expense' | 'transfer'
          amount: number
          name: string
          frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
          start_date: string
          end_date: string | null
          next_date: string
          last_generated_date: string | null
          is_active: boolean
          auto_create: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          type: 'income' | 'expense' | 'transfer'
          amount: number
          name: string
          frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
          start_date: string
          end_date?: string | null
          next_date: string
          last_generated_date?: string | null
          is_active?: boolean
          auto_create?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          category_id?: string | null
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          name?: string
          frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
          start_date?: string
          end_date?: string | null
          next_date?: string
          last_generated_date?: string | null
          is_active?: boolean
          auto_create?: boolean
          updated_at?: string
        }
        Relationships: never[]
      }
      bill_alerts: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: number | null
          day_of_month: number
          days_before: number
          is_active: boolean
          created_at: string
          updated_at: string
          google_event_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount?: number | null
          day_of_month: number
          days_before?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          google_event_id?: string | null
        }
        Update: {
          name?: string
          amount?: number | null
          day_of_month?: number
          days_before?: number
          is_active?: boolean
          updated_at?: string
          google_event_id?: string | null
        }
        Relationships: never[]
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string
          name: string
          amount: number
          period_start: string
          period_end: string
          spent: number
          is_recurring: boolean
          recurrence_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          alert_threshold: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category_id: string
          name: string
          amount: number
          period_start: string
          period_end: string
          spent?: number
          is_recurring?: boolean
          recurrence_frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          alert_threshold?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          name?: string
          amount?: number
          period_start?: string
          period_end?: string
          spent?: number
          is_recurring?: boolean
          recurrence_frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          alert_threshold?: number | null
          updated_at?: string
        }
        Relationships: never[]
      }
      goals: {
        Row: {
          id: string
          user_id: string
          account_id: string | null
          name: string
          description: string | null
          target_amount: number
          current_amount: number
          target_date: string | null
          status: 'active' | 'completed' | 'cancelled'
          icon: string | null
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id?: string | null
          name: string
          description?: string | null
          target_amount: number
          current_amount?: number
          target_date?: string | null
          status?: 'active' | 'completed' | 'cancelled'
          icon?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          name?: string
          description?: string | null
          target_amount?: number
          current_amount?: number
          target_date?: string | null
          status?: 'active' | 'completed' | 'cancelled'
          icon?: string | null
          color?: string | null
          updated_at?: string
        }
        Relationships: never[]
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      account_type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'wallet' | 'other'
      category_type: 'income' | 'expense'
      transaction_type: 'income' | 'expense' | 'transfer'
      transaction_status: 'pending' | 'completed' | 'cancelled'
      recurrence_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
      alert_type: 'bill_due' | 'budget_exceeded' | 'goal_achieved' | 'low_balance' | 'custom'
      alert_status: 'active' | 'dismissed' | 'snoozed'
      goal_status: 'active' | 'completed' | 'cancelled'
    }
  }
}

// ─── Convenience type aliases (derived from Database) ─────────────────────────

type Tables = Database['public']['Tables']

export type Profile = Tables['profiles']['Row']
export type Account = Tables['accounts']['Row']
export type Category = Tables['categories']['Row']
export type Transaction = Tables['transactions']['Row']
export type RecurringRule = Tables['recurring_rules']['Row']
export type BillAlert = Tables['bill_alerts']['Row']
export type Budget = Tables['budgets']['Row']
export type Goal = Tables['goals']['Row']

// ─── Enum type aliases ─────────────────────────────────────────────────────────

export type AccountType = Database['public']['Enums']['account_type']
export type CategoryType = Database['public']['Enums']['category_type']
export type TransactionType = Database['public']['Enums']['transaction_type']
export type TransactionStatus = Database['public']['Enums']['transaction_status']
export type RecurrenceFrequency = Database['public']['Enums']['recurrence_frequency']
export type AlertType = Database['public']['Enums']['alert_type']
export type AlertStatus = Database['public']['Enums']['alert_status']
export type GoalStatus = Database['public']['Enums']['goal_status']
