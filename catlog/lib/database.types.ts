export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cat_elims: {
        Row: {
          amount: number | null
          dt: string
          id: number
          kind: string
          note: string | null
          score: number | null
          stool: string | null
          urine: string | null
          urine_ml: number | null
          user_id: string | null
          vomit: boolean
        }
        Insert: {
          amount?: number | null
          dt?: string
          id?: never
          kind?: string
          note?: string | null
          score?: number | null
          stool?: string | null
          urine?: string | null
          urine_ml?: number | null
          user_id?: string | null
          vomit?: boolean
        }
        Update: {
          amount?: number | null
          dt?: string
          id?: never
          kind?: string
          note?: string | null
          score?: number | null
          stool?: string | null
          urine?: string | null
          urine_ml?: number | null
          user_id?: string | null
          vomit?: boolean
        }
        Relationships: []
      }
      cat_foods: {
        Row: {
          created_at: string
          food_name: string
          food_type: string | null
          id: number
          kcal_per_g: number
          package_g: number | null
          package_kcal: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          food_name: string
          food_type?: string | null
          id?: never
          kcal_per_g: number
          package_g?: number | null
          package_kcal?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          food_name?: string
          food_type?: string | null
          id?: never
          kcal_per_g?: number
          package_g?: number | null
          package_kcal?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cat_meals: {
        Row: {
          dt: string
          food_id: number
          grams: number
          id: number
          kcal: number
          kcal_per_g_snapshot: number
          leftover_g: number
          meal_group_id: string
          meal_set_code_snapshot: string | null
          meal_set_id: number | null
          meal_set_name_snapshot: string | null
          meal_source: string
          note: string | null
          user_id: string | null
        }
        Insert: {
          dt?: string
          food_id: number
          grams: number
          id?: never
          kcal: number
          kcal_per_g_snapshot: number
          leftover_g?: number
          meal_group_id?: string
          meal_set_code_snapshot?: string | null
          meal_set_id?: number | null
          meal_set_name_snapshot?: string | null
          meal_source?: string
          note?: string | null
          user_id?: string | null
        }
        Update: {
          dt?: string
          food_id?: number
          grams?: number
          id?: never
          kcal?: number
          kcal_per_g_snapshot?: number
          leftover_g?: number
          meal_group_id?: string
          meal_set_code_snapshot?: string | null
          meal_set_id?: number | null
          meal_set_name_snapshot?: string | null
          meal_source?: string
          note?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_meals_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "cat_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_meals_meal_set_id_fkey"
            columns: ["meal_set_id"]
            isOneToOne: false
            referencedRelation: "meal_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_weights: {
        Row: {
          created_at: string
          dt: string
          id: number
          memo: string | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          dt: string
          id?: number
          memo?: string | null
          weight_kg: number
        }
        Update: {
          created_at?: string
          dt?: string
          id?: number
          memo?: string | null
          weight_kg?: number
        }
        Relationships: []
      }
      meal_set_items: {
        Row: {
          created_at: string
          food_id: number
          grams: number
          id: number
          note: string | null
          set_id: number
          sort_no: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          food_id: number
          grams: number
          id?: never
          note?: string | null
          set_id: number
          sort_no?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          food_id?: number
          grams?: number
          id?: never
          note?: string | null
          set_id?: number
          sort_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_set_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "cat_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_set_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "meal_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_sets: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          note: string | null
          set_code: string
          set_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          note?: string | null
          set_code: string
          set_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          note?: string | null
          set_code?: string
          set_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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