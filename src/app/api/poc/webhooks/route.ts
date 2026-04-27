import { NextRequest, NextResponse } from "next/server";
import { appendWebhook, getWebhooks } from "@/lib/webhooks-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const headerRecord: Record<string, string | string[] | undefined> = {};
    request.headers.forEach((value, key) => {
      headerRecord[key] = value;
    });

    const webhook = await appendWebhook({
      receivedAt: new Date().toISOString(),
      headers: headerRecord,
      body,
    });

    return NextResponse.json({ data: webhook }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const webhooks = await getWebhooks();
    const sorted = webhooks.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    return NextResponse.json({ data: sorted }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
