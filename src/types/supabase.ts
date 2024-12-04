export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          user_id: string;
          entry: string;
          speaker: "user" | "ai";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry: string;
          speaker: "user" | "ai";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry?: string;
          speaker?: "user" | "ai";
          created_at?: string;
        };
      };
      atlassian_config: {
        Row: {
          id: string;
          user_id: string;
          api_key: string;
          space_key: string | null;
          base_url: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          api_key: string;
          space_key?: string | null;
          base_url: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          api_key?: string;
          space_key?: string | null;
          base_url?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          content: string;
          metadata: Record<string, any>;
          embedding: number[];
        };
        Insert: {
          id?: string;
          content: string;
          metadata: Record<string, any>;
          embedding: number[];
        };
        Update: {
          id?: string;
          content?: string;
          metadata?: Record<string, any>;
          embedding?: number[];
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      match_documents: {
        Args: {
          query_embedding: number[];
          match_count?: number;
          filter?: Record<string, any>;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Record<string, any>;
          similarity: number;
        }[];
      };
    };
    Enums: {
      speaker: "user" | "ai";
    };
  };
};
