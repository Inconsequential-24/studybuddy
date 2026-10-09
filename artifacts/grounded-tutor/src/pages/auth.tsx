import { SignIn, SignUp } from '@clerk/react';
import { Link } from 'wouter';
import { Logo } from '@/components/shell';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Link href="/" aria-label="StudyBuddy home"><Logo /></Link>
      {children}
    </div>
  );
}
export function SignInPage() {
  return <Frame><SignIn routing="path" path={basePath + '/sign-in'} signUpUrl={basePath + '/sign-up'} /></Frame>;
}
export function SignUpPage() {
  return <Frame><SignUp routing="path" path={basePath + '/sign-up'} signInUrl={basePath + '/sign-in'} /></Frame>;
}
