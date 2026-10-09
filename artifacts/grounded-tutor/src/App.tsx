import { useEffect, useRef, type ComponentType } from 'react';
import { ClerkProvider, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetProfile } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DisplaySettingsProvider } from '@/lib/a11y';
import { LoadingBlock } from '@/components/bits';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import { SignInPage, SignUpPage } from '@/pages/auth';
import Onboarding from '@/pages/onboarding';
import Settings from '@/pages/settings';
import Classrooms from '@/pages/classrooms';
import ClassroomNew from '@/pages/classroom-new';
import Overview from '@/pages/classroom-overview';
import Teach from '@/pages/teach';
import Practice from '@/pages/practice';
import Exam from '@/pages/exam';
import Dashboard from '@/pages/dashboard';
import { isConnectionError, retryReadRequest } from '@/lib/connection';
import { LOCAL_AUTH, SignedIn, SignedOut } from '@/lib/auth';

const queryClient = new QueryClient({ defaultOptions: {
  queries: {
    retry: retryReadRequest,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    refetchOnWindowFocus: (query) => isConnectionError(query.state.error),
  },
  mutations: { retry: false },
} });

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey && !LOCAL_AUTH) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: window.location.origin + basePath + '/logo.svg' },
  variables: {
    colorPrimary: '#0d4450', colorForeground: '#10222a', colorMutedForeground: '#3f545c', colorDanger: '#a3321f',
    colorBackground: '#fdfaf3', colorInput: '#ffffff', colorInputForeground: '#10222a', colorNeutral: '#10222a',
    fontFamily: "'Atkinson Hyperlegible', system-ui, sans-serif", borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fdfaf3] border border-[#d9d1bd] rounded-xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#10222a] font-semibold',
    headerSubtitle: 'text-[#3f545c]',
    socialButtonsBlockButtonText: 'text-[#10222a] font-semibold',
    formFieldLabel: 'text-[#10222a] font-semibold',
    footerActionLink: 'text-[#0d4450] font-semibold underline',
    footerActionText: 'text-[#3f545c]',
    dividerText: 'text-[#3f545c]',
    identityPreviewEditButton: 'text-[#0d4450]',
    formFieldSuccessText: 'text-[#0d4450]',
    alertText: 'text-[#a3321f]',
    formButtonPrimary: 'bg-[#0d4450] hover:bg-[#093540] text-white',
    formFieldInput: 'border-[#5c6f77]',
    socialButtonsBlockButton: 'border-[#5c6f77]',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== uid) qc.clear();
      prev.current = uid;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

function HomeRedirect() {
  return (
    <>
      <SignedIn><Redirect to="/classrooms" /></SignedIn>
      <SignedOut><Landing /></SignedOut>
    </>
  );
}

function ProfileGate({ children }: { children: React.ReactNode }) {
  const q = useGetProfile();
  if (q.isLoading) return <div className="mx-auto max-w-3xl p-8"><LoadingBlock rows={3} label="Loading your profile" /></div>;
  const missing = (q.error as { status?: number } | null)?.status === 404;
  if (missing || (q.data && !q.data.completed)) return <Redirect to="/onboarding" />;
  return <>{children}</>;
}

function protectedRoute(Page: ComponentType, needsProfile = true) {
  return function Protected() {
    return (
      <>
        <SignedIn>{needsProfile ? <ProfileGate><Page /></ProfileGate> : <Page />}</SignedIn>
        <SignedOut><Redirect to="/" /></SignedOut>
      </>
    );
  };
}

const POnboarding = protectedRoute(Onboarding, false);
const PSettings = protectedRoute(Settings, false);
const PClassrooms = protectedRoute(Classrooms);
const PNew = protectedRoute(ClassroomNew, false);
const POverview = protectedRoute(Overview);
const PTeach = protectedRoute(Teach);
const PPractice = protectedRoute(Practice);
const PExam = protectedRoute(Exam);
const PDash = protectedRoute(Dashboard);

function AppRoutes() {
  const [location] = useLocation();
  return (
    <QueryClientProvider client={queryClient}>
      {!LOCAL_AUTH && <ClerkQueryClientCacheInvalidator />}
      <ErrorBoundary resetKey={location}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={LOCAL_AUTH ? ToClassrooms : SignInPage} />
          <Route path="/sign-up/*?" component={LOCAL_AUTH ? ToClassrooms : SignUpPage} />
          <Route path="/onboarding" component={POnboarding} />
          <Route path="/settings" component={PSettings} />
          <Route path="/classrooms" component={PClassrooms} />
          <Route path="/classrooms/new" component={PNew} />
          <Route path="/classrooms/:id" component={POverview} />
          <Route path="/classrooms/:id/teach" component={PTeach} />
          <Route path="/classrooms/:id/practice" component={PPractice} />
          <Route path="/classrooms/:id/exam" component={PExam} />
          <Route path="/classrooms/:id/dashboard" component={PDash} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

function ToClassrooms() {
  return <Redirect to="/classrooms" />;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  if (LOCAL_AUTH) return <AppRoutes />;
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={basePath + '/sign-in'}
      signUpUrl={basePath + '/sign-up'}
      localization={{
        signIn: { start: { title: 'Sign in to StudyBuddy', subtitle: 'Sign in to pick up your studying' } },
        signUp: { start: { title: 'Create your StudyBuddy account', subtitle: 'Your PDFs, your tutor' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <AppRoutes />
    </ClerkProvider>
  );
}

function App() {
  return (
    <DisplaySettingsProvider>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </DisplaySettingsProvider>
  );
}

export default App;
