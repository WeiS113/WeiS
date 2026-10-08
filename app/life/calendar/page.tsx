
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Entry = {
  id: string;
  entry_type: "moment" | "journal";
  content: string;
  mood: string | null;
  image_paths: string[] | null;
  entry_date: string;
  created_at: string;
};

function todayLocal() {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return `${year} 年 ${month + 1} 月`;
}

export default function LifeCalendarPage() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const firstDay = dateKey(year, month, 1);
  const lastDay = dateKey(
    year,
    month,
    new Date(year, month + 1, 0).getDate()
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setPhotoUrls({});

      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError || !auth.user) {
          throw new Error("请先登录 WeiS 账号");
        }

        const { data, error: queryError } = await supabase
          .from("life_entries")
          .select(
            "id,entry_type,content,mood,image_paths,entry_date,created_at"
          )
          .eq("user_id", auth.user.id)
          .gte("entry_date", firstDay)
          .lte("entry_date", lastDay)
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;
        if (cancelled) return;

        const rows = (data ?? []) as Entry[];
        setEntries(rows);

        const paths = [
          ...new Set(
            rows.flatMap((entry) => entry.image_paths ?? [])
          ),
        ];

        if (paths.length > 0) {
          const { data: signed, error: imageError } =
            await supabase.storage
              .from("life-images")
              .createSignedUrls(paths, 3600);

          if (imageError) {
            console.error("照片加载失败", imageError);
          }

          if (!cancelled) {
            const urls: Record<string, string> = {};
            signed?.forEach((item, index) => {
              if (item.signedUrl) {
                urls[paths[index]] = item.signedUrl;
              }
            });
            setPhotoUrls(urls);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setEntries([]);
          setError(
            err instanceof Error ? err.message : "加载失败"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [firstDay, lastDay]);

  function changeMonth(offset: number) {
    const target = new Date(year, month + offset, 1);
    setYear(target.getFullYear());
    setMonth(target.getMonth());
    setSelectedDate(
      dateKey(
        target.getFullYear(),
        target.getMonth(),
        1
      )
    );
  }

  const entriesByDate = useMemo(() => {
    const result: Record<string, Entry[]> = {};

    for (const entry of entries) {
      if (!result[entry.entry_date]) {
        result[entry.entry_date] = [];
      }
      result[entry.entry_date].push(entry);
    }

    return result;
  }, [entries]);

  const dayCount = new Date(year, month + 1, 0).getDate();
  const weekdayOffset =
    (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: weekdayOffset }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEntries = entriesByDate[selectedDate] ?? [];

  return (
    <main className="min-h-screen bg-[#f8f5fa] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/life"
            className="rounded-full bg-white/80 px-4 py-2 text-sm shadow-sm"
          >
            ← Life
          </Link>
          <h1 className="text-lg font-semibold">
            Life Calendar
          </h1>
          <span className="text-xl text-violet-400">♡</span>
        </header>

        <section className="rounded-[30px] border border-white bg-white/75 p-4 shadow-sm backdrop-blur-xl sm:p-7">
          <p className="mb-2 text-xs tracking-[0.25em] text-violet-400">
            YOUR MEMORIES
          </p>

          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="rounded-xl bg-slate-50 px-4 py-2"
              aria-label="上个月"
            >
              ←
            </button>
            <h2 className="text-lg font-semibold">
              {monthLabel(year, month)}
            </h2>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="rounded-xl bg-slate-50 px-4 py-2"
              aria-label="下个月"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {["一", "二", "三", "四", "五", "六", "日"].map(
              (day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs text-slate-400"
                >
                  {day}
                </div>
              )
            )}

            {cells.map((day, index) => {
              if (day === null) {
                return <div key={`blank-${index}`} />;
              }

              const key = dateKey(year, month, day);
              const dayEntries = entriesByDate[key] ?? [];
              const hasMoment = dayEntries.some(
                (entry) => entry.entry_type === "moment"
              );
              const hasJournal = dayEntries.some(
                (entry) => entry.entry_type === "journal"
              );

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-sm transition sm:min-h-16 ${
                    selectedDate === key
                      ? "bg-violet-100 font-semibold text-violet-700"
                      : "bg-slate-50/70 hover:bg-rose-50"
                  }`}
                >
                  <span>{day}</span>
                  <span className="flex h-2 gap-1">
                    {hasMoment && (
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    )}
                    {hasJournal && (
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-5 text-xs text-slate-500">
            <span>● <span className="text-rose-400">Moments</span></span>
            <span>● <span className="text-violet-500">Journal</span></span>
          </div>
        </section>

        {error && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </p>
        )}

        <section className="mt-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {selectedDate}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                这一天的生活记录
              </p>
            </div>
            <span className="text-sm text-slate-400">
              {selectedEntries.length} 条
            </span>
          </div>

          {loading ? (
            <p className="py-10 text-center text-slate-400">
              正在加载回忆...
            </p>
          ) : selectedEntries.length === 0 ? (
            <div className="rounded-3xl bg-white/70 p-10 text-center text-sm text-slate-400">
              这一天还没有生活记录 ♡
            </div>
          ) : (
            <div className="space-y-4">
              {selectedEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-3xl border border-white bg-white/80 p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-medium ${
                        entry.entry_type === "moment"
                          ? "text-rose-500"
                          : "text-violet-500"
                      }`}
                    >
                      {entry.entry_type === "moment"
                        ? "♡ Moments"
                        : "✎ Journal"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(
                        entry.created_at
                      ).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {entry.mood && (
                    <p className="mb-3 text-sm">{entry.mood}</p>
                  )}

                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {entry.content}
                  </p>

                  {entry.image_paths &&
                    entry.image_paths.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {entry.image_paths.map((path) =>
                          photoUrls[path] ? (
                            <a
                              key={path}
                              href={photoUrls[path]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-square overflow-hidden rounded-xl bg-slate-100"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrls[path]}
                                alt="生活照片"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ) : (
                            <div
                              key={path}
                              className="aspect-square rounded-xl bg-slate-100"
                            />
                          )
                        )}
                      </div>
                    )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

