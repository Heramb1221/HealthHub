import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route guard (Next 16 `proxy`, formerly middleware).
 *
 * This only checks that a session cookie EXISTS so signed-out visitors are redirected quickly.
 * It is NOT authorization: the API enforces auth and roles on every request (AGENTS.md), and
 * pages must handle 401/403 from the API themselves. Admin role checks happen in the admin layout
 * by asking the API, never by trusting anything stored on the client.
 *
 * Demo mode has no server session, so the guard is skipped and screens read the demo session instead.
 */
const SESSION_COOKIE = process.env.AUTH_COOKIE_NAME ?? "hh_session";
const DEMO = process.env.NEXT_PUBLIC_API_MODE !== "live";

export function proxy(request: NextRequest) {
  if (DEMO) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

/** Protected areas only. Public pages (/, /sign-in, /sign-up, /hospitals preview if made public) are excluded. */
export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/prescriptions/:path*", "/medications/:path*", "/history/:path*", "/health-card/:path*", "/appointments/:path*", "/admin/:path*"],
};
