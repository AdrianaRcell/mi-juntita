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
          amount,
          date,
          method,
          note,
          receipt_url
        FROM kelly_payments
        WHERE CAST(id AS TEXT) = ${String(paymentId)}
        LIMIT 1
      `;
      if (byId.length) payment = byId[0];
    }

    if (!payment && receiptUrl) {
      const byReceipt = await sql`
        SELECT
          id,
          amount,
          date,
          method,
          note,
          receipt_url
        FROM kelly_payments
        WHERE receipt_url = ${receiptUrl}
        LIMIT 1
      `;
      if (byReceipt.length) payment = byReceipt[0];
    }

    if (!payment && amount > 0 && date) {
      const matches = await sql`
        SELECT
          id,
          amount,
          date,
          method,
          note,
          receipt_url
        FROM kelly_payments
        WHERE amount = ${amount}
          AND CAST(date AS TEXT) = ${date}
          AND COALESCE(method, '') = ${method}
          AND COALESCE(note, '') = ${note}
        ORDER BY id DESC
        LIMIT 2
      `;

      if (matches.length === 1) payment = matches[0];

      if (matches.length > 1) {
        return json(
          {
            ok: false,
            error:
              "Hay más de un pago con los mismos datos. No se eliminó ninguno para evitar borrar el incorrecto.",
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
            "No se encontró el pago en Neon. El movimiento no coincide con ningún registro real.",
        },
        404
      );
    }

    const deleted = await sql`
      DELETE FROM kelly_payments
      WHERE id = ${payment.id}
      RETURNING
        id,
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
          error: "No se pudo eliminar el registro de Neon.",
        },
        500
      );
    }

    const deletedPayment = deleted[0];

    let receiptDeleted = true;

    if (deletedPayment.receipt_url) {
      try {
        await del(deletedPayment.receipt_url);
      } catch (blobError) {
        receiptDeleted = false;
        console.warn(
          "El pago fue eliminado de Neon, pero no se pudo eliminar el comprobante:",
          blobError
        );
      }
    }

    const kellyRows = await sql`
      SELECT id, original
      FROM kelly
      LIMIT 1
    `;

    const original = Number(
      kellyRows[0]?.original ?? 2800
    );

    const remainingPayments = await sql`
      SELECT
        id,
        amount,
        date,
        method,
        note,
        receipt_url
      FROM kelly_payments
      ORDER BY date DESC, id DESC
    `;

    const paid = remainingPayments.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    const balance = Math.max(
      0,
      original - paid
    );

    return json({
      ok: true,
      deletedPaymentId: deletedPayment.id,
      deletedAmount: Number(deletedPayment.amount || 0),
      receiptDeleted,
      kelly: {
        original,
        paid,
        balance,
        payments: remainingPayments,
      },
    });
  } catch (error) {
    console.error(
      "Error eliminando pago de Kelly:",
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el pago.",
      },
      500
    );
  }
}
