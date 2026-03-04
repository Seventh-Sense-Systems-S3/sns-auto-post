// GET (detail) + PATCH (update) + DELETE (soft delete) — implemented in Directive ④
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Post detail — not yet implemented" },
    { status: 501 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { message: "Update post — not yet implemented" },
    { status: 501 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { message: "Delete post — not yet implemented" },
    { status: 501 },
  );
}
