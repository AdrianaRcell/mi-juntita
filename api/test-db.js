import sql from "./db.js";

export default async function handler(request, response) {
  try {
    const result = await sql`
      SELECT
        current_database() AS base,
        current_schema() AS esquema,
        current_user AS usuario,
        current_setting('neon.branch_id', true) AS branch_id
    `;

    const tablas = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    return response.status(200).json({
      ok: true,
      conexion: {
        base: result[0].base,
        esquema: result[0].esquema,
        usuario: result[0].usuario,
        branch_id: result[0].branch_id
      },
      tablas: tablas.map(t => t.table_name)
    });

  } catch (error) {
    console.error(error);

    return response.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
