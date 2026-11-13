import type { Alerta } from "@/lib/types";

const h = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString();

export function crearDemoAlertas(): Alerta[] {
  return [
    {
      id: 8, creada_en: h(0.4), entidad: "Negociación de los Presupuestos", contexto: "Reunión clave entre Gobierno y socios parlamentarios esta tarde",
      prioridad: "alta", x_posicion: 3, x_desde: h(1.2), trends_activo: true, trends_crecimiento: "2000+",
      medios_discover: 1, medios_lista: ["Medio A"],
      titulares_seo: [{ medio: "Medio A", titular: "Titular de ejemplo: claves de la negociación presupuestaria" }],
      angulo: "Qué partidas están en juego y qué cambia para cada comunidad si no hay acuerdo", seccion_sugerida: "Política",
      motivo_afinidad: "Tema de fondo institucional con impacto económico: encaja con nuestro análisis político de largo recorrido.",
      estado: "pendiente", pieza_url: null, estado_actualizado_en: null, estado_por: null,
    },
    {
      id: 7, creada_en: h(2.5), entidad: "IPC adelantado", contexto: "El INE publica el dato adelantado de inflación del mes",
      prioridad: "media", x_posicion: null, x_desde: null, trends_activo: true, trends_crecimiento: "1000+",
      medios_discover: 0, medios_lista: [], titulares_seo: [],
      angulo: "Explicador: qué componentes empujan la inflación y cómo afecta a la cesta de la compra", seccion_sugerida: "Economía",
      motivo_afinidad: "Dato macro con lectura práctica para el lector; nuestra sección de Economía tiene buen rendimiento en explicadores.",
      estado: "pendiente", pieza_url: null, estado_actualizado_en: null, estado_por: null,
    },
    {
      id: 6, creada_en: h(5), entidad: "Ley de vivienda: topes al alquiler", contexto: "Nuevas zonas tensionadas declaradas en varias ciudades",
      prioridad: "alta", x_posicion: 7, x_desde: h(6), trends_activo: true, trends_crecimiento: "5000+",
      medios_discover: 4, medios_lista: ["Medio A", "Medio B", "Medio C", "Medio D"],
      titulares_seo: [
        { medio: "Medio B", titular: "Titular de ejemplo: así quedan los alquileres en las zonas tensionadas" },
        { medio: "Medio C", titular: "Titular de ejemplo: qué ciudades limitan el precio del alquiler" },
      ],
      angulo: "Mapa y datos: cuánto bajaría el alquiler medio en cada barrio afectado", seccion_sugerida: "Sociedad",
      motivo_afinidad: "La vivienda es una de nuestras líneas editoriales prioritarias y permite aportar datos propios.",
      estado: "util", pieza_url: null, estado_actualizado_en: h(4.5), estado_por: "editora.sociedad",
    },
    {
      id: 5, creada_en: h(20), entidad: "Comparecencia en el Congreso", contexto: "Un ministro comparece en comisión sobre la reforma de la financiación autonómica",
      prioridad: "media", x_posicion: 12, x_desde: h(22), trends_activo: false, trends_crecimiento: null,
      medios_discover: 7, medios_lista: ["Medio A", "Medio B", "Medio C", "Medio D", "Medio E", "Medio F", "Medio G"],
      titulares_seo: [{ medio: "Medio E", titular: "Titular de ejemplo: lo que se sabe de la reforma de la financiación" }],
      angulo: "Qué gana y qué pierde cada comunidad con el nuevo modelo", seccion_sugerida: "Política",
      motivo_afinidad: "Debate territorial con mucha profundidad: encaja con el análisis, aunque llegamos tarde a Discover.",
      estado: "ruido", pieza_url: null, estado_actualizado_en: h(19), estado_por: "audiencias.demo",
    },
    {
      id: 4, creada_en: h(26), entidad: "Tipos de interés del BCE", contexto: "Reunión del Consejo de Gobierno del BCE esta semana",
      prioridad: "alta", x_posicion: 5, x_desde: h(28), trends_activo: true, trends_crecimiento: "10000+",
      medios_discover: 2, medios_lista: ["Medio B", "Medio F"],
      titulares_seo: [
        { medio: "Medio B", titular: "Titular de ejemplo: qué esperar de la decisión del BCE" },
        { medio: "Medio F", titular: "Titular de ejemplo: cómo afectaría a tu hipoteca" },
      ],
      angulo: "Calculadora: cuánto cambia una hipoteca media según la decisión", seccion_sugerida: "Economía",
      motivo_afinidad: "Impacto directo en el bolsillo y alta intención de búsqueda; nuestro público lector de Economía responde bien.",
      estado: "publicada", pieza_url: "https://ejemplo.es/economia/bce-hipotecas", estado_actualizado_en: h(24), estado_por: "editor.economia",
    },
    {
      id: 3, creada_en: h(30), entidad: "Selectividad: cambios en la PAU", contexto: "Educación anuncia ajustes en el formato de los exámenes",
      prioridad: "media", x_posicion: 9, x_desde: h(31), trends_activo: false, trends_crecimiento: null,
      medios_discover: 3, medios_lista: ["Medio A", "Medio C", "Medio G"], titulares_seo: [],
      angulo: "Guía práctica para familias y estudiantes: qué cambia y desde cuándo", seccion_sugerida: "Sociedad",
      motivo_afinidad: "Educación es área afín y el formato guía tiene buena vida en buscadores.",
      estado: "pendiente", pieza_url: null, estado_actualizado_en: null, estado_por: null,
    },
    {
      id: 2, creada_en: h(50), entidad: "Premio de novela", contexto: "Fallo de un importante premio literario con polémica sobre el jurado",
      prioridad: "media", x_posicion: 15, x_desde: h(52), trends_activo: true, trends_crecimiento: "500+",
      medios_discover: 0, medios_lista: [], titulares_seo: [],
      angulo: "Contexto: historia del premio y el debate sobre la independencia de los jurados", seccion_sugerida: "Cultura",
      motivo_afinidad: "Debate cultural con trasfondo, ideal para nuestra sección de Cultura y su público fiel.",
      estado: "util", pieza_url: null, estado_actualizado_en: h(48), estado_por: "editor.cultura",
    },
    {
      id: 1, creada_en: h(65), entidad: "Exposición sobre memoria democrática", contexto: "Una muestra en un museo nacional abre debate sobre su enfoque",
      prioridad: "alta", x_posicion: 6, x_desde: h(66), trends_activo: false, trends_crecimiento: null,
      medios_discover: 5, medios_lista: ["Medio A", "Medio B", "Medio D", "Medio E", "Medio H"],
      titulares_seo: [{ medio: "Medio D", titular: "Titular de ejemplo: la exposición que divide a los historiadores" }],
      angulo: "Qué se muestra, qué falta y qué dicen los especialistas", seccion_sugerida: "Cultura",
      motivo_afinidad: "Cruce entre cultura y política, terreno natural para un medio de análisis.",
      estado: "publicada", pieza_url: null, estado_actualizado_en: h(60), estado_por: "editor.cultura",
    },
  ];
}
