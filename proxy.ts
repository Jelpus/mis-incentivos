import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/mi-cuenta/:path*",
    "/perfil/:path*",
    "/api/admin/:path*",
    "/api/profile/:path*",
  ],
};
