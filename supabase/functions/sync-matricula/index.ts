// Edge Function: sync-matricula (v final)
// Reglas: estado "Firmada"/"Pendiente"; año estricto; firmante = principal o suplente;
// sin apoderado -> 422; upsert por simple_tramite_id.
//
// Recibe callbacks de SIMPLE (tramites.slepvalparaiso.gob.cl) para el flujo de firma de
// matrícula con Clave Única. Eventos: "ingreso" y "firma".
// Desplegada con verify_jwt=false (SIMPLE no manda JWT de usuario; la seguridad es el
// header x-simple-token). Responde preflight OPTIONS y limpia el sufijo &_token=<csrf>
// que SIMPLE pega al body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIMPLE_API_TOKEN = Deno.env.get("SIMPLE_API_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  db: { schema: "matriculas" },
  auth: { persistSession: false },
});

function corsHeaders(req: Request): Record<string, string> {
  const reqHeaders = req.headers.get("access-control-request-headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders ?? "Content-Type, Authorization, apikey, x-simple-token",
  };
}

function normalizarRut(rut: unknown): string {
  if (!rut) return "";
  return String(rut).replace(/[.\-\s]/g, "").toUpperCase();
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function parseBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  const intentos: string[] = [];
  intentos.push(raw);
  intentos.push(raw.replace(/&_?token=[^&]*/gi, ""));
  const llave = raw.indexOf("{");
  const cierre = raw.lastIndexOf("}");
  if (llave !== -1 && cierre !== -1 && cierre > llave) {
    intentos.push(raw.slice(llave, cierre + 1));
  }
  for (const t of intentos) {
    try {
      const obj = JSON.parse(t.trim());
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch { /* siguiente */ }
  }
  try {
    const params = new URLSearchParams(raw);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) {
      if (k === "_token" || k === "token") continue;
      obj[k] = v;
    }
    if (Object.keys(obj).length > 0) return obj;
  } catch { /* nada */ }
  return {};
}

async function leerApoderado(id: number | null) {
  if (!id) return null;
  const { data } = await supabase
    .from("apoderado")
    .select("rut_pasaporte, correo_electronico, nombres, apellido_paterno, apellido_materno")
    .eq("id_apoderado", id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const nombre = [data.nombres, data.apellido_paterno, data.apellido_materno]
    .filter((p) => p && String(p).trim() !== "")
    .map((p) => String(p).trim().replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" ");
  return { rut: normalizarRut(data.rut_pasaporte), correo: data.correo_electronico ?? "", nombre };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Método no permitido" }, 405, req);
  }

  const token = req.headers.get("x-simple-token") ?? "";
  if (!SIMPLE_API_TOKEN || token !== SIMPLE_API_TOKEN) {
    console.warn("[sync-matricula] Token invalido o ausente");
    return json({ ok: false, error: "No autorizado" }, 401, req);
  }

  const raw = await req.text();
  const payload = parseBody(raw);
  if (!payload || Object.keys(payload).length === 0) {
    console.warn("[sync-matricula] Body no parseable. Raw:", raw);
    return json({ ok: false, error: "JSON inválido", raw_recibido: raw.slice(0, 500) }, 400, req);
  }
  console.log("[sync-matricula] Payload:", JSON.stringify(payload));

  const evento = String(payload["evento"] ?? "");
  const rutAlumno = normalizarRut(payload["rut_alumno"]);
  const anio = payload["anio_escolar"] ? Number(payload["anio_escolar"]) : null;

  if (!rutAlumno) {
    return json({ ok: false, error: "Falta rut_alumno", payload_recibido: payload }, 400, req);
  }

  const { data: encontrado, error: errBuscar } = await supabase.rpc(
    "buscar_matricula_por_rut",
    { p_rut: rutAlumno, p_anio: anio },
  );
  if (errBuscar) {
    return json({ ok: false, error: "Error buscando matrícula: " + errBuscar.message }, 500, req);
  }
  const fila = Array.isArray(encontrado) ? encontrado[0] : encontrado;
  if (!fila) {
    return json({ ok: false, error: "Matrícula no encontrada para el alumno/año", rut_alumno: rutAlumno, anio_escolar: anio }, 404, req);
  }

  const idMatricula = fila.id_matricula;
  const anioMatricula = fila.anio_escolar;

  const principal = await leerApoderado(fila.id_apoderado_principal);
  const suplente = await leerApoderado(fila.id_apoderado_suplente);

  const tramiteId = payload["simple_tramite_id"] ? String(payload["simple_tramite_id"]) : null;

  if (evento === "ingreso") {
    const filaIngreso = {
      id_matricula: idMatricula,
      simple_tramite_id: tramiteId,
      rut_alumno: rutAlumno,
      rut_apoderado: principal?.rut ?? suplente?.rut ?? "",
      anio_escolar: anioMatricula,
      estado: "pendiente",
      correo_apoderado: principal?.correo ?? suplente?.correo ?? "",
    };
    const { error } = await supabase
      .from("firma_matricula")
      .upsert(filaIngreso, { onConflict: "simple_tramite_id", ignoreDuplicates: true });
    if (error) {
      return json({ ok: false, error: "Error registrando ingreso: " + error.message }, 500, req);
    }
    await supabase.from("matricula").update({ estado_firma: "Pendiente" }).eq("id_matricula", idMatricula);
    return json({ ok: true, evento, id_matricula: idMatricula, estado: "Pendiente" }, 200, req);
  }

  if (evento === "firma") {
    const rutFirmante = normalizarRut(payload["rut_firmante"]);

    if (!principal && !suplente) {
      return json({ ok: false, error: "El alumno no tiene apoderado registrado. Complete la matrícula (funcionario) antes de firmar." }, 422, req);
    }

    const rutsValidos = [principal?.rut, suplente?.rut].filter((r) => r && r !== "");
    if (rutFirmante && rutsValidos.length > 0 && !rutsValidos.includes(rutFirmante)) {
      return json({ ok: false, error: "El RUT del firmante no coincide con el apoderado (titular ni suplente) del alumno.", rut_firmante: rutFirmante }, 409, req);
    }

    const firmante = (suplente && rutFirmante === suplente.rut) ? suplente : (principal ?? suplente);

    const limpiar = (v: unknown) => (v && String(v).trim() !== "") ? String(v).trim() : "";
    const nombresFirmante = limpiar(payload["nombres"]);
    const apellidosFirmante = limpiar(payload["apellidos"]);
    const emailFirmante = limpiar(payload["email"]);
    const nombreCompuesto = [nombresFirmante, apellidosFirmante].filter((p) => p !== "").join(" ").trim();
    const nombreFinal = nombreCompuesto || firmante?.nombre || null;
    const correoComprobante = emailFirmante || firmante?.correo || null;

    const respuestas = {
      religion: payload["religion"] ?? null,
      acepta_acta: payload["acepta_acta"] ?? null,
      autoriza_entrevista: payload["autoriza_entrevista"] ?? null,
      autoriza_imagenes: payload["autoriza_imagenes"] ?? null,
    };

    const filaFirma = {
      id_matricula: idMatricula,
      simple_tramite_id: tramiteId,
      rut_alumno: rutAlumno,
      rut_apoderado: firmante?.rut ?? "",
      rut_firmante: rutFirmante,
      nombre_firmante: nombreFinal,
      nombres_firmante: nombresFirmante || null,
      apellidos_firmante: apellidosFirmante || null,
      email_firmante: emailFirmante || null,
      anio_escolar: anioMatricula,
      estado: "firmado",
      metodo: "clave_unica_simple",
      respuestas,
      correo_apoderado: correoComprobante,
      url_pdf_firmado: payload["url_pdf_firmado"] ? String(payload["url_pdf_firmado"]) : null,
      fecha_firma: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("firma_matricula")
      .upsert(filaFirma, { onConflict: "simple_tramite_id" });
    if (error) {
      return json({ ok: false, error: "Error registrando firma: " + error.message }, 500, req);
    }

    const siNo = (v: unknown) => String(v ?? "").toUpperCase() === "SI";
    await supabase
      .from("matricula")
      .update({
        estado_firma: "Firmada",
        // Sincroniza tambien la columna del flujo de renovacion (piloto 2027),
        // que es la que ve el funcionario en el badge de la grilla.
        estado_renovacion: "Firmada",
        metodo_firma: "clave_unica_simple",
        opcion_religion: payload["religion"] ?? null,
        acepta_compromiso: siNo(payload["acepta_acta"]),
        autoriza_entrevista: siNo(payload["autoriza_entrevista"]),
        autoriza_imagen: siNo(payload["autoriza_imagenes"]),
      })
      .eq("id_matricula", idMatricula);

    return json({ ok: true, evento, id_matricula: idMatricula, estado: "Firmada", nombre_firmante: nombreFinal, correo_comprobante: correoComprobante }, 200, req);
  }

  return json({ ok: false, error: "Evento no reconocido: " + evento }, 400, req);
});
