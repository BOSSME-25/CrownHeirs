export { auth as middleware } from "@/auth";

// Protect everything except the auth endpoints, the login page,
// Next.js internals, and static assets.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|logo).*)"],
};
