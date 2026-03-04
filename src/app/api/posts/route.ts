// POST (create) + GET (list) — implemented in Directive ④
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Posts API — not yet implemented" });
}

export async function POST() {
  return NextResponse.json(
    { message: "Create post — not yet implemented" },
    { status: 501 },
  );
}
