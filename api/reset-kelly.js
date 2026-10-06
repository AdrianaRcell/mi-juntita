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
    if (body?.confirm !== "RESET_KELLY_2800") {
      return json({ ok:false, error:"Confirmación inválida." },400);
    }

    const rows = await sql`
      SELECT id, receipt_url
      FROM kelly_payments
      ORDER BY id
    `;

    let receiptsDeleted = 0;
    for (const row of rows) {
      const receiptUrl = String(row?.receipt_url || "").trim();
      if (!receiptUrl) continue;
      try {
        await del(receiptUrl);
        receiptsDeleted += 1;
      } catch (blobError) {
        console.warn("No se pudo eliminar un comprobante antiguo de Kelly:", blobError);
      }
    }

    await sql`DELETE FROM kelly_payments`;

    let updated = await sql`
      UPDATE kelly
      SET original = 2800
      RETURNING original
    `;

    if (!updated.length) {
      updated = await sql`
        INSERT INTO kelly (original)
        VALUES (2800)
        RETURNING original
      `;
    }

    return json({
      ok:true,
      deletedPayments:rows.length,
      receiptsDeleted,
      original:Number(updated[0]?.original || 2800)
    });
  } catch (error) {
    console.error("Error restableciendo Kelly:", error);
    return json({
      ok:false,
      error:error instanceof Error ? error.message : "No se pudo restablecer Kelly."
    },500);
  }
}
