import { NextResponse, type NextRequest } from "next/server";
import { DRIVER_COOKIE, DRIVER_COOKIE_MAX_AGE, whoami } from "@/lib/driver-session";

/**
 * Opened from the link the owner sends on WhatsApp. Saves the driver's secret
 * in a cookie on this phone, then opens the driver app.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/driver/start/[token]">) {
  const { token } = await ctx.params;
  const target = request.nextUrl.clone();
  target.search = "";

  const me = token.length >= 32 ? await whoami(token).catch(() => null) : null;
  if (!me) {
    target.pathname = "/d";
    target.searchParams.set("invalid", "1");
    return NextResponse.redirect(target);
  }

  target.pathname = "/d";
  const res = NextResponse.redirect(target);
  res.cookies.set(DRIVER_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: DRIVER_COOKIE_MAX_AGE,
  });
  return res;
}
