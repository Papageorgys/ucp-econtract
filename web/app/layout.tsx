import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "e-Contract",
  description: "White-label e-contract onboarding — prototype frontend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <header className="top">
          <div className="in">
            <Link href="/" className="brand">
              <i aria-hidden="true" />
              e-Contract
            </Link>
            <span className="sp" />
            <Link href="/agent" className="small muted">
              Agent console
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
