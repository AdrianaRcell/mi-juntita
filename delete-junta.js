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
      return json({ ok: false, error: "Origen no permitido." }, 403);
    }

    const body = await request.json().catch(() => null);
    const juntaId = String(body?.juntaId ?? "").trim();

    if (!juntaId) {
      return json({ ok: false, error: "Falta el ID de la Junta." }, 400);
    }

    const junta = await sql`
      SELECT id, name, goal
      FROM juntas
      WHERE CAST(id AS TEXT) = ${juntaId}
      LIMIT 1
    `;

    if (!junta.length) {
      return json({ ok: false, error: "No se encontró la Junta." }, 404);
    }

    const payments = await sql`
      SELECT id, receipt_url
      FROM junta_payments
      WHERE CAST(junta_id AS TEXT) = ${juntaId}
    `;

    for (const payment of payments) {
      const receiptUrl = String(payment?.receipt_url || "").trim();
      if (!receiptUrl) continue;

      try {
        await del(receiptUrl);
      } catch (blobError) {
        console.warn("No se pudo eliminar un comprobante de la Junta:", blobError);
      }
    }

    await sql`
      DELETE FROM junta_payments
      WHERE CAST(junta_id AS TEXT) = ${juntaId}
    `;

    const deleted = await sql`
      DELETE FROM juntas
      WHERE CAST(id AS TEXT) = ${juntaId}
      RETURNING id, name, goal
    `;

    if (!deleted.length) {
      return json({ ok: false, error: "No se pudo eliminar la Junta." }, 500);
    }

    return json({
      ok: true,
      deletedJuntaId: deleted[0].id,
      deletedName: deleted[0].name || "Junta",
      deletedGoal: Number(deleted[0].goal || 0)
    });
  } catch (error) {
    console.error("Error eliminando Junta:", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar la Junta."
    }, 500);
  }
}
