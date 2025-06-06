// src/app/manager/protected/layout.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link'
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { LogOut, TrendingUp, Package, Users, ShoppingBag, Archive, UserCog, ListOrdered, Warehouse, Menu, X, Database, Target } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface ManagerLayoutProps {
  children: React.ReactNode;
}

export default function ManagerLayout({ children }: ManagerLayoutProps) {
  const { user, logout, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isUserLoading && (!user || user.role !== 'manager')) {
      logout();
      router.push('/manager/login');
    }
  }, [user, isUserLoading, router, logout]);

  // Close sidebar when navigating to a new page
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);


  if (isUserLoading || !user || user.role !== 'manager') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="mt-4">Loading user data...</p>
      </main>
    );
  }

  // Function to determine the page title based on the current path
  const getPageTitle = (path: string): string => {
    if (path.endsWith('/dashboard')) return 'Dashboard';
    if (path.endsWith('/sales-log')) return 'Sales Log';
    if (path.endsWith('/returns-log')) return 'Returns Log';
    if (path.endsWith('/staff-performance')) return 'Staff Performance';
    if (path.endsWith('/item-performance')) return 'Item Performance';
    if (path.endsWith('/target-incentive')) return 'Targets & Incentives';
    if (path.endsWith('/stock')) return 'Stock Status';
    if (path.endsWith('/products')) return 'Product Management';
    if (path.endsWith('/staff')) return 'Staff Management';
    if (path.endsWith('/data-updation')) return 'Data Updation';
    return 'Manager Area';
  };

  // Function to determine if a link is active
  const isActive = (path: string) => pathname === path;


  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Navigation */}
      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-col border-r bg-background transition-transform ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } sm:translate-x-0 sm:flex`}>
        <nav className="flex flex-col gap-2 px-2 py-4 items-start overflow-y-auto">
          <Link href="/manager/protected/dashboard" className="flex items-center gap-2 px-3 py-2 text-lg font-semibold text-primary mb-4">
            <Package className="h-6 w-6" /> Inventory Manager CRM
          </Link>
          <Link
            href="/manager/protected/dashboard"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
              isActive('/manager/protected/dashboard') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Dashboard
          </Link>
          <Link
            href="/manager/protected/sales-log"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
               isActive('/manager/protected/sales-log') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <ShoppingBag className="h-4 w-4" /> Sales Log
          </Link>
          <Link
             href="/manager/protected/returns-log"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/manager/protected/returns-log') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
           >
             <Archive className="h-4 w-4" /> Returns Log
           </Link>
           <Link
              href="/manager/protected/staff-performance"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/manager/protected/staff-performance') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <Users className="h-4 w-4" /> Staff Performance
           </Link>
           <Link
              href="/manager/protected/item-performance"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/manager/protected/item-performance') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <ListOrdered className="h-4 w-4" /> Item Performance
           </Link>
           <Link
              href="/manager/protected/target-incentive"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/manager/protected/target-incentive') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <Target  className="h-4 w-4" /> Target & Incentive
           </Link>
           <Link
              href="/manager/protected/stock"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/manager/protected/stock') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
          >
              <Warehouse className="h-4 w-4" /> Stock Status
          </Link>
          <Link
             href="/manager/protected/products"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/manager/protected/products') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
          >
             <Package className="h-4 w-4" /> Product Management
          </Link>
          <Link
             href="/manager/protected/staff"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/manager/protected/staff') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
          >
             <UserCog className="h-4 w-4" /> Staff Management
          </Link>
          <Link
             href="/manager/protected/data-updation"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/manager/protected/data-updation') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
          >
             <Database className="h-4 w-4" /> Data Updation
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 sm:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 justify-between">
           <Button
             variant="ghost"
             size="icon"
             className="sm:hidden"
             onClick={() => setIsSidebarOpen(!isSidebarOpen)}
           >
             {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
             <span className="sr-only">Toggle Menu</span>
           </Button>
           <h1 className="text-xl sm:text-2xl font-semibold">{getPageTitle(pathname)}</h1>
           <div className="flex items-center gap-4">
             <span className="text-sm text-muted-foreground hidden md:inline">Welcome, {user.name}!</span>
             <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/'); }}>
               <LogOut className="mr-1 h-4 w-4" /> Logout
             </Button>
           </div>
         </header>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
        )}

        {/* Page Content */}
        <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}