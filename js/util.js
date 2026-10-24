// 공통 도구 — 화면 요소 찾기, 알림, 필요할 때 불러오는 도구, 파일 받기, 좌표계
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString("ko-KR", { maximumFractionDigits: d });
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const toast = (msg, ms = 2600) => {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, ms);
  };

  const LIB = {
    turf: "https://cdn.jsdelivr.net/npm/@turf/turf@7.1.0/turf.min.js",
    shp: "https://cdn.jsdelivr.net/npm/shpjs@4.0.4/dist/shp.min.js",
    jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  };
  const scripts = new Map();
  const loadScript = (url, global) => {
    if (global && window[global]) return Promise.resolve();
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = () => { scripts.delete(url); s.remove(); reject(new Error("도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.")); };
      document.head.appendChild(s);
    }));
    return scripts.get(url);
  };

  // 브라우저에서 만든 파일 받기. 임시 주소는 바로 지우면 받기가 실패할 수 있어 넉넉히 둔 뒤 지움
  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "사업지";

  // ---------- 좌표계 ----------
  const BESSEL = "+ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";
  const tm = (lon0, y0, datum = "+ellps=GRS80") => `+proj=tmerc +lat_0=38 +lon_0=${lon0} +k=1 +x_0=200000 +y_0=${y0} ${datum} +units=m +no_defs`;
  const UTMK = "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";
  const CRS = [
    { id: "4326", name: "WGS84 경위도 (위도, 경도)" },
    { id: "5186", name: "EPSG:5186 중부원점 (GRS80)", def: tm(127, 600000) },
    { id: "5185", name: "EPSG:5185 서부원점 (GRS80)", def: tm(125, 600000) },
    { id: "5187", name: "EPSG:5187 동부원점 (GRS80)", def: tm(129, 600000) },
    { id: "5188", name: "EPSG:5188 동해원점 (GRS80)", def: tm(131, 600000) },
    { id: "5179", name: "EPSG:5179 UTM-K (GRS80)", def: UTMK },
    { id: "5181", name: "EPSG:5181 중부원점 (GRS80, Y 500000)", def: tm(127, 500000) },
    { id: "5174", name: "EPSG:5174 보정 중부원점 (Bessel, 옛 지적)", def: tm(127.0028902777778, 500000, BESSEL) },
    { id: "2097", name: "EPSG:2097 중부원점 (Bessel)", def: tm(127, 500000, BESSEL) },
    { id: "32652", name: "EPSG:32652 UTM 52N (WGS84)", def: "+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs" },
  ];
  const crsDef = (id) => (CRS.find((c) => c.id === id) || {}).def;

  // 도형 도구
  const feat = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
  const eachXY = (c, fn) => { if (typeof c[0] === "number") fn(c); else c.forEach((x) => eachXY(x, fn)); };
  const mapCoords = (c, fn) => (typeof c[0] === "number" ? fn(c) : c.map((x) => mapCoords(x, fn)));
  const bboxOf = (features) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    features.forEach((f) => eachXY(f.geometry.coordinates, ([x, y]) => {
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }));
    return b;
  };
  const kindOf = (g) => (/Point/.test(g.type) ? "point" : /LineString/.test(g.type) ? "line" : "polygon");

  window.U = { $, $$, esc, fmt, debounce, tick, toast, LIB, loadScript, saveBlob, safeName, CRS, crsDef, BESSEL, UTMK, feat, eachXY, mapCoords, bboxOf, kindOf };
})();
