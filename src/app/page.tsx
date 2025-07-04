// src/app/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { User, LogIn, Briefcase } from "lucide-react"; // Import all needed icons

export default function LandingPage() {
  const storeName = process.env.STORE_NAME || "Dry Fruit Manager";

  // Read the environment variable. It will be a string 'true' or 'false'.
  const showRecruiterFlow = process.env.RECRUITER_PAGE === 'true';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 bg-primary-foreground">
      <div className="text-center mb-8 text-primary">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">{storeName}</h1>
        <p className="text-lg">Efficiently manage your dry fruit inventory, orders, and vendors.</p>
      </div>
      <Card className="w-full max-w-sm shadow-lg bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Welcome!</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Please select your role to login.
          </CardDescription>
        </CardHeader>

        {/* --- CONDITIONAL RENDERING LOGIC --- */}
        {showRecruiterFlow ? (
          // **A) Recruiter Flow is ENABLED:** Show the new layout with the "Recruiter" button
          <CardContent className="flex flex-col space-y-4">
            <Link href="/recruiter/login">
              <Button className="w-full" size="lg">
                <Briefcase className="mr-2 h-5 w-5" /> Recruiter / Demo Access
              </Button>
            </Link>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or login as
                </span>
              </div>
            </div>
            
            <Link href="/vendor/login">
              <Button className="w-full" variant="secondary" size="lg">
                <User className="mr-2 h-5 w-5" /> Vendor Login
              </Button>
            </Link>
            <Link href="/manager/login">
              <Button className="w-full" variant="secondary" size="lg">
                <LogIn className="mr-2 h-5 w-5" /> Manager Login
              </Button>
            </Link>
          </CardContent>
        ) : (
          // **B) Recruiter Flow is DISABLED:** Show the original layout
          <CardContent className="flex flex-col space-y-4">
            <Link href="/vendor/login">
              <Button className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90" size="lg">
                <User className="mr-2 h-5 w-5" /> Vendor Login
              </Button>
            </Link>
            <Link href="/manager/login">
              <Button className="w-full border border-input bg-background hover:bg-accent hover:text-accent-foreground" variant="outline" size="lg">
                <LogIn className="mr-2 h-5 w-5" /> Manager Login
              </Button>
            </Link>
          </CardContent>
        )}
        {/* --- END OF CONDITIONAL LOGIC --- */}
      </Card>
    </main>
  );
}