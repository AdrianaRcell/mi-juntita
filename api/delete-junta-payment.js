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
    const paymentId = body?.paymentId ?? "";
    const juntaId = body?.juntaId ?? "";
    const receiptUrl = String(body?.receiptUrl || "").trim();

    let payment = null;

    if (String(paymentId).trim() !== "") {
      const byId = await sql`
        SELECT id, junta_id, amount, receipt_url
        FROM junta_payments
        WHERE CAST(id AS TEXT) = ${String(paymentId)}
        LIMIT 1
      `;
      if (byId.length) payment = byId[0];
    }

    if (!payment && receiptUrl) {
      const byReceipt = await sql`
        SELECT id, junta_id, amount, receipt_url
        FROM junta_payments
        WHERE receipt_url = ${receiptUrl}
        LIMIT 1
      `;
      if (byReceipt.length) payment = byReceipt[0];
    }

    if (!payment) {
      return json({
        ok:false,
        error:"No se encontró el aporte en Neon. Se intentó localizarlo por ID y por comprobante."
      },404);
    }

    const foundById =
      String(paymentId).trim() !== "" &&
      String(payment.id) === String(paymentId);

    if (
      foundById &&
      juntaId &&
      String(payment.junta_id) !== String(juntaId)
    ) {
      return json({ ok:false, error:"El aporte no pertenece a esa Junta." },403);
    }

    const receiptToDelete = payment.receipt_url || receiptUrl || "";
    const realPaymentId = payment.id;

    const deleted = await sql`
      DELETE FROM junta_payments
      WHERE id = ${realPaymentId}
      RETURNING id, junta_id, amount, receipt_url
    `;

    if (!deleted.length) {
      return json({ ok:false, error:"No se pudo eliminar el aporte de Neon." },500);
    }

    const deletedPayment = deleted[0];
    let receiptDeleted = true;

    if (receiptToDelete) {
      try { await del(receiptToDelete); }
      catch (blobError) {
        receiptDeleted = false;
        console.warn("El aporte fue eliminado de Neon, pero el comprobante no pudo eliminarse de Blob:", blobError);
      }
    }

    return json({
      ok:true,
      deletedPaymentId:deletedPayment.id,
      deletedAmount:Number(deletedPayment.amount || 0),
      juntaId:deletedPayment.junta_id,
      receiptDeleted
    });
  } catch(error) {
    console.error("Error eliminando aporte de Junta:",error);
    return json({
      ok:false,
      error:error instanceof Error ? error.message : "No se pudo eliminar el aporte."
    },500);
  }
}
