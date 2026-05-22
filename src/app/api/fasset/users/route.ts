import { NextRequest, NextResponse } from "next/server";
import {
  buildRequestRecord,
  createPartnerUser,
  FassetRequestError,
  getPartnerUsers,
} from "@/lib/fasset";

export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");

    const result = await getPartnerUsers(page, pageSize);
    const { meta: _ignored, ...body } = result;
    const meta = {
      ...result.meta,
      request: {
        ...buildRequestRecord(`/partners/get-partner-users?page=${page}&pageSize=${pageSize}`),
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

    const { meta: _ignored, ...responseBody } = result;
    const meta = {
      ...result.meta,
      request: {
        ...buildRequestRecord("/partners/create-user", {
          method: "POST",
          body: JSON.stringify({
            userIdFromPartner: body.userIdFromPartner,
            metadata: body.metadata,
          }),
        }),
        response: responseBody,
      },
    };
    return NextResponse.json(responseBody, { status: 201, headers: { "x-fasset-meta": JSON.stringify(meta) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
