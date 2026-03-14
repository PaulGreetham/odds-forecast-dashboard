"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { BetsState } from "@/types/domain/bets";

const defaultState: BetsState = {
  defaultStake: "10",
  rowStakes: {},
  accumulators: [],
};

export function useBetsState(uid: string | null) {
  const [betsState, setBetsState] = useState<BetsState>(defaultState);
  const [error, setError] = useState<string | null>(null);

  const betsStateDoc = useMemo(() => {
    if (!db || !uid) {
      return null;
    }
    return doc(db, "users", uid, "appState", "bets");
  }, [uid]);

  useEffect(() => {
    if (!betsStateDoc) {
      return;
    }

    const unsubscribe = onSnapshot(
      betsStateDoc,
      (snapshot) => {
        if (!snapshot.exists()) {
          setBetsState(defaultState);
          return;
        }
        const data = snapshot.data();
        setBetsState({
          defaultStake: String(data.defaultStake ?? "10"),
          rowStakes: Object.fromEntries(
            Object.entries((data.rowStakes as Record<string, unknown>) ?? {}).map(([k, v]) => [
              k,
              String(v ?? ""),
            ])
          ),
          accumulators: Array.isArray(data.accumulators)
            ? (data.accumulators as Array<Record<string, unknown>>).map((acc, index) => ({
                id: String(acc.id ?? `acc-${index + 1}`),
                name: String(acc.name ?? `Accumulator ${index + 1}`),
                stake: String(acc.stake ?? "0"),
                matchIds: Array.isArray(acc.matchIds)
                  ? acc.matchIds.map((matchId) => String(matchId))
                  : [],
                day: acc.day ? String(acc.day) : null,
                note: String(acc.note ?? ""),
              }))
            : [],
        });
        setError(null);
      },
      () => setError("Bets state could not be loaded due to Firestore permissions.")
    );

    return () => unsubscribe();
  }, [betsStateDoc]);

  return { betsState, error };
}

