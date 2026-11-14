"use client";
// Role 4 (Experience). The 1280x720 stage Channel films into FaceTime.
// Open http://localhost:3000/stage?sessionId=demo&debug=1 to fire events by hand.
//
// Layout (40 px safe margin on every edge, FaceTime crops):
//   left column  x 40..440   caption bubble on top, character (400x500) at the bottom
//   right column x 480..1240 scene / map (top, 300 tall), Odyssey text (bottom)
//
// Every image has a drawn fallback (SVG character, SVG map, titled scene card), so the stage
// looks finished before the real art exists in assets/.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CharacterId, MapLocation, Passage, StageEvent } from "@odyssey/contracts";
import { passages, episodes } from "@odyssey/story";

const BRAIN_WS = process.env.NEXT_PUBLIC_BRAIN_WS ?? "ws://localhost:8080";
const MOUTH_IDLE_MS = 200; // close the mouth if no mouth event arrives for this long

const NAMES: Record<CharacterId, string> = { athena: "Athena", odysseus: "Odysseus", poseidon: "Poseidon", circe: "Circe" };
const COLORS: Record<CharacterId, string> = { athena: "#5b7a8c", odysseus: "#b5532b", poseidon: "#2f5d7c", circe: "#6b4c7a" };

function mouthFrame(level: number) {
  if (level < 0.1) return 0;
  if (level < 0.3) return 1;
  if (level < 0.6) return 2;
  return 3;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV"];

type Visual = { kind: "scene" | "map"; id: string; n: number };
type Cast = { left: CharacterId; right: CharacterId | null; speaking: CharacterId };

// Remembers which asset URLs 404'd so we can draw the fallback instead. `probe` catches images
// that already failed during server render, before React attached onError.
function useImageFallback() {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const fail = (src: string) => setFailed((s) => (s.has(src) ? s : new Set(s).add(src)));
  return {
    ok: (src: string) => !failed.has(src),
    fail,
    probe: (src: string) => (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth === 0) fail(src);
    },
  };
}

export default function Stage() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "demo";
  const debug = params.get("debug") === "1";

  const [cast, setCast] = useState<Cast>({ left: "athena", right: null, speaking: "athena" });
  const [mouth, setMouth] = useState<Partial<Record<CharacterId, number>>>({});
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [visuals, setVisuals] = useState<Visual[]>([]); // last two, newest last, for cross-fade
  const [caption, setCaption] = useState("");
  const [connected, setConnected] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const mouthTimers = useRef<Partial<Record<CharacterId, ReturnType<typeof setTimeout>>>>({});
  const visualN = useRef(0);

  const showVisual = (kind: Visual["kind"], id: string) =>
    setVisuals((v) => [...v.slice(-1), { kind, id, n: ++visualN.current }]);

  const apply = (e: StageEvent) => {
    switch (e.type) {
      case "character":
        setCast((c) =>
          e.side === "right" ? { ...c, right: e.character, speaking: e.character }
          : e.side === "left" ? { ...c, left: e.character, speaking: e.character }
          : { left: e.character, right: null, speaking: e.character }, // no side = solo
        );
        break;
      case "mouth": {
        const ch = e.character;
        setMouth((m) => ({ ...m, [ch]: mouthFrame(e.level) }));
        if (e.level >= 0.1) setCast((c) => (c.speaking === ch ? c : { ...c, speaking: ch }));
        clearTimeout(mouthTimers.current[ch]);
        mouthTimers.current[ch] = setTimeout(() => setMouth((m) => ({ ...m, [ch]: 0 })), MOUTH_IDLE_MS);
        break;
      }
      case "highlight": setHighlighted(e.passageIds); break;
      case "scene": showVisual("scene", e.sceneId); break;
      case "map": showVisual("map", e.locationId); break;
      case "caption": setCaption(e.text); break;
      case "clear": setHighlighted([]); setVisuals([]); setCaption(""); break;
    }
  };

  // Stage socket with auto-reconnect.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(`${BRAIN_WS}/stage?sessionId=${encodeURIComponent(sessionId)}`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (m) => {
        try { apply(JSON.parse(m.data) as StageEvent); } catch { /* ignore malformed */ }
      };
      ws.onclose = () => { setConnected(false); if (!closed) setTimeout(connect, 1000); };
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }, [sessionId]);

  // Scroll the first highlighted passage to the middle of the text panel.
  useEffect(() => {
    const panel = textRef.current;
    const el = highlighted[0] && panel?.querySelector<HTMLElement>(`[data-pid="${highlighted[0]}"]`);
    if (!panel || !el) return;
    panel.scrollTo({ top: el.offsetTop - panel.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [highlighted]);

  const debate = cast.right !== null;

  return (
    <div className="stage">
      {/* Caption bubble (top left) */}
      <div className={`caption ${caption ? "show" : ""}`}>{caption}</div>

      {/* Character(s) (bottom left). In debate mode both share the column, the silent one dimmed. */}
      {debate ? (
        <>
          <Character id={cast.left} frame={mouth[cast.left] ?? 0} active={cast.speaking === cast.left} box={{ left: 20, width: 230 }} />
          <Character id={cast.right!} frame={mouth[cast.right!] ?? 0} active={cast.speaking === cast.right} box={{ left: 230, width: 230 }} flip />
        </>
      ) : (
        <Character id={cast.left} frame={mouth[cast.left] ?? 0} active box={{ left: 40, width: 400 }} />
      )}

      {/* Visual panel: scene or map (top right) */}
      <div className="visual">
        {visuals.length === 0 && <div className="visual-empty">ΟΔΥΣΣΕΙΑ</div>}
        {visuals.map((v) => (
          <div key={v.n} className="fade-in layer">
            {v.kind === "scene" ? <Scene id={v.id} /> : <JourneyMap locationId={v.id} />}
          </div>
        ))}
      </div>

      {/* Text panel (bottom right) */}
      <TextPanel ref={textRef} highlighted={highlighted} />

      {debug && <DebugPanel onEvent={apply} connected={connected} sessionId={sessionId} />}
    </div>
  );
}

// ---------- character ----------

function Character({ id, frame, active, box, flip }: { id: CharacterId; frame: number; active: boolean; box: { left: number; width: number }; flip?: boolean }) {
  const img = useImageFallback();
  const body = `/assets/characters/${id}/body.png`;
  return (
    <div key={id} className={`character fade-in ${active ? "" : "dim"}`} style={{ left: box.left, width: box.width }}>
      <div className="sway" style={{ transform: flip ? "scaleX(-1)" : undefined }}>
        {img.ok(body) ? (
          <>
            <img ref={img.probe(body)} src={body} alt={NAMES[id]} onError={() => img.fail(body)} className="layer contain" />
            {/* Preload all mouth frames so switching never flickers */}
            {[0, 1, 2, 3].map((f) => (
              <img key={f} ref={img.probe(body)} src={`/assets/characters/${id}/mouth-${f}.png`} alt="" className="layer contain"
                style={{ opacity: f === frame ? 1 : 0 }} onError={() => img.fail(body)} />
            ))}
          </>
        ) : (
          <PlaceholderFigure id={id} frame={frame} />
        )}
      </div>
      <div className="nameplate">{NAMES[id]}</div>
    </div>
  );
}

// Drawn stand-in until assets/characters/<id>/*.png exist. Same mouth thresholds, plus a blink.
function PlaceholderFigure({ id, frame }: { id: CharacterId; frame: number }) {
  const c = COLORS[id];
  const mouthH = [2, 6, 12, 18][frame];
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMax meet" className="layer">
      <path d="M80 500 Q90 300 200 280 Q310 300 320 500 Z" fill={c} />
      <path d="M140 500 L200 300 L260 500" fill="none" stroke="#1d1a16" strokeWidth="3" opacity="0.4" />
      <circle cx="200" cy="190" r="90" fill="#e6b98f" stroke="#1d1a16" strokeWidth="4" />
      {id === "athena" && <path d="M105 170 Q200 40 295 170 L280 120 Q200 60 120 120 Z" fill="#8a8f96" stroke="#1d1a16" strokeWidth="4" />}
      {id === "poseidon" && <path d="M120 240 Q200 330 280 240 Q260 300 200 310 Q140 300 120 240 Z" fill="#dfe6ea" stroke="#1d1a16" strokeWidth="3" />}
      {id === "odysseus" && <path d="M125 240 Q200 310 275 240 Q255 285 200 292 Q145 285 125 240 Z" fill="#4a3426" />}
      {id === "circe" && <path d="M110 200 Q100 90 200 95 Q300 90 290 200 Q300 300 320 340 L280 300 Q290 180 200 130 Q110 180 120 300 L80 340 Q100 300 110 200 Z" fill="#2b1d2f" />}
      <g className="blink">
        <ellipse cx="168" cy="180" rx="9" ry="11" fill="#1d1a16" />
        <ellipse cx="232" cy="180" rx="9" ry="11" fill="#1d1a16" />
      </g>
      <ellipse cx="200" cy="232" rx={18 + frame * 2} ry={mouthH} fill="#5a1f14" style={{ transition: "ry 60ms" }} />
    </svg>
  );
}

// ---------- scene & map ----------

function Scene({ id }: { id: string }) {
  const img = useImageFallback();
  const src = `/assets/scenes/${id}.png`;
  const ep = episodes.find((e) => e.sceneId === id);
  if (img.ok(src)) return <img ref={img.probe(src)} src={src} alt={ep?.title ?? id} onError={() => img.fail(src)} className="layer cover" />;
  return (
    <div className="layer scene-fallback">
      <div className="scene-title">{ep?.title ?? id}</div>
      {ep && <div className="scene-sub">{ep.summary}</div>}
    </div>
  );
}

function JourneyMap({ locationId }: { locationId: string }) {
  const img = useImageFallback();
  const [locs, setLocs] = useState<MapLocation[]>([]);
  useEffect(() => {
    fetch("/assets/map/locations.json").then((r) => r.json()).then(setLocs).catch(() => setLocs([]));
  }, []);
  const base = "/assets/map/base.png";
  const troy = locs.find((l) => l.id === "troy");
  const here = locs.find((l) => l.id === locationId);
  // Map panel is 760x300; locations are in percent, so draw in a 100x100 box stretched to fit.
  return (
    <div className="layer">
      {img.ok(base)
        ? <img ref={img.probe(base)} src={base} alt="Journey map" onError={() => img.fail(base)} className="layer cover" />
        : <div className="layer map-fallback" />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="layer">
        {troy && here && (
          <line x1={troy.x} y1={troy.y} x2={here.x} y2={here.y} stroke="#7a2e14" strokeWidth="0.6"
            strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" className="route" />
        )}
      </svg>
      {locs.map((l) => (
        <div key={l.id} className={`pin ${l.id === locationId ? "here" : ""}`} style={{ left: `${l.x}%`, top: `${l.y}%` }}>
          <span className="dot" />
          {(l.id === locationId || l.id === "troy") && <span className="pin-label">{l.name}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- text ----------

function TextPanel({ ref, highlighted }: { ref: React.Ref<HTMLDivElement>; highlighted: string[] }) {
  const books = useMemo(() => {
    const m = new Map<number, Passage[]>();
    for (const p of passages) m.set(p.book, [...(m.get(p.book) ?? []), p]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, []);
  return (
    <div ref={ref} className="text">
      {books.map(([book, ps]) => (
        <section key={book}>
          <h2 className="book-title">Book {ROMAN[book] ?? book}</h2>
          {ps.map((p) => (
            <p key={p.id} data-pid={p.id} className={`passage ${highlighted.includes(p.id) ? "lit" : ""}`}>
              <span className="pid">{p.id}</span>{p.text}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------- debug ----------

function DebugPanel({ onEvent, connected, sessionId }: { onEvent: (e: StageEvent) => void; connected: boolean; sessionId: string }) {
  const [talker, setTalker] = useState<CharacterId>("athena");
  const talking = useRef<ReturnType<typeof setInterval> | null>(null);
  const btn = (label: string, e: StageEvent) => (
    <button key={label} onClick={() => onEvent(e)}>{label}</button>
  );
  // Fake speech: random mouth levels every 50 ms, like Brain will send.
  const toggleTalk = () => {
    if (talking.current) { clearInterval(talking.current); talking.current = null; return; }
    talking.current = setInterval(() => onEvent({ type: "mouth", character: talker, level: Math.random() }), 50);
  };
  useEffect(() => () => { if (talking.current) clearInterval(talking.current); }, []);
  const ids: CharacterId[] = ["athena", "odysseus", "poseidon", "circe"];
  return (
    <div className="debug">
      <div><b>{connected ? "● brain connected" : "○ brain offline"}</b> · session {sessionId}</div>
      <div>{ids.map((c) => btn(c, { type: "character", character: c }))}</div>
      <div>debate: {btn("odysseus | poseidon", { type: "character", character: "odysseus", side: "left" })}
        {btn("+ poseidon right", { type: "character", character: "poseidon", side: "right" })}</div>
      <div>
        talk as <select value={talker} onChange={(e) => setTalker(e.target.value as CharacterId)}>{ids.map((c) => <option key={c}>{c}</option>)}</select>
        <button onClick={toggleTalk}>start/stop talking</button>
        {[0, 0.2, 0.5, 0.9].map((l) => btn(`mouth ${l}`, { type: "mouth", character: talker, level: l }))}
      </div>
      <div>
        {passages.slice(0, 3).map((p) => btn(`hl ${p.id}`, { type: "highlight", passageIds: [p.id] }))}
        {episodes.map((e) => btn(`scene ${e.sceneId}`, { type: "scene", sceneId: e.sceneId }))}
        {episodes.map((e) => btn(`map ${e.locationId}`, { type: "map", locationId: e.locationId }))}
        {btn("map aeaea", { type: "map", locationId: "aeaea" })}
      </div>
      <div>
        {btn("caption", { type: "caption", text: "Tie yourself to the mast before the song begins." })}
        {btn("clear", { type: "clear" })}
      </div>
    </div>
  );
}
