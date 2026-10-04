import sql from "./db.js";

export default async function handler(request, response) {
  try {
    const result = await sql`SELECT NOW() AS hora`;
    
    return response.status(200).json({
      ok: true,
      mensaje: "Mi Juntita está conectada a Neon 🌸",
      hora: result[0].hora
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      ok: false,
      error: "No se pudo conectar con Neon"
    });
  }
}
