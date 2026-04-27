import { NextRequest, NextResponse } from "next/server";
import { FassetRequestError, getPartnerUserWallets } from "@/lib/fasset";

export async function GET(request: NextRequest) {
  try {
    const partnerUserId = request.nextUrl.searchParams.get("partnerUserId");

    if (!partnerUserId) {
      return NextResponse.json(
        { message: "partnerUserId query parameter is required" },
        { status: 400 },
      );
    }

    const result = await getPartnerUserWallets(partnerUserId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
