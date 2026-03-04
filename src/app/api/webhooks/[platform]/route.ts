// Platform webhooks — future implementation
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Webhook — not yet implemented" },
    { status: 501 },
  );
}
