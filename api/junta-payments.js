import sql from "./db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const juntaId = req.query?.junta_id;

      if (juntaId) {
        const rows = await sql`
          SELECT
            id,
            junta_id,
            amount,
            payment_date,
            method,
            note,
            receipt_url,
            created_at
          FROM junta_payments
          WHERE junta_id = ${juntaId}
          ORDER BY payment_date DESC, created_at DESC
        `;

        return res.status(200).json({
          ok: true,
          payments: rows
        });
      }

      const rows = await sql`
        SELECT
          id,
          junta_id,
          amount,
          payment_date,
          method,
          note,
          receipt_url,
          created_at
        FROM junta_payments
        ORDER BY payment_date DESC, created_at DESC
      `;

      return res.status(200).json({
        ok: true,
        payments: rows
      });
    }

    if (req.method === "POST") {
      const {
        id,
        junta_id,
        amount,
        payment_date,
        method,
        note,
        receipt_url
      } = req.body || {};

      if (!id || !junta_id || !payment_date) {
        return res.status(400).json({
          ok: false,
          error: "Faltan datos del pago"
        });
      }

      const rows = await sql`
        INSERT INTO junta_payments (
          id,
          junta_id,
          amount,
          payment_date,
          method,
          note,
          receipt_url
        )
        VALUES (
          ${id},
          ${junta_id},
          ${Number(amount) || 0},
          ${payment_date},
          ${method || ""},
          ${note || ""},
          ${receipt_url || ""}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          amount = EXCLUDED.amount,
          payment_date = EXCLUDED.payment_date,
          method = EXCLUDED.method,
          note = EXCLUDED.note,
          receipt_url = EXCLUDED.receipt_url
        RETURNING
          id,
          junta_id,
          amount,
          payment_date,
          method,
          note,
          receipt_url,
          created_at
      `;

      return res.status(200).json({
        ok: true,
        payment: rows[0]
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Método no permitido"
    });

  } catch (error) {
    console.error("Error en junta-payments:", error);

    return res.status(500).json({
      ok: false,
      error: "Error al trabajar con los pagos"
    });
  }
}
