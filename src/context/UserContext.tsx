// src/context/UserContext.tsx
"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string; // staff_id
  name: string;
  role: 'vendor' | 'manager' | null;
}

interface UserContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    // Try to load user from localStorage on initial load (optional persistence)
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('currentUser');
      try {
        return storedUser ? JSON.parse(storedUser) : null;
      } catch (error) {
        console.error("Error parsing stored user:", error);
        localStorage.removeItem('currentUser'); // Clear corrupted data
        return null;
      }
    }
    return null;
  });

  const login = (userData: User) => {
    setUser(userData);
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentUser', JSON.stringify(userData));
    }
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentUser');
      // Optionally redirect to login page
      // window.location.href = '/'; // or a specific login page
    }
  };

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};