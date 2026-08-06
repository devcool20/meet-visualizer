
  import { lazy, Suspense } from "react";
  import { createRoot } from "react-dom/client";
  import { BrowserRouter, Routes, Route } from "react-router";
  import App from "./app/App";
  import DocsPage from "./app/DocsPage";
  import HelpPage from "./app/HelpPage";
  import { AuthProvider, ProtectedRoute } from "./app/auth/AuthContext";
  import SignUpPage from "./app/auth/SignUpPage";
  import "./styles/index.css";

  const WelcomePage = lazy(() => import("./app/onboarding/WelcomePage"));
  const RehearsePage = lazy(() => import("./app/onboarding/RehearsePage"));
  const NotionInterstitialPage = lazy(() => import("./app/onboarding/NotionInterstitialPage"));
  const MeetStepPage = lazy(() => import("./app/onboarding/MeetStepPage"));

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

  function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute>
        <Suspense fallback={null}>
          <DashboardShell>{children}</DashboardShell>
        </Suspense>
      </ProtectedRoute>
    );
  }

  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <WelcomePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rehearse"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <RehearsePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notion-connect"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <NotionInterstitialPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/meet"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <MeetStepPage />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <CardsLibraryPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/cards"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <CardsLibraryPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/cards/:id"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <CardEditorPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/review"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <ReviewDraftsPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/integrations"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <IntegrationsPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/settings"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <SettingsPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/activity"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <ActivityPage />
                </Suspense>
              </DashboardLayout>
            }
          />
          <Route
            path="/dashboard/account"
            element={
              <DashboardLayout>
                <Suspense fallback={null}>
                  <AccountPage />
                </Suspense>
              </DashboardLayout>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>,
  );
