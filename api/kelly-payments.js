import sql from "./db.js";

export default async function handler(request, response) {
  try {

    // ==========================================================
    // GET — OBTENER PAGOS DE KELLY
    // ==========================================================

    if (request.method === "GET") {

      const payments = await sql`
        SELECT
          id,
          kelly_id,
          amount,
          payment_date,
          method,
          note,
          receipt_url,
          created_at
        FROM kelly_payments
        WHERE kelly_id = 1
        ORDER BY
          payment_date ASC,
          created_at ASC
      `;


      return response.status(200).json({
        ok: true,
        payments
      });
    }


    // ==========================================================
    // POST — REGISTRAR PAGO DE KELLY
    // ==========================================================

    if (request.method === "POST") {

      const {
        id,
        amount,
        payment_date,
        method,
        note,
        receipt_url
      } = request.body || {};


      if (
        !id ||
        !amount ||
        !payment_date
      ) {

        return response.status(400).json({
          ok: false,
          error: "Faltan datos del pago"
        });
      }


      const numericAmount =
        Number(amount);


      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {

        return response.status(400).json({
          ok: false,
          error: "El monto del pago no es válido"
        });
      }


      const result = await sql`
        INSERT INTO kelly_payments (
          id,
          kelly_id,
          amount,
          payment_date,
          method,
          note,
          receipt_url
        )
        VALUES (
          ${id},
          1,
          ${numericAmount},
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


    // ==========================================================
    // MÉTODO NO PERMITIDO
    // ==========================================================

    return response.status(405).json({
      ok: false,
      error: "Método no permitido"
    });


  } catch (error) {

    console.error(
      "Error en /api/kelly-payments:",
      error
    );


    return response.status(500).json({
      ok: false,
      error: "No se pudieron procesar los pagos de Kelly"
    });
  }
}
