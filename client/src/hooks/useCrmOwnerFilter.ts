import { useEffect, useState } from "react";
import { usersApi } from "../api/users";
import { useAuth } from "../context/AuthContext";
import type { TaskUserRef } from "../types";

const STORAGE_PREFIX = "crm_owner_filter_";

export function useCrmOwnerFilter() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : null;

  const [owner, setOwnerState] = useState<string>(() => {
    if (!isAdmin) return "me";
    if (!storageKey) return "me";
    return localStorage.getItem(storageKey) ?? "me";
  });
  const [salespeople, setSalespeople] = useState<TaskUserRef[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .directory()
      .then((all) => setSalespeople(all.filter((u) => u.role === "ADMIN" || u.role === "COMERCIAL")))
      .catch(() => setSalespeople([]));
  }, [isAdmin]);

  function setOwner(value: string) {
    if (!isAdmin) return;
    setOwnerState(value);
    if (storageKey) localStorage.setItem(storageKey, value);
  }

  return { owner, setOwner, salespeople };
}
