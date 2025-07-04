"use client";

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  LogOut, TrendingUp, Package, Users, ShoppingBag, Archive, UserCog, 
  ListOrdered, Warehouse, Menu, X, Database, Target 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge'; // Using a badge for the "Demo Mode" indicator

interface ManagerLayoutProps {
  children: React.ReactNode;
}

export default function ManagerDemoLayout({ children }: ManagerLayoutProps) {
  const router = useRouter(); // Keep for the "Exit Demo" button
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on navigation (good for mobile UX)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  // Function to determine the page title based on the current path
  const getPageTitle = (path: string): string => {
    if (path.endsWith('/dashboard')) return 'Dashboard';
    if (path.endsWith('/sales-log')) return 'Sales Log';
    if (path.endsWith('/returns-log')) return 'Returns Log';
    if (path.endsWith('/staff-performance')) return 'Staff Performance';
    if (path.endsWith('/item-performance')) return 'Item Performance';
    if (path.endsWith('/target-incentives')) return 'Targets & Incentives';
    if (path.endsWith('/stock')) return 'Stock Status';
    if (path.endsWith('/products')) return 'Product Management';
    return 'Manager Demo';
  };

  // Function to determine if a link is active
  const isActive = (path: string) => pathname === path;

  // --- All user checking and loading logic has been removed ---

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-col border-r bg-background transition-transform ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } sm:translate-x-0 sm:flex`}>
        <nav className="flex flex-col gap-2 px-2 py-4 items-start overflow-y-auto">
          {/* MODIFIED: Link points back to the recruiter portal */}
          <Link href="/recruiter/portal" className="flex items-center gap-2 px-3 py-2 text-lg font-semibold text-primary mb-4">
            <Package className="h-6 w-6" /> Inventory Manager CRM
          </Link>
          {/* IMPORTANT: All links are updated to the /recruiter/manager-demo/ path */}
          <Link
            href="/recruiter/manager-demo/dashboard"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
              isActive('/recruiter/manager-demo/dashboard') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Dashboard
          </Link>
          <Link
            href="/recruiter/manager-demo/sales-log"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
               isActive('/recruiter/manager-demo/sales-log') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <ShoppingBag className="h-4 w-4" /> Sales Log
          </Link>
          <Link
             href="/recruiter/manager-demo/returns-log"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/recruiter/manager-demo/returns-log') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
           >
             <Archive className="h-4 w-4" /> Returns Log
           </Link>
           <Link
              href="/recruiter/manager-demo/staff-performance"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/recruiter/manager-demo/staff-performance') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <Users className="h-4 w-4" /> Staff Performance
           </Link>
           <Link
              href="/recruiter/manager-demo/item-performance"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/recruiter/manager-demo/item-performance') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <ListOrdered className="h-4 w-4" /> Item Performance
           </Link>
           <Link
              href="/recruiter/manager-demo/target-incentive"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/recruiter/manager-demo/target-incentives') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
           >
             <Target  className="h-4 w-4" /> Target & Incentive
           </Link>
           <Link
              href="/recruiter/manager-demo/stock"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                 isActive('/recruiter/manager-demo/stock') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
              }`}
          >
              <Warehouse className="h-4 w-4" /> Stock Status
          </Link>
          <Link
             href="/recruiter/manager-demo/products"
             className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive('/recruiter/manager-demo/products') ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-primary'
             }`}
          >
             <Package className="h-4 w-4" /> Product Management
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 sm:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 justify-between">
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
             {/* MODIFIED: Replaced user name with a "Demo Mode" badge */}
             <Badge variant="outline" className="border-yellow-500 text-yellow-600">Demo Mode</Badge>
             {/* MODIFIED: Button now exits to the recruiter portal */}
             <Button variant="ghost" size="sm" onClick={() => router.push('/recruiter/portal')}>
               <LogOut className="mr-1 h-4 w-4" /> Exit Demo
             </Button>
           </div>
         </header>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 sm:hidden"
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