"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultCenter, demoPuddles, normalizePuddles, sizeLabel, type Puddle } from "@/lib/puddles";

type GoogleMap = {
  setCenter: (position: LatLng) => void;
  setZoom: (zoom: number) => void;
};

type LatLng = {
  lat: number;
  lng: number;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
  addListener: (eventName: string, handler: () => void) => void;
};

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    LatLngBounds: new () => {
      extend: (position: LatLng) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
  }
}

const mapApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const gasWebAppUrl = process.env.NEXT_PUBLIC_GAS_WEB_APP_URL;
const storageKey = "mizuta-map-puddles";

export function MizutaMapApp() {
  const [puddles, setPuddles] = useState<Puddle[]>([]);
  const [selectedPuddle, setSelectedPuddle] = useState<Puddle | null>(null);
  const [position, setPosition] = useState<LatLng>({ lat: defaultCenter.lat, lng: defaultCenter.lng });
  const [status, setStatus] = useState("水たまりデータを読み込み中...");
  const [submitStatus, setSubmitStatus] = useState("");
  const [showAr, setShowAr] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(mapApiKey ? "" : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が未設定です。");
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);

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
        mapRef.current?.setCenter(nextPosition);
      },
      () => {
        setStatus((current) => `${current} 現在地は許可されていないため東京駅周辺を表示します。`);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!mapApiKey) {
      return;
    }

    if (window.google?.maps) {
      window.setTimeout(() => setMapReady(true), 0);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", () => setMapReady(true), { once: true });
      existingScript.addEventListener("error", () => setMapError("Google Mapsを読み込めませんでした。"), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapApiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.addEventListener("load", () => setMapReady(true), { once: true });
    script.addEventListener("error", () => setMapError("Google Mapsを読み込めませんでした。"), {
      once: true,
    });
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapElementRef.current || !window.google?.maps) {
      return;
    }

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapElementRef.current, {
        center: position,
        zoom: 15,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = visiblePuddles.map((puddle) => {
      const marker = new window.google!.maps.Marker({
        position: { lat: puddle.latitude, lng: puddle.longitude },
        map: mapRef.current,
        title: `水たまり ${sizeLabel(puddle.size)}`,
      });
      marker.addListener("click", () => setSelectedPuddle(puddle));

      return marker;
    });
  }, [mapReady, position, visiblePuddles]);

  const selectedMapLink = useMemo(() => {
    if (!selectedPuddle) {
      return "";
    }

    return `https://www.google.com/maps/search/?api=1&query=${selectedPuddle.latitude},${selectedPuddle.longitude}`;
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
              現在地の近くにある水たまりを共有し、写真・大きさ・レビュー・天気を集めるGitHub Pages対応MVPです。
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
            魚を泳がせるARを開く
          </button>
        </aside>

        <section className="grid min-h-[720px] gap-4 lg:grid-rows-[1fr_auto]">
          <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-[#c9e3ee] bg-[#d9edf4] shadow-sm">
            {mapApiKey && !mapError ? (
              <div ref={mapElementRef} className="absolute inset-0" aria-label="Google Maps" />
            ) : (
              <FallbackMap position={position} puddles={visiblePuddles} message={mapError} />
            )}
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
                    Google Mapsで開く
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

function FallbackMap({
  position,
  puddles,
  message,
}: {
  position: LatLng;
  puddles: Puddle[];
  message: string;
}) {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(90deg,#c7e2ea_1px,transparent_1px),linear-gradient(#c7e2ea_1px,transparent_1px)] bg-[size:48px_48px]">
      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#126782] shadow-lg" />
      {puddles.map((puddle, index) => (
        <div
          key={puddle.id}
          className="absolute h-8 w-8 rounded-full border-2 border-white bg-[#2aa7c8] text-center text-xs font-bold leading-7 text-white shadow"
          style={{
            left: `${28 + index * 18}%`,
            top: `${35 + (index % 2) * 22}%`,
          }}
          title={`${puddle.latitude}, ${puddle.longitude}`}
        >
          {sizeLabel(puddle.size)}
        </div>
      ))}
      <div className="absolute bottom-4 left-4 right-4 rounded-lg bg-white/95 p-4 text-sm text-[#486575] shadow">
        <p className="font-semibold text-[#102033]">Google Maps未接続</p>
        <p className="mt-1">{message || "APIキーを設定すると実地図に切り替わります。"}</p>
        <p className="mt-2 font-mono text-xs">
          center {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </p>
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
  const [cameraStatus, setCameraStatus] = useState("カメラを起動しています...");

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraStatus("");
        }
      } catch {
        setCameraStatus("カメラを使用できません。ブラウザの権限設定を確認してください。");
      }
    }

    void startCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#07131d] text-white">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,rgba(4,16,24,0.4))]" />
      <div className="fish-swim absolute left-0 top-1/2 text-6xl drop-shadow-lg" aria-hidden>
        &gt;&lt;&gt;
      </div>
      <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-4">
        <div className="rounded-lg bg-black/55 p-4 backdrop-blur">
          <p className="text-sm font-semibold">Mizuta AR</p>
          <p className="mt-1 max-w-sm text-sm text-white/80">
            カメラ映像に魚を重ねています。水たまりの上で魚が泳ぐ簡易WebARです。
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
