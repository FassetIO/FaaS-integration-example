import { NextRequest, NextResponse } from "next/server";
import {
  buildRequestRecord,
  FassetRequestError,
  generateEmbedToken,
  getFassetConfig,
  getPartnerUserWallets,
} from "@/lib/fasset";
import { computeWalletHash } from "@/lib/wallet-hash";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      partnerUserId?: string;
      theme?: "light" | "dark";
    };

    if (!body.partnerUserId) {
      return NextResponse.json({ message: "partnerUserId is required" }, { status: 400 });
    }

    const theme = body.theme ?? "dark";

    const [tokenResp, walletsResp] = await Promise.all([
      generateEmbedToken(body.partnerUserId, theme),
      getPartnerUserWallets(body.partnerUserId),
    ]);

    const { walletHashKey, widgetUrl } = getFassetConfig();
    const walletHash = computeWalletHash(walletsResp.data.wallets, walletHashKey);

    const meta = {
      requests: [
        buildRequestRecord("/partners/embed-token", {
          method: "POST",
          body: JSON.stringify({ partnerUserId: body.partnerUserId, theme }),
        }),
        buildRequestRecord(`/partners/get-partner-user-wallets?partnerUserId=${body.partnerUserId}`),
      ],
    };

    return NextResponse.json(
      {
        data: {
          token: tokenResp.data.token,
          walletHash,
          widgetUrl,
          wallets: walletsResp.data.wallets,
        },
      },
      { headers: { "x-fasset-meta": JSON.stringify(meta) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = error instanceof FassetRequestError ? error.statusCode : 500;
    return NextResponse.json({ message }, { status: statusCode });
  }
}
