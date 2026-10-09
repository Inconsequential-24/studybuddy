// Local development without Clerk (AUTH_DRIVER=local): every request acts as one
// fixed user. Never allowed in production; the server binds to localhost only.
export const LOCAL_USER_ID = "local-user";

export const isLocalAuth = () => process.env.AUTH_DRIVER === "local";

export function assertLocalAuthAllowed() {
  if (isLocalAuth() && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_DRIVER=local disables sign-in and cannot be used with NODE_ENV=production.");
  }
}
