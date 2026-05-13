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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      annual_calendar_days: {
        Row: {
          calendar_id: string
          created_at: string
          custom_day_type_id: string | null
          date: string
          day_type: Database["public"]["Enums"]["day_type"]
          group_id: string | null
          group_id_2: string | null
          id: string
          legend: string | null
        }
        Insert: {
          calendar_id: string
          created_at?: string
          custom_day_type_id?: string | null
          date: string
          day_type?: Database["public"]["Enums"]["day_type"]
          group_id?: string | null
          group_id_2?: string | null
          id?: string
          legend?: string | null
        }
        Update: {
          calendar_id?: string
          created_at?: string
          custom_day_type_id?: string | null
          date?: string
          day_type?: Database["public"]["Enums"]["day_type"]
          group_id?: string | null
          group_id_2?: string | null
          id?: string
          legend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "annual_calendar_days_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "annual_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_calendar_days_custom_day_type_id_fkey"
            columns: ["custom_day_type_id"]
            isOneToOne: false
            referencedRelation: "custom_day_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_calendar_days_group_id_2_fkey"
            columns: ["group_id_2"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_calendar_days_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_calendars: {
        Row: {
          auto_rotate_groups: boolean
          created_at: string
          department_id: string
          description: string | null
          id: string
          info_text: string | null
          info_text_ar: string | null
          info_text_fr: string | null
          is_reviewed: boolean
          reviewed_at: string | null
          updated_at: string
          year: number
        }
        Insert: {
          auto_rotate_groups?: boolean
          created_at?: string
          department_id: string
          description?: string | null
          id?: string
          info_text?: string | null
          info_text_ar?: string | null
          info_text_fr?: string | null
          is_reviewed?: boolean
          reviewed_at?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          auto_rotate_groups?: boolean
          created_at?: string
          department_id?: string
          description?: string | null
          id?: string
          info_text?: string | null
          info_text_ar?: string | null
          info_text_fr?: string | null
          is_reviewed?: boolean
          reviewed_at?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          current_rows: number
          global_free_days_enabled: boolean
          global_free_days_value: number | null
          id: string
          is_locked: boolean
          lock_reason: string | null
          max_rows: number
          updated_at: string
          warning_threshold: number
        }
        Insert: {
          created_at?: string
          current_rows?: number
          global_free_days_enabled?: boolean
          global_free_days_value?: number | null
          id?: string
          is_locked?: boolean
          lock_reason?: string | null
          max_rows?: number
          updated_at?: string
          warning_threshold?: number
        }
        Update: {
          created_at?: string
          current_rows?: number
          global_free_days_enabled?: boolean
          global_free_days_value?: number | null
          id?: string
          is_locked?: boolean
          lock_reason?: string | null
          max_rows?: number
          updated_at?: string
          warning_threshold?: number
        }
        Relationships: []
      }
      application_events: {
        Row: {
          action: string
          actor_user_id: string | null
          application_id: string
          created_at: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          application_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          application_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          admin_notes: string | null
          admin_status: Database["public"]["Enums"]["application_admin_status"]
          ai_extracted: Json | null
          ai_processed_at: string | null
          ai_rejection_reasons: string[] | null
          ai_score: number | null
          ai_status: Database["public"]["Enums"]["ai_processing_status"]
          ai_summary: string | null
          availability: string | null
          created_at: string
          current_address: string
          current_lat: number | null
          current_lng: number | null
          custom_position: string | null
          cv_file_type: Database["public"]["Enums"]["cv_file_type"] | null
          cv_file_url: string | null
          distance_km: number | null
          email: string | null
          first_name: string
          form_language: string
          gender: Database["public"]["Enums"]["gender_type"]
          has_disability: boolean
          id: string
          job_position_id: string | null
          languages: Json | null
          last_name: string
          origin_country: string
          phone: string | null
          shifts: string[] | null
          spanish_level: number
          vehicle: Database["public"]["Enums"]["vehicle_type"]
          years_experience: string | null
        }
        Insert: {
          admin_notes?: string | null
          admin_status?: Database["public"]["Enums"]["application_admin_status"]
          ai_extracted?: Json | null
          ai_processed_at?: string | null
          ai_rejection_reasons?: string[] | null
          ai_score?: number | null
          ai_status?: Database["public"]["Enums"]["ai_processing_status"]
          ai_summary?: string | null
          availability?: string | null
          created_at?: string
          current_address: string
          current_lat?: number | null
          current_lng?: number | null
          custom_position?: string | null
          cv_file_type?: Database["public"]["Enums"]["cv_file_type"] | null
          cv_file_url?: string | null
          distance_km?: number | null
          email?: string | null
          first_name: string
          form_language?: string
          gender: Database["public"]["Enums"]["gender_type"]
          has_disability?: boolean
          id?: string
          job_position_id?: string | null
          languages?: Json | null
          last_name: string
          origin_country: string
          phone?: string | null
          shifts?: string[] | null
          spanish_level?: number
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
          years_experience?: string | null
        }
        Update: {
          admin_notes?: string | null
          admin_status?: Database["public"]["Enums"]["application_admin_status"]
          ai_extracted?: Json | null
          ai_processed_at?: string | null
          ai_rejection_reasons?: string[] | null
          ai_score?: number | null
          ai_status?: Database["public"]["Enums"]["ai_processing_status"]
          ai_summary?: string | null
          availability?: string | null
          created_at?: string
          current_address?: string
          current_lat?: number | null
          current_lng?: number | null
          custom_position?: string | null
          cv_file_type?: Database["public"]["Enums"]["cv_file_type"] | null
          cv_file_url?: string | null
          distance_km?: number | null
          email?: string | null
          first_name?: string
          form_language?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          has_disability?: boolean
          id?: string
          job_position_id?: string | null
          languages?: Json | null
          last_name?: string
          origin_country?: string
          phone?: string | null
          shifts?: string[] | null
          spanish_level?: number
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "active_job_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "job_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_name: string
          actor_role: string
          created_at: string
          details: string | null
          entity_data: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action_type: string
          actor_name: string
          actor_role: string
          created_at?: string
          details?: string | null
          entity_data?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action_type?: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          details?: string | null
          entity_data?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          backup_date: string
          created_at: string | null
          download_url: string | null
          error_message: string | null
          expires_at: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          status: string
          storage_files_count: number | null
          tables_count: number | null
          total_records: number | null
          triggered_by: string | null
        }
        Insert: {
          backup_date: string
          created_at?: string | null
          download_url?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          status: string
          storage_files_count?: number | null
          tables_count?: number | null
          total_records?: number | null
          triggered_by?: string | null
        }
        Update: {
          backup_date?: string
          created_at?: string | null
          download_url?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          status?: string
          storage_files_count?: number | null
          tables_count?: number | null
          total_records?: number | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      calendar_review_alerts: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_resolved: boolean
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_resolved?: boolean
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_resolved?: boolean
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          worker_id?: string
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_review_alerts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_review_alerts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_review_alerts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_control_settings: {
        Row: {
          break_almuerzo_max_minutes: number
          break_comida_max_minutes: number
          break_merienda_max_minutes: number
          entry_tolerance_minutes: number
          id: string
          max_break_minutes: number
          max_breaks_count: number
          max_total_break_minutes: number
          updated_at: string | null
        }
        Insert: {
          break_almuerzo_max_minutes?: number
          break_comida_max_minutes?: number
          break_merienda_max_minutes?: number
          entry_tolerance_minutes?: number
          id?: string
          max_break_minutes?: number
          max_breaks_count?: number
          max_total_break_minutes?: number
          updated_at?: string | null
        }
        Update: {
          break_almuerzo_max_minutes?: number
          break_comida_max_minutes?: number
          break_merienda_max_minutes?: number
          entry_tolerance_minutes?: number
          id?: string
          max_break_minutes?: number
          max_breaks_count?: number
          max_total_break_minutes?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      clock_entries: {
        Row: {
          created_at: string
          entry_type: string
          id: string
          punched_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          entry_type: string
          id?: string
          punched_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          entry_type?: string
          id?: string
          punched_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_entry_edits: {
        Row: {
          action: string
          clock_entry_id: string | null
          created_at: string
          id: string
          manager_id: string
          manager_name: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          worker_id: string
        }
        Insert: {
          action: string
          clock_entry_id?: string | null
          created_at?: string
          id?: string
          manager_id: string
          manager_name?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          worker_id: string
        }
        Update: {
          action?: string
          clock_entry_id?: string | null
          created_at?: string
          id?: string
          manager_id?: string
          manager_name?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_entry_edits_clock_entry_id_fkey"
            columns: ["clock_entry_id"]
            isOneToOne: false
            referencedRelation: "clock_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_entry_edits_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_day_types: {
        Row: {
          color: string
          created_at: string
          department_id: string
          id: string
          name: string
          sort_order: number
          system_type: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          id?: string
          name: string
          sort_order?: number
          system_type?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          sort_order?: number
          system_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_day_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_day_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      day_exception_requests: {
        Row: {
          admin_action_at: string | null
          admin_action_by: string | null
          admin_rejection_reason: string | null
          admin_status: string | null
          created_at: string
          department_id: string
          id: string
          manager_action_at: string | null
          manager_action_by: string | null
          manager_rejection_reason: string | null
          manager_status: string | null
          reason: string
          request_date: string
          status: string
          updated_at: string
          worker_email: string | null
          worker_id: string | null
          worker_name: string
          worker_number: string
        }
        Insert: {
          admin_action_at?: string | null
          admin_action_by?: string | null
          admin_rejection_reason?: string | null
          admin_status?: string | null
          created_at?: string
          department_id: string
          id?: string
          manager_action_at?: string | null
          manager_action_by?: string | null
          manager_rejection_reason?: string | null
          manager_status?: string | null
          reason: string
          request_date: string
          status?: string
          updated_at?: string
          worker_email?: string | null
          worker_id?: string | null
          worker_name: string
          worker_number: string
        }
        Update: {
          admin_action_at?: string | null
          admin_action_by?: string | null
          admin_rejection_reason?: string | null
          admin_status?: string | null
          created_at?: string
          department_id?: string
          id?: string
          manager_action_at?: string | null
          manager_action_by?: string | null
          manager_rejection_reason?: string | null
          manager_status?: string | null
          reason?: string
          request_date?: string
          status?: string
          updated_at?: string
          worker_email?: string | null
          worker_id?: string | null
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_exception_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_exception_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_exception_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      department_availabilities: {
        Row: {
          created_at: string
          date: string
          department_id: string
          half_day: boolean
          id: string
        }
        Insert: {
          created_at?: string
          date: string
          department_id: string
          half_day?: boolean
          id?: string
        }
        Update: {
          created_at?: string
          date?: string
          department_id?: string
          half_day?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_availabilities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_availabilities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_correction_requests: {
        Row: {
          created_at: string
          current_department_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          requested_department_id: string
          status: string
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Insert: {
          created_at?: string
          current_department_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_department_id: string
          status?: string
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Update: {
          created_at?: string
          current_department_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_department_id?: string
          status?: string
          worker_id?: string
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_correction_requests_current_department_id_fkey"
            columns: ["current_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_correction_requests_current_department_id_fkey"
            columns: ["current_department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_correction_requests_requested_department_id_fkey"
            columns: ["requested_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_correction_requests_requested_department_id_fkey"
            columns: ["requested_department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_correction_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      department_day_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          department_id: string
          id: string
          is_unblocked: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          department_id: string
          id?: string
          is_unblocked?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          department_id?: string
          id?: string
          is_unblocked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "department_day_overrides_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_day_overrides_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_role_aliases: {
        Row: {
          alias_name: string
          created_at: string
          department_id: string
          id: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          department_id: string
          id?: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_role_aliases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_role_aliases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_schedule_rules: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_active: boolean
          rule_config: Json
          rule_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_active?: boolean
          rule_config?: Json
          rule_type: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_active?: boolean
          rule_config?: Json
          rule_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_schedule_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_schedule_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_shifts: {
        Row: {
          color: string
          created_at: string
          department_id: string
          end_time: string | null
          id: string
          is_rest: boolean
          name: string
          shift_key: string
          sort_order: number
          start_time: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          end_time?: string | null
          id?: string
          is_rest?: boolean
          name: string
          shift_key: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          end_time?: string | null
          id?: string
          is_rest?: boolean
          name?: string
          shift_key?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_shifts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_shifts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          auto_block_by_concurrency: boolean
          consulta_reviewed_at: string | null
          consulta_reviewed_by: string | null
          created_at: string
          description: string | null
          id: string
          manager_email: string | null
          manual_free_days_enabled: boolean | null
          manual_free_days_value: number | null
          max_concurrent_workers_global: number | null
          max_days_per_employee: number
          name: string
          public_token: string
          require_all_days: boolean
          schedule_auto_rotate_teams: boolean
          schedule_configured: boolean
          schedule_locked_for_managers: boolean
          slug: string | null
          updated_at: string
        }
        Insert: {
          auto_block_by_concurrency?: boolean
          consulta_reviewed_at?: string | null
          consulta_reviewed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manager_email?: string | null
          manual_free_days_enabled?: boolean | null
          manual_free_days_value?: number | null
          max_concurrent_workers_global?: number | null
          max_days_per_employee?: number
          name: string
          public_token?: string
          require_all_days?: boolean
          schedule_auto_rotate_teams?: boolean
          schedule_configured?: boolean
          schedule_locked_for_managers?: boolean
          slug?: string | null
          updated_at?: string
        }
        Update: {
          auto_block_by_concurrency?: boolean
          consulta_reviewed_at?: string | null
          consulta_reviewed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manager_email?: string | null
          manual_free_days_enabled?: boolean | null
          manual_free_days_value?: number | null
          max_concurrent_workers_global?: number | null
          max_days_per_employee?: number
          name?: string
          public_token?: string
          require_all_days?: boolean
          schedule_auto_rotate_teams?: boolean
          schedule_configured?: boolean
          schedule_locked_for_managers?: boolean
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      group_join_requests: {
        Row: {
          assigned_team_id: string | null
          assigned_work_group_id: string | null
          created_at: string
          department_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: string
          worker_email: string | null
          worker_name: string
          worker_number: string
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_work_group_id?: string | null
          created_at?: string
          department_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          worker_email?: string | null
          worker_name: string
          worker_number: string
        }
        Update: {
          assigned_team_id?: string | null
          assigned_work_group_id?: string | null
          created_at?: string
          department_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          worker_email?: string | null
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "worker_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_assigned_work_group_id_fkey"
            columns: ["assigned_work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_balance_imports: {
        Row: {
          admin_id: string | null
          admin_name: string
          created_at: string
          id: string
          notes: string | null
          total_csv_records: number
          total_ignored: number
          total_imported: number
        }
        Insert: {
          admin_id?: string | null
          admin_name: string
          created_at?: string
          id?: string
          notes?: string | null
          total_csv_records?: number
          total_ignored?: number
          total_imported?: number
        }
        Update: {
          admin_id?: string | null
          admin_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          total_csv_records?: number
          total_ignored?: number
          total_imported?: number
        }
        Relationships: [
          {
            foreignKeyName: "hour_balance_imports_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_balance_imports_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_balance_settings: {
        Row: {
          alert_threshold: number | null
          created_at: string
          hours_format: string
          id: string
          rounding: string
          updated_at: string
        }
        Insert: {
          alert_threshold?: number | null
          created_at?: string
          hours_format?: string
          id?: string
          rounding?: string
          updated_at?: string
        }
        Update: {
          alert_threshold?: number | null
          created_at?: string
          hours_format?: string
          id?: string
          rounding?: string
          updated_at?: string
        }
        Relationships: []
      }
      hour_balances: {
        Row: {
          balance_hours: number
          created_at: string
          id: string
          import_id: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          balance_hours?: number
          created_at?: string
          id?: string
          import_id?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          balance_hours?: number
          created_at?: string
          id?: string
          import_id?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hour_balances_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "hour_balance_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hour_balances_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_ai_config: {
        Row: {
          default_font_delta: number
          id: string
          idioma: string
          incluir_articulos: boolean
          instrucciones_custom: string
          memoria_empresa: string
          tono: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_font_delta?: number
          id?: string
          idioma?: string
          incluir_articulos?: boolean
          instrucciones_custom?: string
          memoria_empresa?: string
          tono?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_font_delta?: number
          id?: string
          idioma?: string
          incluir_articulos?: boolean
          instrucciones_custom?: string
          memoria_empresa?: string
          tono?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      incidencias_ai_memory_entries: {
        Row: {
          categoria: string
          contenido: string
          created_at: string
          id: string
          suggested_by_ai: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          contenido: string
          created_at?: string
          id?: string
          suggested_by_ai?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          contenido?: string
          created_at?: string
          id?: string
          suggested_by_ai?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      incidencias_ai_prompt_versions: {
        Row: {
          author_manager_id: string | null
          author_name: string | null
          change_notes: string | null
          content: string
          created_at: string
          id: string
          prompt_id: string
          version_number: number
        }
        Insert: {
          author_manager_id?: string | null
          author_name?: string | null
          change_notes?: string | null
          content: string
          created_at?: string
          id?: string
          prompt_id: string
          version_number: number
        }
        Update: {
          author_manager_id?: string | null
          author_name?: string | null
          change_notes?: string | null
          content?: string
          created_at?: string
          id?: string
          prompt_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_ai_prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "incidencias_ai_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_ai_prompts: {
        Row: {
          category: string
          created_at: string
          current_version_id: string | null
          default_content: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          prompt_key: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          current_version_id?: string | null
          default_content: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          prompt_key: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          current_version_id?: string | null
          default_content?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prompt_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_ai_prompts_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "incidencias_ai_prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_attachment_links: {
        Row: {
          created_at: string
          expires_at: string | null
          file_name: string | null
          id: string
          last_accessed_at: string | null
          mime_type: string | null
          proposal_id: string
          storage_path: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          file_name?: string | null
          id?: string
          last_accessed_at?: string | null
          mime_type?: string | null
          proposal_id: string
          storage_path: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          file_name?: string | null
          id?: string
          last_accessed_at?: string | null
          mime_type?: string | null
          proposal_id?: string
          storage_path?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_attachment_links_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_audit_logs: {
        Row: {
          action_type: string
          actor_id: string
          actor_name: string
          actor_role: string
          cambios_json: Json | null
          created_at: string
          details: string | null
          id: string
          incidencia_id: string | null
          propuesta_id: string | null
        }
        Insert: {
          action_type: string
          actor_id: string
          actor_name: string
          actor_role: string
          cambios_json?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          incidencia_id?: string | null
          propuesta_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          actor_name?: string
          actor_role?: string
          cambios_json?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          incidencia_id?: string | null
          propuesta_id?: string | null
        }
        Relationships: []
      }
      incidencias_bulk_scan_corrections: {
        Row: {
          correction_chat: Json
          created_at: string
          created_by: string | null
          final_assignments: Json
          id: string
          initial_assignments: Json
          lessons: string | null
          pdf_filename: string | null
          total_pages: number | null
        }
        Insert: {
          correction_chat?: Json
          created_at?: string
          created_by?: string | null
          final_assignments?: Json
          id?: string
          initial_assignments?: Json
          lessons?: string | null
          pdf_filename?: string | null
          total_pages?: number | null
        }
        Update: {
          correction_chat?: Json
          created_at?: string
          created_by?: string | null
          final_assignments?: Json
          id?: string
          initial_assignments?: Json
          lessons?: string | null
          pdf_filename?: string | null
          total_pages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_bulk_scan_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_bulk_scan_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_categories: {
        Row: {
          active: boolean
          color: string
          consecuencia_critico: string | null
          created_at: string
          csv_aliases: string[] | null
          department_id: string | null
          es_critico: boolean
          gravedad: string
          id: string
          importe_rangos: Json | null
          name: string
          puntos: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          color?: string
          consecuencia_critico?: string | null
          created_at?: string
          csv_aliases?: string[] | null
          department_id?: string | null
          es_critico?: boolean
          gravedad?: string
          id?: string
          importe_rangos?: Json | null
          name: string
          puntos?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          color?: string
          consecuencia_critico?: string | null
          created_at?: string
          csv_aliases?: string[] | null
          department_id?: string | null
          es_critico?: boolean
          gravedad?: string
          id?: string
          importe_rangos?: Json | null
          name?: string
          puntos?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_category_departments: {
        Row: {
          category_id: string
          created_at: string
          department_id: string
          id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          department_id: string
          id?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_category_departments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "incidencias_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_category_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_category_tags: {
        Row: {
          category_id: string
          created_at: string
          field_name: string
          field_value: string
          id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field_name: string
          field_value: string
          id?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field_name?: string
          field_value?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_category_tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "incidencias_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          propuesta_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          propuesta_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          propuesta_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_chat_messages_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_daily_metrics: {
        Row: {
          created_at: string
          date: string
          department_id: string
          id: string
          propuestas: number
          reincidentes: number
          sanciones: number
          total: number
        }
        Insert: {
          created_at?: string
          date: string
          department_id: string
          id?: string
          propuestas?: number
          reincidentes?: number
          sanciones?: number
          total?: number
        }
        Update: {
          created_at?: string
          date?: string
          department_id?: string
          id?: string
          propuestas?: number
          reincidentes?: number
          sanciones?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_daily_metrics_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_department_managers: {
        Row: {
          created_at: string
          department_id: string
          id: string
          manager_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          manager_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_department_managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_department_stats: {
        Row: {
          day_distribution: Json | null
          department_id: string
          dia_pico: number | null
          graves: number
          leves: number
          media_por_trabajador: number
          muy_graves: number
          reincidentes: number
          riesgo_global: number
          tendencia: string | null
          tiempo_medio_resolucion: number
          total: number
          updated_at: string
        }
        Insert: {
          day_distribution?: Json | null
          department_id: string
          dia_pico?: number | null
          graves?: number
          leves?: number
          media_por_trabajador?: number
          muy_graves?: number
          reincidentes?: number
          riesgo_global?: number
          tendencia?: string | null
          tiempo_medio_resolucion?: number
          total?: number
          updated_at?: string
        }
        Update: {
          day_distribution?: Json | null
          department_id?: string
          dia_pico?: number | null
          graves?: number
          leves?: number
          media_por_trabajador?: number
          muy_graves?: number
          reincidentes?: number
          riesgo_global?: number
          tendencia?: string | null
          tiempo_medio_resolucion?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_department_stats_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_departments: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      incidencias_email_config: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          is_primary: boolean | null
          purpose: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean | null
          purpose?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean | null
          purpose?: string
        }
        Relationships: []
      }
      incidencias_firma_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          firma_ip: string | null
          firma_url: string | null
          id: string
          legal_document_id: string
          printed_at: string | null
          scanned_signed_pdf_url: string | null
          signed_photo_url: string | null
          signed_photo_urls: Json | null
          status: string
          worker_id: string
          worker_name: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          firma_ip?: string | null
          firma_url?: string | null
          id?: string
          legal_document_id: string
          printed_at?: string | null
          scanned_signed_pdf_url?: string | null
          signed_photo_url?: string | null
          signed_photo_urls?: Json | null
          status?: string
          worker_id: string
          worker_name: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          firma_ip?: string | null
          firma_url?: string | null
          id?: string
          legal_document_id?: string
          printed_at?: string | null
          scanned_signed_pdf_url?: string | null
          signed_photo_url?: string | null
          signed_photo_urls?: Json | null
          status?: string
          worker_id?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_firma_tasks_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "incidencias_legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_gravedades: {
        Row: {
          active: boolean
          color: string
          created_at: string | null
          icon_name: string | null
          id: string
          key: string
          label: string
          label_plural: string
          puntos: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string | null
          icon_name?: string | null
          id?: string
          key: string
          label: string
          label_plural: string
          puntos?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string | null
          icon_name?: string | null
          id?: string
          key?: string
          label?: string
          label_plural?: string
          puntos?: number
          sort_order?: number
        }
        Relationships: []
      }
      incidencias_legal_document_versions: {
        Row: {
          change_description: string | null
          created_at: string
          created_by: string | null
          document_id: string
          html_content: string
          id: string
          version_number: number
        }
        Insert: {
          change_description?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          html_content: string
          id?: string
          version_number?: number
        }
        Update: {
          change_description?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          html_content?: string
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_legal_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "incidencias_legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_legal_documents: {
        Row: {
          anulado: boolean
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          articulos_citados: Json | null
          created_at: string
          created_by: string | null
          department_id: string
          descripcion_hechos: string
          dias_suspension: number | null
          document_code: string | null
          draft_pdf_url: string | null
          email_destinatario: string | null
          email_enviado: boolean
          email_enviado_at: string | null
          fecha_inicio_suspension: string | null
          firma_empresa_url: string | null
          firma_trabajador_url: string | null
          firmado: boolean
          firmado_at: string | null
          firmado_ip: string | null
          font_delta: number
          fundamentacion_juridica: string
          gravedad_final: string
          html_content: string
          id: string
          pdf_url: string | null
          plazo_alegaciones_dias: number | null
          propuesta_id: string
          sancion_aplicada: string | null
          suspension: boolean
          tipo: string
          worker_id: string
          worker_name: string
          worker_number: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          articulos_citados?: Json | null
          created_at?: string
          created_by?: string | null
          department_id: string
          descripcion_hechos?: string
          dias_suspension?: number | null
          document_code?: string | null
          draft_pdf_url?: string | null
          email_destinatario?: string | null
          email_enviado?: boolean
          email_enviado_at?: string | null
          fecha_inicio_suspension?: string | null
          firma_empresa_url?: string | null
          firma_trabajador_url?: string | null
          firmado?: boolean
          firmado_at?: string | null
          firmado_ip?: string | null
          font_delta?: number
          fundamentacion_juridica?: string
          gravedad_final?: string
          html_content?: string
          id?: string
          pdf_url?: string | null
          plazo_alegaciones_dias?: number | null
          propuesta_id: string
          sancion_aplicada?: string | null
          suspension?: boolean
          tipo?: string
          worker_id: string
          worker_name: string
          worker_number?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          articulos_citados?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          descripcion_hechos?: string
          dias_suspension?: number | null
          document_code?: string | null
          draft_pdf_url?: string | null
          email_destinatario?: string | null
          email_enviado?: boolean
          email_enviado_at?: string | null
          fecha_inicio_suspension?: string | null
          firma_empresa_url?: string | null
          firma_trabajador_url?: string | null
          firmado?: boolean
          firmado_at?: string | null
          firmado_ip?: string | null
          font_delta?: number
          fundamentacion_juridica?: string
          gravedad_final?: string
          html_content?: string
          id?: string
          pdf_url?: string | null
          plazo_alegaciones_dias?: number | null
          propuesta_id?: string
          sancion_aplicada?: string | null
          suspension?: boolean
          tipo?: string
          worker_id?: string
          worker_name?: string
          worker_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_legal_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_legal_documents_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_losses: {
        Row: {
          claim_id: string | null
          consecuencia: string | null
          created_at: string
          fecha: string
          id: string
          importe: number
          motivo: string | null
          origen: string
          record_id: string | null
          ticket_id: string | null
          worker_id: string | null
        }
        Insert: {
          claim_id?: string | null
          consecuencia?: string | null
          created_at?: string
          fecha?: string
          id?: string
          importe?: number
          motivo?: string | null
          origen?: string
          record_id?: string | null
          ticket_id?: string | null
          worker_id?: string | null
        }
        Update: {
          claim_id?: string | null
          consecuencia?: string | null
          created_at?: string
          fecha?: string
          id?: string
          importe?: number
          motivo?: string | null
          origen?: string
          record_id?: string | null
          ticket_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_losses_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "incidencias_records"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read_at: string | null
          role: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read_at?: string | null
          role?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          role?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      incidencias_positive_categories: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      incidencias_positive_record_workers: {
        Row: {
          created_at: string
          id: string
          record_id: string
          worker_id: string
          worker_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          record_id: string
          worker_id: string
          worker_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          record_id?: string
          worker_id?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_positive_record_workers_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "incidencias_positive_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_positive_record_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "incidencias_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_positive_records: {
        Row: {
          category_id: string
          created_at: string
          created_by_id: string
          created_by_name: string
          department_id: string | null
          descripcion: string
          fecha: string
          id: string
          pruebas_urls: Json
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by_id: string
          created_by_name?: string
          department_id?: string | null
          descripcion?: string
          fecha?: string
          id?: string
          pruebas_urls?: Json
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by_id?: string
          created_by_name?: string
          department_id?: string | null
          descripcion?: string
          fecha?: string
          id?: string
          pruebas_urls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_positive_records_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "incidencias_positive_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_positive_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_propuestas_changelog: {
        Row: {
          cambiado_por: string
          campo: string
          created_at: string
          id: string
          propuesta_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          cambiado_por: string
          campo: string
          created_at?: string
          id?: string
          propuesta_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          cambiado_por?: string
          campo?: string
          created_at?: string
          id?: string
          propuesta_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_propuestas_changelog_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_propuestas_rrhh: {
        Row: {
          admin_pruebas_urls: Json | null
          ai_analysis: Json | null
          ai_borrador_generado: boolean
          ai_modification: Json | null
          ai_reasoning_log: Json | null
          aprobada_at: string | null
          aprobada_por: string | null
          archivada_at: string | null
          archivada_motivo: string | null
          archivada_por: string | null
          audiencia_previa_completada_at: string | null
          audiencia_previa_notas: string | null
          collage_layout: Json | null
          created_at: string
          department_id: string
          disabled_manager_pruebas: Json
          duplicated_from_propuesta_id: string | null
          email_body: string | null
          email_html: string | null
          email_subject: string | null
          estado: string
          fecha_inicio: string | null
          gravedad: string
          id: string
          merge_admin_context: string | null
          merge_source_ids: string[]
          merged_into_id: string | null
          necesita_aclaracion: boolean
          nspp_days_remaining: number | null
          nspp_encargado_name: string | null
          nspp_justificacion: string | null
          nspp_start_contract_date: string | null
          nspp_worker_fiscal_id: string | null
          nspp_worker_name: string | null
          nspp_worker_number: string | null
          pliego_cargos_generado_at: string | null
          pliego_cargos_html: string | null
          preguntas_admin: Json | null
          rechazada_at: string | null
          rechazada_por: string | null
          rechazo_motivo: string | null
          record_id: string | null
          requiere_audiencia_previa: boolean
          respuestas_admin: Json | null
          sin_suspension_explicita: boolean
          suspension_aviso_enviado_at: string | null
          suspension_dias: number | null
          suspension_fechas: Json | null
          target_worker_id: string | null
          tipo: string
        }
        Insert: {
          admin_pruebas_urls?: Json | null
          ai_analysis?: Json | null
          ai_borrador_generado?: boolean
          ai_modification?: Json | null
          ai_reasoning_log?: Json | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          archivada_at?: string | null
          archivada_motivo?: string | null
          archivada_por?: string | null
          audiencia_previa_completada_at?: string | null
          audiencia_previa_notas?: string | null
          collage_layout?: Json | null
          created_at?: string
          department_id: string
          disabled_manager_pruebas?: Json
          duplicated_from_propuesta_id?: string | null
          email_body?: string | null
          email_html?: string | null
          email_subject?: string | null
          estado?: string
          fecha_inicio?: string | null
          gravedad?: string
          id?: string
          merge_admin_context?: string | null
          merge_source_ids?: string[]
          merged_into_id?: string | null
          necesita_aclaracion?: boolean
          nspp_days_remaining?: number | null
          nspp_encargado_name?: string | null
          nspp_justificacion?: string | null
          nspp_start_contract_date?: string | null
          nspp_worker_fiscal_id?: string | null
          nspp_worker_name?: string | null
          nspp_worker_number?: string | null
          pliego_cargos_generado_at?: string | null
          pliego_cargos_html?: string | null
          preguntas_admin?: Json | null
          rechazada_at?: string | null
          rechazada_por?: string | null
          rechazo_motivo?: string | null
          record_id?: string | null
          requiere_audiencia_previa?: boolean
          respuestas_admin?: Json | null
          sin_suspension_explicita?: boolean
          suspension_aviso_enviado_at?: string | null
          suspension_dias?: number | null
          suspension_fechas?: Json | null
          target_worker_id?: string | null
          tipo?: string
        }
        Update: {
          admin_pruebas_urls?: Json | null
          ai_analysis?: Json | null
          ai_borrador_generado?: boolean
          ai_modification?: Json | null
          ai_reasoning_log?: Json | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          archivada_at?: string | null
          archivada_motivo?: string | null
          archivada_por?: string | null
          audiencia_previa_completada_at?: string | null
          audiencia_previa_notas?: string | null
          collage_layout?: Json | null
          created_at?: string
          department_id?: string
          disabled_manager_pruebas?: Json
          duplicated_from_propuesta_id?: string | null
          email_body?: string | null
          email_html?: string | null
          email_subject?: string | null
          estado?: string
          fecha_inicio?: string | null
          gravedad?: string
          id?: string
          merge_admin_context?: string | null
          merge_source_ids?: string[]
          merged_into_id?: string | null
          necesita_aclaracion?: boolean
          nspp_days_remaining?: number | null
          nspp_encargado_name?: string | null
          nspp_justificacion?: string | null
          nspp_start_contract_date?: string | null
          nspp_worker_fiscal_id?: string | null
          nspp_worker_name?: string | null
          nspp_worker_number?: string | null
          pliego_cargos_generado_at?: string | null
          pliego_cargos_html?: string | null
          preguntas_admin?: Json | null
          rechazada_at?: string | null
          rechazada_por?: string | null
          rechazo_motivo?: string | null
          record_id?: string | null
          requiere_audiencia_previa?: boolean
          respuestas_admin?: Json | null
          sin_suspension_explicita?: boolean
          suspension_aviso_enviado_at?: string | null
          suspension_dias?: number | null
          suspension_fechas?: Json | null
          target_worker_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_propuestas_rrhh_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_propuestas_rrhh_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_propuestas_rrhh_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "incidencias_records"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_push_tokens: {
        Row: {
          created_at: string
          device_token: string
          id: string
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_token: string
          id?: string
          last_seen_at?: string
          platform?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      incidencias_record_workers: {
        Row: {
          id: string
          record_id: string
          worker_id: string
          worker_name: string
          worker_number: string | null
        }
        Insert: {
          id?: string
          record_id: string
          worker_id: string
          worker_name: string
          worker_number?: string | null
        }
        Update: {
          id?: string
          record_id?: string
          worker_id?: string
          worker_name?: string
          worker_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_record_workers_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "incidencias_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_record_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "incidencias_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_records: {
        Row: {
          accion_propuesta: string
          ai_articulos_relevantes: Json | null
          ai_categoria_sugerida: string | null
          ai_dias_suspension_sugeridos: number | null
          ai_gravedad_recomendada: string | null
          ai_gravedad_sugerida: string | null
          ai_motivo_legal: string | null
          ai_processed_at: string | null
          ai_recomendacion: string | null
          ai_riesgo_reincidencia: number | null
          ai_tipo_razonamiento: string | null
          ai_tipo_recomendado: string | null
          archivada_at: string | null
          archivada_motivo: string | null
          archivada_por: string | null
          category_id: string | null
          created_at: string
          created_by_id: string
          created_by_name: string
          csv_metadata: Json | null
          csv_tag_value: string | null
          custom_category_name: string | null
          deleted_at: string | null
          department_id: string
          descripcion: string | null
          duplicated_from_record_id: string | null
          estado: string
          evidence_hashes: Json | null
          fecha: string
          firmada: boolean
          id: string
          importe_total: number | null
          origen: string
          propuesta_fecha_inicio: string | null
          propuesta_suspension: boolean
          pruebas_urls: Json
          updated_at: string
          worker_pending: boolean
        }
        Insert: {
          accion_propuesta?: string
          ai_articulos_relevantes?: Json | null
          ai_categoria_sugerida?: string | null
          ai_dias_suspension_sugeridos?: number | null
          ai_gravedad_recomendada?: string | null
          ai_gravedad_sugerida?: string | null
          ai_motivo_legal?: string | null
          ai_processed_at?: string | null
          ai_recomendacion?: string | null
          ai_riesgo_reincidencia?: number | null
          ai_tipo_razonamiento?: string | null
          ai_tipo_recomendado?: string | null
          archivada_at?: string | null
          archivada_motivo?: string | null
          archivada_por?: string | null
          category_id?: string | null
          created_at?: string
          created_by_id: string
          created_by_name: string
          csv_metadata?: Json | null
          csv_tag_value?: string | null
          custom_category_name?: string | null
          deleted_at?: string | null
          department_id: string
          descripcion?: string | null
          duplicated_from_record_id?: string | null
          estado?: string
          evidence_hashes?: Json | null
          fecha?: string
          firmada?: boolean
          id?: string
          importe_total?: number | null
          origen?: string
          propuesta_fecha_inicio?: string | null
          propuesta_suspension?: boolean
          pruebas_urls?: Json
          updated_at?: string
          worker_pending?: boolean
        }
        Update: {
          accion_propuesta?: string
          ai_articulos_relevantes?: Json | null
          ai_categoria_sugerida?: string | null
          ai_dias_suspension_sugeridos?: number | null
          ai_gravedad_recomendada?: string | null
          ai_gravedad_sugerida?: string | null
          ai_motivo_legal?: string | null
          ai_processed_at?: string | null
          ai_recomendacion?: string | null
          ai_riesgo_reincidencia?: number | null
          ai_tipo_razonamiento?: string | null
          ai_tipo_recomendado?: string | null
          archivada_at?: string | null
          archivada_motivo?: string | null
          archivada_por?: string | null
          category_id?: string | null
          created_at?: string
          created_by_id?: string
          created_by_name?: string
          csv_metadata?: Json | null
          csv_tag_value?: string | null
          custom_category_name?: string | null
          deleted_at?: string | null
          department_id?: string
          descripcion?: string | null
          duplicated_from_record_id?: string | null
          estado?: string
          evidence_hashes?: Json | null
          fecha?: string
          firmada?: boolean
          id?: string
          importe_total?: number | null
          origen?: string
          propuesta_fecha_inicio?: string | null
          propuesta_suspension?: boolean
          pruebas_urls?: Json
          updated_at?: string
          worker_pending?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_records_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "incidencias_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_reglas_departamento: {
        Row: {
          activar_automatico: boolean
          alerta_despido_activa: boolean
          auto_escalar_tipo: boolean
          created_at: string
          department_id: string
          escalado_reglas: Json
          ia_analisis_automatico: boolean
          ia_considerar_convenio: boolean
          id: string
          notificar_encargado_popup: boolean
          notificar_encargado_umbral_pct: number
          periodo_dias_amonestaciones: number
          periodo_dias_despido: number
          periodo_dias_evaluacion: number
          periodo_puntos_dias: number
          puntos_grave: number
          puntos_leve: number
          puntos_moderada: number
          puntos_muy_grave: number
          sistema_puntos_activo: boolean
          umbral_amonestacion_puntos: number
          umbral_amonestaciones: number
          umbral_combinado_activo: boolean
          umbral_combinado_minimo: number
          umbral_graves: number
          umbral_graves_despido: number
          umbral_leves: number
          umbral_muy_graves: number
          umbral_muy_graves_despido: number
          updated_at: string
          valor_grave_equivalente: number
          valor_leve_equivalente: number
          valor_moderada_equivalente: number
          valor_muy_grave_equivalente: number
        }
        Insert: {
          activar_automatico?: boolean
          alerta_despido_activa?: boolean
          auto_escalar_tipo?: boolean
          created_at?: string
          department_id: string
          escalado_reglas?: Json
          ia_analisis_automatico?: boolean
          ia_considerar_convenio?: boolean
          id?: string
          notificar_encargado_popup?: boolean
          notificar_encargado_umbral_pct?: number
          periodo_dias_amonestaciones?: number
          periodo_dias_despido?: number
          periodo_dias_evaluacion?: number
          periodo_puntos_dias?: number
          puntos_grave?: number
          puntos_leve?: number
          puntos_moderada?: number
          puntos_muy_grave?: number
          sistema_puntos_activo?: boolean
          umbral_amonestacion_puntos?: number
          umbral_amonestaciones?: number
          umbral_combinado_activo?: boolean
          umbral_combinado_minimo?: number
          umbral_graves?: number
          umbral_graves_despido?: number
          umbral_leves?: number
          umbral_muy_graves?: number
          umbral_muy_graves_despido?: number
          updated_at?: string
          valor_grave_equivalente?: number
          valor_leve_equivalente?: number
          valor_moderada_equivalente?: number
          valor_muy_grave_equivalente?: number
        }
        Update: {
          activar_automatico?: boolean
          alerta_despido_activa?: boolean
          auto_escalar_tipo?: boolean
          created_at?: string
          department_id?: string
          escalado_reglas?: Json
          ia_analisis_automatico?: boolean
          ia_considerar_convenio?: boolean
          id?: string
          notificar_encargado_popup?: boolean
          notificar_encargado_umbral_pct?: number
          periodo_dias_amonestaciones?: number
          periodo_dias_despido?: number
          periodo_dias_evaluacion?: number
          periodo_puntos_dias?: number
          puntos_grave?: number
          puntos_leve?: number
          puntos_moderada?: number
          puntos_muy_grave?: number
          sistema_puntos_activo?: boolean
          umbral_amonestacion_puntos?: number
          umbral_amonestaciones?: number
          umbral_combinado_activo?: boolean
          umbral_combinado_minimo?: number
          umbral_graves?: number
          umbral_graves_despido?: number
          umbral_leves?: number
          umbral_muy_graves?: number
          umbral_muy_graves_despido?: number
          updated_at?: string
          valor_grave_equivalente?: number
          valor_leve_equivalente?: number
          valor_moderada_equivalente?: number
          valor_muy_grave_equivalente?: number
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_reglas_departamento_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_reglas_globales: {
        Row: {
          activar_automatico: boolean
          alerta_despido_activa: boolean
          auto_escalar_tipo: boolean
          created_at: string
          escalado_reglas: Json
          ia_analisis_automatico: boolean
          ia_considerar_convenio: boolean
          id: string
          notificar_encargado_popup: boolean
          notificar_encargado_umbral_pct: number
          periodo_dias_amonestaciones: number
          periodo_dias_despido: number
          periodo_dias_evaluacion: number
          periodo_puntos_dias: number
          puntos_grave: number
          puntos_leve: number
          puntos_moderada: number
          puntos_muy_grave: number
          sistema_puntos_activo: boolean
          umbral_amonestacion_puntos: number
          umbral_amonestaciones: number
          umbral_combinado_activo: boolean
          umbral_combinado_minimo: number
          umbral_graves: number
          umbral_graves_despido: number
          umbral_leves: number
          umbral_muy_graves: number
          umbral_muy_graves_despido: number
          updated_at: string
          valor_grave_equivalente: number
          valor_leve_equivalente: number
          valor_moderada_equivalente: number
          valor_muy_grave_equivalente: number
        }
        Insert: {
          activar_automatico?: boolean
          alerta_despido_activa?: boolean
          auto_escalar_tipo?: boolean
          created_at?: string
          escalado_reglas?: Json
          ia_analisis_automatico?: boolean
          ia_considerar_convenio?: boolean
          id?: string
          notificar_encargado_popup?: boolean
          notificar_encargado_umbral_pct?: number
          periodo_dias_amonestaciones?: number
          periodo_dias_despido?: number
          periodo_dias_evaluacion?: number
          periodo_puntos_dias?: number
          puntos_grave?: number
          puntos_leve?: number
          puntos_moderada?: number
          puntos_muy_grave?: number
          sistema_puntos_activo?: boolean
          umbral_amonestacion_puntos?: number
          umbral_amonestaciones?: number
          umbral_combinado_activo?: boolean
          umbral_combinado_minimo?: number
          umbral_graves?: number
          umbral_graves_despido?: number
          umbral_leves?: number
          umbral_muy_graves?: number
          umbral_muy_graves_despido?: number
          updated_at?: string
          valor_grave_equivalente?: number
          valor_leve_equivalente?: number
          valor_moderada_equivalente?: number
          valor_muy_grave_equivalente?: number
        }
        Update: {
          activar_automatico?: boolean
          alerta_despido_activa?: boolean
          auto_escalar_tipo?: boolean
          created_at?: string
          escalado_reglas?: Json
          ia_analisis_automatico?: boolean
          ia_considerar_convenio?: boolean
          id?: string
          notificar_encargado_popup?: boolean
          notificar_encargado_umbral_pct?: number
          periodo_dias_amonestaciones?: number
          periodo_dias_despido?: number
          periodo_dias_evaluacion?: number
          periodo_puntos_dias?: number
          puntos_grave?: number
          puntos_leve?: number
          puntos_moderada?: number
          puntos_muy_grave?: number
          sistema_puntos_activo?: boolean
          umbral_amonestacion_puntos?: number
          umbral_amonestaciones?: number
          umbral_combinado_activo?: boolean
          umbral_combinado_minimo?: number
          umbral_graves?: number
          umbral_graves_despido?: number
          umbral_leves?: number
          umbral_muy_graves?: number
          umbral_muy_graves_despido?: number
          updated_at?: string
          valor_grave_equivalente?: number
          valor_leve_equivalente?: number
          valor_moderada_equivalente?: number
          valor_muy_grave_equivalente?: number
        }
        Relationships: []
      }
      incidencias_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          department_id: string
          description: string | null
          due_at: string | null
          id: string
          printed_at: string | null
          ref_id: string | null
          signed_photo_url: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department_id: string
          description?: string | null
          due_at?: string | null
          id?: string
          printed_at?: string | null
          ref_id?: string | null
          signed_photo_url?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department_id?: string
          description?: string | null
          due_at?: string | null
          id?: string
          printed_at?: string | null
          ref_id?: string | null
          signed_photo_url?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      incidencias_training_documents: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          document_type: string
          extracted_text: string | null
          file_size: number
          filename: string
          id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          document_type?: string
          extracted_text?: string | null
          file_size?: number
          filename: string
          id?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          document_type?: string
          extracted_text?: string | null
          file_size?: number
          filename?: string
          id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      incidencias_video_frames: {
        Row: {
          ai_description: string | null
          caption: string | null
          capture_source: string | null
          created_at: string
          frame_url: string
          id: string
          propuesta_id: string
          relevance_score: number | null
          source_video_name: string | null
          storage_path: string | null
          timestamp_seconds: number
          verified_at: string | null
          video_path: string
        }
        Insert: {
          ai_description?: string | null
          caption?: string | null
          capture_source?: string | null
          created_at?: string
          frame_url: string
          id?: string
          propuesta_id: string
          relevance_score?: number | null
          source_video_name?: string | null
          storage_path?: string | null
          timestamp_seconds: number
          verified_at?: string | null
          video_path: string
        }
        Update: {
          ai_description?: string | null
          caption?: string | null
          capture_source?: string | null
          created_at?: string
          frame_url?: string
          id?: string
          propuesta_id?: string
          relevance_score?: number | null
          source_video_name?: string | null
          storage_path?: string | null
          timestamp_seconds?: number
          verified_at?: string | null
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_video_frames_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "incidencias_propuestas_rrhh"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_worker_stats: {
        Row: {
          department_id: string
          graves: number
          leves: number
          muy_graves: number
          reincidencias: number
          riesgo_score: number
          total_count: number
          ultimos_30: number
          ultimos_60: number
          ultimos_90: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          department_id: string
          graves?: number
          leves?: number
          muy_graves?: number
          reincidencias?: number
          riesgo_score?: number
          total_count?: number
          ultimos_30?: number
          ultimos_60?: number
          ultimos_90?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          department_id?: string
          graves?: number
          leves?: number
          muy_graves?: number
          reincidencias?: number
          riesgo_score?: number
          total_count?: number
          ultimos_30?: number
          ultimos_60?: number
          ultimos_90?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_worker_stats_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_worker_stats_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "incidencias_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias_workers: {
        Row: {
          activo: boolean
          apellidos: string | null
          created_at: string
          department_id: string
          email: string | null
          external_url_salix: string | null
          id: string
          is_external: boolean
          nombre: string
          telefono: string | null
          worker_number: string | null
        }
        Insert: {
          activo?: boolean
          apellidos?: string | null
          created_at?: string
          department_id: string
          email?: string | null
          external_url_salix?: string | null
          id?: string
          is_external?: boolean
          nombre: string
          telefono?: string | null
          worker_number?: string | null
        }
        Update: {
          activo?: boolean
          apellidos?: string | null
          created_at?: string
          department_id?: string
          email?: string | null
          external_url_salix?: string | null
          id?: string
          is_external?: boolean
          nombre?: string
          telefono?: string | null
          worker_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_workers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "incidencias_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_evaluations: {
        Row: {
          attended: boolean
          created_at: string
          decision: string | null
          id: string
          interview_id: string
          manager_id: string
          manager_name: string
          manager_role: string
          notes: string | null
          psicotecnico: string | null
          rating: number | null
          updated_at: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          decision?: string | null
          id?: string
          interview_id: string
          manager_id: string
          manager_name: string
          manager_role: string
          notes?: string | null
          psicotecnico?: string | null
          rating?: number | null
          updated_at?: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          decision?: string | null
          id?: string
          interview_id?: string
          manager_id?: string
          manager_name?: string
          manager_role?: string
          notes?: string | null
          psicotecnico?: string | null
          rating?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluations_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          additional_info: string | null
          application_id: string | null
          assigned_manager_id: string | null
          candidate_email: string | null
          candidate_name: string
          candidate_phone: string | null
          created_at: string
          created_by_manager_id: string | null
          custom_department: string | null
          cv_file_type: string | null
          cv_file_url: string | null
          department_id: string | null
          duration_minutes: number
          id: string
          job_position_id: string | null
          room: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          additional_info?: string | null
          application_id?: string | null
          assigned_manager_id?: string | null
          candidate_email?: string | null
          candidate_name: string
          candidate_phone?: string | null
          created_at?: string
          created_by_manager_id?: string | null
          custom_department?: string | null
          cv_file_type?: string | null
          cv_file_url?: string | null
          department_id?: string | null
          duration_minutes?: number
          id?: string
          job_position_id?: string | null
          room?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          additional_info?: string | null
          application_id?: string | null
          assigned_manager_id?: string | null
          candidate_email?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          created_at?: string
          created_by_manager_id?: string | null
          custom_department?: string | null
          cv_file_type?: string | null
          cv_file_url?: string | null
          department_id?: string | null
          duration_minutes?: number
          id?: string
          job_position_id?: string | null
          room?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_manager_id_fkey"
            columns: ["created_by_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_manager_id_fkey"
            columns: ["created_by_manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "active_job_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "job_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_comparisons: {
        Row: {
          created_at: string
          id: string
          result_summary: Json | null
          supplier_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          result_summary?: Json | null
          supplier_name: string
        }
        Update: {
          created_at?: string
          id?: string
          result_summary?: Json | null
          supplier_name?: string
        }
        Relationships: []
      }
      invoice_product_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          internal_product_name: string
          supplier_name: string
          supplier_product_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          internal_product_name: string
          supplier_name: string
          supplier_product_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          internal_product_name?: string
          supplier_name?: string
          supplier_product_name?: string
        }
        Relationships: []
      }
      invoice_supplier_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          supplier_name: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          supplier_name: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          supplier_name?: string
        }
        Relationships: []
      }
      invoice_suppliers: {
        Row: {
          ai_learnings: Json | null
          aliases: string[] | null
          created_at: string | null
          id: string
          last_comparison_at: string | null
          name: string
          notes: string | null
          product_catalog: Json | null
          total_comparisons: number | null
          updated_at: string | null
        }
        Insert: {
          ai_learnings?: Json | null
          aliases?: string[] | null
          created_at?: string | null
          id?: string
          last_comparison_at?: string | null
          name: string
          notes?: string | null
          product_catalog?: Json | null
          total_comparisons?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_learnings?: Json | null
          aliases?: string[] | null
          created_at?: string | null
          id?: string
          last_comparison_at?: string | null
          name?: string
          notes?: string | null
          product_catalog?: Json | null
          total_comparisons?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      job_positions: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          department_id: string | null
          description: string
          id: string
          is_active: boolean
          is_default: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          department_id?: string | null
          description?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          department_id?: string | null
          description?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      justificante_audit_logs: {
        Row: {
          action_type: string
          actor_name: string
          actor_role: string
          created_at: string
          department_name: string | null
          details: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          justificante_id: string | null
          metadata: Json | null
          tipo_justificante: string | null
          worker_name: string | null
          worker_number: string | null
        }
        Insert: {
          action_type: string
          actor_name: string
          actor_role: string
          created_at?: string
          department_name?: string | null
          details?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          justificante_id?: string | null
          metadata?: Json | null
          tipo_justificante?: string | null
          worker_name?: string | null
          worker_number?: string | null
        }
        Update: {
          action_type?: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          department_name?: string | null
          details?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          justificante_id?: string | null
          metadata?: Json | null
          tipo_justificante?: string | null
          worker_name?: string | null
          worker_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "justificante_audit_logs_justificante_id_fkey"
            columns: ["justificante_id"]
            isOneToOne: false
            referencedRelation: "justificantes"
            referencedColumns: ["id"]
          },
        ]
      }
      justificante_documentos: {
        Row: {
          actor_nombre: string
          actor_rol: string
          archivo_nombre: string | null
          archivo_tipo: string | null
          archivo_url: string | null
          created_at: string
          id: string
          justificante_id: string
          mensaje: string | null
          tipo_mensaje: string
        }
        Insert: {
          actor_nombre: string
          actor_rol: string
          archivo_nombre?: string | null
          archivo_tipo?: string | null
          archivo_url?: string | null
          created_at?: string
          id?: string
          justificante_id: string
          mensaje?: string | null
          tipo_mensaje: string
        }
        Update: {
          actor_nombre?: string
          actor_rol?: string
          archivo_nombre?: string | null
          archivo_tipo?: string | null
          archivo_url?: string | null
          created_at?: string
          id?: string
          justificante_id?: string
          mensaje?: string | null
          tipo_mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "justificante_documentos_justificante_id_fkey"
            columns: ["justificante_id"]
            isOneToOne: false
            referencedRelation: "justificantes"
            referencedColumns: ["id"]
          },
        ]
      }
      justificante_gestiones: {
        Row: {
          accion: Database["public"]["Enums"]["justificante_estado"]
          comentario_gestor: string | null
          created_at: string
          gestionado_por_nombre: string
          gestionado_por_user_id: string | null
          id: string
          justificante_id: string
        }
        Insert: {
          accion: Database["public"]["Enums"]["justificante_estado"]
          comentario_gestor?: string | null
          created_at?: string
          gestionado_por_nombre: string
          gestionado_por_user_id?: string | null
          id?: string
          justificante_id: string
        }
        Update: {
          accion?: Database["public"]["Enums"]["justificante_estado"]
          comentario_gestor?: string | null
          created_at?: string
          gestionado_por_nombre?: string
          gestionado_por_user_id?: string | null
          id?: string
          justificante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "justificante_gestiones_justificante_id_fkey"
            columns: ["justificante_id"]
            isOneToOne: false
            referencedRelation: "justificantes"
            referencedColumns: ["id"]
          },
        ]
      }
      justificantes: {
        Row: {
          archivo_nombre: string
          archivo_tipo: string
          archivo_url: string
          archivos_adicionales: Json | null
          comentario_empleado: string | null
          created_at: string
          department_id: string
          estado: Database["public"]["Enums"]["justificante_estado"]
          fecha_fin: string
          fecha_inicio: string
          id: string
          last_doc_request_message: string | null
          last_viewed_at: string | null
          pending_docs_request: boolean | null
          time_entry_id: string | null
          tipo: Database["public"]["Enums"]["justificante_tipo"]
          updated_at: string
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Insert: {
          archivo_nombre: string
          archivo_tipo: string
          archivo_url: string
          archivos_adicionales?: Json | null
          comentario_empleado?: string | null
          created_at?: string
          department_id: string
          estado?: Database["public"]["Enums"]["justificante_estado"]
          fecha_fin: string
          fecha_inicio: string
          id?: string
          last_doc_request_message?: string | null
          last_viewed_at?: string | null
          pending_docs_request?: boolean | null
          time_entry_id?: string | null
          tipo: Database["public"]["Enums"]["justificante_tipo"]
          updated_at?: string
          worker_id: string
          worker_name: string
          worker_number: string
        }
        Update: {
          archivo_nombre?: string
          archivo_tipo?: string
          archivo_url?: string
          archivos_adicionales?: Json | null
          comentario_empleado?: string | null
          created_at?: string
          department_id?: string
          estado?: Database["public"]["Enums"]["justificante_estado"]
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          last_doc_request_message?: string | null
          last_viewed_at?: string | null
          pending_docs_request?: boolean | null
          time_entry_id?: string | null
          tipo?: Database["public"]["Enums"]["justificante_tipo"]
          updated_at?: string
          worker_id?: string
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "justificantes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificantes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificantes_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justificantes_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      justificantes_settings: {
        Row: {
          created_at: string
          department_notifications: Json | null
          id: string
          manager_notification_emails: Json | null
          manager_notifications_enabled: boolean | null
          notification_emails: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_notifications?: Json | null
          id?: string
          manager_notification_emails?: Json | null
          manager_notifications_enabled?: boolean | null
          notification_emails?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_notifications?: Json | null
          id?: string
          manager_notification_emails?: Json | null
          manager_notifications_enabled?: boolean | null
          notification_emails?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      labor_import_history: {
        Row: {
          created_at: string
          error_details: Json | null
          file_name: string | null
          id: string
          import_type: string
          imported_by: string
          records_error: number
          records_processed: number
          records_success: number
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          file_name?: string | null
          id?: string
          import_type: string
          imported_by: string
          records_error?: number
          records_processed?: number
          records_success?: number
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          file_name?: string | null
          id?: string
          import_type?: string
          imported_by?: string
          records_error?: number
          records_processed?: number
          records_success?: number
        }
        Relationships: []
      }
      labor_incident_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          incident_count: number
          period_end: string
          period_start: string
          sent_at: string
          worker_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          incident_count: number
          period_end: string
          period_start: string
          sent_at?: string
          worker_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          incident_count?: number
          period_end?: string
          period_start?: string
          sent_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_incident_alerts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_module_settings: {
        Row: {
          absence_threshold_hours: number
          active_modules: Json
          alert_email: string | null
          alert_threshold_absences: number | null
          alert_threshold_delays: number | null
          alerts_enabled: boolean | null
          courtesy_minutes: number
          created_at: string
          delay_threshold_minutes: number
          future_db_connection_config: Json | null
          id: string
          updated_at: string
        }
        Insert: {
          absence_threshold_hours?: number
          active_modules?: Json
          alert_email?: string | null
          alert_threshold_absences?: number | null
          alert_threshold_delays?: number | null
          alerts_enabled?: boolean | null
          courtesy_minutes?: number
          created_at?: string
          delay_threshold_minutes?: number
          future_db_connection_config?: Json | null
          id?: string
          updated_at?: string
        }
        Update: {
          absence_threshold_hours?: number
          active_modules?: Json
          alert_email?: string | null
          alert_threshold_absences?: number | null
          alert_threshold_delays?: number | null
          alerts_enabled?: boolean | null
          courtesy_minutes?: number
          created_at?: string
          delay_threshold_minutes?: number
          future_db_connection_config?: Json | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_identifier: string
        }
        Insert: {
          attempted_at?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_identifier: string
        }
        Update: {
          attempted_at?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_identifier?: string
        }
        Relationships: []
      }
      manager_department_assignments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          manager_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          manager_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_department_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_department_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_department_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_department_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_activity: string
          manager_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_activity?: string
          manager_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_activity?: string
          manager_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_sessions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_sessions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          avatar_url: string | null
          candidaturas_only: boolean
          created_at: string
          department_id: string | null
          email: string | null
          id: string
          is_blocked: boolean
          name: string
          parent_manager_id: string | null
          password_hash: string | null
          role: string
          setup_token: string | null
          worker_id: string | null
          worker_team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          candidaturas_only?: boolean
          created_at?: string
          department_id?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean
          name: string
          parent_manager_id?: string | null
          password_hash?: string | null
          role?: string
          setup_token?: string | null
          worker_id?: string | null
          worker_team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          candidaturas_only?: boolean
          created_at?: string
          department_id?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean
          name?: string
          parent_manager_id?: string | null
          password_hash?: string | null
          role?: string
          setup_token?: string | null
          worker_id?: string | null
          worker_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_parent_manager_id_fkey"
            columns: ["parent_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_parent_manager_id_fkey"
            columns: ["parent_manager_id"]
            isOneToOne: false
            referencedRelation: "managers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_worker_team_id_fkey"
            columns: ["worker_team_id"]
            isOneToOne: false
            referencedRelation: "worker_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      operativa_altas_config: {
        Row: {
          created_at: string
          emails: string[] | null
          id: string
          primary_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operativa_anticipos_config: {
        Row: {
          created_at: string | null
          emails: string[] | null
          id: string
          primary_email: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      operativa_despidos_config: {
        Row: {
          created_at: string
          emails: string[]
          id: string
          primary_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          emails?: string[]
          id?: string
          primary_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          emails?: string[]
          id?: string
          primary_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operativa_envios_history: {
        Row: {
          datos: Json
          destinatarios: string[] | null
          email_id: string | null
          id: string
          sent_at: string
          sent_by: string
          tipo: string
        }
        Insert: {
          datos?: Json
          destinatarios?: string[] | null
          email_id?: string | null
          id?: string
          sent_at?: string
          sent_by?: string
          tipo?: string
        }
        Update: {
          datos?: Json
          destinatarios?: string[] | null
          email_id?: string | null
          id?: string
          sent_at?: string
          sent_by?: string
          tipo?: string
        }
        Relationships: []
      }
      operativa_justificante_config: {
        Row: {
          created_at: string | null
          emails: string[]
          id: string
          primary_email: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emails?: string[]
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emails?: string[]
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      operativa_nspp_config: {
        Row: {
          created_at: string | null
          emails: string[] | null
          id: string
          primary_email: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emails?: string[] | null
          id?: string
          primary_email?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      performance_thresholds: {
        Row: {
          created_at: string | null
          department_id: string
          green_min: number
          id: string
          updated_at: string | null
          yellow_min: number
        }
        Insert: {
          created_at?: string | null
          department_id: string
          green_min?: number
          id?: string
          updated_at?: string | null
          yellow_min?: number
        }
        Update: {
          created_at?: string | null
          department_id?: string
          green_min?: number
          id?: string
          updated_at?: string | null
          yellow_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_thresholds_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_thresholds_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_annual_calendar_days: {
        Row: {
          created_at: string
          date: string
          id: string
          personal_calendar_id: string
          personal_calendar_worker_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          personal_calendar_id: string
          personal_calendar_worker_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          personal_calendar_id?: string
          personal_calendar_worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_annual_calendar_days_personal_calendar_id_fkey"
            columns: ["personal_calendar_id"]
            isOneToOne: false
            referencedRelation: "personal_annual_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_annual_calendar_days_personal_calendar_worker_id_fkey"
            columns: ["personal_calendar_worker_id"]
            isOneToOne: false
            referencedRelation: "personal_annual_calendar_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_annual_calendar_workers: {
        Row: {
          color: string
          created_at: string
          id: string
          personal_calendar_id: string
          sort_order: number
          source_group_id: string | null
          worker_id: string | null
          worker_name: string
          worker_number: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          personal_calendar_id: string
          sort_order?: number
          source_group_id?: string | null
          worker_id?: string | null
          worker_name: string
          worker_number: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          personal_calendar_id?: string
          sort_order?: number
          source_group_id?: string | null
          worker_id?: string | null
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_annual_calendar_workers_personal_calendar_id_fkey"
            columns: ["personal_calendar_id"]
            isOneToOne: false
            referencedRelation: "personal_annual_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_annual_calendar_workers_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_annual_calendar_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_annual_calendars: {
        Row: {
          created_at: string
          department_id: string
          id: string
          name: string
          source_calendar_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          name: string
          source_calendar_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          source_calendar_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_annual_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_annual_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_annual_calendars_source_calendar_id_fkey"
            columns: ["source_calendar_id"]
            isOneToOne: false
            referencedRelation: "annual_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_calendar_availabilities: {
        Row: {
          created_at: string
          date: string
          half_day: boolean
          id: string
          personal_calendar_id: string
        }
        Insert: {
          created_at?: string
          date: string
          half_day?: boolean
          id?: string
          personal_calendar_id: string
        }
        Update: {
          created_at?: string
          date?: string
          half_day?: boolean
          id?: string
          personal_calendar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_calendar_availabilities_personal_calendar_id_fkey"
            columns: ["personal_calendar_id"]
            isOneToOne: false
            referencedRelation: "personal_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_calendars: {
        Row: {
          created_at: string
          department_id: string
          id: string
          max_days: number
          public_token: string
          slug: string | null
          updated_at: string
          worker_name: string
          worker_number: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          max_days?: number
          public_token?: string
          slug?: string | null
          updated_at?: string
          worker_name: string
          worker_number: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          max_days?: number
          public_token?: string
          slug?: string | null
          updated_at?: string
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_calendars_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_schedule_rotation_groups: {
        Row: {
          base_week: number
          base_year: number
          created_at: string
          department_id: string
          id: string
          name: string
          rotation_enabled: boolean
          updated_at: string
        }
        Insert: {
          base_week?: number
          base_year?: number
          created_at?: string
          department_id: string
          id?: string
          name: string
          rotation_enabled?: boolean
          updated_at?: string
        }
        Update: {
          base_week?: number
          base_year?: number
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          rotation_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_schedule_rotation_groups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_schedule_rotation_groups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_work_schedules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          rotation_group_id: string | null
          rotation_position: number
          schedule_template: Json
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          rotation_group_id?: string | null
          rotation_position?: number
          schedule_template?: Json
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          rotation_group_id?: string | null
          rotation_position?: number
          schedule_template?: Json
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_work_schedules_rotation_group_id_fkey"
            columns: ["rotation_group_id"]
            isOneToOne: false
            referencedRelation: "personal_schedule_rotation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_work_schedules_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_answers: {
        Row: {
          answer_given: string | null
          answered_at: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          session_id: string
          time_taken_seconds: number | null
        }
        Insert: {
          answer_given?: string | null
          answered_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          session_id: string
          time_taken_seconds?: number | null
        }
        Update: {
          answer_given?: string | null
          answered_at?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          session_id?: string
          time_taken_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "psico_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psico_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "psico_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_questions: {
        Row: {
          block_name: string | null
          category: string
          consistency_pair_id: string | null
          correct_answer: string
          created_at: string | null
          difficulty: number | null
          id: string
          is_active: boolean | null
          order_index: number | null
          points: number | null
          question_data: Json
          question_text: string
          question_type: string
          test_id: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          block_name?: string | null
          category: string
          consistency_pair_id?: string | null
          correct_answer: string
          created_at?: string | null
          difficulty?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          points?: number | null
          question_data?: Json
          question_text: string
          question_type: string
          test_id?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          block_name?: string | null
          category?: string
          consistency_pair_id?: string | null
          correct_answer?: string
          created_at?: string | null
          difficulty?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          points?: number | null
          question_data?: Json
          question_text?: string
          question_type?: string
          test_id?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "psico_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_results: {
        Row: {
          accuracy_percentage: number | null
          ai_insights: string | null
          average_time_per_question: number | null
          category_scores: Json | null
          cognitive_profile: string | null
          consistency_index: number | null
          correct_answers: number
          created_at: string | null
          detailed_analysis: Json | null
          id: string
          incorrect_answers: number
          recommendation: string | null
          session_id: string
          speed_index: number | null
          total_questions: number
          unanswered: number
          updated_at: string | null
        }
        Insert: {
          accuracy_percentage?: number | null
          ai_insights?: string | null
          average_time_per_question?: number | null
          category_scores?: Json | null
          cognitive_profile?: string | null
          consistency_index?: number | null
          correct_answers?: number
          created_at?: string | null
          detailed_analysis?: Json | null
          id?: string
          incorrect_answers?: number
          recommendation?: string | null
          session_id: string
          speed_index?: number | null
          total_questions: number
          unanswered?: number
          updated_at?: string | null
        }
        Update: {
          accuracy_percentage?: number | null
          ai_insights?: string | null
          average_time_per_question?: number | null
          category_scores?: Json | null
          cognitive_profile?: string | null
          consistency_index?: number | null
          correct_answers?: number
          created_at?: string | null
          detailed_analysis?: Json | null
          id?: string
          incorrect_answers?: number
          recommendation?: string | null
          session_id?: string
          speed_index?: number | null
          total_questions?: number
          unanswered?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "psico_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_sessions: {
        Row: {
          access_code: string
          area_id: string | null
          candidate_email: string | null
          candidate_name: string
          candidate_phone: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_question_index: number | null
          expires_at: string | null
          id: string
          ip_address: string | null
          position_applied: string
          started_at: string | null
          status: string | null
          test_id: string | null
          total_time_seconds: number | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          access_code: string
          area_id?: string | null
          candidate_email?: string | null
          candidate_name: string
          candidate_phone?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_question_index?: number | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          position_applied: string
          started_at?: string | null
          status?: string | null
          test_id?: string | null
          total_time_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          access_code?: string
          area_id?: string | null
          candidate_email?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_question_index?: number | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          position_applied?: string
          started_at?: string | null
          status?: string | null
          test_id?: string | null
          total_time_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_sessions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "psico_test_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psico_sessions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "psico_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_test_areas: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      psico_test_questions: {
        Row: {
          category: string
          correct_answer: string
          created_at: string
          id: string
          order_index: number
          points: number
          question_data: Json | null
          question_text: string
          question_type: string
          test_id: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          category: string
          correct_answer: string
          created_at?: string
          id?: string
          order_index?: number
          points?: number
          question_data?: Json | null
          question_text: string
          question_type?: string
          test_id?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          category?: string
          correct_answer?: string
          created_at?: string
          id?: string
          order_index?: number
          points?: number
          question_data?: Json | null
          question_text?: string
          question_type?: string
          test_id?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "psico_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      psico_tests: {
        Row: {
          area_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          questions_count: number | null
          scoring_config: Json | null
          target_positions: string[] | null
          time_limit_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          questions_count?: number | null
          scoring_config?: Json | null
          target_positions?: string[] | null
          time_limit_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          questions_count?: number | null
          scoring_config?: Json | null
          target_positions?: string[] | null
          time_limit_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psico_tests_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "psico_test_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      rrhh_users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          password_hash: string | null
          role: Database["public"]["Enums"]["rrhh_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          password_hash?: string | null
          role?: Database["public"]["Enums"]["rrhh_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          password_hash?: string | null
          role?: Database["public"]["Enums"]["rrhh_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      salidas_voluntarias: {
        Row: {
          created_at: string | null
          department_id: string | null
          department_name: string | null
          fecha: string
          firma_base64: string
          hora: string
          id: string
          manager_id: string
          manager_name: string
          worker_id: string
          worker_name: string
          worker_number: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          department_name?: string | null
          fecha?: string
          firma_base64: string
          hora?: string
          id?: string
          manager_id: string
          manager_name: string
          worker_id: string
          worker_name: string
          worker_number?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          department_name?: string | null
          fecha?: string
          firma_base64?: string
          hora?: string
          id?: string
          manager_id?: string
          manager_name?: string
          worker_id?: string
          worker_name?: string
          worker_number?: string | null
        }
        Relationships: []
      }
      salix_clock_entries: {
        Row: {
          created_at: string | null
          department_name: string
          direction: string
          id: string
          import_batch_id: string | null
          punch_date: string
          punch_time: string
          worker_id: string | null
          worker_name: string
          worker_number: string
        }
        Insert: {
          created_at?: string | null
          department_name: string
          direction: string
          id?: string
          import_batch_id?: string | null
          punch_date: string
          punch_time: string
          worker_id?: string | null
          worker_name: string
          worker_number: string
        }
        Update: {
          created_at?: string | null
          department_name?: string
          direction?: string
          id?: string
          import_batch_id?: string | null
          punch_date?: string
          punch_time?: string
          worker_id?: string | null
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "salix_clock_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_ai_conversations: {
        Row: {
          content: string
          created_at: string | null
          department_id: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          created_at?: string | null
          department_id: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          created_at?: string | null
          department_id?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_ai_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_ai_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_ai_memory: {
        Row: {
          corrections: string
          created_at: string
          department_id: string
          id: string
          instructions: string
          learned_rule: string
        }
        Insert: {
          corrections?: string
          created_at?: string
          department_id: string
          id?: string
          instructions?: string
          learned_rule?: string
        }
        Update: {
          corrections?: string
          created_at?: string
          department_id?: string
          id?: string
          instructions?: string
          learned_rule?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_ai_memory_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_ai_memory_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_group_colors: {
        Row: {
          color: string
          created_at: string
          department_id: string
          group_letter: string
          id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          group_letter: string
          id?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          group_letter?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_group_colors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_group_colors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          severity: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          severity: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          severity?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      system_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          role: Database["public"]["Enums"]["system_role"]
          user_identifier: string
          user_type: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          id?: string
          role?: Database["public"]["Enums"]["system_role"]
          user_identifier: string
          user_type: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          role?: Database["public"]["Enums"]["system_role"]
          user_identifier?: string
          user_type?: string
        }
        Relationships: []
      }
      team_config_backups: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          id: string
          label: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: string
          label?: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: string
          label?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_config_backups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_config_backups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_config_drafts: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          change_log: Json | null
          created_at: string
          created_by: string | null
          department_id: string
          id: string
          is_applied: boolean
          label: string | null
          snapshot: Json
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          change_log?: Json | null
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: string
          is_applied?: boolean
          label?: string | null
          snapshot?: Json
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          change_log?: Json | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: string
          is_applied?: boolean
          label?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_config_drafts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_config_drafts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          department_id: string
          end_time: string | null
          id: string
          schedule_type: string
          start_time: string | null
          updated_at: string
          valid_from: string
          valid_until: string | null
          work_group_id: string | null
          worker_team_id: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          department_id: string
          end_time?: string | null
          id?: string
          schedule_type: string
          start_time?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          work_group_id?: string | null
          worker_team_id?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          department_id?: string
          end_time?: string | null
          id?: string
          schedule_type?: string
          start_time?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          work_group_id?: string | null
          worker_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedules_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedules_worker_team_id_fkey"
            columns: ["worker_team_id"]
            isOneToOne: false
            referencedRelation: "worker_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          delay_minutes: number | null
          entry_date: string
          id: string
          import_batch_id: string | null
          is_absence: boolean
          observation: string | null
          source: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          delay_minutes?: number | null
          entry_date: string
          id?: string
          import_batch_id?: string | null
          is_absence?: boolean
          observation?: string | null
          source?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          delay_minutes?: number | null
          entry_date?: string
          id?: string
          import_batch_id?: string | null
          is_absence?: boolean
          observation?: string | null
          source?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_summaries: {
        Row: {
          absence_days: number
          created_at: string
          id: string
          month: number
          monthly_delay_minutes: number
          updated_at: string
          week_number: number
          weekly_delay_minutes: number
          worked_days: number
          worker_id: string
          year: number
        }
        Insert: {
          absence_days?: number
          created_at?: string
          id?: string
          month: number
          monthly_delay_minutes?: number
          updated_at?: string
          week_number: number
          weekly_delay_minutes?: number
          worked_days?: number
          worker_id: string
          year: number
        }
        Update: {
          absence_days?: number
          created_at?: string
          id?: string
          month?: number
          monthly_delay_minutes?: number
          updated_at?: string
          week_number?: number
          weekly_delay_minutes?: number
          worked_days?: number
          worker_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_summaries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
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
      vacation_group_exchanges: {
        Row: {
          accepted_by_a: boolean
          accepted_by_a_at: string | null
          accepted_by_b: boolean
          accepted_by_b_at: string | null
          approved_at: string | null
          approved_by: string | null
          approved_by_admin: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          department_id: string
          employee_a_id: string
          employee_b_id: string
          id: string
          original_group_a_id: string | null
          original_group_b_id: string | null
          signature_a: string | null
          signature_b: string | null
          status: string
          temporary_group_a_id: string | null
          temporary_group_b_id: string | null
          token_a: string
          token_b: string
          updated_at: string
          year: number
        }
        Insert: {
          accepted_by_a?: boolean
          accepted_by_a_at?: string | null
          accepted_by_b?: boolean
          accepted_by_b_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_admin?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id: string
          employee_a_id: string
          employee_b_id: string
          id?: string
          original_group_a_id?: string | null
          original_group_b_id?: string | null
          signature_a?: string | null
          signature_b?: string | null
          status?: string
          temporary_group_a_id?: string | null
          temporary_group_b_id?: string | null
          token_a?: string
          token_b?: string
          updated_at?: string
          year: number
        }
        Update: {
          accepted_by_a?: boolean
          accepted_by_a_at?: string | null
          accepted_by_b?: boolean
          accepted_by_b_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_admin?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          employee_a_id?: string
          employee_b_id?: string
          id?: string
          original_group_a_id?: string | null
          original_group_b_id?: string | null
          signature_a?: string | null
          signature_b?: string | null
          status?: string
          temporary_group_a_id?: string | null
          temporary_group_b_id?: string | null
          token_a?: string
          token_b?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vacation_group_exchanges_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_employee_a_id_fkey"
            columns: ["employee_a_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_employee_b_id_fkey"
            columns: ["employee_b_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_original_group_a_id_fkey"
            columns: ["original_group_a_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_original_group_b_id_fkey"
            columns: ["original_group_b_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_temporary_group_a_id_fkey"
            columns: ["temporary_group_a_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_group_exchanges_temporary_group_b_id_fkey"
            columns: ["temporary_group_b_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_request_dates: {
        Row: {
          created_at: string
          date: string
          half_day: boolean
          id: string
          vacation_request_id: string
        }
        Insert: {
          created_at?: string
          date: string
          half_day?: boolean
          id?: string
          vacation_request_id: string
        }
        Update: {
          created_at?: string
          date?: string
          half_day?: boolean
          id?: string
          vacation_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_request_dates_vacation_request_id_fkey"
            columns: ["vacation_request_id"]
            isOneToOne: false
            referencedRelation: "vacation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_requests: {
        Row: {
          admin_rejection_reason: string | null
          created_at: string
          department_id: string
          edit_request_at: string | null
          edit_request_by: string | null
          edit_request_reason: string | null
          edit_request_status: string | null
          employee_email: string
          employee_name: string
          id: string
          is_admin_request: boolean
          manager_action_by: string | null
          manager_approved_at: string | null
          manager_rejection_reason: string | null
          manager_status: string | null
          notes: string | null
          requested_by_admin_name: string | null
          signature: string | null
          status: string
          worker_number: string
        }
        Insert: {
          admin_rejection_reason?: string | null
          created_at?: string
          department_id: string
          edit_request_at?: string | null
          edit_request_by?: string | null
          edit_request_reason?: string | null
          edit_request_status?: string | null
          employee_email: string
          employee_name: string
          id?: string
          is_admin_request?: boolean
          manager_action_by?: string | null
          manager_approved_at?: string | null
          manager_rejection_reason?: string | null
          manager_status?: string | null
          notes?: string | null
          requested_by_admin_name?: string | null
          signature?: string | null
          status?: string
          worker_number?: string
        }
        Update: {
          admin_rejection_reason?: string | null
          created_at?: string
          department_id?: string
          edit_request_at?: string | null
          edit_request_by?: string | null
          edit_request_reason?: string | null
          edit_request_status?: string | null
          employee_email?: string
          employee_name?: string
          id?: string
          is_admin_request?: boolean
          manager_action_by?: string | null
          manager_approved_at?: string | null
          manager_rejection_reason?: string | null
          manager_status?: string | null
          notes?: string | null
          requested_by_admin_name?: string | null
          signature?: string | null
          status?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_schedule_versions: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string
          id: string
          notes: string | null
          schedule_id: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          schedule_id: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_schedule_versions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "weekly_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_schedules: {
        Row: {
          configuration: Json
          created_at: string
          department_id: string
          generated_at: string
          id: string
          is_reviewed: boolean
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          week_number: number
          year: number
        }
        Insert: {
          configuration?: Json
          created_at?: string
          department_id: string
          generated_at?: string
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          week_number: number
          year: number
        }
        Update: {
          configuration?: Json
          created_at?: string
          department_id?: string
          generated_at?: string
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_shift_configs: {
        Row: {
          color: string
          created_at: string
          department_id: string
          end_time: string | null
          icon_key: string | null
          id: string
          is_rest: boolean
          name: string
          shift_key: string
          sort_order: number
          start_time: string | null
          updated_at: string
          week: number
          year: number
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          end_time?: string | null
          icon_key?: string | null
          id?: string
          is_rest?: boolean
          name: string
          shift_key: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
          week: number
          year: number
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          end_time?: string | null
          icon_key?: string | null
          id?: string
          is_rest?: boolean
          name?: string
          shift_key?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
          week?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_shift_configs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_shift_configs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      work_group_teams: {
        Row: {
          created_at: string
          id: string
          work_group_id: string
          worker_team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          work_group_id: string
          worker_team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          work_group_id?: string
          worker_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_group_teams_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_group_teams_worker_team_id_fkey"
            columns: ["worker_team_id"]
            isOneToOne: false
            referencedRelation: "worker_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      work_groups: {
        Row: {
          color: string
          created_at: string
          department_id: string
          free_days_deduction: number | null
          id: string
          max_concurrent_workers: number | null
          max_free_days: number | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          free_days_deduction?: number | null
          id?: string
          max_concurrent_workers?: number | null
          max_free_days?: number | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          free_days_deduction?: number | null
          id?: string
          max_concurrent_workers?: number | null
          max_free_days?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_groups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_groups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_calendar_modifications: {
        Row: {
          access_token: string
          added_personal_days: Json | null
          admin_name: string
          admin_reason: string
          created_at: string
          department_id: string
          email_sent_at: string | null
          id: string
          modification_type: string
          new_group_id: string | null
          original_group_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          removed_group_days: Json | null
          signature: string | null
          signed_at: string | null
          signed_ip: string | null
          status: string
          updated_at: string
          worker_id: string
          year: number
        }
        Insert: {
          access_token?: string
          added_personal_days?: Json | null
          admin_name: string
          admin_reason: string
          created_at?: string
          department_id: string
          email_sent_at?: string | null
          id?: string
          modification_type: string
          new_group_id?: string | null
          original_group_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          removed_group_days?: Json | null
          signature?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          status?: string
          updated_at?: string
          worker_id: string
          year?: number
        }
        Update: {
          access_token?: string
          added_personal_days?: Json | null
          admin_name?: string
          admin_reason?: string
          created_at?: string
          department_id?: string
          email_sent_at?: string | null
          id?: string
          modification_type?: string
          new_group_id?: string | null
          original_group_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          removed_group_days?: Json | null
          signature?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_calendar_modifications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_calendar_modifications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_calendar_modifications_new_group_id_fkey"
            columns: ["new_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_calendar_modifications_original_group_id_fkey"
            columns: ["original_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_calendar_modifications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          is_resolved: boolean
          resolved_at: string | null
          worker_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          worker_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      worker_day_exceptions: {
        Row: {
          approved_at: string
          approved_by: string
          created_at: string
          department_id: string
          exception_date: string
          exception_request_id: string | null
          id: string
          worker_name: string
          worker_number: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          created_at?: string
          department_id: string
          exception_date: string
          exception_request_id?: string | null
          id?: string
          worker_name: string
          worker_number: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          created_at?: string
          department_id?: string
          exception_date?: string
          exception_request_id?: string | null
          id?: string
          worker_name?: string
          worker_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_day_exceptions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_day_exceptions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_day_exceptions_exception_request_id_fkey"
            columns: ["exception_request_id"]
            isOneToOne: false
            referencedRelation: "day_exception_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_performance_history: {
        Row: {
          created_at: string | null
          id: string
          import_source: string | null
          lines_hour: number
          recorded_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          import_source?: string | null
          lines_hour: number
          recorded_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          import_source?: string | null
          lines_hour?: number
          recorded_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_performance_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_personal_calendar_days: {
        Row: {
          created_at: string
          date: string
          day_type: string
          department_id: string
          half_day: boolean
          id: string
          modification_id: string | null
          worker_id: string
          year: number
        }
        Insert: {
          created_at?: string
          date: string
          day_type: string
          department_id: string
          half_day?: boolean
          id?: string
          modification_id?: string | null
          worker_id: string
          year?: number
        }
        Update: {
          created_at?: string
          date?: string
          day_type?: string
          department_id?: string
          half_day?: boolean
          id?: string
          modification_id?: string | null
          worker_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_personal_calendar_days_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_personal_calendar_days_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_personal_calendar_days_modification_id_fkey"
            columns: ["modification_id"]
            isOneToOne: false
            referencedRelation: "worker_calendar_modifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_personal_calendar_days_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_team_labels: {
        Row: {
          color: string | null
          created_at: string
          department_id: string
          excluded_shift_keys: string[]
          icon: string | null
          id: string
          inherit_team_color: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          department_id: string
          excluded_shift_keys?: string[]
          icon?: string | null
          id?: string
          inherit_team_color?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          department_id?: string
          excluded_shift_keys?: string[]
          icon?: string | null
          id?: string
          inherit_team_color?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_team_labels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_team_labels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_teams: {
        Row: {
          created_at: string
          department_id: string
          display_name: string | null
          id: string
          is_schedule_locked: boolean
          label_id: string | null
          name: string
          responsable_worker_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          display_name?: string | null
          id?: string
          is_schedule_locked?: boolean
          label_id?: string | null
          name: string
          responsable_worker_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          display_name?: string | null
          id?: string
          is_schedule_locked?: boolean
          label_id?: string | null
          name?: string
          responsable_worker_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_teams_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "worker_team_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_teams_responsable_worker_id_fkey"
            columns: ["responsable_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          department_id: string
          email: string | null
          fiscal_id: string | null
          id: string
          is_altillo: boolean
          is_on_leave: boolean
          is_on_vacation: boolean
          is_responsable: boolean
          lines_hour: number | null
          name: string
          password_hash: string | null
          pending_vacation_days: number
          role: string | null
          start_contract_date: string | null
          typology: string | null
          updated_at: string
          user_id: string | null
          vacation_days_adjustment: number
          work_group_id: string | null
          worker_code: string | null
          worker_number: string
          worker_team_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          department_id: string
          email?: string | null
          fiscal_id?: string | null
          id?: string
          is_altillo?: boolean
          is_on_leave?: boolean
          is_on_vacation?: boolean
          is_responsable?: boolean
          lines_hour?: number | null
          name: string
          password_hash?: string | null
          pending_vacation_days?: number
          role?: string | null
          start_contract_date?: string | null
          typology?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_days_adjustment?: number
          work_group_id?: string | null
          worker_code?: string | null
          worker_number: string
          worker_team_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          department_id?: string
          email?: string | null
          fiscal_id?: string | null
          id?: string
          is_altillo?: boolean
          is_on_leave?: boolean
          is_on_vacation?: boolean
          is_responsable?: boolean
          lines_hour?: number | null
          name?: string
          password_hash?: string | null
          pending_vacation_days?: number
          role?: string | null
          start_contract_date?: string | null
          typology?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_days_adjustment?: number
          work_group_id?: string | null
          worker_code?: string | null
          worker_number?: string
          worker_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_work_group_id_fkey"
            columns: ["work_group_id"]
            isOneToOne: false
            referencedRelation: "work_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_worker_team_id_fkey"
            columns: ["worker_team_id"]
            isOneToOne: false
            referencedRelation: "worker_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_job_positions: {
        Row: {
          description: string | null
          form_fields: Json | null
          id: string | null
          is_default: boolean | null
          title: string | null
        }
        Insert: {
          description?: string | null
          form_fields?: never
          id?: string | null
          is_default?: boolean | null
          title?: string | null
        }
        Update: {
          description?: string | null
          form_fields?: never
          id?: string | null
          is_default?: boolean | null
          title?: string | null
        }
        Relationships: []
      }
      departments_public: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          max_days_per_employee: number | null
          name: string | null
          public_token: string | null
          require_all_days: boolean | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          max_days_per_employee?: number | null
          name?: string | null
          public_token?: string | null
          require_all_days?: boolean | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          max_days_per_employee?: number | null
          name?: string | null
          public_token?: string | null
          require_all_days?: boolean | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      managers_public: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      execute_readonly_query: { Args: { query_text: string }; Returns: Json }
      find_matching_absences: {
        Args: {
          p_fecha_fin: string
          p_fecha_inicio: string
          p_worker_id: string
        }
        Returns: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          delay_minutes: number | null
          entry_date: string
          id: string
          import_batch_id: string | null
          is_absence: boolean
          observation: string | null
          source: string
          updated_at: string
          worker_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_personal_calendar_public: {
        Args: { p_token: string }
        Returns: {
          department_id: string
          id: string
          max_days: number
          slug: string
          worker_name: string
          worker_number: string
        }[]
      }
      get_public_departments: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          max_days_per_employee: number
          name: string
          public_token: string
          require_all_days: boolean
          slug: string
          updated_at: string
        }[]
      }
      get_public_managers: {
        Args: never
        Returns: {
          avatar_url: string
          candidaturas_only: boolean
          created_at: string
          department_id: string
          email: string
          id: string
          name: string
          role: string
          worker_id: string
          worker_team_id: string
        }[]
      }
      get_public_workers_by_department: {
        Args: { p_department_id: string }
        Returns: {
          id: string
          name: string
          work_group_id: string
          worker_team_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_system_role: {
        Args: {
          p_required_role: Database["public"]["Enums"]["system_role"]
          p_user_id: string
          p_user_type: string
        }
        Returns: boolean
      }
      touch_incidencias_attachment_link: {
        Args: { _token: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_processing_status:
        | "pending"
        | "processing"
        | "passed"
        | "rejected"
        | "error"
      app_role: "admin" | "user"
      application_admin_status:
        | "new"
        | "reviewing"
        | "shortlisted"
        | "discarded"
        | "hired"
      cv_file_type: "pdf" | "image"
      day_type:
        | "laboral"
        | "festivo"
        | "vacaciones_generales"
        | "vacaciones_grupo"
      gender_type: "male" | "female"
      justificante_estado:
        | "pendiente"
        | "gestionado"
        | "rechazado"
        | "pendiente_docs"
      justificante_tipo: "medico" | "personal" | "otro"
      rrhh_role: "admin_principal" | "rrhh"
      system_role:
        | "admin_principal"
        | "rrhh"
        | "encargado"
        | "empleado"
        | "consulta"
      vehicle_type: "none" | "skate" | "bike" | "car"
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
      ai_processing_status: [
        "pending",
        "processing",
        "passed",
        "rejected",
        "error",
      ],
      app_role: ["admin", "user"],
      application_admin_status: [
        "new",
        "reviewing",
        "shortlisted",
        "discarded",
        "hired",
      ],
      cv_file_type: ["pdf", "image"],
      day_type: [
        "laboral",
        "festivo",
        "vacaciones_generales",
        "vacaciones_grupo",
      ],
      gender_type: ["male", "female"],
      justificante_estado: [
        "pendiente",
        "gestionado",
        "rechazado",
        "pendiente_docs",
      ],
      justificante_tipo: ["medico", "personal", "otro"],
      rrhh_role: ["admin_principal", "rrhh"],
      system_role: [
        "admin_principal",
        "rrhh",
        "encargado",
        "empleado",
        "consulta",
      ],
      vehicle_type: ["none", "skate", "bike", "car"],
    },
  },
} as const
