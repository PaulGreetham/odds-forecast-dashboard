"use client";

import { useMemo } from "react";
import { collection } from "firebase/firestore";

import { db } from "@/lib/firebase";

export function useMatchesCollection(uid: string | null) {
  return useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return collection(db, "users", uid, "matches");
  }, [uid]);
}
