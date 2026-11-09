import { auth } from "@/auth";

/** Every page needs a session; signed-out visitors go to /signin. */
export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/signin") {
    const url = new URL("/signin", req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = {
  // Not for NextAuth's own routes, the token route (it answers 401 itself), or static files.
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
