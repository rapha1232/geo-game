"use client";

import { useEffect, useState } from "react";
import { browserOffsetMinutes, localDate } from "../../lib/daily/time";
import { dailyQuizFor } from "../../lib/quiz/daily";
import { QuizRunner } from "./QuizRunner";

/** `/play/quiz/daily`: today's quiz for the player's local date. The date is read in the browser, so the server renders nothing. */
export function QuizDaily() {
  const [today, setToday] = useState<{ slug: string; date: string; seed: string } | null>(null);
  useEffect(() => {
    const date = localDate(Date.now(), browserOffsetMinutes());
    const { quiz, seed } = dailyQuizFor(date);
    setToday({ slug: quiz.slug, date, seed });
  }, []);
  if (!today) return <p role="status" />;
  return <QuizRunner slug={today.slug} daily={{ date: today.date, seed: today.seed }} />;
}
