const FUNCTION_URL = process.env.SUPABASE_FUNCTION_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (!FUNCTION_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ detail: "Server API proxy is not configured" });
    return;
  }

  const incoming = new URL(req.url || "/api/proxy", "http://localhost");
  const route = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path || "");
  incoming.searchParams.delete("path");

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value && !["connection", "content-length", "host"].includes(name.toLowerCase())) {
      headers.set(name, Array.isArray(value) ? value.join(",") : value);
    }
  }
  headers.set("apikey", SUPABASE_ANON_KEY);

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body !== undefined) {
      body = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }
  }

  const functionBase = FUNCTION_URL.replace(/\/+$/, "");
  const apiBase = functionBase.endsWith("/functions/v1")
    ? `${functionBase}/api`
    : functionBase;
  const target = `${apiBase}/${route}${incoming.search}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    const location = upstream.headers.get("location");
    if (location) res.setHeader("location", location);
    res.setHeader("cache-control", "no-store");
    res.send(responseBody);
  } catch (error) {
    console.error("Supabase API proxy failed", error);
    res.status(502).json({ detail: "Could not reach the email API" });
  }
}
