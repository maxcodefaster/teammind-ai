import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If user is not logged in and trying to access protected routes
  if (
    !session &&
    (req.nextUrl.pathname.startsWith("/chat") ||
      req.nextUrl.pathname.startsWith("/connect"))
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // If user is logged in
  if (session) {
    // Allow API routes to pass through
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return res;
    }

    // Check if user is trying to access chat page
    if (req.nextUrl.pathname.startsWith("/chat")) {
      // Check if user has Atlassian config
      const { data: configData, error: configError } = await supabase
        .from("atlassian_config")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      // If no config or no space key selected, redirect to connect page
      if (!configData || !configData.space_key) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/connect";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
