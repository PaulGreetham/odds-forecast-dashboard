"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";

export function useAuthUid() {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return () => unsubscribe();
  }, []);

  return uid;
}

