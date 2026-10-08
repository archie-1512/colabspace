export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*", "/board/:path*"],
};
