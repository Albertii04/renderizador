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
      access_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string | null
          disabled_at: string | null
          display_code: string | null
          id: string
          max_uses: number | null
          organization_id: string
          reservation_id: string | null
          station_id: string | null
          updated_at: string
          used_count: number
          valid_from: string
          valid_until: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_code?: string | null
          id?: string
          max_uses?: number | null
          organization_id: string
          reservation_id?: string | null
          station_id?: string | null
          updated_at?: string
          used_count?: number
          valid_from: string
          valid_until: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_code?: string | null
          id?: string
          max_uses?: number | null
          organization_id?: string
          reservation_id?: string | null
          station_id?: string | null
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "access_codes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "access_codes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          station_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          station_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "audit_logs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_app_versions: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          minimum_supported_version: string | null
          notes: string | null
          published_at: string | null
          rollout_percent: number
          updated_at: string
          version: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          minimum_supported_version?: string | null
          notes?: string | null
          published_at?: string | null
          rollout_percent?: number
          updated_at?: string
          version: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          minimum_supported_version?: string | null
          notes?: string | null
          published_at?: string | null
          rollout_percent?: number
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "desktop_app_versions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "desktop_release_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_release_channels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          station_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          station_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          station_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_email_rules: {
        Row: {
          allowed: boolean
          created_at: string
          email: string
          id: string
          organization_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          email: string
          id?: string
          organization_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_email_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          access_policy: string
          created_at: string
          email_domain: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          access_policy?: string
          created_at?: string
          email_domain?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          access_policy?: string
          created_at?: string
          email_domain?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          buffer_minutes: number
          created_at: string
          ends_at: string
          estimated_minutes: number
          id: string
          instructions: string | null
          organization_id: string
          project_name: string | null
          starts_at: string
          station_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          work_type: string | null
        }
        Insert: {
          buffer_minutes?: number
          created_at?: string
          ends_at: string
          estimated_minutes: number
          id?: string
          instructions?: string | null
          organization_id: string
          project_name?: string | null
          starts_at: string
          station_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id: string
          work_type?: string | null
        }
        Update: {
          buffer_minutes?: number
          created_at?: string
          ends_at?: string
          estimated_minutes?: number
          id?: string
          instructions?: string | null
          organization_id?: string
          project_name?: string | null
          starts_at?: string
          station_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "reservations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          access_code_id: string | null
          actual_end_at: string | null
          admin_override: boolean
          created_at: string
          ended_by: string | null
          estimated_end_at: string | null
          id: string
          last_heartbeat_at: string | null
          organization_id: string
          reservation_id: string | null
          revoked_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason: string | null
          updated_at: string
          user_id: string | null
          warning_sent_at: string | null
        }
        Insert: {
          access_code_id?: string | null
          actual_end_at?: string | null
          admin_override?: boolean
          created_at?: string
          ended_by?: string | null
          estimated_end_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          organization_id: string
          reservation_id?: string | null
          revoked_at?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason?: string | null
          updated_at?: string
          user_id?: string | null
          warning_sent_at?: string | null
        }
        Update: {
          access_code_id?: string | null
          actual_end_at?: string | null
          admin_override?: boolean
          created_at?: string
          ended_by?: string | null
          estimated_end_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          organization_id?: string
          reservation_id?: string | null
          revoked_at?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["session_state"]
          station_id?: string
          termination_reason?: string | null
          updated_at?: string
          user_id?: string | null
          warning_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["access_code_id"]
          },
          {
            foreignKeyName: "sessions_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "station_access_overview"
            referencedColumns: ["station_id"]
          },
          {
            foreignKeyName: "sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          location: string | null
          metadata: Json
          name: string
          organization_id: string
          paired_at: string | null
          pairing_code_hash: string | null
          pairing_expires_at: string | null
          release_channel_id: string | null
          slug: string
          station_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          location?: string | null
          metadata?: Json
          name: string
          organization_id: string
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          release_channel_id?: string | null
          slug: string
          station_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          location?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          release_channel_id?: string | null
          slug?: string
          station_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_release_channel_id_fkey"
            columns: ["release_channel_id"]
            isOneToOne: false
            referencedRelation: "desktop_release_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      station_access_overview: {
        Row: {
          access_code_id: string | null
          has_access_code: boolean | null
          has_reservation: boolean | null
          reservation_id: string | null
          reservation_user_id: string | null
          station_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["reservation_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_station: {
        Args: {
          provided_code_hash?: string
          station_secret_input?: string
          station_uuid: string
        }
        Returns: Json
      }
      claim_station_pairing: { Args: { p_code: string }; Returns: Json }
      create_admin_access_code: {
        Args: {
          max_uses_input?: number
          station_uuid: string
          valid_from_input: string
          valid_until_input: string
        }
        Returns: Json
      }
      create_organization: {
        Args: {
          p_access_policy: string
          p_email_domain: string
          p_name: string
          p_slug: string
        }
        Returns: {
          access_policy: string
          created_at: string
          email_domain: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_reservation_with_code: {
        Args: {
          buffer_minutes_input?: number
          ends_at_input: string
          estimated_minutes_input: number
          instructions_input?: string
          project_name_input?: string
          starts_at_input: string
          station_uuid: string
          work_type_input?: string
        }
        Returns: Json
      }
      current_role_for_org: {
        Args: { organization_uuid: string }
        Returns: Database["public"]["Enums"]["membership_role"]
      }
      end_station_session: {
        Args: { session_uuid: string; station_secret_input?: string }
        Returns: {
          access_code_id: string | null
          actual_end_at: string | null
          admin_override: boolean
          created_at: string
          ended_by: string | null
          estimated_end_at: string | null
          id: string
          last_heartbeat_at: string | null
          organization_id: string
          reservation_id: string | null
          revoked_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason: string | null
          updated_at: string
          user_id: string | null
          warning_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      extend_station_session: {
        Args: { extra_minutes: number; session_uuid: string }
        Returns: Json
      }
      find_reservation_conflict: {
        Args: {
          ends_at_input: string
          ignore_reservation_uuid?: string
          starts_at_input: string
          station_uuid: string
        }
        Returns: {
          buffer_minutes: number
          created_at: string
          ends_at: string
          estimated_minutes: number
          id: string
          instructions: string | null
          organization_id: string
          project_name: string | null
          starts_at: string
          station_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          work_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_access_code: { Args: { raw_code: string }; Returns: string }
      generate_station_pairing_code: {
        Args: { station_uuid: string; ttl_minutes?: number }
        Returns: Json
      }
      get_active_station_session: {
        Args: { station_secret_input?: string; station_uuid: string }
        Returns: {
          access_code_id: string | null
          actual_end_at: string | null
          admin_override: boolean
          created_at: string
          ended_by: string | null
          estimated_end_at: string | null
          id: string
          last_heartbeat_at: string | null
          organization_id: string
          reservation_id: string | null
          revoked_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason: string | null
          updated_at: string
          user_id: string | null
          warning_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_station_by_code: {
        Args: { station_code_input: string }
        Returns: {
          created_at: string
          enabled: boolean
          id: string
          location: string | null
          metadata: Json
          name: string
          organization_id: string
          paired_at: string | null
          pairing_code_hash: string | null
          pairing_expires_at: string | null
          release_channel_id: string | null
          slug: string
          station_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_station_scope: { Args: { station_uuid: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_station_catalog: { Args: never; Returns: Json }
      next_station_reservation: {
        Args: { station_uuid: string }
        Returns: {
          buffer_minutes: number
          created_at: string
          ends_at: string
          estimated_minutes: number
          id: string
          instructions: string | null
          organization_id: string
          project_name: string | null
          starts_at: string
          station_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
          work_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_audit_event: {
        Args: {
          action_name: string
          entity_type_name: string
          entity_uuid?: string
          metadata_payload?: Json
          organization_uuid: string
          station_uuid?: string
        }
        Returns: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          station_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_station_session: {
        Args: { reason_input?: string; session_uuid: string }
        Returns: {
          access_code_id: string | null
          actual_end_at: string | null
          admin_override: boolean
          created_at: string
          ended_by: string | null
          estimated_end_at: string | null
          id: string
          last_heartbeat_at: string | null
          organization_id: string
          reservation_id: string | null
          revoked_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason: string | null
          updated_at: string
          user_id: string | null
          warning_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_station_session: {
        Args: {
          access_code_uuid?: string
          admin_override_value?: boolean
          estimated_minutes_value?: number
          reservation_uuid?: string
          station_secret_input?: string
          station_uuid: string
        }
        Returns: {
          access_code_id: string | null
          actual_end_at: string | null
          admin_override: boolean
          created_at: string
          ended_by: string | null
          estimated_end_at: string | null
          id: string
          last_heartbeat_at: string | null
          organization_id: string
          reservation_id: string | null
          revoked_at: string | null
          started_at: string
          state: Database["public"]["Enums"]["session_state"]
          station_id: string
          termination_reason: string | null
          updated_at: string
          user_id: string | null
          warning_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      station_runtime_snapshot: {
        Args: { station_uuid: string }
        Returns: Json
      }
      station_runtime_snapshot_with_secret: {
        Args: { station_secret_input: string; station_uuid: string }
        Returns: Json
      }
    }
    Enums: {
      membership_role: "user" | "station_admin" | "org_admin" | "super_admin"
      reservation_status:
        | "draft"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
      session_state: "pending" | "active" | "warning" | "ended"
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
      membership_role: ["user", "station_admin", "org_admin", "super_admin"],
      reservation_status: [
        "draft",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
      ],
      session_state: ["pending", "active", "warning", "ended"],
    },
  },
} as const
