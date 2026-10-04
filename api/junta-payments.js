import sql from "./db.js";

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const juntaId = request.query?.junta_id;

      if (!juntaId) {
        return response.status(400).json({
          ok: false,
          error: "Falta junta_id"
        });
      }

      const payments = await sql`
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
        ORDER BY payment_date ASC, created_at ASC
      `;

      return response.status(200).json({
        ok: true,
        payments
      });
    }

    if (request.method === "POST") {
      const {
        id,
        junta_id,
        amount,
        payment_date,
        method,
        note,
        receipt_url
      } = request.body || {};

      if (!id || !junta_id || !amount || !payment_date) {
        return response.status(400).json({
          ok: false,
          error: "Faltan datos del pago"
        });
      }

      const result = await sql`
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
          ${Number(amount)},
          ${payment_date},
          ${method || ""},
          ${note || ""},
          ${receipt_url || ""}
        )
        RETURNING *
      `;

      return response.status(201).json({
        ok: true,
        payment: result[0]
      });
    }

    return response.status(405).json({
      ok: false,
      error: "Método no permitido"
    });

  } catch (error) {
    console.error(error);

    return response.status(500).json({
      ok: false,
      error: "No se pudieron procesar los pagos"
    });
  }
}
