import { NextRequest, NextResponse } from "next/server";
import { createPartnerUser, FassetRequestError, getPartnerUsers } from "@/lib/fasset";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");

    const result = await getPartnerUsers(limit, offset);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userIdFromPartner?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.userIdFromPartner) {
      return NextResponse.json(
        { message: "userIdFromPartner is required" },
        { status: 400 },
      );
    }

    const result = await createPartnerUser({
      userIdFromPartner: body.userIdFromPartner,
      metadata: body.metadata,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
