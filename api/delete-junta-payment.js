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

    const paymentId = body?.paymentId ?? "";
    const juntaId = body?.juntaId ?? "";
    const amount = Number(body?.amount || 0);
    const date = String(body?.date || "").trim();
    const method = String(body?.method || "").trim();
    const note = String(body?.note || "").trim();
    const receiptUrl = String(body?.receiptUrl || "").trim();

    let payment = null;

    if (String(paymentId).trim() !== "") {
      const byId = await sql`
        SELECT
          id,
          junta_id,
          amount,
          date,
          method,
          note,
          receipt_url
        FROM junta_payments
        WHERE CAST(id AS TEXT) = ${String(paymentId)}
        LIMIT 1
      `;
      if (byId.length) payment = byId[0];
    }

    if (!payment && receiptUrl) {
      const byReceipt = await sql`
        SELECT
          id,
          junta_id,
          amount,
          date,
          method,
          note,
          receipt_url
        FROM junta_payments
        WHERE receipt_url = ${receiptUrl}
        LIMIT 1
      `;
      if (byReceipt.length) payment = byReceipt[0];
    }

    if (!payment && amount > 0 && date) {
      let matches;

      if (juntaId) {
        matches = await sql`
          SELECT
            id,
            junta_id,
            amount,
            date,
            method,
            note,
            receipt_url
          FROM junta_payments
          WHERE amount = ${amount}
            AND CAST(date AS TEXT) = ${date}
            AND COALESCE(method, '') = ${method}
            AND COALESCE(note, '') = ${note}
            AND CAST(junta_id AS TEXT) = ${String(juntaId)}
          ORDER BY id DESC
          LIMIT 2
        `;
      } else {
        matches = await sql`
          SELECT
            id,
            junta_id,
            amount,
            date,
            method,
            note,
            receipt_url
          FROM junta_payments
          WHERE amount = ${amount}
            AND CAST(date AS TEXT) = ${date}
            AND COALESCE(method, '') = ${method}
            AND COALESCE(note, '') = ${note}
          ORDER BY id DESC
          LIMIT 2
        `;
      }

      if (matches.length === 1) payment = matches[0];

      if (matches.length > 1) {
        return json(
          {
            ok: false,
            error:
              "Hay más de un aporte con los mismos datos. No se eliminó ninguno para evitar borrar el incorrecto.",
          },
          409
        );
      }
    }

    if (!payment) {
      return json(
        {
          ok: false,
          error:
            "No se encontró el aporte en Neon. El movimiento no coincide con ningún registro real.",
        },
        404
      );
    }

    if (
      juntaId &&
      String(payment.junta_id) !== String(juntaId)
    ) {
      return json(
        {
          ok: false,
          error:
            "El aporte no pertenece a esa Junta.",
        },
        403
      );
    }

    const deleted = await sql`
      DELETE FROM junta_payments
      WHERE id = ${payment.id}
      RETURNING
        id,
        junta_id,
        amount,
        date,
        method,
        note,
        receipt_url
    `;

    if (!deleted.length) {
      return json(
        {
          ok: false,
          error:
            "No se pudo eliminar el registro de Neon.",
        },
        500
      );
    }

    const deletedPayment = deleted[0];

    let receiptDeleted = true;

    if (deletedPayment.receipt_url) {
      try {
        await del(
          deletedPayment.receipt_url
        );
      } catch (blobError) {
        receiptDeleted = false;

        console.warn(
          "El aporte fue eliminado de Neon, pero no se pudo eliminar el comprobante:",
          blobError
        );
      }
    }

    return json({
      ok: true,
      deletedPaymentId: deletedPayment.id,
      deletedAmount: Number(
        deletedPayment.amount || 0
      ),
      juntaId: deletedPayment.junta_id,
      receiptDeleted,
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
