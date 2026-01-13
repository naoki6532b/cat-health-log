export function checkPin(req: Request) {
  const required = process.env.API_PIN || process.env.NEXT_PUBLIC_API_PIN || "";
  if (!required) return null;

  const url = new URL(req.url);
  const pinFromQuery = url.searchParams.get("pin") || "";
  const pinFromHeader =
    req.headers.get("x-pin") ||
    req.headers.get("X-PIN") ||
    req.headers.get("authorization") ||
    "";

  const pin =
    pinFromQuery ||
    (pinFromHeader.startsWith("Bearer ") ? pinFromHeader.slice(7) : pinFromHeader);

  if (pin !== required) {
    return new Response(JSON.stringify({ error: "Unauthorized (bad pin)" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return null;
}
