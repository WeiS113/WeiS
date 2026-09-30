"use client";

import {
  ReactNode,
  useEffect,
  useState,
} from "react";

import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

type RealtimeSyncProps = {
  children: ReactNode;
};

export default function RealtimeSync({
  children,
}: RealtimeSyncProps) {
  const pathname = usePathname();

  const [version, setVersion] =
    useState(0);

  useEffect(() => {
    if (pathname === "/login") {
      return;
    }

    const channel = supabase
      .channel("WeiS-planner-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          setVersion(
            (current) =>
              current + 1
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
        },
        () => {
          setVersion(
            (current) =>
              current + 1
          );
        }
      )
      .subscribe((status) => {
        if (
          status === "SUBSCRIBED"
        ) {
          console.log(
            "Realtime 已连接"
          );
        }

        if (
          status ===
          "CHANNEL_ERROR"
        ) {
          console.error(
            "Realtime 连接失败"
          );
        }
      });

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [pathname]);

  return (
    <div key={version}>
      {children}
    </div>
  );
}