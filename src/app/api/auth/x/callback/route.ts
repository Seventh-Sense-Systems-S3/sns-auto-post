// OAuth callback — implemented in Directive ③
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "X OAuth callback — not yet implemented" },
    { status: 501 },
  );
}
