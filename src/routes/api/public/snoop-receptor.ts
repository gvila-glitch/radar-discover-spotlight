// Ruta pública que recibe las alertas JSON push de Discover Snoop.
// Destino en el proyecto de Lovable: src/routes/api/public/snoop-receptor.ts
// Snoop no sabe enviar cabeceras: el token secreto va en la dirección (?token=...).
import { createFileRoute } from "@tanstack/react-router";
import { procesarEnvioSnoop } from "@/lib/snoopReceptor";

async function recibir(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length"));
  const resultado = await procesarEnvioSnoop({
    token: new URL(request.url).searchParams.get("token"),
    secreto: process.env["SNOOP_TOKEN"],
    metodo: request.method,
    contentLength: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null,
    leerTexto: () => request.text(),
    guardar: async (filas) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Los artículos repetidos (misma url) se ignoran; la respuesta sigue siendo 200.
      const { data, error } = await supabaseAdmin
        .from("snoop_articulos")
        .upsert(filas, { onConflict: "url", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error("No se pudo guardar el envío.");
      return data?.length ?? 0;
    },
  });
  if (resultado.log) console.info(`[snoop-receptor] ${resultado.log}`);
  return Response.json(resultado.cuerpo, { status: resultado.status });
}

export const Route = createFileRoute("/api/public/snoop-receptor")({
  server: {
    handlers: {
      POST: async ({ request }) => recibir(request),
      PUT: async ({ request }) => recibir(request),
      GET: async () => new Response("Unauthorized", { status: 401 }),
    },
  },
});
