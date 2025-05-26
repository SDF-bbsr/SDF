// src/app/(vendor)/login/page.tsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { useUser } from '@/context/UserContext'; // Import useUser

export default function VendorLoginPage() {
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { login: loginUser } = useUser(); // Get login function from context

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const trimmedStaffId = staffId.trim(); // Trim whitespace from staffId

    try {
      const response = await fetch('/api/auth/vendor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: trimmedStaffId, password }),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed.');
      }

      // Assuming data.user contains { id, name, role }
      loginUser(data.user); // Update user context
      sonnerToast.success(data.message || 'Login successful!');
      router.push('/vendor/scan'); // Redirect to scan page

    } catch (err: any) {
      setError(err.message);
      sonnerToast.error(err.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main suppressHydrationWarning className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 bg-slate-100">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Vendor Login</CardTitle>
          <CardDescription>
            Enter your Staff ID and password to access the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="staffId">Staff ID</Label>
              <Input
                id="staffId"
                type="text"
                placeholder="Your Staff ID/Name"
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                placeholder="****"
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Login
            </Button>
          </form>
        </CardContent>
        <CardFooter className="grid gap-4">
           <Button variant="secondary" className="w-full" onClick={() => router.push('/')}>
           Back
           </Button>
        </CardFooter>
      </Card>
    </main>
  );
}