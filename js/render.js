// 도면 그리기 — 용지(mm) 좌표로 그리는 펜(캔버스·SVG 두 가지)에 바탕 위성영상, 토지피복 산림·수계 면,
// 오픈스트리트맵 이름표·흐름 방향, 사업지구·주변 범위, 방위표·축척 막대·범례·좌표 격자·출처를 그림
(() => {
  const { UTMK, crsDef } = U;
  const RE = 6378137, RAD = Math.PI / 180, PT = 25.4 / 72, WORLD = 2 * Math.PI * RE;
  const FONT = '"Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  const mx = (lon) => RE * lon * RAD;
  const my = (lat) => RE * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
  const ilon = (x) => x / RE / RAD;
  const ilat = (y) => (2 * Math.atan(Math.exp(y / RE)) - Math.PI / 2) / RAD;

  const COLOR = {
    site: "#e8212b", forest: "#5cc84a", water: "#1fc8d8", waterText: "#0b6aa8", peak: "#2b8a3e",
    flow: "#1864ab", arrowForest: "#1f8a37", arrowWater: "#1c7ed6",
    rings: ["#ffe14d", "#ffffff", "#7fd3ff", "#ff9f40", "#d0bfff"],
  };
  // 생태·자연도 색(1·2등급·별도관리지역)과 투명도
  const NAT = { g1: "#2f9a41", g2: "#9fd58f", sep: "#f2bfa6", op: 0.62 };
  const SCALES = [1000, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
  // 전국 도면(식생기후대·식물상 지역): 남한 본토·제주가 틀에 드는 축척
  const NATIONAL = ["veg", "flo"];
  const NATIONAL_SCALES = [500000, 750000, 1000000, 1500000, 2000000, 2500000, 3000000, 3500000, 4000000, 5000000];
  const KOREA_BOX = [124.55, 33.05, 130.0, 38.65];
  const scalesFor = (fig) => (NATIONAL.includes(fig.kind) ? NATIONAL_SCALES : SCALES);
  const PAPER = { A4: [210, 297], A3: [297, 420] };

  // ---------- 글자 ----------
  const mctx = document.createElement("canvas").getContext("2d");
  const textW = (str, size, weight = 400) => { mctx.font = `${weight} ${size * PT * 10}px ${FONT}`; return mctx.measureText(str).width / 10; };
  // 가운데·위 맞춤을 기준선(alphabetic) 위치로 바꿔 캔버스와 SVG가 같게 나오게 함
  const baseY = (size, base) => { const em = size * PT; return base === "middle" ? 0.36 * em : base === "top" ? 0.8 * em : 0; };
  const ensureFonts = async (strings) => {
    if (!document.fonts || !document.fonts.load) return;
    const text = [...new Set(strings.join(""))].join("");
    try { await Promise.race([document.fonts.load(`700 16px "Pretendard Variable"`, text), new Promise((r) => setTimeout(r, 4000))]); } catch (_) { /* 기본 글꼴로 */ }
  };

  // ---------- 펜 ----------
  class CanvasPen {
    constructor(ctx, k) { this.c = ctx; this.k = k; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingQuality = "high"; }
    path(parts, s) {
      const c = this.c;
      c.beginPath();
      let any = false;
      for (const p of parts) {
        if (p.length < 2) continue;
        any = true;
        c.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
        if (s.closed) c.closePath();
      }
      if (!any) return;
      if (s.fill) { c.globalAlpha = s.fillOpacity ?? 1; c.fillStyle = s.fill; c.fill("evenodd"); }
      if (s.stroke) {
        c.globalAlpha = s.strokeOpacity ?? 1;
        c.strokeStyle = s.stroke;
        c.lineWidth = s.width || 0.2;
        c.setLineDash(s.dash || []);
        c.lineJoin = s.join || "round";
        c.lineCap = s.cap || "round";
        c.stroke();
        c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
    text(str, x, y, s) {
      const c = this.c, k = this.k;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.translate(x * k, y * k);
      if (s.angle) c.rotate(s.angle * RAD);
      c.font = `${s.weight || 400} ${s.size * PT * k}px ${FONT}`;
      c.textAlign = s.align || "left";
      c.textBaseline = "alphabetic";
      const yb = baseY(s.size, s.base) * k;
      if (s.halo) { c.lineJoin = "round"; c.miterLimit = 2; c.strokeStyle = s.halo; c.lineWidth = (s.haloWidth || 0.5) * 2 * k; c.strokeText(str, 0, yb); }
      c.fillStyle = s.color || "#000";
      c.fillText(str, 0, yb);
      c.restore();
    }
    // opt.pixel: 구분도처럼 칸 경계를 또렷하게(늘릴 때 흐리게 섞지 않음). opt.png는 SVG에서만 씀
    image(img, x, y, w, h, opt = {}) {
      if (opt.pixel) this.c.imageSmoothingEnabled = false;
      this.c.drawImage(img, x, y, w, h);
      this.c.imageSmoothingEnabled = true;
    }
    clip(x, y, w, h) { this.c.save(); this.c.beginPath(); this.c.rect(x, y, w, h); this.c.clip(); }
    unclip() { this.c.restore(); }
  }
  const n2 = (v) => +v.toFixed(2);
  const ex = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  class SvgPen {
    constructor(W, H) { this.W = W; this.H = H; this.o = []; this.nClip = 0; }
    path(parts, s) {
      let d = "";
      for (const p of parts) {
        if (p.length < 2) continue;
        d += "M" + p.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L") + (s.closed ? "Z" : "");
      }
      if (!d) return;
      const a = [`d="${d}"`, s.fill ? `fill="${s.fill}" fill-rule="evenodd"` : `fill="none"`];
      if (s.fill && s.fillOpacity != null && s.fillOpacity < 1) a.push(`fill-opacity="${s.fillOpacity}"`);
      if (s.stroke) {
        a.push(`stroke="${s.stroke}" stroke-width="${n2(s.width || 0.2)}" stroke-linejoin="${s.join || "round"}" stroke-linecap="${s.cap || "round"}"`);
        if (s.dash && s.dash.length) a.push(`stroke-dasharray="${s.dash.map(n2).join(" ")}"`);
        if (s.strokeOpacity != null && s.strokeOpacity < 1) a.push(`stroke-opacity="${s.strokeOpacity}"`);
      }
      this.o.push(`<path ${a.join(" ")}/>`);
    }
    text(str, x, y, s) {
      const anchor = { left: "start", center: "middle", right: "end" }[s.align || "left"];
      const common = `x="0" y="${n2(baseY(s.size, s.base))}" font-family='${FONT}' font-size="${n2(s.size * PT)}" font-weight="${s.weight || 400}" text-anchor="${anchor}"`;
      let g = `<g transform="translate(${n2(x)} ${n2(y)})${s.angle ? ` rotate(${n2(s.angle)})` : ""}">`;
      if (s.halo) g += `<text ${common} fill="${s.halo}" stroke="${s.halo}" stroke-width="${n2((s.haloWidth || 0.5) * 2)}" stroke-linejoin="round">${ex(str)}</text>`;
      g += `<text ${common} fill="${s.color || "#000"}">${ex(str)}</text></g>`;
      this.o.push(g);
    }
    image(img, x, y, w, h, opt = {}) {
      const url = img.toDataURL ? (opt.png ? img.toDataURL("image/png") : img.toDataURL("image/jpeg", 0.9)) : img.src;
      this.o.push(`<image x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="none"${opt.pixel ? ' style="image-rendering:pixelated"' : ""} xlink:href="${url}"/>`);
    }
    clip(x, y, w, h) {
      const id = `clip${++this.nClip}`;
      this.o.push(`<clipPath id="${id}"><rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}"/></clipPath><g clip-path="url(#${id})">`);
    }
    unclip() { this.o.push("</g>"); }
    toString() {
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
        `width="${this.W}mm" height="${this.H}mm" viewBox="0 0 ${this.W} ${this.H}">\n${this.o.join("\n")}\n</svg>\n`;
    }
  }
  // 글자만 모으는 펜(글꼴을 미리 받으려고 한 번 그려 봄)
  class NullPen {
    constructor() { this.strings = []; }
    path() {} image() {} clip() {} unclip() {}
    text(str) { this.strings.push(str); }
  }

  // ---------- 용지·지도 변환 ----------
  const layout = (fig) => {
    const [a, b] = PAPER[fig.paper] || PAPER.A4;
    const W = fig.orient === "port" ? a : b, H = fig.orient === "port" ? b : a;
    const e = fig.paper === "A3" ? 1.3 : 1;   // 도면 요소 크기 배율
    const m = 10 * e;
    const top = fig.el.title && fig.title ? 13 * e : 0;
    const foot = 6 * e;
    return { W, H, e, frame: { x: m, y: m + top, w: W - 2 * m, h: H - 2 * m - top - foot }, m, top, foot };
  };
  // 웹 메르카토르를 가운데 위도에서 1/cos φ만큼 줄여 실제 축척을 맞춤(도면 범위 몇 km 안에서는 차이가 아주 작음)
  const makeView = (frame, lon0, lat0, scale) => {
    const m = scale / 1000 / Math.cos(lat0 * RAD);   // 용지 1 mm = 메르카토르 m
    const X0 = mx(lon0), Y0 = my(lat0);
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    const v = {
      frame, scale, lon0, lat0, m, X0, Y0,
      fromM: (X, Y) => [cx + (X - X0) / m, cy - (Y - Y0) / m],
      toM: (px, py) => [X0 + (px - cx) * m, Y0 - (py - cy) * m],
      fromLL: (lon, lat) => [cx + (mx(lon) - X0) / m, cy - (my(lat) - Y0) / m],
      toLL: (px, py) => [ilon(X0 + (px - cx) * m), ilat(Y0 - (py - cy) * m)],
    };
    v.mBox = [X0 - (frame.w / 2) * m, Y0 - (frame.h / 2) * m, X0 + (frame.w / 2) * m, Y0 + (frame.h / 2) * m];
    v.llBox = [ilon(v.mBox[0]), ilat(v.mBox[1]), ilon(v.mBox[2]), ilat(v.mBox[3])];
    return v;
  };
  const centerOf = (fig, site) => {
    const b = NATIONAL.includes(fig.kind) ? KOREA_BOX : U.bboxOf(site.features);
    const X = (mx(b[0]) + mx(b[2])) / 2 + (fig.offset ? fig.offset[0] : 0);
    const Y = (my(b[1]) + my(b[3])) / 2 + (fig.offset ? fig.offset[1] : 0);
    return [ilon(X), ilat(Y)];
  };
  // 주변 범위를 그리는지: 위성 현황도는 늘, 생태축·생태·자연도는 켰을 때
  const ringsOn = (fig) => fig.kind === "sat" || (fig.kind === "eco" && fig.eco.rings) || (fig.kind === "nat" && fig.nat.rings);
  // 자동 축척: 위성 현황도는 가장 큰 주변 범위, 생태축·생태·자연도는 사업지구 둘레 1 km(주변 범위를 켜면 그 범위)가 틀에 들도록
  const autoScale = (fig, site) => {
    const { frame } = layout(fig);
    const b = U.bboxOf(site.features);
    const lat0 = (b[1] + b[3]) / 2;
    if (NATIONAL.includes(fig.kind)) {
      const k = KOREA_BOX, lat = (k[1] + k[3]) / 2;
      const need = Math.max(((mx(k[2]) - mx(k[0])) * Math.cos(lat * RAD)) / (frame.w * 0.96), ((my(k[3]) - my(k[1])) * Math.cos(lat * RAD)) / (frame.h * 0.96)) * 1000;
      return NATIONAL_SCALES.find((v) => v >= need) || NATIONAL_SCALES[NATIONAL_SCALES.length - 1];
    }
    const rings = ringsOn(fig) ? fig.rings : [];
    const padKm = rings.length ? Math.max(...rings) : fig.kind === "sat" ? 0.5 : 1;
    const wM = (mx(b[2]) - mx(b[0])) * Math.cos(lat0 * RAD) + 2 * padKm * 1000;
    const hM = (my(b[3]) - my(b[1])) * Math.cos(lat0 * RAD) + 2 * padKm * 1000;
    const need = Math.max(wM / (frame.w * 0.95), hM / (frame.h * 0.95)) * 1000;
    return SCALES.find((s) => s >= need) || SCALES[SCALES.length - 1];
  };

  // ---------- 바탕지도: 위성영상(Esri World Imagery)·브이월드 백지도 ----------
  const ESRI = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  // 브이월드 인증키는 저장소에 넣지 않고 배포할 때 js/config.js로 넣음(로컬 시험은 인증키 저장.bat)
  const VW_KEY = (window.FIG_CONFIG || {}).vworldKey || "";
  // 바탕지도 종류. key: 브이월드 인증키가 있어야 함. darken: 옅은 선을 보고서용으로 진하게(흰색과의 차이를 darken배)
  const VW = (layer, ext) => (z, x, y) => `https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/${layer}/${z}/${y}/${x}.${ext}`;
  const BASES = {
    sat: { name: "위성영상(Esri)", url: ESRI, max: 19, bg: "#d9dee2", src: "영상: Esri World Imagery(Esri, Maxar, Earthstar Geographics)" },
    vsat: { name: "위성영상(브이월드)", url: VW("Satellite", "jpeg"), max: 19, bg: "#d9dee2", key: true, src: "영상: 국토교통부 브이월드 위성영상" },
    vbase: { name: "브이월드 기본지도", url: VW("Base", "png"), max: 19, bg: "#ffffff", key: true, src: "바탕: 국토교통부 브이월드 기본지도" },
    // 백지도: 공원·묘지 같은 옅은 색 면이 진하게 하면 짙은 색이 되므로 흑백으로 바꾼 뒤 진하게
    vwhite: { name: "브이월드 백지도", url: VW("white", "png"), max: 18, bg: "#ffffff", darken: 2.2, gray: true, key: true, src: "바탕: 국토교통부 브이월드 백지도" },
    hill: { name: "지형 음영(Esri)", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/${z}/${y}/${x}`, max: 16, bg: "#ffffff", src: "지형 음영: Esri World Hillshade(Esri, USGS, NASA 등)" },
    none: { name: "흰 바탕" },
  };
  // 위성 위에 겹치는 지명·도로(브이월드 하이브리드, 투명 PNG)
  const LABELS = { url: VW("Hybrid", "png"), max: 19, bg: null, src: "지명: 국토교통부 브이월드" };
  const imgCache = new Map();
  const loadImg = (url) => {
    if (!imgCache.has(url)) {
      imgCache.set(url, new Promise((res) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => res(im);
        im.onerror = () => { imgCache.delete(url); res(null); };
        im.src = url;
      }));
      while (imgCache.size > 900) imgCache.delete(imgCache.keys().next().value);
    }
    return imgCache.get(url);
  };
  const pool = async (jobs, n) => {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) await jobs[i++](); }));
  };
  // 틀 범위를 출력 해상도(k 화소/mm)에 맞는 확대 단계 타일로 이어 붙여 캔버스 하나로
  const basemap = async (v, k, onProgress, alive, src = BASES.sat, gray = false) => {
    const pxW = Math.max(1, Math.round(v.frame.w * k)), pxH = Math.max(1, Math.round(v.frame.h * k));
    const mPerPx = (v.mBox[2] - v.mBox[0]) / pxW;
    let z = Math.max(6, Math.min(src.max, Math.ceil(Math.log2(WORLD / 256 / mPerPx) - 0.25)));
    const [X0, Y0, X1, Y1] = v.mBox;
    let ts, tx0, tx1, ty0, ty1;
    for (;; z--) {
      ts = WORLD / 2 ** z;
      tx0 = Math.floor((X0 + WORLD / 2) / ts); tx1 = Math.floor((X1 + WORLD / 2) / ts);
      ty0 = Math.floor((WORLD / 2 - Y1) / ts); ty1 = Math.floor((WORLD / 2 - Y0) / ts);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 1600 || z <= 6) break;
    }
    const cv = document.createElement("canvas");
    cv.width = pxW; cv.height = pxH;
    const c = cv.getContext("2d");
    if (src.bg) { c.fillStyle = src.bg; c.fillRect(0, 0, pxW, pxH); }
    c.imageSmoothingQuality = "high";
    const jobs = [];
    const total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
    let done = 0, missing = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        jobs.push(async () => {
          if (!alive()) return;
          const im = await loadImg(src.url(z, tx, ty));
          done++;
          onProgress && onProgress(done / total);
          if (!im) { missing++; return; }
          // 화소 경계에 맞춰 붙여 타일 사이 틈이 보이지 않게
          const x0 = Math.round((tx * ts - WORLD / 2 - X0) / mPerPx), x1 = Math.round(((tx + 1) * ts - WORLD / 2 - X0) / mPerPx);
          const y0 = Math.round((Y1 - (WORLD / 2 - ty * ts)) / mPerPx), y1 = Math.round((Y1 - (WORLD / 2 - (ty + 1) * ts)) / mPerPx);
          c.drawImage(im, x0, y0, x1 - x0, y1 - y0);
        });
      }
    }
    await pool(jobs, 12);
    // 진하게(백지도)·흑백(선택)
    gray = gray || src.gray;
    if ((src.darken || gray) && alive()) {
      const img = c.getImageData(0, 0, pxW, pxH), d = img.data, f = src.darken || 1;
      for (let i = 0; i < d.length; i += 4) {
        let r = 255 - (255 - d[i]) * f, g = 255 - (255 - d[i + 1]) * f, b = 255 - (255 - d[i + 2]) * f;
        if (gray) r = g = b = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = Math.max(0, r); d[i + 1] = Math.max(0, g); d[i + 2] = Math.max(0, b);
      }
      c.putImageData(img, 0, 0);
    }
    return { canvas: cv, z, missing, total };
  };

  // ---------- 토지피복(환경부 세분류 2025를 10 m 묶음으로, habitat.biogrideia.com 공개 자료) ----------
  const HAB = "https://habitat.biogrideia.com/";
  const LC = { idx: null, tiles: new Map(), cache: null };
  const lcIndex = () => LC.idx || (LC.idx = Promise.all([
    fetch(`${HAB}data/lc10/index.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(`${HAB}data/grid.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  ]).then(([d, g]) => {
    LC.n = (d.cells * g.res) / d.px; LC.px = d.px; LC.x0 = g.x0; LC.y1 = g.y1; LC.groups = d.groups; LC.set = new Set(d.tiles);
    return d;
  }).catch((err) => { LC.idx = null; throw err; }));
  const decodeGray = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    const src = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const cv = document.createElement("canvas");
    cv.width = src.width; cv.height = src.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    src.close && src.close();
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const out = new Uint8Array(cv.width * cv.height);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = d[j];
    return out;
  };
  const lcTile = (key) => {
    if (!LC.set.has(key)) return Promise.resolve(null);
    if (!LC.tiles.has(key)) {
      LC.tiles.set(key, decodeGray(`${HAB}data/lc10/${key}.webp`).catch(() => { LC.tiles.delete(key); return null; }));
      while (LC.tiles.size > 12) LC.tiles.delete(LC.tiles.keys().next().value);
    }
    return LC.tiles.get(key);
  };
  // 수계: 하천(711)·호소(712)·내륙습지(511, 하안습지 등). 갯벌·염전(521·522)은 따로 켜고 끔(바다는 해안선 밖으로 칠함)
  const FOREST = ["broad", "conifer", "mixed"], WATER = ["river", "lake", "wetland"], TIDAL = ["tidal"];
  // 틀(조금 넉넉하게)의 10 m 화소를 0/1 격자로 → 살짝 흐리게 → 0.5 등치선(d3.contours) → 메르카토르 좌표 고리
  const landcover = async (v) => {
    await lcIndex();
    const toU = proj4("WGS84", UTMK), toG = proj4(UTMK, "WGS84");
    const utmBox = (mb) => {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const [x, y] = toU.forward([ilon(mb[0] + ((mb[2] - mb[0]) * i) / 4), ilat(mb[1] + ((mb[3] - mb[1]) * j) / 4)]);
        b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
      }
      return b;
    };
    const need = utmBox(v.mBox);
    const C = LC.cache;
    if (C && C.box[0] <= need[0] && C.box[1] <= need[1] && C.box[2] >= need[2] && C.box[3] >= need[3] && C.res === v.res) return C.val;
    const padX = (need[2] - need[0]) * 0.3, padY = (need[3] - need[1]) * 0.3;
    const box = [need[0] - padX, need[1] - padY, need[2] + padX, need[3] + padY];
    const P = LC.px, N = LC.n;
    const px0 = Math.floor((box[0] - LC.x0) / P), px1 = Math.ceil((box[2] - LC.x0) / P);
    const py0 = Math.floor((LC.y1 - box[3]) / P), py1 = Math.ceil((LC.y1 - box[1]) / P);
    const W = px1 - px0 + 1, H = py1 - py0 + 1;
    if (W * H > 16e6) throw new Error("범위가 너무 넓어 토지피복을 그리지 않았습니다. 축척을 키워 주세요.");
    const lut = new Uint8Array(256);
    LC.groups.forEach((g, i) => { if (FOREST.includes(g)) lut[i + 1] = 1; if (WATER.includes(g)) lut[i + 1] = 2; if (TIDAL.includes(g)) lut[i + 1] = 3; });
    const forest = new Float32Array(W * H), water = new Float32Array(W * H), tidal = new Float32Array(W * H);
    const jobs = [];
    let gotAny = false, zeros = 0, seen = 0;
    for (let ty = Math.floor(py0 / N); ty <= Math.floor(py1 / N); ty++) {
      for (let tx = Math.floor(px0 / N); tx <= Math.floor(px1 / N); tx++) {
        jobs.push(lcTile(`${tx}_${ty}`).then((d) => {
          if (!d) return;
          gotAny = true;
          const ox = tx * N, oy = ty * N;
          const ax = Math.max(px0, ox), bx = Math.min(px1, ox + N - 1), ay = Math.max(py0, oy), by = Math.min(py1, oy + N - 1);
          for (let py = ay; py <= by; py++) {
            const src = (py - oy) * N - ox, dst = (py - py0) * W - px0;
            seen += bx - ax + 1;
            for (let px = ax; px <= bx; px++) {
              if (!d[src + px]) zeros++;
              const c = lut[d[src + px]];
              if (c === 1) forest[dst + px] = 1; else if (c === 2) water[dst + px] = 1; else if (c === 3) tidal[dst + px] = 1;
            }
          }
        }));
      }
    }
    await Promise.all(jobs);
    if (!gotAny) throw new Error("이 범위의 토지피복 자료가 없습니다.");
    d3.blur2({ data: forest, width: W, height: H }, 1);
    d3.blur2({ data: water, width: W, height: H }, 0.6);
    d3.blur2({ data: tidal, width: W, height: H }, 1);
    // d3.contours 좌표는 화소 가장자리 기준(화소 i가 [i, i+1])
    const toMerc = (ring) => {
      const out = new Float64Array(ring.length * 2);
      ring.forEach(([cx, cy], i) => {
        const [lon, lat] = toG.forward([LC.x0 + (px0 + cx) * P, LC.y1 - (py0 + cy) * P]);
        out[2 * i] = mx(lon); out[2 * i + 1] = my(lat);
      });
      return out;
    };
    const vec = (grid, thr) => d3.contours().size([W, H]).thresholds([thr])(grid)[0].coordinates.map((poly) => poly.map(toMerc));
    // 분류 없음(접경지역 등) 비율: 바다 밖인데 값이 없으면 산림·수계가 빠짐
    const val = { forest: vec(forest, 0.5), water: vec(water, 0.42), tidal: vec(tidal, 0.5), nodata: seen ? zeros / seen : 1 };
    LC.cache = { box, val, res: v.res };
    return val;
  };

  // ---------- 오픈스트리트맵(산 이름·저수지 이름·하천 선과 흐름 방향) ----------
  // 한국 OSM 파일에서 미리 뽑아 둔 0.1도 조각(data/osm, tools/build_osm.py). 하천 선의 점 순서가 흐르는 방향
  const OSM = { idx: null, tiles: new Map(), key: "", val: null };
  const osmIndex = () => OSM.idx || (OSM.idx = fetch("data/osm/index.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { OSM.T = d.tile; OSM.set = new Set(d.tiles); return d; })
    .catch((err) => { OSM.idx = null; throw err; }));
  const osmTile = (key) => {
    if (!OSM.set.has(key)) return Promise.resolve(null);
    if (!OSM.tiles.has(key)) {
      OSM.tiles.set(key, fetch(`data/osm/${key}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(() => { OSM.tiles.delete(key); return null; }));
      while (OSM.tiles.size > 80) OSM.tiles.delete(OSM.tiles.keys().next().value);
    }
    return OSM.tiles.get(key);
  };
  const osm = async (v) => {
    await osmIndex();
    const [w, s, e, n] = v.llBox, T = OSM.T;
    const dx = (e - w) * 0.25, dy = (n - s) * 0.25;
    const keys = [];
    for (let tx = Math.floor((w - dx) / T); tx <= Math.floor((e + dx) / T); tx++) {
      for (let ty = Math.floor((s - dy) / T); ty <= Math.floor((n + dy) / T); ty++) keys.push(`${tx}_${ty}`);
    }
    const key = keys.join(",");
    if (OSM.key === key) return OSM.val;
    const got = await Promise.all(keys.map(osmTile));
    const peaks = [], waters = [], ways = [], seen = new Set();
    got.filter(Boolean).forEach((d) => {
      d.p.forEach(([lon, lat, name, ele]) => peaks.push({ id: `p${lon},${lat}`, name, ele, X: mx(lon), Y: my(lat) }));
      d.w.forEach(([lon, lat, name, area]) => waters.push({ id: `w${lon},${lat}`, name, area, X: mx(lon), Y: my(lat) }));
      d.l.forEach((l) => {
        if (seen.has(l.i)) return;
        seen.add(l.i);
        ways.push({ id: `l${l.i}`, name: l.n, kind: l.k === "r" ? "river" : "stream", pts: l.c.map(([lon, lat]) => [mx(lon), my(lat)]) });
      });
    });
    OSM.key = key;
    OSM.val = { peaks, waters, ways };
    return OSM.val;
  };

  // ---------- 하천구역·소하천구역(data/water)과 바다를 가를 육지(data/land) ----------
  // 0.1도 조각 이진 파일(tools/build_water.py·build_land.py): 경위도 1e-7도 정수를 조각 모서리 기준 zigzag varint 차이로 적음
  // 파일 구조: [판] [면 수] {면} … [묶음 수] {번호, 면 수, {면} …} …  (육지는 앞의 면만 씀)
  const decodeBin = (buf, tx, ty, T, Q) => {
    const b = new Uint8Array(buf);
    let i = 1;
    const rv = () => { let u = 0, s = 1, c; do { c = b[i++]; u += (c & 0x7f) * s; s *= 128; } while (c & 0x80); return u; };
    const zd = (u) => (u % 2 ? -(u + 1) / 2 : u / 2);
    const ox = Math.round(tx * T * Q), oy = Math.round(ty * T * Q);
    const poly = () => {
      const rings = [];
      for (let r = rv(); r > 0; r--) {
        const n = rv(), a = new Float64Array(n * 2);
        let x = ox, y = oy;
        for (let k = 0; k < n; k++) { x += zd(rv()); y += zd(rv()); a[2 * k] = mx(x / Q); a[2 * k + 1] = my(y / Q); }
        rings.push(a);
      }
      return rings;
    };
    const polys = [], groups = [];
    for (let k = rv(); k > 0; k--) polys.push(poly());
    for (let k = rv(); k > 0; k--) {
      const id = rv(), ps = [];
      for (let j = rv(); j > 0; j--) ps.push(poly());
      groups.push({ id, ps });
    }
    return { polys, groups };
  };
  // base 폴더의 조각을 틀 범위만큼 받아 합침(묶음은 번호로 한 번만). 목록에 있는 조각을 못 받으면 실패로 봄(바다를 잘못 칠하지 않게)
  const binLayer = (base, decode = decodeBin, merge = null) => {
    const S = { idx: null, tiles: new Map(), key: "", val: null };
    const index = () => S.idx || (S.idx = fetch(`${base}/index.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { S.T = d.tile; S.Q = d.q; S.set = new Set(d.tiles); return d; })
      .catch((err) => { S.idx = null; throw err; }));
    const tile = (key) => {
      if (!S.set.has(key)) return Promise.resolve(null);
      if (!S.tiles.has(key)) {
        const [tx, ty] = key.split("_").map(Number);
        S.tiles.set(key, fetch(`${base}/${key}.bin`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((buf) => decode(buf, tx, ty, S.T, S.Q)).catch((err) => { S.tiles.delete(key); throw err; }));
        while (S.tiles.size > 60) S.tiles.delete(S.tiles.keys().next().value);
      }
      return S.tiles.get(key);
    };
    return async (v) => {
      await index();
      const [w, s, e, n] = v.llBox, T = S.T;
      const keys = [];
      for (let tx = Math.floor(w / T); tx <= Math.floor(e / T); tx++) for (let ty = Math.floor(s / T); ty <= Math.floor(n / T); ty++) keys.push(`${tx}_${ty}`);
      const key = keys.join(",");
      if (S.key === key) return S.val;
      const got = (await Promise.all(keys.map(tile))).filter(Boolean);
      if (merge) { S.key = key; S.val = merge(got, await S.idx); return S.val; }
      const seen = new Set(), polys = [], grouped = [];
      got.forEach((d) => {
        polys.push(...d.polys);
        d.groups.forEach((f) => { if (!seen.has(f.id)) { seen.add(f.id); grouped.push(...f.ps); } });
      });
      S.key = key;
      S.val = { polys, grouped };
      return S.val;
    };
  };
  // 생태·자연도(data/ecnat, tools/build_ecnat.py): 판 2 = [층 수] {[층 번호] [면 수] {면} …} — 1·2등급, 9 별도관리지역
  const decodeLayers = (buf, tx, ty, T, Q) => {
    const b = new Uint8Array(buf);
    let i = 1;
    const rv = () => { let u = 0, s = 1, c; do { c = b[i++]; u += (c & 0x7f) * s; s *= 128; } while (c & 0x80); return u; };
    const zd = (u) => (u % 2 ? -(u + 1) / 2 : u / 2);
    const ox = Math.round(tx * T * Q), oy = Math.round(ty * T * Q);
    const out = {};
    for (let l = rv(); l > 0; l--) {
      const code = rv(), polys = [];
      for (let k = rv(); k > 0; k--) {
        const rings = [];
        for (let r = rv(); r > 0; r--) {
          const n = rv(), a = new Float64Array(n * 2);
          let x = ox, y = oy;
          for (let j = 0; j < n; j++) { x += zd(rv()); y += zd(rv()); a[2 * j] = mx(x / Q); a[2 * j + 1] = my(y / Q); }
          rings.push(a);
        }
        polys.push(rings);
      }
      out[code] = polys;
    }
    return out;
  };
  const mergeLayers = (got, idx) => {
    const out = { 1: [], 2: [], 9: [], source: idx && idx.source };
    got.forEach((d) => Object.keys(d).forEach((c) => { (out[c] || (out[c] = [])).push(...d[c]); }));
    return out;
  };
  // 식생기후대(data/vegclim, tools/build_vegclim.py): 회색조 그림 값 = 구분 번호 → 색 그림 → 메르카토르 세로로 펴 둠(어느 축척에서도 그대로 씀)
  let VEG = null;
  const vegLayer = () => VEG || (VEG = (async () => {
    const idx = await fetch("data/vegclim/index.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const vals = await decodeGray("data/vegclim/classes.png");
    const { width: w, height: h } = idx;
    const src = document.createElement("canvas");
    src.width = w; src.height = h;
    const sc = src.getContext("2d"), img = sc.createImageData(w, h);
    const rgb = {};
    idx.classes.forEach((c) => { rgb[c.v] = [1, 3, 5].map((i) => parseInt(c.color.slice(i, i + 2), 16)); });
    for (let i = 0; i < vals.length; i++) {
      const c = rgb[vals[i]];
      if (c) { img.data[4 * i] = c[0]; img.data[4 * i + 1] = c[1]; img.data[4 * i + 2] = c[2]; img.data[4 * i + 3] = 255; }
    }
    sc.putImageData(img, 0, 0);
    const [w0, s0, e0, n0] = idx.bounds, YT = my(n0), YB = my(s0), H2 = Math.round(h * 1.35);
    const warped = document.createElement("canvas");
    warped.width = w; warped.height = H2;
    const wc = warped.getContext("2d");
    for (let j = 0; j < H2; j++) {
      const lat = ilat(YT - ((j + 0.5) / H2) * (YT - YB)), i = Math.min(h - 1, Math.max(0, Math.floor(((n0 - lat) / (n0 - s0)) * h)));
      wc.drawImage(src, 0, i, w, 1, 0, j, w, 1);
    }
    return { idx, warped, classes: idx.classes, source: idx.source };
  })().catch((err) => { VEG = null; throw err; }));
  let FLO = null;
  const floLayer = () => FLO || (FLO = fetch("data/flora/zones.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => ({ classes: d.zones, cells: d.cells.map(([v, ring]) => [v, ring.map(([lon, lat]) => [mx(lon), my(lat)])]), source: d.source }))
    .catch((err) => { FLO = null; throw err; }));
  const waterLayer = binLayer("data/water"), landLayer = binLayer("data/land"), natLayer = binLayer("data/ecnat", decodeLayers, mergeLayers);
  const waterZones = async (v) => { const d = await waterLayer(v); return { river: d.polys, small: d.grouped }; };
  const landPolys = async (v) => (await landLayer(v)).polys;

  // ---------- 주변 범위(turf.buffer) ----------
  const RINGS = { key: "", val: null };
  const ringGeoms = async (site, kms) => {
    const key = JSON.stringify([site.features.length, U.bboxOf(site.features), kms]);
    if (RINGS.key === key) return RINGS.val;
    await U.loadScript(U.LIB.turf, "turf");
    const val = kms.map((km) => {
      const bufs = site.features.map((f) => turf.buffer(f, km, { units: "kilometers", steps: 48 })).filter(Boolean);
      const g = bufs.length === 1 ? bufs[0] : turf.union(turf.featureCollection(bufs));
      const polys = g.geometry.type === "Polygon" ? [g.geometry.coordinates] : g.geometry.coordinates;
      return { km, rings: polys.map((p) => p[0]) };   // 바깥 고리만
    });
    RINGS.key = key;
    RINGS.val = val;
    return val;
  };

  // ---------- 도형 도구(용지 mm) ----------
  const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
  // 더글러스-포이커 줄이기
  const simplify = (pts, tol) => {
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    const t2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let best = -1, bi = -1;
      for (let i = a + 1; i < b; i++) {
        const [px, py] = pts[i];
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
        if (d > best) { best = d; bi = i; }
      }
      if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const boxHit = (a, list) => list.some((b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);
  const textBox = (x, y, w, h, angle, align) => {
    // 글자 가운데 기준 상자를 돌려 축에 맞춘 범위로
    const ox = align === "center" ? 0 : align === "right" ? -w / 2 : w / 2;
    const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, q]) => [x + (u + ox) * c - q * s, y + (u + ox) * s + q * c]);
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  };
  // 넓은 화살표(축): 지난 점들을 부드럽게 잇고(캣멀-롬) 꼬리는 가늘게, 머리는 넓게
  const arrowShape = (pts, w) => {
    if (pts.length < 2) return null;
    const sm = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let t = 0; t < 1; t += 1 / 16) {
        const t2 = t * t, t3 = t2 * t;
        sm.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    sm.push(pts[pts.length - 1]);
    const cum = [0];
    for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
    const L = cum[cum.length - 1];
    if (L < w) return null;
    const hl = Math.min(w * 2.1, L * 0.45), hw = w * 2.1;
    const at = (d) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const x = sm[i - 1][0] + (sm[i][0] - sm[i - 1][0]) * t, y = sm[i - 1][1] + (sm[i][1] - sm[i - 1][1]) * t;
      const a = Math.atan2(sm[i][1] - sm[i - 1][1], sm[i][0] - sm[i - 1][0]);
      return { x, y, nx: -Math.sin(a), ny: Math.cos(a) };
    };
    const left = [], right = [];
    const bodyL = L - hl, steps = Math.max(8, Math.ceil(bodyL / 0.8));
    for (let s = 0; s <= steps; s++) {
      const d = (bodyL * s) / steps, q = at(d), half = (w * (0.55 + (0.45 * d) / bodyL)) / 2;
      left.push([q.x + q.nx * half, q.y + q.ny * half]);
      right.push([q.x - q.nx * half, q.y - q.ny * half]);
    }
    const base = at(bodyL), tip = sm[sm.length - 1];
    return [...left, [base.x + (base.nx * hw) / 2, base.y + (base.ny * hw) / 2], tip, [base.x - (base.nx * hw) / 2, base.y - (base.ny * hw) / 2], ...right.reverse()];
  };
  // 흐름 방향 작은 화살표(가운데 x,y, 방향 a 라디안, 길이 len)
  const flowArrow = (x, y, a, len) => {
    const c = Math.cos(a), s = Math.sin(a), P = (u, q) => [x + u * c - q * s, y + u * s + q * c];
    const h = len / 2, sw = len * 0.09, hw = len * 0.26, hl = len * 0.42;
    return [P(-h, -sw), P(h - hl, -sw), P(h - hl, -hw), P(h, 0), P(h - hl, hw), P(h - hl, sw), P(-h, sw)];
  };
  const fmtNum = (n) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  const dms = (deg, pos, neg) => {
    const h = deg >= 0 ? pos : neg;
    let s = Math.round(Math.abs(deg) * 3600);
    const d = Math.floor(s / 3600); s -= d * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return `${d}°${String(m).padStart(2, "0")}′${s ? `${String(s).padStart(2, "0")}″` : ""}${h}`;
  };

  // ---------- 그리기 ----------
  // 자료 받기(영상·토지피복·이름·범위)와 그리기를 나눠, 미리보기와 받기가 같은 그림을 내게 함
  const prepare = async (fig, site, k, ctl = {}) => {
    const alive = ctl.alive || (() => true);
    const L0 = layout(fig);
    const [lon0, lat0] = centerOf(fig, site);
    const v = makeView(L0.frame, lon0, lat0, fig.scale);
    v.res = fig.kind;
    const natl = NATIONAL.includes(fig.kind);
    const warn = [];
    const eco = fig.kind === "eco", nat = fig.kind === "nat";
    const wantRings = ringsOn(fig);
    // 바탕: 고른 종류(브이월드는 인증키가 없으면 Esri 위성으로), 밝기는 그리기에서 흰색을 덮어 조절
    let baseKey = BASES[fig.basemap] ? fig.basemap : "sat";
    if (BASES[baseKey].key && !VW_KEY) { warn.push(`브이월드 인증키가 없어 ${BASES[baseKey].name} 대신 위성영상(Esri)으로 그렸습니다(인증키 저장.bat).`); baseKey = "sat"; }
    const baseSrc = baseKey === "none" ? null : BASES[baseKey];
    const labelsOn = fig.baseLabels && VW_KEY && baseKey !== "none";
    const jobs = {
      base: baseSrc ? basemap(v, k, ctl.onTiles, alive, baseSrc, fig.gray).catch((err) => { console.warn(err); warn.push("바탕지도를 받지 못했습니다."); return null; }) : null,
      labels: labelsOn ? basemap(v, k, null, alive, LABELS).catch((err) => { console.warn(err); return null; }) : null,
      lc: eco && (fig.eco.forest || fig.eco.water || fig.eco.tidal) ? landcover(v).catch((err) => { console.warn(err); warn.push(err.message && /범위|자료/.test(err.message) ? err.message : "토지피복 자료를 받지 못했습니다."); return null; }) : null,
      osm: eco && (fig.eco.peaks || fig.eco.wnames || fig.eco.flow || fig.eco.streams) ? osm(v).catch((err) => { console.warn(err); warn.push("이름·하천 자료를 받지 못했습니다."); return null; }) : null,
      rings: wantRings && fig.rings.length ? ringGeoms(site, fig.rings).catch((err) => { console.warn(err); warn.push("주변 범위를 계산하지 못했습니다."); return null; }) : null,
    };
    // 이름·하천 자료가 늦으면(미리보기) 먼저 그리고, 도착하면 onLate로 다시 그리게 함
    let osmJob = jobs.osm;
    if (osmJob && ctl.osmWait != null) {
      const LATE = {};
      osmJob = Promise.race([osmJob, new Promise((r) => setTimeout(() => r(LATE), ctl.osmWait))]).then((x) => {
        if (x !== LATE) return x;
        warn.push("이름·하천 자료를 받는 중입니다…");
        jobs.osm.then((d) => ctl.onLate && ctl.onLate(!!d));
        return null;
      });
    }
    const wzJob = eco && (fig.eco.rzone || fig.eco.szone) ? waterZones(v).catch((err) => { console.warn(err); warn.push("하천구역 자료를 받지 못했습니다."); return null; }) : null;
    const clsJob = fig.kind === "veg" ? vegLayer() : fig.kind === "flo" ? floLayer() : null;
    const clsSafe = clsJob ? clsJob.catch((err) => { console.warn(err); warn.push("구분도 자료를 받지 못했습니다."); return null; }) : null;
    const natJob = nat ? natLayer(v).catch((err) => { console.warn(err); warn.push("생태·자연도 자료를 받지 못했습니다."); return null; }) : null;
    const landJob = eco && fig.eco.sea ? landPolys(v).catch((err) => { console.warn(err); warn.push("해안선 자료를 받지 못해 바다를 칠하지 않았습니다."); return null; }) : null;
    const [base, lc, os, rings, wz, land, nd, cls, labels] = await Promise.all([jobs.base, jobs.lc, osmJob, jobs.rings, wzJob, landJob, natJob, clsSafe, jobs.labels]);
    if (lc && lc.nodata > 0.15) warn.push(`이 범위의 ${Math.round(lc.nodata * 100)}%는 토지피복 분류가 없어(접경지역·먼바다 등) 산림·수계가 빠질 수 있습니다.`);
    return { L: L0, v, base, baseKey, labels, lc, osm: os, rings, wz, land, nd, cls, natl, warn };
  };

  // 실제로 그림. pen: CanvasPen·SvgPen·NullPen. 반환: 이름표 후보(고치기 목록용)
  const paint = (pen, fig, site, D) => {
    const { L: Lo, v, base, baseKey, labels, lc, osm: os, rings, wz, land, nd, cls, natl } = D;
    const { W, H, e, frame: F } = Lo;
    const eco = fig.kind === "eco", nat = fig.kind === "nat";
    const P = (lon, lat) => v.fromLL(lon, lat);
    const PM = (X, Y) => v.fromM(X, Y);
    const inF = (x, y, pad = 0) => x >= F.x + pad && x <= F.x + F.w - pad && y >= F.y + pad && y <= F.y + F.h - pad;
    const halo = "#ffffff";
    const occupied = [];
    const labelsOut = [];

    // 종이
    pen.path([[[0, 0], [W, 0], [W, H], [0, H]]], { closed: true, fill: "#ffffff" });

    // 도면 요소 자리(이름표가 피하도록 먼저 계산)
    const north = fig.el.north ? { cx: F.x + F.w - 9 * e, top: F.y + 4 * e, h: 13 * e } : null;
    if (north) occupied.push([north.cx - 5 * e, F.y, F.x + F.w, north.top + north.h + 3 * e]);

    // 축척 막대
    let sb = null;
    if (fig.el.scalebar) {
      const target = (F.w * 0.24 * v.scale) / 1000;   // m
      const NICE = [[50, 5], [100, 4], [200, 4], [250, 5], [400, 4], [500, 5], [1000, 4], [1500, 3], [2000, 4], [2500, 5], [3000, 3], [4000, 4], [5000, 5], [10000, 4], [20000, 4],
        [25000, 5], [50000, 5], [100000, 4], [200000, 4]];
      const [len, seg] = [...NICE].reverse().find(([l]) => l <= target) || NICE[0];
      const km = len >= 2000;
      const barW = (len * 1000) / v.scale;
      const labels = Array.from({ length: seg + 1 }, (_, i) => { const val = (len * i) / seg; return km ? fmtNum(val / 1000) : fmtNum(val); });
      const unit = km ? "km" : "m";
      const fs = 6.8 * e, pad = 2.4 * e;
      const lastW = textW(`${labels[seg]} ${unit}`, fs);
      const bw = barW + pad * 2 + lastW / 2 + textW(` ${unit}`, fs) / 2 + textW(labels[0], fs) / 2;
      const bh = 9.2 * e;
      const x = F.x + 3 * e, y = F.y + F.h - 3 * e - bh;
      sb = { x, y, bw, bh, barW, seg, labels, unit, fs, pad, len };
      occupied.push([x - 1, y - 1, x + bw + 1, y + bh + 1]);
    }

    // 확대 그림(전국 도면에서 사업지 둘레): 왼쪽 아래, 축척 막대 위
    let inset = null;
    if (natl && fig.natl.inset) {
      // 제주를 가리지 않게 제주 북쪽(북위 33.9도) 위에 둠
      const w = F.w * 0.4, h = Math.min(F.h * 0.26, w * 0.62);
      const bottom = Math.min(sb ? sb.y - 3 * e : F.y + F.h - 3 * e, v.fromLL(126, 33.9)[1] - 2 * e);
      inset = { x: F.x + 3 * e, y: bottom - h, w, h };
      occupied.push([inset.x - 1, inset.y - 1, inset.x + w + 1, inset.y + h + 1]);
    }

    // 범례 항목
    const legend = [];
    const sitePoly = site.features.some((f) => U.kindOf(f.geometry) === "polygon");
    const siteName = fig.siteText || "사업지구";
    legend.push({ type: natl ? "point" : sitePoly ? "outline" : site.features.some((f) => U.kindOf(f.geometry) === "line") ? "line" : "point", color: COLOR.site, label: siteName });
    if (nat) {
      if (fig.nat.g1) legend.push({ type: "fill", color: NAT.g1, opacity: NAT.op, label: "1등급" });
      if (fig.nat.g2) legend.push({ type: "fill", color: NAT.g2, opacity: NAT.op, label: "2등급" });
      legend.push({ type: "box", label: "3등급" });
      if (fig.nat.sep) legend.push({ type: "fill", color: NAT.sep, opacity: 0.9, label: "별도관리지역" });
    }
    if (natl && cls) cls.classes.forEach((c) => legend.push({ type: "fill", color: c.color, opacity: 1, label: c.name }));
    if (eco && lc && fig.eco.forest) legend.push({ type: "fill", color: COLOR.forest, opacity: 0.6, label: fig.eco.forestName || "산림생태계" });   // 흰 바탕 범례에서는 조금 진하게
    if (eco && (lc && (fig.eco.water || fig.eco.tidal) || land && fig.eco.sea || os && fig.eco.streams || wz && (fig.eco.rzone || fig.eco.szone))) legend.push({ type: "fill", color: COLOR.water, opacity: 1, label: fig.eco.waterName || "수생태계" });
    if (eco && (fig.arrows || []).some((a) => a.kind === "forest")) legend.push({ type: "arrow", color: COLOR.arrowForest, label: "산림축" });
    if (eco && (fig.arrows || []).some((a) => a.kind === "water")) legend.push({ type: "arrow", color: COLOR.arrowWater, label: "수계축" });
    if (eco && os && fig.eco.flow && os.ways.length) legend.push({ type: "flow", color: COLOR.flow, label: "하천 흐름 방향" });
    if (eco && os && fig.eco.peaks && os.peaks.length) legend.push({ type: "peak", color: COLOR.peak, label: "산봉우리" });
    if (rings) rings.forEach((r, i) => legend.push({ type: "dash", color: COLOR.rings[i % COLOR.rings.length], label: `${fmtNum(r.km)} km 범위` }));
    let lg = null;
    const legendTitle = { nat: "생태·자연도", veg: "한국 식생기후 분포도", flo: "한국 식물상 지역" }[fig.kind] || "범   례";
    if (fig.el.legend) {
      const fs = 8.2 * e, rowH = 5.4 * e, sym = 9 * e, pad = 3 * e, titleH = 7.4 * e;
      // 글꼴이 없는 프로그램(SVG를 맑은 고딕으로 열 때 등)에서도 넘치지 않게 여유를 둠
      const tw = Math.max(textW(legendTitle, 9.5 * e, 700), ...legend.map((it) => textW(it.label, fs))) * 1.12;
      const bw = Math.max(34 * e, pad * 2 + sym + 2.6 * e + tw), bh = titleH + legend.length * rowH + pad * 0.9;
      const x = F.x + F.w - 3 * e - bw, y = F.y + F.h - 3 * e - bh;
      lg = { x, y, bw, bh, fs, rowH, sym, pad, titleH };
      occupied.push([x - 1, y - 1, x + bw + 1, y + bh + 1]);
    }

    // 제목
    if (fig.el.title && fig.title) pen.text(fig.title, W / 2, Lo.m + Lo.top / 2 - 1 * e, { size: 15 * e, weight: 700, align: "center", base: "middle", color: "#111" });

    pen.clip(F.x, F.y, F.w, F.h);
    // 바탕
    if (base) pen.image(base.canvas, F.x, F.y, F.w, F.h);
    if (labels) pen.image(labels.canvas, F.x, F.y, F.w, F.h, { png: true });
    if (fig.base > 0) pen.path([[[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]]], { closed: true, fill: "#ffffff", fillOpacity: Math.min(1, fig.base) });
    // 식생기후대(그림)·식물상 지역(격자)을 주어진 지도 변환으로 그림(본 지도와 확대 그림이 같이 씀)
    const drawClasses = (vw) => {
      if (!cls) return;
      if (fig.kind === "veg") {
        const [w0, s0, e0, n0] = cls.idx.bounds, a = vw.fromLL(w0, n0), b = vw.fromLL(e0, s0);
        pen.image(cls.warped, a[0], a[1], b[0] - a[0], b[1] - a[1], { png: true, pixel: true });
      } else {
        cls.classes.forEach((z) => {
          const parts = cls.cells.filter((c) => c[0] === z.v).map((c) => c[1].map(([X, Y]) => vw.fromM(X, Y)));
          pen.path(parts, { closed: true, fill: z.color, stroke: z.color, width: 0.05 });
        });
      }
    };
    if (natl) drawClasses(v);

    // 토지피복 면(용지 좌표로 바꿔 줄이고, 아주 작은 조각은 뺌)
    const polyParts = (polys, minA) => {
      const out = [];
      const fx0 = F.x - 5, fy0 = F.y - 5, fx1 = F.x + F.w + 5, fy1 = F.y + F.h + 5;
      for (const poly of polys) {
        const rings2 = [];
        poly.forEach((r, ri) => {
          const pts = [];
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (let i = 0; i < r.length; i += 2) {
            const p = PM(r[i], r[i + 1]);
            pts.push(p);
            if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1];
          }
          if (ri === 0 && (bx1 < fx0 || bx0 > fx1 || by1 < fy0 || by0 > fy1)) return;
          if (ri > 0 && !rings2.length) return;
          if (Math.abs(ringArea(pts)) < minA) return;
          rings2.push(simplify(pts, 0.06));
        });
        out.push(...rings2);
      }
      return out;
    };
    // 생태·자연도: 2등급 → 1등급 → 별도관리지역 순으로 반투명하게(바탕 선이 비치게)
    if (nat && nd) {
      if (fig.nat.g2) pen.path(polyParts(nd[2], 0.3), { closed: true, fill: NAT.g2, fillOpacity: NAT.op });
      if (fig.nat.g1) pen.path(polyParts(nd[1], 0.3), { closed: true, fill: NAT.g1, fillOpacity: NAT.op });
      // 별도관리지역은 등급 위에 겹쳐 있어, 덜 비치게 칠해 녹색과 섞이지 않게 함
      if (fig.nat.sep) pen.path(polyParts(nd[9], 0.3), { closed: true, fill: NAT.sep, fillOpacity: 0.9 });
    }
    // 바다: 틀 사각형과 육지(시군구 경계, 해안선을 따름) 고리를 짝홀 규칙으로 한 번에 칠해 육지 밖만 칠함
    if (eco && land && fig.eco.sea) {
      const p = 5, rect = [[F.x - p, F.y - p], [F.x + F.w + p, F.y - p], [F.x + F.w + p, F.y + F.h + p], [F.x - p, F.y + F.h + p]];
      pen.path([rect, ...polyParts(land, 0)], { closed: true, fill: COLOR.water });
    }
    // 수계는 출처 여럿(토지피복 하천·호소·습지, 하천구역, 소하천구역, 하천 선)이 겹치므로 불투명하게 칠해 겹친 곳이 진해지지 않게 함
    if (eco && lc && fig.eco.forest) pen.path(polyParts(lc.forest, 2.5), { closed: true, fill: COLOR.forest, fillOpacity: 0.5 });
    if (eco && lc && fig.eco.water) pen.path(polyParts(lc.water, 0.6), { closed: true, fill: COLOR.water });
    if (eco && lc && fig.eco.tidal) pen.path(polyParts(lc.tidal, 1), { closed: true, fill: COLOR.water });
    if (eco && wz && fig.eco.rzone) pen.path(polyParts(wz.river, 0), { closed: true, fill: COLOR.water });
    // 소하천구역은 폭이 몇 m뿐이라 작은 축척에서도 보이게 같은 색 테두리를 얇게 두름
    if (eco && wz && fig.eco.szone) pen.path(polyParts(wz.small, 0), { closed: true, fill: COLOR.water, stroke: COLOR.water, width: 0.18 * e });
    // 하천 선(오픈스트리트맵): 하천구역·소하천구역에 빠진 물길(지정 구간 밖 상류 등)을 같은 색으로 이어 칠함
    const wayPage = os ? os.ways.map((w) => ({ ...w, pp: w.pts.map(([X, Y]) => PM(X, Y)) })) : [];
    if (eco && os && fig.eco.streams) {
      pen.path(wayPage.filter((w) => w.kind === "stream").map((w) => simplify(w.pp, 0.05)), { stroke: COLOR.water, width: 0.6 * e });
      pen.path(wayPage.filter((w) => w.kind === "river").map((w) => simplify(w.pp, 0.05)), { stroke: COLOR.water, width: 0.9 * e });
    }

    // 좌표 격자 선
    const gridLabels = [];
    if (fig.el.grid === "geo") {
      const [w0, s0, e0, n0] = v.llBox;
      const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s / 3600);
      const step = STEPS.find((s) => (e0 - w0) / s <= 6) || STEPS[STEPS.length - 1];
      const lines = [];
      for (let lon = Math.ceil(w0 / step) * step; lon <= e0; lon += step) {
        const [x] = P(lon, (s0 + n0) / 2);
        lines.push([[x, F.y], [x, F.y + F.h]]);
        gridLabels.push({ t: dms(lon, "E", "W"), x, y: F.y + 1.6 * e, align: "center", base: "top" });
      }
      for (let lat = Math.ceil(s0 / step) * step; lat <= n0; lat += step) {
        const [, y] = P((w0 + e0) / 2, lat);
        lines.push([[F.x, y], [F.x + F.w, y]]);
        gridLabels.push({ t: dms(lat, "N", "S"), x: F.x + 1.6 * e, y: y - 0.9 * e, align: "left", base: "bottom" });
      }
      pen.path(lines, { stroke: "#ffffff", width: 0.18 * e, strokeOpacity: 0.75, dash: [1.2 * e, 0.8 * e] });
    } else if (fig.el.grid === "tm") {
      const toTM = proj4("WGS84", crsDef("5186")), fromTM = proj4(crsDef("5186"), "WGS84");
      const cs = [[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]].map(([x, y]) => toTM.forward(v.toLL(x, y)));
      const X0 = Math.min(...cs.map((c) => c[0])), X1 = Math.max(...cs.map((c) => c[0])), Y0 = Math.min(...cs.map((c) => c[1])), Y1 = Math.max(...cs.map((c) => c[1]));
      const STEPS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
      const step = STEPS.find((s) => (X1 - X0) / s <= 6) || 10000;
      const lines = [];
      const line = (pts) => pts.map(([a, b]) => P(...fromTM.forward([a, b])));
      for (let X = Math.ceil(X0 / step) * step; X <= X1; X += step) {
        const l = line(Array.from({ length: 9 }, (_, i) => [X, Y0 + ((Y1 - Y0) * i) / 8]));
        lines.push(l);
        const top = l.reduce((best, p, i) => (i && l[i - 1][1] >= F.y && p[1] <= F.y ? [l[i - 1][0] + ((p[0] - l[i - 1][0]) * (F.y - l[i - 1][1])) / (p[1] - l[i - 1][1]), F.y] : best), null);
        if (top) gridLabels.push({ t: fmtNum(X), x: top[0], y: F.y + 1.6 * e, align: "center", base: "top" });
      }
      for (let Y = Math.ceil(Y0 / step) * step; Y <= Y1; Y += step) {
        const l = line(Array.from({ length: 9 }, (_, i) => [X0 + ((X1 - X0) * i) / 8, Y]));
        lines.push(l);
        const lft = l.reduce((best, p, i) => (i && l[i - 1][0] <= F.x && p[0] >= F.x ? [F.x, l[i - 1][1] + ((p[1] - l[i - 1][1]) * (F.x - l[i - 1][0])) / (p[0] - l[i - 1][0])] : best), null);
        if (lft) gridLabels.push({ t: fmtNum(Y), x: F.x + 1.6 * e, y: lft[1] - 0.9 * e, align: "left", base: "bottom" });
      }
      pen.path(lines, { stroke: "#ffffff", width: 0.18 * e, strokeOpacity: 0.75, dash: [1.2 * e, 0.8 * e] });
    }

    // 주변 범위
    const ringLabels = [];
    if (rings) {
      rings.forEach((r, i) => {
        const col = COLOR.rings[i % COLOR.rings.length];
        const parts = r.rings.map((ring) => ring.map(([lon, lat]) => P(lon, lat)));
        pen.path(parts, { closed: true, stroke: "#000000", width: 0.9 * e, strokeOpacity: 0.35 });
        pen.path(parts, { closed: true, stroke: col, width: 0.55 * e, dash: [2.4 * e, 1.3 * e] });
        // 이름: 범위 고리의 가장 위(북쪽) 점, 틀 밖이면 틀 안에서 가장 위 점
        const all = parts.flat().filter(([x, y]) => inF(x, y, 6 * e));
        if (all.length) {
          const top = all.reduce((a, b) => (b[1] < a[1] ? b : a));
          ringLabels.push({ t: `${fmtNum(r.km)} km`, x: top[0], y: top[1] + 1.2 * e, color: col });
        }
      });
    }

    // 사업지구
    const sitePolys = [], siteLines = [], sitePts = [];
    site.features.forEach((f) => {
      const g = f.geometry;
      if (g.type === "Polygon") g.coordinates.forEach((r) => sitePolys.push(r.map((c) => P(c[0], c[1]))));
      if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((r) => sitePolys.push(r.map((c) => P(c[0], c[1])))));
      if (g.type === "LineString") siteLines.push(g.coordinates.map((c) => P(c[0], c[1])));
      if (g.type === "MultiLineString") g.coordinates.forEach((l) => siteLines.push(l.map((c) => P(c[0], c[1]))));
      if (g.type === "Point") sitePts.push(P(g.coordinates[0], g.coordinates[1]));
    });
    pen.path(sitePolys, { closed: true, stroke: "#ffffff", width: 1.25 * e, strokeOpacity: 0.55 });
    pen.path(sitePolys, { closed: true, stroke: COLOR.site, width: 0.75 * e });
    pen.path(siteLines, { stroke: "#ffffff", width: 1.5 * e, strokeOpacity: 0.55 });
    pen.path(siteLines, { stroke: COLOR.site, width: 0.95 * e });
    sitePts.forEach(([x, y]) => {
      const c = Array.from({ length: 25 }, (_, i) => [x + 1.6 * e * Math.cos((i / 24) * 2 * Math.PI), y + 1.6 * e * Math.sin((i / 24) * 2 * Math.PI)]);
      pen.path([c], { closed: true, fill: COLOR.site, stroke: "#ffffff", width: 0.4 * e });
    });
    const sb0 = [Infinity, Infinity, -Infinity, -Infinity];
    [...sitePolys.flat(), ...siteLines.flat(), ...sitePts].forEach(([x, y]) => { sb0[0] = Math.min(sb0[0], x); sb0[1] = Math.min(sb0[1], y); sb0[2] = Math.max(sb0[2], x); sb0[3] = Math.max(sb0[3], y); });
    occupied.push([sb0[0] - 1, sb0[1] - 1, sb0[2] + 1, sb0[3] + 1]);

    // 축 화살표(산림축·수계축)
    (eco ? fig.arrows || [] : []).forEach((a) => {
      const shape = arrowShape(a.pts.map(([lon, lat]) => P(lon, lat)), (a.kind === "forest" ? 6.5 : 5) * e);
      if (!shape) return;
      pen.path([shape], { closed: true, fill: a.kind === "forest" ? COLOR.arrowForest : COLOR.arrowWater, fillOpacity: 0.78, stroke: "#ffffff", width: 0.35 * e });
    });

    // 1등급 권역까지 이격거리(선택): 도면 틀 안에 보이는 1등급만 보고, 사업지구 경계와 가장 가까운 두 점을 치수선으로 이음
    let dist1 = null;
    if (nat && nd && fig.nat.dist1 && Number.isFinite(sb0[0])) {
      const x0 = F.x, y0 = F.y, x1 = F.x + F.w, y1 = F.y + F.h;
      // 선분을 틀 안으로 자름(리앙-바스키). 틀 밖이면 null
      const clipSeg = (ax, ay, bx, by) => {
        let t0 = 0, t1 = 1;
        const dx = bx - ax, dy = by - ay;
        for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
          if (p === 0) { if (q < 0) return null; continue; }
          const r = q / p;
          if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
        return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
      };
      const segs = [], polys1 = [];
      nd[1].forEach((poly) => {
        const rings = poly.map((r) => { const pts = []; for (let i = 0; i < r.length; i += 2) pts.push(PM(r[i], r[i + 1])); return pts; });
        polys1.push(rings);
        rings.forEach((pts) => { for (let i = 1; i < pts.length; i++) { const c = clipSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); if (c) segs.push(c); } });
      });
      const siteSegs = [];
      [...sitePolys, ...siteLines].forEach((pts) => { for (let i = 1; i < pts.length; i++) siteSegs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]); });
      sitePts.forEach(([x, y]) => siteSegs.push([x, y, x, y]));
      const inPolys = (x, y) => polys1.some((rings) => {
        let c = false;
        rings.forEach((r) => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; });
        return c;
      });
      // 점과 선분 사이 가장 가까운 점
      const near = (px, py, ax, ay, bx, by) => {
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + t * dx, qy = ay + t * dy;
        return [(px - qx) ** 2 + (py - qy) ** 2, qx, qy];
      };
      const cross = (a, b) => {
        const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        const p1 = [a[0], a[1]], p2 = [a[2], a[3]], p3 = [b[0], b[1]], p4 = [b[2], b[3]];
        return d(p3, p4, p1) * d(p3, p4, p2) < 0 && d(p1, p2, p3) * d(p1, p2, p4) < 0;
      };
      const siteVerts = siteSegs.map((s) => [s[0], s[1]]);
      let best = null;
      if (siteVerts.some(([x, y]) => inPolys(x, y)) || segs.some((g) => siteSegs.some((s) => cross(s, g)))) {
        dist1 = { m: 0, inside: true };
      } else if (segs.length) {
        for (const s of siteSegs) {
          for (const g of segs) {
            for (const [d, ax, ay, bx, by] of [
              ((r) => [r[0], s[0], s[1], r[1], r[2]])(near(s[0], s[1], g[0], g[1], g[2], g[3])),
              ((r) => [r[0], s[2], s[3], r[1], r[2]])(near(s[2], s[3], g[0], g[1], g[2], g[3])),
              ((r) => [r[0], r[1], r[2], g[0], g[1]])(near(g[0], g[1], s[0], s[1], s[2], s[3])),
              ((r) => [r[0], r[1], r[2], g[2], g[3]])(near(g[2], g[3], s[0], s[1], s[2], s[3])),
            ]) if (!best || d < best.d) best = { d, a: [ax, ay], b: [bx, by] };
          }
        }
        if (best) dist1 = { m: (Math.sqrt(best.d) * v.scale) / 1000 };
      } else dist1 = { none: true };
      const distText = (m) => (m >= 1000 ? `${fmtNum(Math.round(m / 10) / 100)} km` : `${fmtNum(Math.round(m / 10) * 10)} m`);
      if (best) {
        const [a, b] = [best.a, best.b], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = 1.8 * e;
        const head = [b, [b[0] - hl * Math.cos(ang - 0.38), b[1] - hl * Math.sin(ang - 0.38)], [b[0] - hl * Math.cos(ang + 0.38), b[1] - hl * Math.sin(ang + 0.38)]];
        pen.path([[a, b]], { stroke: "#ffffff", width: 1.2 * e });
        pen.path([[a, b]], { stroke: "#1f1f1f", width: 0.45 * e });
        pen.path([head], { closed: true, fill: "#1f1f1f", stroke: "#ffffff", width: 0.2 * e });
        pen.path([Array.from({ length: 17 }, (_, k) => [a[0] + 0.7 * e * Math.cos((k / 16) * 2 * Math.PI), a[1] + 0.7 * e * Math.sin((k / 16) * 2 * Math.PI)])], { closed: true, fill: "#1f1f1f", stroke: "#ffffff", width: 0.2 * e });
        // 글자: 치수선 방향으로 돌려(거꾸로 서지 않게) 선 바로 위에
        const t = distText(dist1.m), fs = 8 * e, mxp = (a[0] + b[0]) / 2, myp = (a[1] + b[1]) / 2;
        let deg = (ang * 180) / Math.PI;
        if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;
        const off = fs * PT * 0.85, nx = Math.sin(deg * RAD), ny = -Math.cos(deg * RAD);
        pen.text(t, mxp + nx * off, myp + ny * off, { size: fs, weight: 700, align: "center", base: "middle", angle: deg, color: "#111", halo: "#ffffff", haloWidth: 0.6 * e });
      } else if (dist1 && dist1.inside) {
        pen.text("1등급 권역과 겹침", (sb0[0] + sb0[2]) / 2, sb0[3] + 2 * e, { size: 8 * e, weight: 700, align: "center", base: "top", color: "#111", halo: "#ffffff", haloWidth: 0.6 * e });
      }
    }

    // 사업지구 글자
    if (fig.el.sitelabel && Number.isFinite(sb0[0])) {
      const t = siteName, fs = 9.5 * e;
      const x = (sb0[0] + sb0[2]) / 2, y = sb0[1] - 2.2 * e;
      pen.text(t, x, y, { size: fs, weight: 700, align: "center", color: COLOR.site, halo, haloWidth: 0.55 * e });
      occupied.push([x - textW(t, fs, 700) / 2 - 1, y - fs * PT - 1, x + textW(t, fs, 700) / 2 + 1, y + 1]);
    }

    // 이름표 후보 — 산 → 저수지 → 하천 순서로, 다른 글자·도면 요소와 겹치면 뺌
    const hide = fig.labelHide || new Set(), rename = fig.labelText || new Map();
    const place = [];
    if (eco && os) {
      const fsP = 7.6 * e, fsW = 7.6 * e;
      if (fig.eco.peaks) {
        [...os.peaks].sort((a, b) => b.ele - a.ele).forEach((pk) => {
          const [x, y] = PM(pk.X, pk.Y);
          if (!inF(x, y, 6 * e)) return;
          const t = rename.get(pk.id) || pk.name;
          const w = textW(t, fsP, 600), h = fsP * PT;
          const box = [x - Math.max(w / 2, 2 * e), y - 2.2 * e, x + Math.max(w / 2, 2 * e), y + 1.4 * e + h + 0.6];
          labelsOut.push({ id: pk.id, kind: "산", text: pk.name, shown: false });
          if (hide.has(pk.id) || boxHit(box, occupied)) return;
          occupied.push(box);
          labelsOut[labelsOut.length - 1].shown = true;
          place.push(() => {
            const s = 1.9 * e;
            pen.path([[[x, y - s], [x + s * 0.95, y + s * 0.62], [x - s * 0.95, y + s * 0.62]]], { closed: true, fill: COLOR.peak, stroke: "#ffffff", width: 0.35 * e });
            pen.text(t, x, y + 1.6 * e, { size: fsP, weight: 600, align: "center", base: "top", color: COLOR.peak, halo, haloWidth: 0.5 * e });
          });
        });
      }
      if (fig.eco.wnames) {
        // 넓이(㎡) → 용지 넓이(㎟): 용지 1 mm = 축척/1000 m. 아주 작은 못은 이름을 달지 않음
        const mm2 = (v.scale / 1000) ** 2;
        os.waters.filter((wb) => wb.area / mm2 >= 2.5).sort((a, b) => b.area - a.area).forEach((wb) => {
          const [x, y] = PM(wb.X, wb.Y);
          if (!inF(x, y, 5 * e)) return;
          const t = rename.get(wb.id) || wb.name;
          const w = textW(t, fsW, 600), h = fsW * PT;
          const box = [x - w / 2 - 0.5, y - h / 2 - 0.5, x + w / 2 + 0.5, y + h / 2 + 0.5];
          labelsOut.push({ id: wb.id, kind: "물", text: wb.name, shown: false });
          if (hide.has(wb.id) || boxHit(box, occupied)) return;
          occupied.push(box);
          labelsOut[labelsOut.length - 1].shown = true;
          place.push(() => pen.text(t, x, y, { size: fsW, weight: 600, align: "center", base: "middle", color: COLOR.waterText, halo, haloWidth: 0.5 * e }));
        });
        // 하천 이름: 같은 이름 선을 모아 틀 안에서 가장 긴 조각의 가운데에 선 방향으로
        const byName = new Map();
        wayPage.filter((w) => w.name).forEach((w) => { if (!byName.has(w.name)) byName.set(w.name, []); byName.get(w.name).push(w); });
        const cands = [];
        byName.forEach((ws, name) => {
          let best = null, bestL = 0;
          ws.forEach((w) => {
            let cur = [], curL = 0;
            const flush = () => { if (curL > bestL) { best = { pts: cur, id: w.id }; bestL = curL; } cur = []; curL = 0; };
            w.pp.forEach((p) => {
              if (!inF(p[0], p[1], 8 * e)) return flush();
              if (cur.length) curL += Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]);
              cur.push(p);
            });
            flush();
          });
          if (best && bestL > 18 * e) cands.push({ name, id: `s:${name}`, pts: best.pts, L: bestL, river: ws.some((w) => w.kind === "river") });
        });
        cands.sort((a, b) => (b.river - a.river) || (b.L - a.L)).forEach((c) => {
          const t = rename.get(c.id) || c.name;
          const w = textW(t, fsW, 600), h = fsW * PT;
          // 가운데 지점과 앞뒤로 글자 길이만큼의 방향
          const cum = [0];
          for (let i = 1; i < c.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]));
          const at = (d) => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t2 = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [c.pts[i - 1][0] + (c.pts[i][0] - c.pts[i - 1][0]) * t2, c.pts[i - 1][1] + (c.pts[i][1] - c.pts[i - 1][1]) * t2]; };
          const mid = c.L / 2, a0 = at(Math.max(0, mid - w / 2)), a1 = at(Math.min(c.L, mid + w / 2)), m = at(mid);
          let ang = (Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) * 180) / Math.PI;
          if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
          // 선에서 살짝 비켜(선 위쪽) 놓음
          const off = h * 0.9, nx = Math.sin(ang * RAD), ny = -Math.cos(ang * RAD);
          const x = m[0] + nx * off, y = m[1] + ny * off;
          const box = textBox(x, y, w + 1, h + 0.8, ang, "center");
          labelsOut.push({ id: c.id, kind: "하천", text: c.name, shown: false });
          if (hide.has(c.id) || boxHit(box, occupied)) return;
          occupied.push(box);
          labelsOut[labelsOut.length - 1].shown = true;
          place.push(() => pen.text(t, x, y, { size: fsW, weight: 600, align: "center", base: "middle", angle: ang, color: COLOR.waterText, halo, haloWidth: 0.5 * e }));
        });
      }
      // 흐름 방향: 이름 있는 하천과 강의 선 방향(오픈스트리트맵은 흐르는 방향으로 그림)을 따라 간격을 두고
      if (fig.eco.flow) {
        const gap = 48 * e, len = 5.2 * e, spots = [];
        wayPage.filter((w) => w.kind === "river" || w.name).forEach((w) => {
          const pp = w.pp;
          let acc = gap * 0.5;
          for (let i = 1; i < pp.length; i++) {
            const seg = Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]);
            while (acc <= seg) {
              const t = acc / seg;
              const x = pp[i - 1][0] + (pp[i][0] - pp[i - 1][0]) * t, y = pp[i - 1][1] + (pp[i][1] - pp[i - 1][1]) * t;
              const a = Math.atan2(pp[i][1] - pp[i - 1][1], pp[i][0] - pp[i - 1][0]);
              const box = [x - len / 2 - 0.5, y - len / 2 - 0.5, x + len / 2 + 0.5, y + len / 2 + 0.5];
              if (inF(x, y, 6 * e) && !spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < gap * 0.45) && !boxHit(box, occupied)) {
                spots.push([x, y]);
                occupied.push(box);
                place.push(() => pen.path([flowArrow(x, y, a, len)], { closed: true, fill: COLOR.flow, stroke: "#ffffff", width: 0.3 * e }));
              }
              acc += gap;
            }
            acc -= seg;
          }
        });
      }
    }
    place.forEach((fn) => fn());
    if (natl && Number.isFinite(sb0[0])) {
      const cx = (sb0[0] + sb0[2]) / 2, cy = (sb0[1] + sb0[3]) / 2, rr = 1.3 * e;
      if (inset) {
        // 확대 그림으로 잇는 선: 사업지 점에서 확대 그림 오른쪽 위 모서리
        pen.path([[[cx, cy], [inset.x + inset.w, inset.y]]], { stroke: "#111111", width: 0.3 * e });
      }
      pen.path([Array.from({ length: 25 }, (_, k) => [cx + rr * Math.cos((k / 24) * 2 * Math.PI), cy + rr * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: COLOR.site, stroke: "#ffffff", width: 0.35 * e });
      pen.text(siteName, cx + rr + 1.2 * e, cy, { size: 7.5 * e, weight: 700, align: "left", base: "middle", color: "#111", halo: "#ffffff", haloWidth: 0.5 * e });
    }
    if (inset) {
      const b = U.bboxOf(site.features), lon0 = (b[0] + b[2]) / 2, lat0 = (b[1] + b[3]) / 2;
      const span = Math.max((mx(b[2]) - mx(b[0])) * Math.cos(lat0 * RAD), (my(b[3]) - my(b[1])) * Math.cos(lat0 * RAD), 600) * 2.2;
      const iv = makeView(inset, lon0, lat0, Math.max(2000, (span / Math.min(inset.w, inset.h)) * 1000));
      pen.clip(inset.x, inset.y, inset.w, inset.h);
      pen.path([[[inset.x, inset.y], [inset.x + inset.w, inset.y], [inset.x + inset.w, inset.y + inset.h], [inset.x, inset.y + inset.h]]], { closed: true, fill: "#ffffff" });
      drawClasses(iv);
      const ip = [];
      site.features.forEach((f) => {
        const g = f.geometry;
        const ring = (r) => ip.push(r.map((c) => iv.fromLL(c[0], c[1])));
        if (g.type === "Polygon") g.coordinates.forEach(ring);
        if (g.type === "MultiPolygon") g.coordinates.forEach((pp) => pp.forEach(ring));
      });
      pen.path(ip, { closed: true, stroke: COLOR.site, width: 0.6 * e });
      pen.unclip();
      pen.path([[[inset.x, inset.y], [inset.x + inset.w, inset.y], [inset.x + inset.w, inset.y + inset.h], [inset.x, inset.y + inset.h]]], { closed: true, stroke: "#111111", width: 0.3 * e, join: "miter" });
    }
    ringLabels.forEach((r) => pen.text(r.t, r.x, r.y, { size: 7.5 * e, weight: 700, align: "center", base: "top", color: r.color, halo: "#000000", haloWidth: 0.45 * e }));
    gridLabels.forEach((g) => pen.text(g.t, g.x, g.y, { size: 6 * e, align: g.align, base: g.base, color: "#ffffff", halo: "#222222", haloWidth: 0.4 * e }));
    pen.unclip();

    // 방위표
    if (north) {
      const { cx, top, h } = north, w = 3.3 * e, ty = top + 4.4 * e, by = top + h, notch = ty + (by - ty) * 0.7;
      pen.text("N", cx, top + 3.4 * e, { size: 9.5 * e, weight: 700, align: "center", color: "#111", halo, haloWidth: 0.55 * e });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch], [cx - w, by]]], { closed: true, stroke: "#ffffff", width: 1 * e });
      pen.path([[[cx, ty], [cx, notch], [cx - w, by]]], { closed: true, fill: "#1f1f1f" });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch]]], { closed: true, fill: "#ffffff" });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch], [cx - w, by]]], { closed: true, stroke: "#1f1f1f", width: 0.3 * e });
    }
    // 축척 막대
    if (sb) {
      const { x, y, bw, bh, barW, seg, labels, unit, fs, pad } = sb;
      pen.path([[[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]]], { closed: true, fill: "#ffffff", fillOpacity: 0.92, stroke: "#333333", width: 0.2 * e });
      const bx = x + pad + textW(labels[0], fs) / 2, by = y + 2.2 * e, bH = 1.7 * e;
      for (let i = 0; i < seg; i++) {
        const sx = bx + (barW * i) / seg;
        pen.path([[[sx, by], [sx + barW / seg, by], [sx + barW / seg, by + bH], [sx, by + bH]]], { closed: true, fill: i % 2 ? "#ffffff" : "#1f1f1f" });
      }
      pen.path([[[bx, by], [bx + barW, by], [bx + barW, by + bH], [bx, by + bH]]], { closed: true, stroke: "#1f1f1f", width: 0.25 * e });
      labels.forEach((t, i) => pen.text(i === seg ? `${t} ${unit}` : t, bx + (barW * i) / seg + (i === seg ? textW(` ${unit}`, fs) / 2 : 0), by + bH + 1.2 * e, { size: fs, align: "center", base: "top", color: "#1f1f1f" }));
    }
    // 범례
    if (lg) {
      const { x, y, bw, bh, fs, rowH, sym, pad, titleH } = lg;
      pen.path([[[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]]], { closed: true, fill: "#ffffff", fillOpacity: 0.95, stroke: "#333333", width: 0.25 * e });
      pen.text(legendTitle, x + bw / 2, y + titleH / 2 + 0.3 * e, { size: 9.5 * e, weight: 700, align: "center", base: "middle", color: "#111" });
      pen.path([[[x + pad * 0.6, y + titleH], [x + bw - pad * 0.6, y + titleH]]], { stroke: "#333333", width: 0.2 * e });
      legend.forEach((it, i) => {
        const cy = y + titleH + rowH * (i + 0.5) + pad * 0.3, sx = x + pad, sh = 3.4 * e;
        const r = [[sx, cy - sh / 2], [sx + sym, cy - sh / 2], [sx + sym, cy + sh / 2], [sx, cy + sh / 2]];
        if (it.type === "outline") pen.path([r], { closed: true, stroke: it.color, width: 0.7 * e, join: "miter" });
        if (it.type === "box") pen.path([r], { closed: true, fill: "#ffffff", stroke: "#8a8a8a", width: 0.25 * e, join: "miter" });
        if (it.type === "fill") pen.path([r], { closed: true, fill: it.color, fillOpacity: Math.min(1, (it.opacity || 1) + 0.1) });
        if (it.type === "line") pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: it.color, width: 0.95 * e });
        if (it.type === "point") pen.path([Array.from({ length: 25 }, (_, k) => [sx + sym / 2 + 1.4 * e * Math.cos((k / 24) * 2 * Math.PI), cy + 1.4 * e * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: it.color });
        if (it.type === "dash") {
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: "#5f6368", width: 0.95 * e, cap: "butt" });
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: it.color, width: 0.55 * e, dash: [2.1 * e, 1.1 * e], cap: "butt" });
        }
        if (it.type === "arrow") pen.path([arrowShape([[sx, cy], [sx + sym, cy]], 2.2 * e)], { closed: true, fill: it.color, fillOpacity: 0.85 });
        if (it.type === "flow") pen.path([flowArrow(sx + sym / 2, cy, 0, 5 * e)], { closed: true, fill: it.color });
        if (it.type === "peak") { const s = 1.8 * e, px = sx + sym / 2; pen.path([[[px, cy - s], [px + s * 0.95, cy + s * 0.62], [px - s * 0.95, cy + s * 0.62]]], { closed: true, fill: it.color }); }
        pen.text(it.label, sx + sym + 2.6 * e, cy, { size: fs, align: "left", base: "middle", color: "#1f1f1f" });
      });
    }
    // 틀
    pen.path([[[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]]], { closed: true, stroke: "#1f1f1f", width: 0.35 * e, join: "miter" });
    // 출처·축척
    const fy = F.y + F.h + Lo.foot * 0.62;
    if (fig.el.source) {
      const src = [BASES[baseKey].src || ""];
      if (labels) src.push(LABELS.src);
      if (nat && nd && nd.source) src.push(nd.source.replace(/^생태·자연도 /, "생태·자연도: "));
      if (natl && cls) src.push(fig.kind === "veg" ? `식생기후대: ${cls.source}(구분: 한국의 숲 Ⅵ, 국립수목원 2020)` : `식물상 지역: ${cls.source}`);
      if (eco && lc) src.push("토지피복: 환경부 세분류 토지피복지도(2025)");
      if (eco && wz && fig.eco.rzone) src.push("하천구역: 국토교통부 브이월드 하천망");
      if (eco && wz && fig.eco.szone) src.push("소하천구역: 국토교통부 연속주제도");
      if (eco && land && fig.eco.sea) src.push("해안선: 국토교통부 브이월드 시군구 경계");
      if (eco && os) src.push("이름·하천: © OpenStreetMap 기여자");
      if (!src[0]) src.shift();
      // 축척 글자와 겹치지 않게, 길면 ‘·’ 사이에서 줄을 나눔
      const fs = 6.2 * e, maxW = F.w - textW("축척 1:100,000 (A3 세로)", fs) - 6 * e;
      const lines = [];
      src.forEach((s, i) => {
        const piece = i ? s : `자료: ${s}`;
        const cur = lines.length ? `${lines[lines.length - 1]} · ${piece}` : piece;
        if (lines.length && textW(cur, fs) <= maxW) lines[lines.length - 1] = cur; else lines.push(piece);
      });
      lines.forEach((t, i) => pen.text(t, F.x, fy + (i - (lines.length - 1) / 2) * 2.7 * e, { size: fs, align: "left", base: "middle", color: "#555555" }));
    }
    pen.text(`축척 1:${fmtNum(v.scale)} (${fig.paper} ${fig.orient === "port" ? "세로" : "가로"})`, F.x + F.w, fy, { size: 6.2 * e, align: "right", base: "middle", color: "#555555" });
    return { labels: labelsOut, dist1 };
  };

  // 전체: 자료 받기 → 글꼴 → 그리기
  const render = async (pen, fig, site, k, ctl = {}) => {
    const D = await prepare(fig, site, k, ctl);
    if (ctl.alive && !ctl.alive()) return null;
    const np = new NullPen();
    paint(np, fig, site, D);
    await ensureFonts(np.strings);
    if (ctl.alive && !ctl.alive()) return null;
    const out = paint(pen, fig, site, D);
    return { ...out, view: D.v, layout: D.L, warn: D.warn };
  };

  window.Carto = { render, layout, makeView, autoScale, centerOf, SCALES, scalesFor, NATIONAL, BASES, hasVworld: !!VW_KEY, CanvasPen, SvgPen, mx, my, ilon, ilat, COLOR, arrowShape };
})();
