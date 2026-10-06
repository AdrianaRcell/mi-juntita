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
    const paymentId = body?.paymentId;
    const receiptUrl = String(body?.receiptUrl || "").trim();

    if ((paymentId === undefined || paymentId === null || String(paymentId).trim() === "") && !receiptUrl) {
      return json({ ok: false, error: "Falta el identificador del pago." }, 400);
    }

    let row = null;

    if (paymentId !== undefined && paymentId !== null && String(paymentId).trim() !== "") {
      const rows = await sql`
        SELECT id, receipt_url
        FROM kelly_payments
        WHERE CAST(id AS TEXT) = ${String(paymentId)}
        LIMIT 1
      `;
      if (rows.length) row = rows[0];
    }

    if (!row && receiptUrl) {
      const rows = await sql`
        SELECT id, receipt_url
        FROM kelly_payments
        WHERE receipt_url = ${receiptUrl}
        LIMIT 1
      `;
      if (rows.length) row = rows[0];
    }

    if (!row) {
      return json({ ok: false, error: "No se encontró el pago." }, 404);
    }

    const realPaymentId = row.id;
    const realReceiptUrl = String(row.receipt_url || receiptUrl || "").trim();

    await sql`
      DELETE FROM kelly_payments
      WHERE id = ${realPaymentId}
    `;

    let receiptDeleted = true;
    if (realReceiptUrl) {
      try {
        await del(realReceiptUrl);
      } catch (blobError) {
        receiptDeleted = false;
        console.warn("El pago fue eliminado de Neon, pero el comprobante no pudo eliminarse de Blob:", blobError);
      }
    }

    return json({
      ok: true,
      deletedPaymentId: realPaymentId,
      receiptDeleted
    });
  } catch (error) {
    console.error("Error eliminando pago de Kelly:", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar el pago de Kelly."
    }, 500);
  }
}
