
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
                },"expenses": {
                  Row: {
                    "amount": number,"category_id": string,"created_at": string,"created_by": string,"household_id": string,"id": string,"note": string | null,"paid_by": string,"shared": boolean,"spent_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id": string,"created_at"?: string,"created_by"?: string,"household_id": string,"id"?: string,"note"?: string | null,"paid_by": string,"shared"?: boolean,"spent_on"?: string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string,"household_id"?: string,"id"?: string,"note"?: string | null,"paid_by"?: string,"shared"?: boolean,"spent_on"?: string
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
                    "created_at": string,"id": string,"invite_code": string | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invite_code"?: string | null,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invite_code"?: string | null,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"members": {
                  Row: {
                    "color": string,"display_name": string,"household_id": string,"joined_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"display_name": string,"household_id": string,"joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "color"?: string,"display_name"?: string,"household_id"?: string,"joined_at"?: string,"user_id"?: string
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_household":
{ Args: { "p_display_name": string,"p_name": string }; Returns: string
                           },
"is_member":
{ Args: { "h": string }; Returns: boolean
                           },
"join_household":
{ Args: { "p_code": string,"p_display_name": string }; Returns: string
                           },
"rotate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
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
