import sql from "./db.js";

export default async function handler(request, response) {
  try {
    const result = await sql`
      SELECT
        current_database() AS base,
        current_schema() AS esquema,
        current_user AS usuario
    `;

    const tablas = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    return response.status(200).json({
      ok: true,
      conexion: result[0],
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
