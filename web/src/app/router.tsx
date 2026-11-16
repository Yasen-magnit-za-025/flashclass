import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AuthCallbackPage } from "@/features/auth/AuthCallbackPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { HomePage } from "@/features/library/HomePage";
import { LibraryPage } from "@/features/library/LibraryPage";
import { MaterialPage } from "@/features/library/MaterialPage";
import { SavedPage } from "@/features/library/SavedPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { AttemptResultPage } from "@/features/quizzes/AttemptResultPage";
import { ProgressPage } from "@/features/quizzes/ProgressPage";
import { TakeQuizPage } from "@/features/quizzes/TakeQuizPage";
import { NotFoundPage, PrivacyPage, RouteErrorPage } from "./StaticPages";
import { RedirectIfSignedIn, RequireAuth, RequireRole } from "./guards";
import { Layout } from "./Layout";

// Teacher and admin areas are split into separate chunks.
const lazyEditor = async () => ({ Component: (await import("@/features/materials/EditorPage")).EditorPage });

const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "privacy", element: <PrivacyPage /> },
      { path: "auth/sign-in", element: <RedirectIfSignedIn><SignInPage /></RedirectIfSignedIn> },
      { path: "auth/sign-up", element: <RedirectIfSignedIn><SignUpPage /></RedirectIfSignedIn> },
      { path: "auth/forgot", element: <ForgotPasswordPage /> },
      { path: "auth/reset", element: <ResetPasswordPage /> },
      { path: "auth/callback", element: <AuthCallbackPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "library", element: <LibraryPage /> },
          { path: "saved", element: <SavedPage /> },
          { path: "m/:id", element: <MaterialPage /> },
          { path: "m/:id/take", element: <TakeQuizPage /> },
          { path: "attempts/:id", element: <AttemptResultPage /> },
          { path: "progress", element: <ProgressPage /> },
          { path: "profile", element: <ProfilePage /> },
          {
            path: "teach",
            element: <RequireRole role="teacher" />,
            children: [
              { index: true, lazy: async () => ({ Component: (await import("@/features/materials/MyMaterialsPage")).MyMaterialsPage }) },
              { path: "new/:kind", lazy: lazyEditor },
              { path: ":id", lazy: lazyEditor },
            ],
          },
          {
            path: "admin",
            element: <RequireRole role="admin" />,
            children: [{ index: true, lazy: async () => ({ Component: (await import("@/features/admin/AdminPage")).AdminPage }) }],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
