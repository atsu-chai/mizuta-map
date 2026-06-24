export type PuddleSize = "small" | "medium" | "large";

export type Puddle = {
  id: string;
  latitude: number;
  longitude: number;
  size: PuddleSize;
  review: string;
  checkedAt: string;
  weather: string;
  imageUrl?: string;
};

export type PuddlePayload = {
  latitude: number;
  longitude: number;
  size: PuddleSize;
  review: string;
  checkedAt: string;
  weather: string;
  image?: {
    fileName: string;
    mimeType: string;
    base64: string;
  };
};

export const defaultCenter = {
  lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 35.681236),
  lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? 139.767125),
};

export const demoPuddles: Puddle[] = [
  {
    id: "demo-tokyo-station",
    latitude: 35.681236,
    longitude: 139.767125,
    size: "medium",
    review: "駅前の歩道に浅い水たまり。通行は可能です。",
    checkedAt: new Date().toISOString(),
    weather: "未取得",
  },
  {
    id: "demo-nihonbashi",
    latitude: 35.6844,
    longitude: 139.7744,
    size: "small",
    review: "小さめ。自転車は避けた方が安全です。",
    checkedAt: new Date().toISOString(),
    weather: "未取得",
  },
];

export function normalizePuddles(value: unknown): Puddle[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "puddles" in value
      ? (value as { puddles: unknown }).puddles
      : [];

  if (!Array.isArray(source)) {
    return [];
  }

  const puddles: Puddle[] = [];

  source.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const record = item as Record<string, unknown>;
    const latitude = Number(record.latitude ?? record.lat);
    const longitude = Number(record.longitude ?? record.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    puddles.push({
      id: String(record.id ?? `puddle-${index}`),
      latitude,
      longitude,
      size: isPuddleSize(record.size) ? record.size : "medium",
      review: String(record.review ?? ""),
      checkedAt: String(record.checkedAt ?? record.checked_at ?? new Date().toISOString()),
      weather: String(record.weather ?? "未取得"),
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : undefined,
    });
  });

  return puddles;
}

export function isPuddleSize(value: unknown): value is PuddleSize {
  return value === "small" || value === "medium" || value === "large";
}

export function sizeLabel(size: PuddleSize) {
  return {
    small: "小",
    medium: "中",
    large: "大",
  }[size];
}
