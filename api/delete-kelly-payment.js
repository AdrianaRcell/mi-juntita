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
    // Evita llamadas mutadoras desde otras páginas/orígenes.
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (origin && origin !== url.origin) {
      return json({ ok: false, error: "Origen no permitido." }, 403);
    }

    const body = await request.json().catch(() => null);
    const paymentId = body?.paymentId;

    if (paymentId === undefined || paymentId === null || String(paymentId).trim() === "") {
      return json({ ok: false, error: "Falta el ID del pago." }, 400);
    }

    const rows = await sql`
      SELECT id, receipt_url
      FROM kelly_payments
      WHERE id = ${paymentId}
      LIMIT 1
    `;

    if (!rows.length) {
      return json({ ok: false, error: "No se encontró el pago." }, 404);
    }

    const receiptUrl = rows[0].receipt_url || "";

    await sql`
      DELETE FROM kelly_payments
      WHERE id = ${paymentId}
    `;

    // El comprobante vive fuera de Neon. Lo eliminamos también cuando existe.
    if (receiptUrl) {
      try {
        await del(receiptUrl);
      } catch (blobError) {
        console.warn("No se pudo eliminar el comprobante de Blob:", blobError);
      }
    }

    return json({
      ok: true,
      deletedPaymentId: paymentId,
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
