
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "categories": {
                  Row: {
                    "archived": boolean,"household_id": string,"id": string,"monthly_budget": number,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"household_id": string,"id"?: string,"monthly_budget"?: number,"name": string,"position"?: number
                  }
                  Update: {
                    "archived"?: boolean,"household_id"?: string,"id"?: string,"monthly_budget"?: number,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"contributions": {
                  Row: {
                    "amount": number,"contributed_on": string,"created_at": string,"goal_id": string,"household_id": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"contributed_on"?: string,"created_at"?: string,"goal_id": string,"household_id": string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"contributed_on"?: string,"created_at"?: string,"goal_id"?: string,"household_id"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contributions_goal_id_household_id_fkey"
      columns: ["goal_id","household_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "contributions_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contributions_household_id_user_id_fkey"
      columns: ["household_id","user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"debt_payments": {
                  Row: {
                    "amount": number,"created_at": string,"debt_id": string,"household_id": string,"id": string,"paid_by": string,"paid_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"debt_id": string,"household_id": string,"id"?: string,"paid_by": string,"paid_on"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"debt_id"?: string,"household_id"?: string,"id"?: string,"paid_by"?: string,"paid_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_household_id_fkey"
      columns: ["debt_id","household_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "debt_payments_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_household_id_paid_by_fkey"
      columns: ["household_id","paid_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "archived": boolean,"created_at": string,"due_day": number | null,"household_id": string,"id": string,"kind": string,"monthly_payment": number,"monthly_rate": number,"name": string,"original_amount": number,"owner_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"created_at"?: string,"due_day"?: number | null,"household_id": string,"id"?: string,"kind"?: string,"monthly_payment"?: number,"monthly_rate"?: number,"name": string,"original_amount": number,"owner_id"?: string | null
                  }
                  Update: {
                    "archived"?: boolean,"created_at"?: string,"due_day"?: number | null,"household_id"?: string,"id"?: string,"kind"?: string,"monthly_payment"?: number,"monthly_rate"?: number,"name"?: string,"original_amount"?: number,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_household_id_owner_id_fkey"
      columns: ["household_id","owner_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category_id": string,"created_at": string,"created_by": string,"household_id": string,"id": string,"note": string | null,"paid_by": string,"recurring_id": string | null,"shared": boolean,"spent_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id": string,"created_at"?: string,"created_by"?: string,"household_id": string,"id"?: string,"note"?: string | null,"paid_by": string,"recurring_id"?: string | null,"shared"?: boolean,"spent_on"?: string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string,"household_id"?: string,"id"?: string,"note"?: string | null,"paid_by"?: string,"recurring_id"?: string | null,"shared"?: boolean,"spent_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "expenses_household_id_created_by_fkey"
      columns: ["household_id","created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    },{
      foreignKeyName: "expenses_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_household_id_paid_by_fkey"
      columns: ["household_id","paid_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    },{
      foreignKeyName: "expenses_recurring_id_fkey"
      columns: ["recurring_id"]
isOneToOne: false
      referencedRelation: "recurring_expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "archived": boolean,"created_at": string,"household_id": string,"id": string,"name": string,"target_amount": number,"target_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"created_at"?: string,"household_id": string,"id"?: string,"name": string,"target_amount": number,"target_date"?: string | null
                  }
                  Update: {
                    "archived"?: boolean,"created_at"?: string,"household_id"?: string,"id"?: string,"name"?: string,"target_amount"?: number,"target_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"id": string,"invite_code": string | null,"invite_expires_at": string | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invite_code"?: string | null,"invite_expires_at"?: string | null,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invite_code"?: string | null,"invite_expires_at"?: string | null,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"incomes": {
                  Row: {
                    "amount": number,"created_at": string,"household_id": string,"id": string,"received_on": string,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"household_id": string,"id"?: string,"received_on"?: string,"source": string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"household_id"?: string,"id"?: string,"received_on"?: string,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incomes_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_household_id_user_id_fkey"
      columns: ["household_id","user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"invite_attempts": {
                  Row: {
                    "at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"members": {
                  Row: {
                    "color": string,"display_name": string,"household_id": string,"joined_at": string,"left_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"display_name": string,"household_id": string,"joined_at"?: string,"left_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "color"?: string,"display_name"?: string,"household_id"?: string,"joined_at"?: string,"left_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "dependents": number,"employment": string,"household_id": string,"profession": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dependents"?: number,"employment"?: string,"household_id": string,"profession"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "dependents"?: number,"employment"?: string,"household_id"?: string,"profession"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_household_id_user_id_fkey"
      columns: ["household_id","user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth_key": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_key": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth_key"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recurring_expenses": {
                  Row: {
                    "active": boolean,"amount": number,"category_id": string,"created_at": string,"created_by": string,"day_of_month": number,"household_id": string,"id": string,"last_applied": string | null,"note": string,"paid_by": string,"shared": boolean,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"amount": number,"category_id": string,"created_at"?: string,"created_by"?: string,"day_of_month": number,"household_id": string,"id"?: string,"last_applied"?: string | null,"note": string,"paid_by": string,"shared"?: boolean,"starts_on"?: string
                  }
                  Update: {
                    "active"?: boolean,"amount"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string,"day_of_month"?: number,"household_id"?: string,"id"?: string,"last_applied"?: string | null,"note"?: string,"paid_by"?: string,"shared"?: boolean,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_expenses_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recurring_expenses_household_id_created_by_fkey"
      columns: ["household_id","created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    },{
      foreignKeyName: "recurring_expenses_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_expenses_household_id_paid_by_fkey"
      columns: ["household_id","paid_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"salaries": {
                  Row: {
                    "amount": number,"household_id": string,"pay_day": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"household_id": string,"pay_day"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"household_id"?: string,"pay_day"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "salaries_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "salaries_household_id_user_id_fkey"
      columns: ["household_id","user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                },"widget_tokens": {
                  Row: {
                    "created_at": string,"created_by": string,"household_id": string,"id": string,"label": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"household_id": string,"id"?: string,"label": string,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"household_id"?: string,"id"?: string,"label"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "widget_tokens_household_id_created_by_fkey"
      columns: ["household_id","created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["household_id","user_id"]
    },{
      foreignKeyName: "widget_tokens_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_recurring":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"can_listen":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"create_household":
{ Args: { "p_display_name": string,"p_name": string }; Returns: string
                           },
"create_widget_token":
{ Args: { "p_label": string }; Returns: string
                           },
"delete_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"is_member":
{ Args: { "h": string }; Returns: boolean
                           },
"join_household":
{ Args: { "p_code": string,"p_display_name": string }; Returns: string
                           },
"leave_household":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"my_household":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"new_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"rotate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"widget_summary":
{ Args: { "p_token": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
