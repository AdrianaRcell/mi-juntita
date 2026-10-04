import { put } from "@vercel/blob";

export async function POST(request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json(
        {
          error: "No se recibió ningún archivo.",
        },
        {
          status: 400,
        }
      );
    }

    const originalName =
      typeof file.name === "string" && file.name.trim()
        ? file.name.trim()
        : "comprobante.jpg";

    const safeName = originalName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-100);

    const blob = await put(
      `mi-juntita/comprobantes/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    return Response.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || file.type || "",
    });

  } catch (error) {
    console.error("Error subiendo comprobante:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo subir el comprobante.",
      },
      {
        status: 500,
      }
    );
  }
}
