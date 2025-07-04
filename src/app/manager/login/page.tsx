// src/app/manager/login/page.tsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Loader2, ShieldCheck } from "lucide-react";
import { useUser } from '@/context/UserContext';

export default function ManagerLoginPage() {
  const [managerId, setManagerId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { login: loginUser } = useUser();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/manager-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed.');
      }

      loginUser(data.user);
      sonnerToast.success(data.message || 'Login successful!');
      router.push('/manager/protected/dashboard'); // Redirect to manager dashboard

    } catch (err: any) {
      setError(err.message);
      sonnerToast.error(err.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 bg-slate-100">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <ShieldCheck className="h-7 w-7 text-green-600" /> Manager Login
          </CardTitle>
          <CardDescription className="text-center">
            Access the management dashboard.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="managerId">Manager ID</Label>
              <Input
                id="managerId"
                type="text"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                placeholder="e.g., Manager1"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </CardContent>
          <CardFooter className="pt-4">
           <Button variant="secondary" className="w-full" onClick={() => router.push('/')}>
           Back
           </Button>
        </CardFooter>
        </form>
      </Card>
    </main>
  );
}