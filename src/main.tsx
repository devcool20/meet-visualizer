import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import App from "./app/App";
import DocsPage from "./app/DocsPage";
import HelpPage from "./app/HelpPage";
import { AuthProvider, ProtectedRoute } from "./app/auth/AuthContext";
import SignUpPage from "./app/auth/SignUpPage";
import { MotionProvider } from "./app/motion";
import "./styles/index.css";

const WelcomePage = lazy(() => import("./app/onboarding/WelcomePage"));
const RehearsePage = lazy(() => import("./app/onboarding/RehearsePage"));
const NotionInterstitialPage = lazy(() => import("./app/onboarding/NotionInterstitialPage"));
const MeetStepPage = lazy(() => import("./app/onboarding/MeetStepPage"));
const InstallExtensionPage = lazy(() => import("./app/onboarding/InstallExtensionPage"));
const DataSetupPage = lazy(() => import("./app/onboarding/DataSetupPage"));
const MeetAddonApp = lazy(() => import("./app/meet-addon/MeetAddonApp"));
const StudioPage = lazy(() => import("./app/studio/StudioPage"));
const VirtualCamDashboard = lazy(() =>
  import("./app/virtualcam/VirtualCamDashboard").then((m) => ({ default: m.VirtualCamDashboard })),
);

const DashboardShell = lazy(() =>
  import("./app/dashboard/DashboardShell").then((m) => ({ default: m.DashboardShell })),
);
const CardsLibraryPage = lazy(() => import("./app/dashboard/CardsLibraryPage"));
const CardEditorPage = lazy(() => import("./app/dashboard/CardEditorPage"));
const ReviewDraftsPage = lazy(() => import("./app/dashboard/ReviewDraftsPage"));
const IntegrationsPage = lazy(() => import("./app/dashboard/IntegrationsPage"));
const SettingsPage = lazy(() => import("./app/dashboard/SettingsPage"));
const ActivityPage = lazy(() => import("./app/dashboard/ActivityPage"));
const AccountPage = lazy(() => import("./app/dashboard/AccountPage"));

/**
 * Route-level fallback. Matches the brand canvas so navigating between lazy
 * routes never flashes white or collapses to a bare "Loading…" string.
 */
function RouteFallback() {
  return (
    <div
     className="flex min-h-screen w-full items-center justify-center bg-background"
      role="status"
      aria-label="Loading"
    >
      <span className="eyebrow flex items-center gap-2.5">
        <span className="relative flex size-1.5">
          <span
           className="absolute inset-0 rounded-full bg-brand"
            style={{ animation: "pulse-ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite" }}
          />
          <span className="relative size-1.5 rounded-full bg-brand" />
        </span>
        Loading
      </span>
    </div>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<RouteFallback />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </ProtectedRoute>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <MotionProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/meet-addon" element={<Page><MeetAddonApp /></Page>} />
          <Route path="/meet-app" element={<Page><MeetAddonApp /></Page>} />
          <Route path="/studio" element={<Page><StudioPage /></Page>} />
          <Route path="/virtualcam" element={<Page><VirtualCamDashboard /></Page>} />

          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <Page><WelcomePage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rehearse"
            element={
              <ProtectedRoute>
                <Page><RehearsePage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notion-connect"
            element={
              <ProtectedRoute>
                <Page><NotionInterstitialPage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/meet"
            element={
              <ProtectedRoute>
                <Page><MeetStepPage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup/extension"
            element={
              <ProtectedRoute>
                <Page><InstallExtensionPage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup/install"
            element={
              <ProtectedRoute>
                <Page><InstallExtensionPage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup/data"
            element={
              <ProtectedRoute>
                <Page><DataSetupPage /></Page>
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup/data-setup"
            element={
              <ProtectedRoute>
                <Page><DataSetupPage /></Page>
              </ProtectedRoute>
            }
          />

          <Route path="/dashboard" element={<DashboardLayout><CardsLibraryPage /></DashboardLayout>} />
          <Route path="/dashboard/cards" element={<DashboardLayout><CardsLibraryPage /></DashboardLayout>} />
          <Route path="/dashboard/cards/:id" element={<DashboardLayout><CardEditorPage /></DashboardLayout>} />
          <Route path="/dashboard/review" element={<DashboardLayout><ReviewDraftsPage /></DashboardLayout>} />
          <Route path="/dashboard/integrations" element={<DashboardLayout><IntegrationsPage /></DashboardLayout>} />
          <Route path="/dashboard/settings" element={<DashboardLayout><SettingsPage /></DashboardLayout>} />
          <Route path="/dashboard/activity" element={<DashboardLayout><ActivityPage /></DashboardLayout>} />
          <Route path="/dashboard/account" element={<DashboardLayout><AccountPage /></DashboardLayout>} />
        </Routes>
      </MotionProvider>
    </AuthProvider>
  </BrowserRouter>,
);
