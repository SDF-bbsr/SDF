// src/app/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { User, LogIn } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 bg-primary-foreground">
      <div className="text-center mb-8 text-primary">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Dry Fruit Manager</h1>
        <p className="text-lg">Efficiently manage your dry fruit inventory, orders, and vendors.</p>
      </div>
      <Card className="w-full max-w-sm shadow-lg bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Welcome!</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Please select your role to login.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Link href="/vendor/login" >
            <Button className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90" size="lg">
              <User className="mr-2 h-5 w-5" /> Vendor Login
            </Button>
          </Link>
          <Link href="/manager/login"  >
            <Button className="w-full border border-input bg-background hover:bg-accent hover:text-accent-foreground" variant="outline" size="lg">
              <LogIn className="mr-2 h-5 w-5" /> Manager Login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}