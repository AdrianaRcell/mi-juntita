import sql from "./db.js";

export default async function handler(request, response) {
  try {
    // ==========================================================
    // GET — OBTENER TODAS LAS JUNTAS
    // ==========================================================

    if (request.method === "GET") {
      const juntas = await sql`
        SELECT
          id,
          name,
          goal,
          normal,
          modality,
          variable,
          created_at
        FROM juntas
        ORDER BY created_at ASC
      `;

      return response.status(200).json({
        ok: true,
        juntas
      });
    }


    // ==========================================================
    // POST — CREAR / ACTUALIZAR JUNTA
    // ==========================================================

    if (request.method === "POST") {
      const {
        id,
        name,
        goal,
        normal,
        modality,
        variable
      } = request.body || {};


      if (!id || !name) {
        return response.status(400).json({
          ok: false,
          error: "Faltan datos de la junta"
        });
      }


      const result = await sql`
        INSERT INTO juntas (
          id,
          name,
          goal,
          normal,
          modality,
          variable
        )
        VALUES (
          ${id},
          ${name},
          ${Number(goal) || 0},
          ${Number(normal) || 0},
          ${modality || "quincenal"},
          ${variable !== false}
        )

        ON CONFLICT (id)

        DO UPDATE SET
          name = EXCLUDED.name,
          goal = EXCLUDED.goal,
          normal = EXCLUDED.normal,
          modality = EXCLUDED.modality,
          variable = EXCLUDED.variable

        RETURNING *
      `;


      return response.status(200).json({
        ok: true,
        junta: result[0]
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
      "Error en /api/juntas:",
      error
    );


    return response.status(500).json({
      ok: false,
      error: "No se pudieron procesar las juntas"
    });
  }
}
