import { NextRequest, NextResponse } from "next/server";
import { createPartnerUser, FassetRequestError, getPartnerUsers } from "@/lib/fasset";

export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");

    const result = await getPartnerUsers(page, pageSize);
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
