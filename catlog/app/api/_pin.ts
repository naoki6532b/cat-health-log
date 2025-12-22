export function checkPin(req: Request) {
  const required = process.env.CATLOG_PIN;
  if (!required) return; // PIN未設定ならチェックしない

  const pin = req.headers.get("x-catlog-pin") ?? "";
  if (pin !== required) {
    throw new Response("PIN required", { status: 401 });
  }
}