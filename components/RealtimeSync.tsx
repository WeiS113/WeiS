"use client";

import {
  ReactNode,
  useEffect,

} from "react";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type RealtimeSyncProps = {
  children: ReactNode;
};

export default function RealtimeSync({
  children,
}: RealtimeSyncProps) {
  const pathname = usePathname();
  const router = useRouter();



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
          router.refresh();
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
          router.refresh();
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
  }, [pathname, router]);

  return <>{children}</>;
}