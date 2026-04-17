'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { geoCentroid } from "d3-geo";
import AudioOrb from "./AudioOrb";
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

type Marker = {
  id: number;
  lat: number;
  lng: number;
  name: string;
  size: number;
  color: string;
};


const starterMarkers: Marker[] = [];

export default function GlobeView() {
  const [markers, setMarkers] = useState<Marker[]>(starterMarkers);
  const [selected, setSelected] = useState<Marker | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [hoverD, setHoverD] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState("2026-03-31");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, any>>({});
  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [llmResults, setLlmResults] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const streamDoneRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  async function loadPreview(url: string) {
    if (previews[url]) return;

    try {
      const res = await fetch("http://127.0.0.1:5000/article-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      setPreviews((prev) => ({
        ...prev,
        [url]: data,
      }));
    } catch (err) {
      console.error("Preview failed for", url, err);
      setPreviews((prev) => ({
        ...prev,
        [url]: { url, error: true },
      }));
    }
  }
  const getCountryCode = (feature: any) =>
    feature?.properties?.ISO_A3 ||
    feature?.properties?.iso_a3 ||
    feature?.properties?.ADM0_A3 ||
    feature?.properties?.adm0_a3;
  function base64ToUint8Array(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }
  function maybeFinishAudioStream() {
    const mediaSource = mediaSourceRef.current;
    const sourceBuffer = sourceBufferRef.current;

    if (!mediaSource || !sourceBuffer) return;

    if (
      streamDoneRef.current &&
      mediaSource.readyState === "open" &&
      !sourceBuffer.updating &&
      audioQueueRef.current.length === 0
    ) {
      try {
        mediaSource.endOfStream();
      } catch (err) {
        console.error("endOfStream error:", err);
      }
    }
  }

  function appendNextAudioChunk() {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer) return;

    if (sourceBuffer.updating) return;

    if (audioQueueRef.current.length === 0) {
      maybeFinishAudioStream();
      return;
    }

    const chunk = audioQueueRef.current.shift();
    if (!chunk) return;

    try {
      sourceBuffer.appendBuffer(chunk);
    } catch (err) {
      console.error("appendBuffer error:", err);
    }
  }
  function initializeStreamingAudio() {
    streamDoneRef.current = false;
    audioQueueRef.current = [];
    sourceBufferRef.current = null;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(mediaSource);
    audioUrlRef.current = objectUrl;

    if (audioRef.current) {
      audioRef.current.src = objectUrl;
      audioRef.current.autoplay = true;
      audioRef.current.play().catch((err) => {
        console.warn("Audio autoplay issue:", err);
      });
    }

    mediaSource.addEventListener("sourceopen", () => {
      try {
        if (!MediaSource.isTypeSupported("audio/mpeg")) {
          console.error("audio/mpeg not supported");
          return;
        }

        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        sourceBufferRef.current = sourceBuffer;

        sourceBuffer.addEventListener("updateend", () => {
          appendNextAudioChunk();
        });

        appendNextAudioChunk();
      } catch (err) {
        console.error("SourceBuffer creation error:", err);
      }
    });
  }

  function buildMarkersFromRows(rows: any[]) {
    const nextMarkers: Marker[] = rows
      .map((row, index) => {
        const feature = countries.find((c) => getCountryCode(c) === row.target_country);

        if (!feature) return null;

        const [lng, lat] = geoCentroid(feature);

        return {
          id: Date.now() + index,
          lat,
          lng,
          name: row.target_country,
          size: 0.18,
          color: "#f97316",
        };
      })
      .filter(Boolean) as Marker[];

    setMarkers(nextMarkers);
  }
  async function loadDayRows(day: string) {
    try {
      const res = await fetch("http://127.0.0.1:5000/day-news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: day }),
      });

      const data = await res.json();
      const nextRows = data.rows || [];

      setRows(nextRows);
      buildMarkersFromRows(nextRows);
      setSelectedCountry("");
    } catch (err) {
      console.error("Failed to load day rows", err);
      setRows([]);
    }
  }
  async function handleCountryClick(polygon: any) {
    const countryCode =
      polygon?.properties?.ISO_A3 ||
      polygon?.properties?.iso_a3 ||
      polygon?.properties?.ADM0_A3 ||
      polygon?.properties?.name;

    setSelectedCountry(countryCode);
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/country-click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          country: countryCode,
          date: selectedDate,
        }),
      });

      const data = await res.json();
      const nextRows = data.rows || [];

      setRows(nextRows);
      buildMarkersFromRows(nextRows);
    } catch (err) {
      console.error(err);
      setRows([]);
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    rows.forEach((row) => {
      if (row.url && !previews[row.url]) {
        loadPreview(row.url);
      }
    });
  }, [rows]);
  useEffect(() => {
    loadDayRows(selectedDate);
  }, [selectedDate]);
  useEffect(() => {
    fetch("/countries.geojson")
      .then((res) => res.json())
      .then((data) => setCountries(data.features));
  }, []);
  // useEffect(() => {
  //   const urls = rows
  //     .map((row) => row.url)
  //     .filter((url): url is string => Boolean(url));

  //   if (urls.length === 0) return;

  //   startStreaming(urls);
  // }, [rows]);
  useEffect(() => {
    const urls = rows.map(r => r.url).filter(Boolean) as string[];
    if (!urls.length) return;

    wsRef.current?.close();
    setLlmResults("");
    setLlmLoading(true);
    initializeStreamingAudio();

    const ws = new WebSocket("ws://127.0.0.1:5000/ws-summary");
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ urls }));

    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);

      if (msg.type === "text") {
        setLlmResults(prev => prev + msg.delta);
      } else if (msg.type === "audio") {
        audioQueueRef.current.push(base64ToUint8Array(msg.data));
        appendNextAudioChunk();
      } else if (msg.type === "done") {
        setLlmLoading(false);
        const ms = mediaSourceRef.current;
        const sb = sourceBufferRef.current;
        if (ms && sb && ms.readyState === "open" && !sb.updating) {
          ms.endOfStream();
        }
      }
    };

    ws.onerror = () => setLlmLoading(false);
    ws.onclose = () => setLlmLoading(false);

    return () => ws.close();
  }, [rows]);
  const labelHtml = useMemo(
    () => (point: Marker) => `
      <div style="padding:6px 8px;border-radius:8px;background:rgba(15,23,42,0.92);color:white;font-size:12px;">
        <strong>${point.name}</strong><br/>
        Lat: ${point.lat.toFixed(2)}<br/>
        Lng: ${point.lng.toFixed(2)}
      </div>
    `,
    []
  );

  const addMarker = (coords: { lat: number; lng: number }) => {
    const next: Marker = {
      id: Date.now(),
      lat: Number(coords.lat.toFixed(4)),
      lng: Number(coords.lng.toFixed(4)),
      name: `Pinned spot ${markers.length + 1}`,
      size: 0.22,
      color: '#f43f5e'
    };

    setMarkers((current) => [...current, next]);
    setSelected(next);
  };

  return (
    <main className="page">
      <section className="hero">
        <div className="leftColumn">
          <div className="copy">
            <p className="eyebrow">Phase 1</p>
            <h1>World News</h1>

            <div className="panel">
              <h2>Date</h2>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="panel">
              <h2>
                {selectedCountry ? `${selectedCountry} — ${selectedDate}` : "Country Results"}
              </h2>

              <div className="resultsBox">
                {loading ? (
                  <p>Loading...</p>
                ) : rows.length === 0 ? (
                  <p>No data yet. Click a country.</p>
                ) : (
                  rows.map((row, i) => (
                    <div key={`${row.url}-${i}`} className="resultItem">
                      <p>
                        <strong>{row.source_country}</strong> → {row.target_country}
                      </p>
                      <p>Mentions: {row.number_of_mentions}</p>
                      <p>Goldstein: {row.goldstein}</p>

                      <a href={row.url} target="_blank" rel="noreferrer">
                        Open article
                      </a>

                      {previews[row.url] && !previews[row.url].error ? (
                        <div className="previewCard">
                          {previews[row.url].image && (
                            <img
                              src={previews[row.url].image}
                              alt={previews[row.url].title || "Article preview"}
                              loading="lazy"
                              style={{
                                width: "100%",
                                borderRadius: "8px",
                                marginTop: "8px",
                                marginBottom: "8px",
                              }}
                            />
                          )}
                          <p><strong>{previews[row.url].title}</strong></p>
                          <p>{previews[row.url].description}</p>
                        </div>
                      ) : previews[row.url]?.error ? (
                        <p>Preview unavailable</p>
                      ) : (
                        <p>Preview not loaded</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="globeWrap">
          <Globe
            width={520}
            height={520}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
            pointsData={markers}
            pointLat="lat"
            pointLng="lng"
            pointAltitude="size"
            pointRadius={0.38}
            pointColor="color"
            pointLabel={labelHtml}
            onPointClick={(point: object) => setSelected(point as Marker)}
            onGlobeClick={(coords: { lat: number; lng: number }) => addMarker(coords)}
            onPolygonClick={(polygon: any) => handleCountryClick(polygon)}
            polygonsData={countries}
            polygonCapColor={(d: any) =>
              d === hoverD ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0)"
            }
            polygonSideColor={() => "rgba(0,0,0,0)"}
            polygonStrokeColor={(d: any) =>
              d === hoverD ? "#ffffff" : "rgba(255,255,255,0.15)"
            }
            polygonAltitude={(d: any) => (d === hoverD ? 0.01 : 0.001)}
            polygonLabel={(d: any) => d.properties?.NAME || d.properties?.name || ""}
            onPolygonHover={(polygon: any) => setHoverD(polygon)}
          />
        </div>

        <div className="rightColumn">
          <div className="llmBox">
            <AudioOrb audioRef={audioRef} active={llmLoading || !!llmResults} size={260} />

            {llmLoading && !llmResults ? (
              <p>Thinking...</p>
            ) : llmResults ? (
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                {llmResults}
              </pre>
            ) : (
              <p>No summary yet.</p>
            )}
            <button
              onClick={() => audioRef.current?.play()}
              style={{
                padding: "12px 20px",
                borderRadius: "14px",
                border: "1px solid rgba(120,160,255,0.28)",
                background: "linear-gradient(135deg, rgba(70,110,255,0.22), rgba(140,90,255,0.18))",
                color: "#eef3ff",
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "0.2px",
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(40,60,140,0.28)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px) scale(1.01)";
                e.currentTarget.style.boxShadow = "0 14px 36px rgba(40,60,140,0.36)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(40,60,140,0.28)";
              }}
            >
              Enable Audio
            </button>
            <audio ref={audioRef} style={{ display: "none" }} />
          </div>
        </div>
      </section>
    </main>
  );
}
