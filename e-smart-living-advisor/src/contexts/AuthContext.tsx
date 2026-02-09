import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  customer_id: string;
  name: string;
  segment: string;
  city?: string;
}

interface AuthContextType {
  user: User | null;
  login: (customerId: string, userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem("smart_home_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = (customerId: string, userData: User) => {
    setUser(userData);
    localStorage.setItem("smart_home_user", JSON.stringify(userData));
    localStorage.setItem("smart_home_customer_id", customerId);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("smart_home_user");
    localStorage.removeItem("smart_home_customer_id");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
