import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/youtube/callback" ||
    pathname === "/api/auth/tiktok/callback" ||
    request.headers.has("next-action")
  ) {
    return NextResponse.next();
  }

  const authenticated = isValidAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );

  if (authenticated) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (pathname === "/login") return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "يلزم تسجيل الدخول." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*).*)"],
};
