// POST (publish to queue) — implemented in Directive ④ / ⑦
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Publish post — not yet implemented" },
    { status: 501 },
  );
}
