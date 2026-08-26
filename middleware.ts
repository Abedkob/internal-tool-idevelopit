import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const isLogin = request.nextUrl.pathname === "/login";

  if (!hasSupabaseConfig()) {
    if (!isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-idv-auth-user");
  requestHeaders.delete("x-idv-auth-email");
  const refreshedCookies: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const { url, anonKey } = getSupabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        requestHeaders.set("cookie", request.cookies.toString());
        refreshedCookies.push(...cookiesToSet);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const authenticated = Boolean(claims?.sub);
  if (claims?.sub) {
    requestHeaders.set("x-idv-auth-user", claims.sub);
    if (typeof claims.email === "string")
      requestHeaders.set("x-idv-auth-email", claims.email);
  }
  function withRefreshedCookies(response: NextResponse) {
    refreshedCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    return response;
  }
  if (!authenticated && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withRefreshedCookies(NextResponse.redirect(url));
  }
  if (authenticated && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return withRefreshedCookies(NextResponse.redirect(url));
  }
  return withRefreshedCookies(
    NextResponse.next({ request: { headers: requestHeaders } }),
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
