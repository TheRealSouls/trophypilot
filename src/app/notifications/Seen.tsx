"use client";

import { useEffect } from "react";
import { useMe } from "@/components/session";

/** Clears the bell's count once the page has marked everything read on the server. */
export function Seen() {
  const { reload } = useMe();
  useEffect(() => {
    const t = setTimeout(() => void reload(), 1500);
    return () => clearTimeout(t);
  }, [reload]);
  return null;
}
