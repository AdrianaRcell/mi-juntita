import sql from "./db.js";
import { del } from "@vercel/blob";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (origin && origin !== url.origin) {
      return json({ ok:false, error:"Origen no permitido." },403);
    }

    const body = await request.json().catch(() => null);
    const keepJuntaId = String(body?.keepJuntaId ?? "").trim();

    if (body?.confirm !== "CLEANUP_LEGACY_JUNTAS_V3") {
      return json({ ok:false, error:"Confirmación inválida." },400);
    }
    if (!keepJuntaId) {
      return json({ ok:false, error:"Falta la Junta que debe conservarse." },400);
    }

    const keep = await sql`
      SELECT id, name, goal, normal
      FROM juntas
      WHERE CAST(id AS TEXT) = ${keepJuntaId}
      LIMIT 1
    `;

    if (!keep.length) {
      return json({ ok:false, error:"No se encontró la Junta que debe conservarse." },404);
    }

    const obsolete = await sql`
      SELECT id, name
      FROM juntas
      WHERE CAST(id AS TEXT) <> ${keepJuntaId}
      ORDER BY id
    `;

    let deleted = 0;
    let receiptsDeleted = 0;

    for (const junta of obsolete) {
      const juntaId = junta.id;
      const payments = await sql`
        SELECT receipt_url
        FROM junta_payments
        WHERE junta_id = ${juntaId}
      `;

      for (const payment of payments) {
        const receiptUrl = String(payment?.receipt_url || "").trim();
        if (!receiptUrl) continue;
        try {
          await del(receiptUrl);
          receiptsDeleted += 1;
        } catch (blobError) {
          console.warn("No se pudo eliminar un comprobante antiguo de Junta:", blobError);
        }
      }

      await sql`
        DELETE FROM junta_payments
        WHERE junta_id = ${juntaId}
      `;

      const removed = await sql`
        DELETE FROM juntas
        WHERE id = ${juntaId}
        RETURNING id
      `;

      if (removed.length) deleted += 1;
    }

    return json({
      ok:true,
      keptJuntaId:keep[0].id,
      keptName:keep[0].name,
      deletedJuntas:deleted,
      receiptsDeleted
    });
  } catch (error) {
    console.error("Error limpiando Juntas antiguas:", error);
    return json({
      ok:false,
      error:error instanceof Error ? error.message : "No se pudieron limpiar las Juntas antiguas."
    },500);
  }
}
