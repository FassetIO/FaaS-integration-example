import { NextRequest, NextResponse } from "next/server";
import { FassetRequestError, getPartnerUserTransactions } from "@/lib/fasset";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ message: "userId query parameter is required" }, { status: 400 });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    const fromDate = request.nextUrl.searchParams.get("fromDate") || undefined;
    const toDate = request.nextUrl.searchParams.get("toDate") || undefined;

    const result = await getPartnerUserTransactions({ userId, limit, offset, fromDate, toDate });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
