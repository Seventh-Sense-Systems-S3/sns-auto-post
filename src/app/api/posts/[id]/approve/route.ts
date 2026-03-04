// POST (approve) — implemented in Directive ④
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Approve post — not yet implemented" },
    { status: 501 },
  );
}
