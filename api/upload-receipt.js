import { put } from "@vercel/blob";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return response.status(405).json({
        ok: false,
        error: "Método no permitido"
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return response.status(400).json({
        ok: false,
        error: "No se recibió ningún comprobante"
      });
    }

    if (!file.type || !file.type.startsWith("image/")) {
      return response.status(400).json({
        ok: false,
        error: "El comprobante debe ser una imagen"
      });
    }

    const MAX_SIZE = 8 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      return response.status(400).json({
        ok: false,
        error: "El comprobante no puede superar los 8 MB"
      });
    }

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";

    const pathname = `comprobantes/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type
    });

    return response.status(200).json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname
    });
  } catch (error) {
    console.error("Error subiendo comprobante:", error);

    return response.status(500).json({
      ok: false,
      error: "No se pudo subir el comprobante"
    });
  }
}
