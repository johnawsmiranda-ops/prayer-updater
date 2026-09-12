/**
 * Hand-written Supabase Database type, matching supabase/migrations/0001_init.sql.
 * If you use the Supabase CLI, you can replace this with a generated file
 * (`supabase gen types typescript`) — the shape must stay compatible with
 * the query helpers in src/lib/prayers.ts and src/lib/canva/.
 */
import type { PrayerStatus, CanvaConnectionStatus, CanvaSyncSummary } from "@/types/prayer";

export interface Database {
  public: {
    Tables: {
      prayers: {
        Row: {
          id: string;
          year: number;
          name: string;
          prayer_request: string;
          requested_by: string | null;
          category: string;
          assigned_ministry: string | null;
          status: PrayerStatus;
          notes: string | null;
          date_added: string;
          last_updated: string;
          date_answered: string | null;
          source_status_raw: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          name: string;
          prayer_request?: string;
          requested_by?: string | null;
          category?: string;
          assigned_ministry?: string | null;
          status?: PrayerStatus;
          notes?: string | null;
          date_added?: string;
          last_updated?: string;
          date_answered?: string | null;
          source_status_raw?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prayers"]["Insert"]>;
        Relationships: [];
      };
      prayer_history: {
        Row: {
          id: string;
          prayer_id: string;
          previous_status: PrayerStatus | null;
          new_status: PrayerStatus | null;
          previous_request: string | null;
          new_request: string | null;
          changed_at: string;
          changed_by: string;
        };
        Insert: Partial<Database["public"]["Tables"]["prayer_history"]["Row"]> & { prayer_id: string };
        Update: Partial<Database["public"]["Tables"]["prayer_history"]["Row"]>;
        Relationships: [];
      };
      canva_connections: {
        Row: {
          id: string;
          user_id: string;
          template_id: string | null;
          design_id: string | null;
          template_name: string | null;
          connection_status: CanvaConnectionStatus;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          field_mapping: Record<string, string>;
          last_synced_at: string | null;
          last_sync_summary: CanvaSyncSummary | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["canva_connections"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["canva_connections"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
