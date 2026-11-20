import { WEEKDAYS, type Schedule } from "./types";

/**
 * Wall-clock time in `timeZone` → UTC Date, without a tz library.
 * Iterates the offset twice so DST boundaries resolve correctly.
 */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  utc = guess - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** 0 = mon … 6 = sun for a calendar date (timezone-independent). */
function weekdayIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Next `count` publishing slots: each selected weekday at `time` in the
 * schedule's timezone, starting on `startDate`, never earlier than `notBefore`.
 */
export function computeSlots(schedule: Schedule, count: number, notBefore = new Date()): Date[] {
  const wanted = new Set(schedule.days.map((d) => WEEKDAYS.indexOf(d)));
  const [hh, mm] = schedule.time.split(":").map(Number);
  let [y, m, d] = schedule.startDate.split("-").map(Number);
  const slots: Date[] = [];

  for (let i = 0; slots.length < count && i < 400; i++) {
    if (wanted.has(weekdayIndex(y, m, d))) {
      const slot = zonedToUtc(y, m, d, hh, mm, schedule.timezone);
      if (slot.getTime() > notBefore.getTime()) slots.push(slot);
    }
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    [y, m, d] = [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
  }
  return slots;
}

export function describeSchedule(schedule: Partial<Schedule> | null | undefined): string {
  if (!schedule?.days?.length || !schedule.time) return "Not scheduled";
  const names: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
  };
  const days = WEEKDAYS.filter((d) => schedule.days!.includes(d)).map((d) => names[d]);
  return `${days.join(", ")} · ${schedule.time}`;
}
