import sql from "./db.js";

export default async function handler(request, response) {
  try {

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
        amount,
        payment_date,
        method,
        note,
        receipt_url
      } = request.body || {};


      const numericAmount =
        Number(amount);


      if (
        !id ||
        !numericAmount ||
        numericAmount <= 0 ||
        !payment_date
      ) {

        return response.status(400).json({
          ok: false,
          error: "Faltan datos del pago de Kelly"
        });
      }


      await sql`
        INSERT INTO kelly (
          id,
          original
        )
        VALUES (
          1,
          2800
        )
        ON CONFLICT (id)
        DO NOTHING
      `;


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
