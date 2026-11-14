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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          angulo: string
          contexto: string
          creada_en: string
          entidad: string
          estado: string
          estado_actualizado_en: string | null
          estado_por: string | null
          id: number
          medios_discover: number
          medios_lista: string[]
          motivo_afinidad: string
          pieza_url: string | null
          prioridad: string
          seccion_sugerida: string
          titulares_seo: Json
          trends_activo: boolean
          trends_crecimiento: string | null
          wikipedia_ratio: number | null
          wikipedia_visitas: number | null
          x_desde: string | null
          x_posicion: number | null
        }
        Insert: {
          angulo?: string
          contexto?: string
          creada_en?: string
          entidad: string
          estado?: string
          estado_actualizado_en?: string | null
          estado_por?: string | null
          id?: never
          medios_discover?: number
          medios_lista?: string[]
          motivo_afinidad?: string
          pieza_url?: string | null
          prioridad: string
          seccion_sugerida?: string
          titulares_seo?: Json
          trends_activo?: boolean
          trends_crecimiento?: string | null
          wikipedia_ratio?: number | null
          wikipedia_visitas?: number | null
          x_desde?: string | null
          x_posicion?: number | null
        }
        Update: {
          angulo?: string
          contexto?: string
          creada_en?: string
          entidad?: string
          estado?: string
          estado_actualizado_en?: string | null
          estado_por?: string | null
          id?: never
          medios_discover?: number
          medios_lista?: string[]
          motivo_afinidad?: string
          pieza_url?: string | null
          prioridad?: string
          seccion_sugerida?: string
          titulares_seo?: Json
          trends_activo?: boolean
          trends_crecimiento?: string | null
          wikipedia_ratio?: number | null
          wikipedia_visitas?: number | null
          x_desde?: string | null
          x_posicion?: number | null
        }
        Relationships: []
      }
      config: {
        Row: {
          actualizado_en: string | null
          clave: string
          valor: string | null
        }
        Insert: {
          actualizado_en?: string | null
          clave: string
          valor?: string | null
        }
        Update: {
          actualizado_en?: string | null
          clave?: string
          valor?: string | null
        }
        Relationships: []
      }
      equipo: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      equipo_roles: {
        Row: {
          email: string
          rol: string
        }
        Insert: {
          email: string
          rol: string
        }
        Update: {
          email?: string
          rol?: string
        }
        Relationships: []
      }
      exclusiones: {
        Row: {
          activo: boolean | null
          id: number
          motivo: string | null
          tipo: string | null
          valor: string
        }
        Insert: {
          activo?: boolean | null
          id?: never
          motivo?: string | null
          tipo?: string | null
          valor: string
        }
        Update: {
          activo?: boolean | null
          id?: never
          motivo?: string | null
          tipo?: string | null
          valor?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          alerta_id: number | null
          canal: string | null
          creado_en: string | null
          id: number
          usuario: string | null
          valoracion: string | null
        }
        Insert: {
          alerta_id?: number | null
          canal?: string | null
          creado_en?: string | null
          id?: never
          usuario?: string | null
          valoracion?: string | null
        }
        Update: {
          alerta_id?: number | null
          canal?: string | null
          creado_en?: string | null
          id?: never
          usuario?: string | null
          valoracion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      medios_referencia: {
        Row: {
          activo: boolean | null
          dominio: string
          nombre: string | null
          top5: boolean | null
        }
        Insert: {
          activo?: boolean | null
          dominio: string
          nombre?: string | null
          top5?: boolean | null
        }
        Update: {
          activo?: boolean | null
          dominio?: string
          nombre?: string | null
          top5?: boolean | null
        }
        Relationships: []
      }
      snoop_articulos: {
        Row: {
          alerta: string | null
          entradilla: string | null
          id: number
          medio: string
          recibido_en: string | null
          titular: string | null
          url: string
        }
        Insert: {
          alerta?: string | null
          entradilla?: string | null
          id?: never
          medio: string
          recibido_en?: string | null
          titular?: string | null
          url: string
        }
        Update: {
          alerta?: string | null
          entradilla?: string | null
          id?: never
          medio?: string
          recibido_en?: string | null
          titular?: string | null
          url?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          environment: string
          id: string
          price_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment: string
          id?: string
          price_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          price_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trends: {
        Row: {
          capturado_en: string | null
          empezo_en: string | null
          id: number
          noticias: Json | null
          termino: string | null
          volumen: string | null
        }
        Insert: {
          capturado_en?: string | null
          empezo_en?: string | null
          id?: never
          noticias?: Json | null
          termino?: string | null
          volumen?: string | null
        }
        Update: {
          capturado_en?: string | null
          empezo_en?: string | null
          id?: never
          noticias?: Json | null
          termino?: string | null
          volumen?: string | null
        }
        Relationships: []
      }
      uso_llm: {
        Row: {
          creado_en: string | null
          id: number
          modelo: string | null
          prompt: string | null
          tokens_entrada: number | null
          tokens_salida: number | null
        }
        Insert: {
          creado_en?: string | null
          id?: never
          modelo?: string | null
          prompt?: string | null
          tokens_entrada?: number | null
          tokens_salida?: number | null
        }
        Update: {
          creado_en?: string | null
          id?: never
          modelo?: string | null
          prompt?: string | null
          tokens_entrada?: number | null
          tokens_salida?: number | null
        }
        Relationships: []
      }
      wikipedia_picos: {
        Row: {
          articulo: string
          capturado_en: string
          dia: string
          id: number
          media_previa: number
          ratio: number
          visitas: number
        }
        Insert: {
          articulo: string
          capturado_en?: string
          dia: string
          id?: never
          media_previa: number
          ratio: number
          visitas: number
        }
        Update: {
          articulo?: string
          capturado_en?: string
          dia?: string
          id?: never
          media_previa?: number
          ratio?: number
          visitas?: number
        }
        Relationships: []
      }
      x_tendencias: {
        Row: {
          capturado_en: string | null
          categoria: string | null
          id: number
          nombre: string | null
          posicion: number | null
          publicaciones: number | null
        }
        Insert: {
          capturado_en?: string | null
          categoria?: string | null
          id?: never
          nombre?: string | null
          posicion?: number | null
          publicaciones?: number | null
        }
        Update: {
          capturado_en?: string | null
          categoria?: string | null
          id?: never
          nombre?: string | null
          posicion?: number | null
          publicaciones?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adquirir_bloqueo_radar: {
        Args: { propietario: string; trabajo: string }
        Returns: boolean
      }
      clave_entidad: { Args: { texto: string }; Returns: string }
      entidades_equivalentes: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      es_admin: { Args: never; Returns: boolean }
      es_equipo: { Args: never; Returns: boolean }
      fusionar_alerta_reciente: {
        Args: { fila: Json; instante: string }
        Returns: Json
      }
      guardar_alertas_trends_atomicas: {
        Args: { candidatas: Json }
        Returns: Json
      }
      guardar_alertas_wikipedia_atomicas: {
        Args: { candidatas: Json }
        Returns: Json
      }
      liberar_bloqueo_radar: {
        Args: { propietario: string; trabajo: string }
        Returns: boolean
      }
      limpiar_snoop: { Args: never; Returns: undefined }
      limpiar_trends: { Args: never; Returns: undefined }
      limpiar_wikipedia_picos: { Args: never; Returns: undefined }
      limpiar_x_tendencias: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
