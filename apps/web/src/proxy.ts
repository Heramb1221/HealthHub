import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.AUTH_COOKIE_NAME ?? "hh_session";
const DEMO = process.env.NEXT_PUBLIC_API_MODE !== "live";

export function proxy(request: NextRequest) {
  if (DEMO) return NextResponse.next();
  if (request.cookies.has("__session") || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/prescriptions/:path*",
    "/medications/:path*",
    "/history/:path*",
    "/vaccinations/:path*",
    "/family/:path*",
    "/health-card/:path*",
    "/appointments/:path*",
    "/insurance/:path*",
    "/payments/:path*",
    "/symptoms/:path*",
    "/admin/:path*",
  ],

};
