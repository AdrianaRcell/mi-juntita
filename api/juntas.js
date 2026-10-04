import sql from "./db.js";

export default async function handler(request, response) {
  try {
    // GET → obtener todas las juntas
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

    // POST → crear una nueva junta
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
        RETURNING *
      `;

      return response.status(201).json({
        ok: true,
        junta: result[0]
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
      error: "No se pudieron procesar las juntas"
    });
  }
}
