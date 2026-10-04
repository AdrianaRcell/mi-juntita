import crypto from "node:crypto";
import sql from "./db.js";

export const runtime = "nodejs";

const secret =
  process.env.MI_JUNTITA_SHARE_SECRET ||
  process.env.MI_JUNTITA_DATABASE_URL ||
  "mi-juntita-share-secret";

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padding =
    normalized.length % 4
      ? "=".repeat(4 - (normalized.length % 4))
      : "";

  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function sign(body) {
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
}

function createToken(payload) {
  const body = base64url(
    JSON.stringify(payload)
  );

  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      fromBase64url(body)
    );

    if (!payload || !["junta", "kelly"].includes(payload.type)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function noStore(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}

async function getJunta(juntaId) {
  if (!juntaId) {
    return null;
  }

  const rows = await sql`
    SELECT
      id,
      name,
      goal,
      normal,
      modality,
      variable
    FROM juntas
    WHERE id = ${juntaId}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  const payments = await sql`
    SELECT
      id,
      amount,
      payment_date,
      method,
      note,
      receipt_url
    FROM junta_payments
    WHERE junta_id = ${juntaId}
    ORDER BY payment_date DESC, id DESC
  `;

  return {
    type: "junta",
    junta: {
      id: row.id,
      name: row.name,
      goal: Number(row.goal || 0),
      normal: Number(row.normal || 0),
      modality: row.modality || "quincenal",
      variable: Boolean(row.variable)
    },
    payments: payments.map(payment => ({
      id: payment.id,
      amount: Number(payment.amount || 0),
      date: String(payment.payment_date || "").slice(0, 10),
      method: payment.method || "",
      note: payment.note || "",
      receiptUrl: payment.receipt_url || ""
    }))
  };
}

async function getKelly() {
  const rows = await sql`
    SELECT original
    FROM kelly
    LIMIT 1
  `;

  const original = Number(rows[0]?.original || 0);

  const payments = await sql`
    SELECT
      id,
      amount,
      payment_date,
      method,
      note,
      receipt_url
    FROM kelly_payments
    ORDER BY payment_date DESC, id DESC
  `;

  return {
    type: "kelly",
    original,
    payments: payments.map(payment => ({
      id: payment.id,
      amount: Number(payment.amount || 0),
      date: String(payment.payment_date || "").slice(0, 10),
      method: payment.method || "",
      note: payment.note || "",
      receiptUrl: payment.receipt_url || ""
    }))
  };
}

async function getSharedData(payload) {
  if (payload.type === "junta") {
    return getJunta(payload.id);
  }

  return getKelly();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const type = body?.type;
    const id = body?.id || "";

    if (!['junta', 'kelly'].includes(type)) {
      return noStore(
        { ok: false, error: "Tipo de compartido no válido." },
        400
      );
    }

    if (type === "junta") {
      const exists = await sql`
        SELECT id
        FROM juntas
        WHERE id = ${id}
        LIMIT 1
      `;

      if (!exists.length) {
        return noStore(
          { ok: false, error: "No se encontró la Junta." },
          404
        );
      }
    }

    const token = createToken({
      type,
      ...(type === "junta" ? { id } : {})
    });

    const origin = new URL(request.url).origin;
    const url = `${origin}/?share=${encodeURIComponent(token)}`;

    return noStore({
      ok: true,
      type,
      url,
      token
    });
  } catch (error) {
    console.error("Error creando enlace compartido:", error);

    return noStore(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear el enlace compartido."
      },
      500
    );
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const payload = verifyToken(token);

    if (!payload) {
      return noStore(
        { ok: false, error: "Enlace compartido no válido." },
        401
      );
    }

    const data = await getSharedData(payload);

    if (!data) {
      return noStore(
        { ok: false, error: "La información compartida ya no existe." },
        404
      );
    }

    return noStore({
      ok: true,
      type: data.type,
      data
    });
  } catch (error) {
    console.error("Error leyendo enlace compartido:", error);

    return noStore(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo abrir el enlace compartido."
      },
      500
    );
  }
}
