# Memory: features/labor/sunday-first-week-ordering
Updated: 2026-01-23

All labor schedule interfaces and PDF exports display Sunday as the first day of the week. The DAYS array in LaborSchedulesTab.tsx starts with { key: "0", short: "D", full: "Domingo" } and ends with { key: "6", short: "S", full: "Sábado" }. Date calculations account for Sunday being the day before the ISO week start (Monday), using `d.setDate(d.getDate() + (dayIndex === 0 ? -1 : dayIndex - 1))`. This applies consistently to:
- Admin schedule management (LaborSchedulesTab.tsx)
- PDF export generation
- Worker personal schedule view (WorkerPersonalSchedule.tsx)
- Embedded worker schedule (EmbeddedWorkerSchedule.tsx)
