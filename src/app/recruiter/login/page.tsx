// src/app/recruiter/login/page.tsx

"use client";

import { useState, useEffect } from 'react';
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
import { ShieldQuestion, Loader2 } from "lucide-react";

export default function RecruiterLoginPage() {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const generateCaptcha = () => {
    setNum1(Math.floor(Math.random() * 50) + 1);
    setNum2(Math.floor(Math.random() * 50) + 1);
    setAnswer(''); // Clear previous answer
  };

  useEffect(() => {
    generateCaptcha();
  }, []); // Generate captcha on initial load

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate a brief delay for UX
    setTimeout(() => {
      if (parseInt(answer, 10) === num1 + num2) {
        sonnerToast.success("Verification successful! Welcome.");
        router.push('/recruiter/portal');
      } else {
        sonnerToast.error("Incorrect answer. Please try the new puzzle.");
        generateCaptcha(); // Generate a new puzzle on failure
        setIsLoading(false);
      }
    }, 500);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-100">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <ShieldQuestion className="h-7 w-7 text-blue-600" />
            Demo Verification
          </CardTitle>
          <CardDescription>
            To ensure you're human, please solve this simple puzzle.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center space-x-2 p-4 bg-slate-50 rounded-md">
              <Label htmlFor="answer" className="text-lg font-medium">
                What is {num1} + {num2}?
              </Label>
            </div>
            <Input
              id="answer"
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer"
              required
              className="text-center text-lg h-12"
              disabled={isLoading}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Proceed"}
            </Button>
          </CardContent>
          <CardFooter>
            <Button variant="link" className="w-full" onClick={() => router.push('/')}>
              Back to Home
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}