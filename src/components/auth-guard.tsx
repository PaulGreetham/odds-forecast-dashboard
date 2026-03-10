"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth, isFirebaseConfigured } from "@/lib/firebase";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(Boolean(auth));
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsCheckingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isCheckingAuth && !user) {
      router.replace("/");
    }
  }, [isCheckingAuth, router, user]);

  if (!isFirebaseConfigured) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Firebase is not configured. Set the `NEXT_PUBLIC_FIREBASE_*` env vars.
      </div>
    );
  }

  if (isCheckingAuth || !user) {
    return <div className="p-6 text-sm text-muted-foreground">Checking access...</div>;
  }

  return <>{children}</>;
}
