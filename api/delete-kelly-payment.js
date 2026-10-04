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

    if (
      paymentId === undefined ||
      paymentId === null ||
      String(paymentId).trim() === ""
    ) {
      return json(
        { ok: false, error: "Falta el ID del pago." },
        400
      );
    }

    // 1. Buscar primero el pago para recuperar su comprobante.
    const paymentRows = await sql`
      SELECT
        id,
        amount,
        receipt_url
      FROM kelly_payments
      WHERE id = ${paymentId}
      LIMIT 1
    `;

    if (!paymentRows.length) {
      return json(
        {
          ok: false,
          error: "No se encontró el pago en Neon. Puede que ya haya sido eliminado.",
        },
        404
      );
    }

    const payment = paymentRows[0];
    const receiptUrl = payment.receipt_url || "";

    // 2. BORRAR EL REGISTRO DE PAGO DE NEON.
    const deletedRows = await sql`
      DELETE FROM kelly_payments
      WHERE id = ${paymentId}
      RETURNING id, amount
    `;

    if (!deletedRows.length) {
      return json(
        { ok: false, error: "No se pudo eliminar el registro del pago." },
        500
      );
    }

    // 3. BORRAR EL COMPROBANTE DE VERCEL BLOB.
    let receiptDeleted = true;

    if (receiptUrl) {
      try {
        await del(receiptUrl);
      } catch (blobError) {
        receiptDeleted = false;

        console.warn(
          "El registro fue eliminado, pero no se pudo eliminar el comprobante:",
          blobError
        );
      }
    }

    // 4. VOLVER A LEER LOS PAGOS RESTANTES.
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

    // 5. VOLVER A LEER LA DEUDA ORIGINAL.
    const kellyRows = await sql`
      SELECT
        id,
        original
      FROM kelly
      LIMIT 1
    `;

    const original = Number(kellyRows[0]?.original || 2800);

    const paid = remainingPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const balance = Math.max(0, original - paid);

    return json({
      ok: true,

      deletedPaymentId: payment.id,
      deletedAmount: Number(payment.amount || 0),

      receiptDeleted,

      kelly: {
        original,
        paid,
        balance,
        payments: remainingPayments,
      },
    });

  } catch (error) {
    console.error("Error eliminando pago de Kelly:", error);

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
