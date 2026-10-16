import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getTikTokCreatorInfo } from "@/lib/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const creator = await getTikTokCreatorInfo();
    return NextResponse.json(creator, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load TikTok creator information.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load TikTok creator information." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
