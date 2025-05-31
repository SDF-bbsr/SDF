// src/app/manager/protected/staff/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusCircle, Edit2, Trash2, UserCog, RefreshCcw, Eye, EyeOff } from 'lucide-react'; // Added Eye, EyeOff
import { toast as sonnerToast, Toaster } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'; // Added for potential future wide tables

interface Staff {
  id: string; // This is the staffId (document ID)
  name: string;
  role: 'vendor' | 'manager';
  password?: string; // Password will be fetched for display logic
  createdAt?: any; 
  _isDeleting?: boolean; // For UI state during delete
}

type StaffWithPasswordVisibility = Staff & {
    showPassword?: boolean;
};

const initialStaffFormState: { staffIdForDoc?: string; name: string; role: 'vendor' | 'manager'; password?: string } = {
  staffIdForDoc: '',
  name: '',
  role: 'vendor',
  password: '',
};

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffWithPasswordVisibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState(initialStaffFormState);

  const fetchStaff = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/manager/staff?includePassword=true'); // Request password
      if (!response.ok) throw new Error('Failed to fetch staff');
      const data: Staff[] = await response.json();
      // Initialize showPassword to false for all staff members
      setStaffList(data.map(staff => ({ ...staff, showPassword: false })));
    } catch (err: any) {
      setError(err.message);
      sonnerToast.error("Error fetching staff: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setStaffForm(prev => ({ ...prev, [name]: value }));
  };
  const handleRoleChange = (value: 'vendor' | 'manager') => {
    setStaffForm(prev => ({ ...prev, role: value }));
  };

  const openAddDialog = () => {
    setEditingStaff(null);
    setStaffForm(initialStaffFormState);
    setIsDialogOpen(true);
  };

  const openEditDialog = (staff: Staff) => {
    setEditingStaff(staff);
    setStaffForm({ 
        name: staff.name,
        role: staff.role,
        password: '', // Password field for reset, not displaying old one here
    });
    setIsDialogOpen(true);
  };

  const handleDeleteStaff = async (staff: StaffWithPasswordVisibility) => {
    if (!confirm(`Are you sure you want to delete staff member ${staff.name} (${staff.id})? This action cannot be undone.`)) {
      return;
    }
    // Optimistic UI update
    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, _isDeleting: true } : s));

    try {
      const response = await fetch(`/api/manager/staff/${staff.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to delete staff');
      }
      sonnerToast.success('Staff member deleted successfully!');
      fetchStaff(); 
    } catch (err: any) {
      sonnerToast.error("Error deleting staff: " + err.message);
      // Revert optimistic UI update on failure
      setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, _isDeleting: false } : s));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { staffIdForDoc, ...formData } = staffForm;
    if (!editingStaff && !formData.password) {
        sonnerToast.error("Password is required for new staff members.");
        setIsSubmitting(false);
        return;
    }
    const dataToSend: any = { ...formData };
    if (editingStaff && !formData.password) {
        delete dataToSend.password;
    }
    if (!editingStaff) {
        if (!staffIdForDoc || staffIdForDoc.trim() === '') {
            sonnerToast.error("Staff ID is required for new staff members.");
            setIsSubmitting(false);
            return;
        }
        dataToSend.staffIdForDoc = staffIdForDoc.trim();
    }

    const url = editingStaff ? `/api/manager/staff/${editingStaff.id}` : '/api/manager/staff';
    const method = editingStaff ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(responseBody.message || (editingStaff ? 'Failed to update staff' : 'Failed to create staff'));
      }
      sonnerToast.success(responseBody.message || `Staff ${editingStaff ? 'updated' : 'created'} successfully!`);
      setIsDialogOpen(false);
      fetchStaff(); 
    } catch (err: any) {
      sonnerToast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePasswordVisibility = (staffId: string, currentRole: 'vendor' | 'manager') => {
    const staffMember = staffList.find(s => s.id === staffId);
    if (!staffMember) return;

    if (currentRole === 'manager' && !staffMember.showPassword) {
      if (!confirm("Are you sure you want to view this manager's password? This is sensitive information.")) {
        return;
      }
    }
    setStaffList(prevList =>
      prevList.map(s =>
        s.id === staffId ? { ...s, showPassword: !s.showPassword } : s
      )
    );
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openAddDialog}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Staff
            </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={fetchStaff} disabled={isLoading} >
                <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh List
            </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5"/> Staff List</CardTitle>
          <CardDescription>Manage staff accounts, roles, and view passwords (use with caution).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading staff...</p>
            </div>
          )}
          {error && !isLoading && <p className="text-destructive text-center py-10">Error: {error}</p>}
          
          {!isLoading && !error && (
            <>
              {staffList.length > 0 ? (
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px] py-2 px-3">Name</TableHead>
                        <TableHead className="min-w-[120px] py-2 px-3">Staff ID</TableHead>
                        <TableHead className="min-w-[180px] py-2 px-3">Password</TableHead>
                        <TableHead className="min-w-[100px] py-2 px-3">Role</TableHead>
                        <TableHead className="text-center min-w-[110px] py-2 px-3">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffList.map((staff) => (
                        <TableRow key={staff.id} className={`${staff._isDeleting ? "opacity-50" : ""} hover:bg-muted/50`}>
                          <TableCell className="font-medium py-2 px-3">{staff.name}</TableCell>
                          <TableCell className="py-2 px-3">{staff.id}</TableCell>
                          <TableCell className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span>
                                {staff.showPassword ? staff.password : '••••••••'}
                              </span>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0" // Make button very small
                                onClick={() => togglePasswordVisibility(staff.id, staff.role)}
                                title={staff.showPassword ? "Hide password" : "Show password"}
                              >
                                {staff.showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="capitalize py-2 px-3">{staff.role}</TableCell>
                          <TableCell className="text-center space-x-1 py-1.5 px-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openEditDialog(staff)} 
                                title="Edit Staff"
                                className="h-7 px-2"
                                disabled={staff._isDeleting || isSubmitting}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={() => handleDeleteStaff(staff)} 
                                title="Delete Staff" 
                                className="h-7 px-2"
                                disabled={staff._isDeleting || (isSubmitting && editingStaff?.id === staff.id)}
                            >
                              {staff._isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              ) : (
                <p className="text-center text-muted-foreground py-10">No staff members found.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}</DialogTitle>
            <DialogDescription>
              {editingStaff ? `Update details for ${editingStaff.name}. Password change is optional.` : 'Enter details for the new staff member.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="grid gap-4 py-4">
            {!editingStaff && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="staffIdForDoc" className="text-right col-span-1">Staff ID *</Label>
                    <Input id="staffIdForDoc" name="staffIdForDoc" value={staffForm.staffIdForDoc || ''} onChange={handleInputChange} className="col-span-3" required />
                </div>
            )}
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right col-span-1">Full Name *</Label>
              <Input id="name" name="name" value={staffForm.name} onChange={handleInputChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right col-span-1">Role *</Label>
              <Select name="role" value={staffForm.role} onValueChange={handleRoleChange} required>
                <SelectTrigger id="role" className="col-span-3"><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right col-span-1">Password {editingStaff ? '' : '*'}</Label>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                value={staffForm.password || ''} 
                onChange={handleInputChange} 
                className="col-span-3" 
                placeholder={editingStaff ? "New password (optional)" : "Required"} 
                required={!editingStaff} // Required only for new staff
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingStaff ? 'Save Changes' : 'Create Staff'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}