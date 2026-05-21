import { NextRequest, NextResponse } from "next/server";
import { buildRequestRecord, createOrder, getOrder } from "@/lib/fasset";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      partnerUserId?: string;
      externalOrderRef?: string;
      fiatAmount?: string;
      fiatCurrency?: string;
      expiresAt?: string;
      remarks?: string;
    };

    if (!body.partnerUserId || !body.externalOrderRef || !body.fiatAmount || !body.fiatCurrency) {
      return NextResponse.json({ message: "partnerUserId, externalOrderRef, fiatAmount, fiatCurrency are required" }, { status: 400 });
    }

    const result = await createOrder({
      partnerUserId: body.partnerUserId,
      externalOrderRef: body.externalOrderRef,
      fiatAmount: body.fiatAmount,
      fiatCurrency: body.fiatCurrency,
      expiresAt: body.expiresAt,
      remarks: body.remarks,
    });

    const meta = {
      ...(result.meta ?? {}),
      request: buildRequestRecord("/orders", { method: "POST", body: JSON.stringify(body) }),
    };

    const { meta: _ignored, ...responseBody } = result;
    return NextResponse.json(responseBody, { status: 201, headers: { "x-fasset-meta": JSON.stringify(meta) } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId") || undefined;
    const externalOrderRef = searchParams.get("externalOrderRef") || undefined;

    if (!orderId && !externalOrderRef) {
      return NextResponse.json({ message: "Provide orderId or externalOrderRef" }, { status: 400 });
    }

    const result = await getOrder({ orderId, externalOrderRef });

    const meta = {
      ...(result.meta ?? {}),
      request: buildRequestRecord(`/orders?${orderId ? `orderId=${orderId}` : `externalOrderRef=${externalOrderRef}`}`),
    };

    const { meta: _ignored, ...body } = result;
    return NextResponse.json(body, { headers: { "x-fasset-meta": JSON.stringify(meta) } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
