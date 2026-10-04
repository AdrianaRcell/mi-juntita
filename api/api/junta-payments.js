import sql from "./db.js";

export default async function handler(request, response) {
  try {

    // ============================================================
    // GET → obtener los pagos de una junta
    // ============================================================

    if (request.method === "GET") {

      const juntaId =
        request.query?.junta_id;

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


    // ============================================================
    // POST → registrar un nuevo pago
    // ============================================================

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


      if (
        !id ||
        !junta_id ||
        !amount ||
        !payment_date
      ) {
        return response.status(400).json({
          ok: false,
          error: "Faltan datos del aporte"
        });
      }


      // Verificamos que la junta exista.

      const junta = await sql`
        SELECT id
        FROM juntas
        WHERE id = ${junta_id}
        LIMIT 1
      `;

      if (!junta.length) {
        return response.status(404).json({
          ok: false,
          error: "La junta no existe"
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


    // ============================================================
    // MÉTODO NO PERMITIDO
    // ============================================================

    return response.status(405).json({
      ok: false,
      error: "Método no permitido"
    });

  } catch (error) {

    console.error(
      "Error en junta-payments:",
      error
    );

    return response.status(500).json({
      ok: false,
      error: "No se pudo procesar el aporte"
    });
  }
}
