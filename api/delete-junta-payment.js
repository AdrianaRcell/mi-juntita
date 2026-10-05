import sql from "./db.js";
import { del } from "@vercel/blob";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (origin && origin !== url.origin) {
      return json(
        { ok: false, error: "Origen no permitido." },
        403
      );
    }

    const body = await request.json().catch(() => null);
    const paymentId = body?.paymentId;
    const juntaId = body?.juntaId;

    if (
      paymentId === undefined ||
      paymentId === null ||
      String(paymentId).trim() === ""
    ) {
      return json(
        { ok: false, error: "Falta el ID del aporte." },
        400
      );
    }

    const rows = await sql`
      SELECT id, junta_id, receipt_url
      FROM junta_payments
      WHERE id = ${paymentId}
      LIMIT 1
    `;

    if (!rows.length) {
      return json(
        { ok: false, error: "No se encontró el aporte." },
        404
      );
    }

    const row = rows[0];

    if (
      juntaId &&
      String(row.junta_id) !== String(juntaId)
    ) {
      return json(
        {
          ok: false,
          error: "El aporte no pertenece a esa Junta.",
        },
        403
      );
    }

    const receiptUrl = row.receipt_url || "";

    await sql`
      DELETE FROM junta_payments
      WHERE id = ${paymentId}
    `;

    if (receiptUrl) {
      try {
        await del(receiptUrl);
      } catch (blobError) {
        console.warn(
          "No se pudo eliminar el comprobante de Blob:",
          blobError
        );
      }
    }

    return json({
      ok: true,
      deletedPaymentId: paymentId,
      juntaId: row.junta_id,
    });
  } catch (error) {
    console.error(
      "Error eliminando aporte de Junta:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el aporte.",
      },
      500
    );
  }
}
