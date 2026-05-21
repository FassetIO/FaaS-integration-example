import { NextRequest, NextResponse } from "next/server";
import {
  buildRequestRecord,
  FassetRequestError,
  getPartnerUserWallets,
} from "@/lib/fasset";

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
    const { meta: _ignored, ...body } = result;
    const meta = {
      ...result.meta,
      request: {
        ...buildRequestRecord(`/partners/get-partner-user-wallets?partnerUserId=${partnerUserId}`),
        response: body,
      },
    };
    return NextResponse.json(body, { headers: { "x-fasset-meta": JSON.stringify(meta) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
