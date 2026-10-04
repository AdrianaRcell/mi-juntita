import sql from "./db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const rows = await sql`
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

      return res.status(200).json({
        ok: true,
        juntas: rows
      });
    }

    if (req.method === "POST") {
      const {
        id,
        name,
        goal,
        normal,
        modality,
        variable
      } = req.body || {};

      if (!id || !name) {
        return res.status(400).json({
          ok: false,
          error: "Faltan datos de la Junta"
        });
      }

      const rows = await sql`
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
          ${Boolean(variable)}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          goal = EXCLUDED.goal,
          normal = EXCLUDED.normal,
          modality = EXCLUDED.modality,
          variable = EXCLUDED.variable
        RETURNING
          id,
          name,
          goal,
          normal,
          modality,
          variable,
          created_at
      `;

      return res.status(200).json({
        ok: true,
        junta: rows[0]
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Método no permitido"
    });

  } catch (error) {
    console.error("Error en juntas:", error);

    return res.status(500).json({
      ok: false,
      error: "Error al trabajar con las Juntas"
    });
  }
}
