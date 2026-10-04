import sql from "./db.js";

export default async function handler(request, response) {
  try {

    // ==========================================================
    // GET — OBTENER KELLY
    // ==========================================================

    if (request.method === "GET") {

      let result = await sql`
        SELECT
          id,
          original,
          created_at
        FROM kelly
        WHERE id = 1
        LIMIT 1
      `;

      // Si todavía no existe, la creamos con el valor inicial
      // de S/ 2,800.
      if (!result.length) {

        result = await sql`
          INSERT INTO kelly (
            id,
            original
          )
          VALUES (
            1,
            2800
          )
          RETURNING
            id,
            original,
            created_at
        `;
      }

      return response.status(200).json({
        ok: true,
        kelly: result[0]
      });
    }


    // ==========================================================
    // POST — CREAR / ACTUALIZAR KELLY
    // ==========================================================

    if (request.method === "POST") {

      const {
        original
      } = request.body || {};


      const amount =
        Number(original);


      if (!Number.isFinite(amount) || amount < 0) {

        return response.status(400).json({
          ok: false,
          error: "El monto original no es válido"
        });
      }


      const result = await sql`
        INSERT INTO kelly (
          id,
          original
        )
        VALUES (
          1,
          ${amount}
        )

        ON CONFLICT (id)

        DO UPDATE SET
          original = EXCLUDED.original

        RETURNING
          id,
          original,
          created_at
      `;


      return response.status(200).json({
        ok: true,
        kelly: result[0]
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
      "Error en /api/kelly:",
      error
    );


    return response.status(500).json({
      ok: false,
      error: "No se pudo procesar Kelly"
    });
  }
}
