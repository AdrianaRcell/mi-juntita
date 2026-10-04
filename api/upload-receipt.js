import { put } from "@vercel/blob";

export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Método no permitido",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const formData = await request.formData();

    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return new Response(
        JSON.stringify({
          error: "No se recibió ningún archivo.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const originalName =
      typeof file.name === "string" && file.name
        ? file.name
        : "comprobante.jpg";

    const safeName = originalName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120);

    const extension =
      safeName.includes(".")
        ? safeName.split(".").pop().toLowerCase()
        : "jpg";

    const finalName =
      `mi-juntita/comprobantes/` +
      `${Date.now()}-${crypto.randomUUID()}.` +
      `${extension}`;

    const blob = await put(
      finalName,
      file,
      {
        access: "public",
        addRandomSuffix: false,
      }
    );

    return new Response(
      JSON.stringify({
        ok: true,
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType || file.type || "",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error("Error subiendo comprobante:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo subir el comprobante.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
