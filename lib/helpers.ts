export const parseDayNumber = (
  value: string | string[] | undefined
): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
};

export const INTERVIEW_REQUIRED_COUNT = 10;
export const SCENARIO_REQUIRED_COUNT = 10;
export const QUIZ_QUESTION_COUNT = 10;

export const getOrderedDayNumbers = (
  days: Record<string, unknown>
): number[] =>
  Object.keys(days)
    .map((key) => Number.parseInt(key, 10))
    .filter((day) => Number.isFinite(day) && day > 0)
    .sort((a, b) => a - b);

export const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

export const mergeUniqueById = <T extends { id: string }>(
  current: T[],
  incoming: T[]
): T[] => {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];

  incoming.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  });

  return merged;
};
