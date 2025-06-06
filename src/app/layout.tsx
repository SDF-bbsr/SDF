// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { UserProvider } from "@/context/UserContext"; // Import UserProvider
import { GoogleAnalytics } from '@next/third-parties/google'

const Store_Name = process.env.STORE_NAME;
const GAID=process.env.GAID;

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: Store_Name,
  description: "Manage dryfruit sales and inventory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <UserProvider> {/* Wrap children with UserProvider */}
          {children}
        </UserProvider>
        <SonnerToaster />
        {GAID && <GoogleAnalytics gaId={GAID} />}
      </body>
    </html>
  );
}