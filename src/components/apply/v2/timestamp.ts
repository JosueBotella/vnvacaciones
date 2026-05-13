/**
 * Returns a Founder-Class style timestamp like "16:27 LTC ☾"
 * "LTC" = Local Time Candidate (decorative)
 */
export function getStoryTimestamp(): { time: string; isNight: boolean } {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const isNight = now.getHours() < 7 || now.getHours() >= 20;
  return { time: `${hh}:${mm}`, isNight };
}
