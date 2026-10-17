import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSnapchatToken } from "@/lib/meta-token";
import { exchangeSnapchatCode, listSnapchatOrganizationProfiles } from "@/lib/snapchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "snapchat_oauth_state";

function settingsRedirect(request: Request, result: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("snapchat", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/snapchat/callback",
    maxAge: 0,
  });
  return response;
}

function stateMatches(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = (await cookies()).get(STATE_COOKIE)?.value;
  if (!stateMatches(stateCookie, url.searchParams.get("state"))) {
    return settingsRedirect(request, "invalid-state");
  }
  if (url.searchParams.has("error") || !url.searchParams.get("code")) {
    return settingsRedirect(request, "denied");
  }

  const code = url.searchParams.get("code");
  if (!code) return settingsRedirect(request, "denied");

  try {
    const tokens = await exchangeSnapchatCode(code);
    let profileId = process.env.SNAPCHAT_PUBLIC_PROFILE_ID?.trim() ?? "";
    let profileName = "";
    if (!profileId) {
      try {
        const profiles = await listSnapchatOrganizationProfiles(tokens.accessToken);
        const availableProfiles = profiles.flatMap((entry) => {
          const profile = entry.public_profile;
          return entry.sub_request_status === "SUCCESS" && profile?.id
            ? [{ id: profile.id, name: profile.display_name ?? "" }]
            : [];
        });
        if (availableProfiles.length === 1) {
          profileId = availableProfiles[0].id;
          profileName = availableProfiles[0].name;
        }
      } catch {
        // OAuth can still be stored; the profile ID can be entered in Settings.
      }
    }
    await prisma.settings.upsert({
      where: { id: "store" },
      create: {
        id: "store",
        snapchatOrganizationId: process.env.SNAPCHAT_ORGANIZATION_ID?.trim() ?? "",
        snapchatProfileId: profileId,
        snapchatProfileName: profileName,
        snapchatAccessToken: encryptSnapchatToken(tokens.accessToken),
        snapchatRefreshToken: encryptSnapchatToken(tokens.refreshToken),
        snapchatTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        snapchatToken: "",
      },
      update: {
        snapchatOrganizationId: process.env.SNAPCHAT_ORGANIZATION_ID?.trim() ?? "",
        ...(profileId ? { snapchatProfileId: profileId, snapchatProfileName: profileName } : {}),
        snapchatAccessToken: encryptSnapchatToken(tokens.accessToken),
        snapchatRefreshToken: encryptSnapchatToken(tokens.refreshToken),
        snapchatTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        snapchatToken: "",
      },
    });
    return settingsRedirect(request, profileId ? "connected" : "connected-profile-required");
  } catch (error) {
    console.error("Snapchat OAuth callback failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return settingsRedirect(request, "error");
  }
}
