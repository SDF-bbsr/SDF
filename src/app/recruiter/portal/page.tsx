// src/app/recruiter/portal/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, ScanLine, ArrowRight, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RecruiterPortalPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 sm:p-8">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 sm:text-4xl">Project Showcase</h1>
        <p className="mt-4 text-lg text-slate-600">
          Thank you for viewing my project. Below are the two primary user-facing sections of the application. Both are presented in a read-only demo mode.
        </p>
      </div>

      <div className="mt-12 grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
        {/* Manager Dashboard Card */}
        <Link href="/recruiter/manager-demo/dashboard" className="group">
          <Card className="h-full transform transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">Manager Dashboard</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base">
                Explore the analytics dashboard, including sales trends, staff performance, and AI-powered sales insights. Functionality is limited to viewing.
              </CardDescription>
            </CardContent>
            <div className="px-6 pb-6 mt-4">
              <div className="text-blue-600 font-semibold flex items-center group-hover:underline">
                View Dashboard
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Card>
        </Link>

        {/* Vendor POS Card */}
        <Link href="/recruiter/vendor-demo/scan" className="group">
          <Card className="h-full transform transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <CardHeader>
               <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                  <ScanLine className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">Vendor Point-of-Sale</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base">
                See the daily workflow of a vendor using the point-of-sale interface for scanning items and completing transactions. Functionality is limited to viewing.
              </CardDescription>
            </CardContent>
             <div className="px-6 pb-6 mt-4">
              <div className="text-green-600 font-semibold flex items-center group-hover:underline">
                View POS Interface
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Card>
        </Link>
      </div>
      <div className="mt-12">
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
    </div>
  );
}