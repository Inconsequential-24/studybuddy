import type { ReactNode } from 'react';
import { Show, useClerk } from '@clerk/react';

// VITE_AUTH_DRIVER=local runs without Clerk as a single always-signed-in local user
// (paired with AUTH_DRIVER=local on the API). Unset keeps Clerk.
export const LOCAL_AUTH = import.meta.env.VITE_AUTH_DRIVER === 'local';

export function SignedIn({ children }: { children: ReactNode }) {
  return LOCAL_AUTH ? <>{children}</> : <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  return LOCAL_AUTH ? null : <Show when="signed-out">{children}</Show>;
}

// Returns null in local mode, where there is no account to sign out of.
export const useSignOut: () => ((redirectUrl: string) => void) | null = LOCAL_AUTH
  ? () => null
  : () => {
      const { signOut } = useClerk();
      return (redirectUrl) => { void signOut({ redirectUrl }); };
    };
