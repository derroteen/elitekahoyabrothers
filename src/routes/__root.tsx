import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground font-serif">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium">Home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Elite Kahoya Brothers – Savings and Loans Chama" },
      { name: "description", content: "Elite Kahoya Brothers is a savings and loans chama providing member savings tracking, loan management, passbooks, reports, and financial records." },
      { name: "keywords", content: "Elite Kahoya Brothers, Chama, Savings Group, Loans, Kenya, Passbook, Member Portal, Financial Management" },
      { name: "author", content: "Elite Kahoya Brothers" },
      { name: "robots", content: "index, follow" },
      { property: "og:site_name", content: "Elite Kahoya Brothers" },
      { property: "og:title", content: "Elite Kahoya Brothers – Savings and Loans Chama" },
      { property: "og:description", content: "Member savings tracking, loan management, passbooks, reports, and financial records for the Elite Kahoya Brothers chama." },
      { property: "og:url", content: "https://www.elitekahoyabrothers.com/" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5fe96aae-99c3-4404-a81b-d6a4116e3714" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Elite Kahoya Brothers – Savings and Loans Chama" },
      { name: "twitter:description", content: "Member savings tracking, loan management, passbooks, reports, and financial records for the Elite Kahoya Brothers chama." },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5fe96aae-99c3-4404-a81b-d6a4116e3714" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght700;900&family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/icon-192x192.svg" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Elite Kahoya Brothers",
          alternateName: "EKB Chama",
          url: "https://www.elitekahoyabrothers.com",
          logo: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5fe96aae-99c3-4404-a81b-d6a4116e3714",
          description: "Elite Kahoya Brothers is a savings and loans chama providing member savings tracking, loan management, passbooks, reports, and financial records.",
          areaServed: "KE",
          keywords: "Chama, Savings Group, Loans, Kenya, Passbook, Member Portal, Financial Management",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Domain fallback logic
    const checkAndRedirect = async () => {
      if (window.location.hostname === "elitekahoyabrothers.com") {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch(window.location.origin, { method: "HEAD", signal: controller.signal });
          clearTimeout(timeoutId);
        } catch (error) {
          // If request fails, redirect to fallback domain
          window.location.href = "https://elitekahoyabrothers.lovable.app" + window.location.pathname + window.location.search;
        }
      }
    };
    checkAndRedirect();

    // PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Service worker registration (if available)
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((registrationError) => {
          console.error("SW registration failed:", registrationError);
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isInstallable && (
          <div className="fixed bottom-4 right-4 z-50">
            <Button onClick={handleInstall} className="bg-navy text-white hover:bg-navy-2">
              Install App
            </Button>
          </div>
        )}
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
