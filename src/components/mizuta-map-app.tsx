"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultCenter, demoPuddles, normalizePuddles, sizeLabel, type Puddle } from "@/lib/puddles";

type LatLng = {
  lat: number;
  lng: number;
};

const gasWebAppUrl = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
const storageKey = "mizuta-map-puddles";

export function MizutaMapApp() {
  const [puddles, setPuddles] = useState<Puddle[]>([]);
  const [selectedPuddle, setSelectedPuddle] = useState<Puddle | null>(null);
  const [position, setPosition] = useState<LatLng>({ lat: defaultCenter.lat, lng: defaultCenter.lng });
  const [status, setStatus] = useState("水たまりデータを読み込み中...");
  const [submitStatus, setSubmitStatus] = useState("");
  const [showAr, setShowAr] = useState(false);

  const visiblePuddles = puddles.length > 0 ? puddles : demoPuddles;

  const loadPuddles = useCallback(async () => {
    try {
      const storedPuddles = readStoredPuddles();
      setPuddles(storedPuddles);
      setStatus(
        gasWebAppUrl
          ? `${storedPuddles.length}件の端末内データを表示しています。GAS送信も有効です。`
          : `${storedPuddles.length}件の端末内データを表示しています。GAS未設定のため投稿はこの端末に保存されます。`,
      );
    } catch (error) {
      setPuddles([]);
      setStatus(error instanceof Error ? error.message : "水たまりデータを取得できませんでした。");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadPuddles);
  }, [loadPuddles]);

  useEffect(() => {
    if (!navigator.geolocation) {
      window.setTimeout(() => {
        setStatus((current) => `${current} 現在地取得はこのブラウザで使えません。`);
      }, 0);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (result) => {
        const nextPosition = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        };
        setPosition(nextPosition);
      },
      () => {
        setStatus((current) => `${current} 現在地は許可されていないため東京駅周辺を表示します。`);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const selectedMapLink = useMemo(() => {
    if (!selectedPuddle) {
      return "";
    }

    return `https://www.openstreetmap.org/?mlat=${selectedPuddle.latitude}&mlon=${selectedPuddle.longitude}#map=18/${selectedPuddle.latitude}/${selectedPuddle.longitude}`;
  }, [selectedPuddle]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus("投稿を送信しています...");

    const formData = new FormData(event.currentTarget);
    formData.set("latitude", String(position.lat));
    formData.set("longitude", String(position.lng));
    formData.set("checkedAt", new Date().toISOString());

    try {
      const imageUrl = await imageFileToDataUrl(formData.get("image"));
      const nextPuddle: Puddle = {
        id: crypto.randomUUID(),
        latitude: position.lat,
        longitude: position.lng,
        size: String(formData.get("size") ?? "medium") as Puddle["size"],
        review: String(formData.get("review") ?? "").trim(),
        checkedAt: String(formData.get("checkedAt")),
        weather: "未取得",
        imageUrl,
      };
      const nextPuddles = [nextPuddle, ...readStoredPuddles()];
      localStorage.setItem(storageKey, JSON.stringify(nextPuddles));
      setPuddles(nextPuddles);

      if (gasWebAppUrl) {
        await submitToGas(nextPuddle, formData.get("image"));
      }

      event.currentTarget.reset();
      setSubmitStatus(gasWebAppUrl ? "投稿しました。GASにも送信しました。" : "投稿しました。この端末に保存されています。");
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : "投稿に失敗しました。");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5fbff] text-[#102033]">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[360px_1fr] lg:px-6">
        <aside className="flex flex-col gap-4">
          <header className="rounded-lg border border-[#c9e3ee] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#237a92]">Mizuta Map</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">水たまりに向かう、避ける、記録する。</h1>
            <p className="mt-3 text-sm leading-6 text-[#486575]">
              APIキーなしの地図で水たまりを共有し、写真・大きさ・レビューを端末に保存するGitHub Pages対応MVPです。
            </p>
          </header>

          <form onSubmit={handleSubmit} className="rounded-lg border border-[#c9e3ee] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">水たまりを投稿</h2>
              <span className="rounded-full bg-[#e5f7fb] px-3 py-1 text-xs font-medium text-[#237a92]">
                即時掲載
              </span>
            </div>

            <label className="mt-4 block text-sm font-medium">
              写真
              <input
                name="image"
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-2 w-full rounded-md border border-[#bfd7e0] bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              大きさ
              <select
                name="size"
                defaultValue="medium"
                className="mt-2 w-full rounded-md border border-[#bfd7e0] bg-white px-3 py-2 text-sm"
              >
                <option value="small">小: 片足で避けられる</option>
                <option value="medium">中: 歩道の一部をふさぐ</option>
                <option value="large">大: 通行ルートを変えたい</option>
              </select>
            </label>

            <label className="mt-4 block text-sm font-medium">
              レビュー
              <textarea
                name="review"
                rows={4}
                placeholder="深さ、滑りやすさ、通り抜けやすさなど"
                className="mt-2 w-full resize-none rounded-md border border-[#bfd7e0] bg-white px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-4 rounded-md bg-[#eef8fb] p-3 font-mono text-xs text-[#486575]">
              lat {position.lat.toFixed(5)} / lng {position.lng.toFixed(5)}
            </div>

            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-[#126782] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d5268]"
            >
              写真と位置情報を送信
            </button>
            {submitStatus ? <p className="mt-3 text-sm text-[#486575]">{submitStatus}</p> : null}
          </form>

          <button
            type="button"
            onClick={() => setShowAr(true)}
            className="rounded-lg border border-[#78bfd0] bg-[#dff6fb] px-4 py-3 text-sm font-semibold text-[#0d5268] transition hover:bg-[#caeef6]"
          >
            水面検出ARを開く
          </button>
        </aside>

        <section className="grid min-h-[720px] gap-4 lg:grid-rows-[1fr_auto]">
          <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-[#c9e3ee] bg-[#d9edf4] shadow-sm">
            <LocalMapView
              center={position}
              puddles={visiblePuddles}
              selectedId={selectedPuddle?.id}
              onSelect={setSelectedPuddle}
            />
            <div className="absolute left-4 top-4 max-w-sm rounded-lg bg-white/95 p-3 text-sm shadow">
              <p className="font-semibold">地図ステータス</p>
              <p className="mt-1 text-[#486575]">{status}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <PuddleList puddles={visiblePuddles} onSelect={setSelectedPuddle} selectedId={selectedPuddle?.id} />
            <section className="rounded-lg border border-[#c9e3ee] bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">水たまり詳細</h2>
              {selectedPuddle ? (
                <div className="mt-4 space-y-3 text-sm">
                  {selectedPuddle.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedPuddle.imageUrl}
                      alt="投稿された水たまり"
                      className="h-40 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-md bg-[#eef8fb] text-[#486575]">
                      写真なし
                    </div>
                  )}
                  <DetailRow label="大きさ" value={sizeLabel(selectedPuddle.size)} />
                  <DetailRow label="確認日時" value={formatDate(selectedPuddle.checkedAt)} />
                  <DetailRow label="天気" value={selectedPuddle.weather} />
                  <DetailRow label="レビュー" value={selectedPuddle.review || "レビューなし"} />
                  <a
                    href={selectedMapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md bg-[#126782] px-4 py-3 text-center font-semibold text-white"
                  >
                    OpenStreetMapで開く
                  </a>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[#486575]">
                  下の一覧から水たまりを選ぶと、写真・位置・大きさ・確認日時・天気・レビューを確認できます。
                </p>
              )}
            </section>
          </div>
        </section>
      </section>

      {showAr ? <ArOverlay onClose={() => setShowAr(false)} /> : null}
    </main>
  );
}

function LocalMapView({
  center,
  puddles,
  selectedId,
  onSelect,
}: {
  center: LatLng;
  puddles: Puddle[];
  selectedId?: string;
  onSelect: (puddle: Puddle) => void;
}) {
  const [zoom, setZoom] = useState(16);
  const meterRange = zoom === 18 ? 320 : zoom === 17 ? 520 : zoom === 16 ? 850 : 1400;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#d9eef4]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(35,122,146,0.12)_1px,transparent_1px),linear-gradient(rgba(35,122,146,0.12)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="absolute left-[-8%] top-[22%] h-8 w-[116%] rotate-[-8deg] rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[-12%] top-[61%] h-10 w-[124%] rotate-[5deg] rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[18%] top-[-12%] h-[124%] w-9 rotate-[12deg] rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[66%] top-[-10%] h-[120%] w-7 rotate-[-10deg] rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[8%] top-[10%] h-28 w-40 rounded-[42%] bg-[#a8d7e4]/70 blur-[1px]" />
      <div className="absolute bottom-[12%] right-[10%] h-36 w-52 rounded-[45%] bg-[#a8d7e4]/70 blur-[1px]" />
      <div className="absolute left-[42%] top-[38%] h-24 w-32 rounded-[50%] bg-[#bde6ee]/70 blur-[1px]" />

      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#0d5268] shadow-lg" />
      <span className="absolute left-1/2 top-[calc(50%+16px)] -translate-x-1/2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold shadow">
        現在地
      </span>

      {puddles.map((puddle) => {
        const point = latLngToMapPercent(center, puddle, meterRange);
        const isSelected = selectedId === puddle.id;

        return (
          <button
            key={puddle.id}
            type="button"
            onClick={() => onSelect(puddle)}
            className={`absolute h-9 w-9 -translate-x-1/2 -translate-y-full rounded-full border-2 text-xs font-bold text-white shadow-lg transition ${
              isSelected ? "scale-110 border-[#102033] bg-[#ff8a00]" : "border-white bg-[#2aa7c8]"
            }`}
            style={{ left: `${point.left}%`, top: `${point.top}%` }}
            title={`${puddle.latitude}, ${puddle.longitude}`}
          >
            {sizeLabel(puddle.size)}
          </button>
        );
      })}

      <div className="absolute bottom-4 left-4 rounded-lg bg-white/95 p-3 text-xs text-[#486575] shadow">
        <p className="font-semibold text-[#102033]">Mizuta Local Map v2</p>
        <p className="mt-1 font-mono">
          {center.lat.toFixed(5)}, {center.lng.toFixed(5)} / {meterRange}m
        </p>
      </div>
      <div className="absolute bottom-4 right-4 flex overflow-hidden rounded-md bg-white shadow">
        <button
          type="button"
          onClick={() => setZoom((current) => Math.min(current + 1, 18))}
          className="border-r border-[#d7e8ee] px-3 py-2 text-lg font-semibold"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.max(current - 1, 12))}
          className="px-3 py-2 text-lg font-semibold"
        >
          -
        </button>
      </div>
    </div>
  );
}

function PuddleList({
  puddles,
  selectedId,
  onSelect,
}: {
  puddles: Puddle[];
  selectedId?: string;
  onSelect: (puddle: Puddle) => void;
}) {
  return (
    <section className="rounded-lg border border-[#c9e3ee] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">近くの水たまり</h2>
        <span className="font-mono text-sm text-[#486575]">{puddles.length}件</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        {puddles.map((puddle) => (
          <button
            key={puddle.id}
            type="button"
            onClick={() => onSelect(puddle)}
            className={`rounded-md border p-4 text-left transition ${
              selectedId === puddle.id
                ? "border-[#126782] bg-[#eef8fb]"
                : "border-[#d7e8ee] bg-white hover:border-[#78bfd0]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">水たまり {sizeLabel(puddle.size)}</span>
              <span className="rounded-full bg-[#e5f7fb] px-2 py-1 text-xs text-[#237a92]">
                {puddle.weather}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-[#486575]">
              {puddle.review || "レビューなし"}
            </p>
            <p className="mt-3 font-mono text-xs text-[#6a8290]">{formatDate(puddle.checkedAt)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#f5fbff] p-3">
      <p className="text-xs font-semibold text-[#486575]">{label}</p>
      <p className="mt-1 leading-6">{value}</p>
    </div>
  );
}

function ArOverlay({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState("カメラを起動しています...");
  const [waterTarget, setWaterTarget] = useState({ detected: false, x: 50, y: 58, confidence: 0 });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frameId = 0;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraStatus("");
          frameId = window.requestAnimationFrame(scanForWater);
        }
      } catch {
        setCameraStatus("カメラを使用できません。ブラウザの権限設定を確認してください。");
      }
    }

    function scanForWater() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2) {
        frameId = window.requestAnimationFrame(scanForWater);
        return;
      }

      const width = 96;
      const height = 128;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        frameId = window.requestAnimationFrame(scanForWater);
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;

      for (let y = Math.floor(height * 0.35); y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const index = (y * width + x) * 4;
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const brightness = (red + green + blue) / 3;
          const blueWater = blue > red + 8 && blue > green - 10 && brightness > 35;
          const darkReflection = brightness > 25 && brightness < 95 && Math.abs(red - green) < 28 && Math.abs(green - blue) < 38;
          const glossyHighlight = brightness > 150 && blue >= red - 8 && green >= red - 12;

          if (blueWater || darkReflection || glossyHighlight) {
            const lowerFrameBias = 1 + y / height;
            const weight = lowerFrameBias * (blueWater ? 2.2 : glossyHighlight ? 1.1 : 1.5);
            totalWeight += weight;
            weightedX += x * weight;
            weightedY += y * weight;
          }
        }
      }

      if (totalWeight > 90) {
        setWaterTarget({
          detected: true,
          x: (weightedX / totalWeight / width) * 100,
          y: (weightedY / totalWeight / height) * 100,
          confidence: Math.min(99, Math.round(totalWeight / 12)),
        });
      } else {
        setWaterTarget((current) => ({ ...current, detected: false, confidence: 0 }));
      }

      frameId = window.setTimeout(() => {
        frameId = window.requestAnimationFrame(scanForWater);
      }, 120);
    }

    void startCamera();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#07131d] text-white">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,rgba(4,16,24,0.4))]" />
      {waterTarget.detected ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-6xl drop-shadow-lg transition-all duration-300"
          style={{ left: `${waterTarget.x}%`, top: `${waterTarget.y}%` }}
          aria-hidden
        >
          <span className="fish-swim block">&gt;&lt;&gt;</span>
        </div>
      ) : null}
      <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-4">
        <div className="rounded-lg bg-black/55 p-4 backdrop-blur">
          <p className="text-sm font-semibold">Mizuta AR 水面検出</p>
          <p className="mt-1 max-w-sm text-sm text-white/80">
            カメラ映像から水面らしい暗い反射・青み・ハイライトを探し、検出位置に魚を表示します。
          </p>
          <p className="mt-2 text-sm text-[#9ee8ff]">
            {waterTarget.detected ? `水面候補を検出中: ${waterTarget.confidence}%` : "水面候補を探しています。水たまりを画面下半分に入れてください。"}
          </p>
          {cameraStatus ? <p className="mt-2 text-sm text-[#9ee8ff]">{cameraStatus}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#102033]"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

function latLngToMapPercent(center: LatLng, puddle: Puddle, meterRange: number) {
  const metersPerLat = 111_320;
  const metersPerLng = Math.cos((center.lat * Math.PI) / 180) * 111_320;
  const dx = (puddle.longitude - center.lng) * metersPerLng;
  const dy = (puddle.latitude - center.lat) * metersPerLat;

  return {
    left: clamp(50 + (dx / meterRange) * 50, 5, 95),
    top: clamp(50 - (dy / meterRange) * 50, 8, 92),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readStoredPuddles() {
  try {
    return normalizePuddles(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return [];
  }
}

async function imageFileToDataUrl(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return undefined;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("写真を読み込めませんでした。")));
    reader.readAsDataURL(value);
  });
}

async function submitToGas(puddle: Puddle, imageValue: FormDataEntryValue | null) {
  if (!gasWebAppUrl) {
    return;
  }

  const image = imageValue instanceof File && imageValue.size > 0
    ? await fileToGasImage(imageValue)
    : undefined;

  const response = await fetch(gasWebAppUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      latitude: puddle.latitude,
      longitude: puddle.longitude,
      size: puddle.size,
      review: puddle.review,
      checkedAt: puddle.checkedAt,
      weather: puddle.weather,
      image,
    }),
  });

  if (!response.ok) {
    throw new Error("端末内には保存しましたが、GAS送信に失敗しました。");
  }
}

async function fileToGasImage(file: File) {
  const dataUrl = await imageFileToDataUrl(file);
  const base64 = dataUrl?.split(",")[1] ?? "";

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64,
  };
}
