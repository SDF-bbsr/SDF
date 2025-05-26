// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { UserProvider } from "@/context/UserContext"; // Import UserProvider

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Dryfruit Goods Manager",
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
      </body>
    </html>
  );
}