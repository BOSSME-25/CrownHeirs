import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdmin, isAllowed } from "@/lib/access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Only allowlisted staff may sign in at all.
    signIn({ user, profile }) {
      const email = profile?.email ?? user?.email;
      return isAllowed(email);
    },
    // Expose an `isAdmin` flag on the session for the UI.
    session({ session }) {
      session.user.isAdmin = isAdmin(session.user?.email);
      return session;
    },
    // Used by middleware to gate every protected route.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
