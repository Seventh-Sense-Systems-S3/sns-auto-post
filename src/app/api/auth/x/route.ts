// OAuth start (redirect) — implemented in Directive ③
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "X OAuth start — not yet implemented" },
    { status: 501 },
  );
}
