import sql from "./db.js";
import { del } from "@vercel/blob";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (origin && origin !== url.origin) {
      return json(
        {
          ok: false,
          error: "Origen no permitido."
        },
        403
      );
    }

    const body = await request.json().catch(() => null);

    const keepJuntaId = String(
      body?.keepJuntaId ?? ""
    ).trim();

    if (body?.confirm !== "CLEANUP_REAL_JUNTA_V4") {
      return json(
        {
          ok: false,
          error: "Confirmación inválida."
        },
        400
      );
    }

    if (keepJuntaId !== "junta_default") {
      return json(
        {
          ok: false,
          error: "La Junta que se conservará no coincide con la Junta real."
        },
        400
      );
    }

    const keep = await sql`
      SELECT
        id,
        name,
        goal,
        normal,
        modality,
        variable
      FROM juntas
      WHERE CAST(id AS TEXT) = ${keepJuntaId}
      LIMIT 1
    `;

    if (!keep.length) {
      return json(
        {
          ok: false,
          error: "No se encontró junta_default."
        },
        404
      );
    }

    const obsolete = await sql`
      SELECT
        id,
        name
      FROM juntas
      WHERE CAST(id AS TEXT) <> ${keepJuntaId}
      ORDER BY created_at ASC
    `;

    let deletedJuntas = 0;
    let deletedPayments = 0;
    let receiptsDeleted = 0;

    for (const junta of obsolete) {
      const juntaId = junta.id;

      const payments = await sql`
        SELECT
          id,
          receipt_url
        FROM junta_payments
        WHERE CAST(junta_id AS TEXT) = ${juntaId}
      `;

      for (const payment of payments) {
        const receiptUrl = String(
          payment?.receipt_url || ""
        ).trim();

        if (!receiptUrl) continue;

        try {
          await del(receiptUrl);
          receiptsDeleted += 1;
        } catch (blobError) {
          console.warn(
            "No se pudo eliminar un comprobante antiguo:",
            blobError
          );
        }
      }

      const deletedPaymentRows = await sql`
        DELETE FROM junta_payments
        WHERE CAST(junta_id AS TEXT) = ${juntaId}
        RETURNING id
      `;

      deletedPayments += deletedPaymentRows.length;

      const deletedJuntaRows = await sql`
        DELETE FROM juntas
        WHERE CAST(id AS TEXT) = ${juntaId}
        RETURNING id, name
      `;

      if (deletedJuntaRows.length) {
        deletedJuntas += 1;
      }
    }

    return json({
      ok: true,
      keptJunta: {
        id: keep[0].id,
        name: keep[0].name,
        goal: Number(keep[0].goal || 0),
        normal: Number(keep[0].normal || 0),
        modality: keep[0].modality,
        variable: keep[0].variable
      },
      deletedJuntas,
      deletedPayments,
      receiptsDeleted
    });
  } catch (error) {
    console.error(
      "Error limpiando Juntas antiguas:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron limpiar las Juntas antiguas."
      },
      500
    );
  }
}
