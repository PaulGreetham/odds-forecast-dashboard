"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { db } from "@/lib/firebase";

export function useMatches<T>(
  uid: string | null,
  mapDoc: (id: string, data: Record<string, unknown>) => T,
  orderByField: string = "date",
  orderDirection: "asc" | "desc" = "asc"
) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);

  const matchesCollection = useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return collection(db, "users", uid, "matches");
  }, [uid]);

  useEffect(() => {
    if (!matchesCollection) {
      return;
    }

    const matchesQuery = query(matchesCollection, orderBy(orderByField, orderDirection));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        setRows(snapshot.docs.map((doc) => mapDoc(doc.id, doc.data() as Record<string, unknown>)));
        setError(null);
      },
      () => setError("Matches could not be loaded due to Firestore permissions.")
    );

    return () => unsubscribe();
  }, [mapDoc, matchesCollection, orderByField, orderDirection]);

  return { rows, error };
}

