import sql from "./db.js";

export default async function handler(request, response) {
  try {
const result = await sql`
  SELECT
    NOW() AS hora,
    current_database() AS base,
    current_schema() AS esquema,
    current_user AS usuario
`;    
   return response.status(200).json({
  ok: true,
  mensaje: "Mi Juntita está conectada a Neon 🌸",
  hora: result[0].hora,
  base: result[0].base,
  esquema: result[0].esquema,
  usuario: result[0].usuario
});
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      ok: false,
      error: "No se pudo conectar con Neon"
    });
  }
}
