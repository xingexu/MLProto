// Same-origin proxy to the Spring Boot API, so the browser never needs CORS
// and the API address can change at deploy time (API_URL is read per request).
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED = /^(ask|eval|regulations(\/[A-Za-z0-9-]+\/timeline)?|watchlist(\/\d+)?)$/;

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const joined = path.join("/");
  if (!ALLOWED.test(joined)) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }
  const base = process.env.API_URL ?? "http://localhost:8080";
  const target = `${base}/api/${joined}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  };
  if (req.method !== "GET" && req.method !== "DELETE") {
    init.body = await req.text();
  }
  try {
    const res = await fetch(target, init);
    const body = res.status === 204 ? null : await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "The InForce API is unreachable. Check that the API service is running." },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
