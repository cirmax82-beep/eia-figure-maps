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
  // 현지조사 위치도: 조사범위 선 색(가까운 범위부터), 조사지점 기호(식생 네모·육수 세모·기타 동그라미)
  // (지점 색에 초록을 쓰지 않음: 생태·자연도 1등급·산림 위에서 구별이 안 됨)
  const FIELD = { rings: ["#ffe14d", "#7fd3ff", "#ff9f40", "#d0bfff", "#ffffff"], pts: { veg: "#d6336c", water: "#1c7ed6", etc: "#f76707" } };
  // 생태·자연도 색(사용자 지정: 1등급 #17ac4d, 2등급 #9dd09c, 3등급 흰색, 별도관리지역 #f2932f).
  // 흑백 바탕(백지도)·흰 바탕이면 불투명하게 칠하고 바탕 선을 위에 다시 얹음(lines), 위성·컬러 바탕이면 바탕이 비치게 op만큼
  const NAT = { g1: "#17ac4d", g2: "#9dd09c", g3: "#ffffff", sep: "#f2932f", op: 0.7 };
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
      this.c.globalAlpha = opt.opacity ?? 1;
      this.c.drawImage(img, x, y, w, h);
      this.c.globalAlpha = 1;
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
      this.o.push(`<image x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="none"${opt.pixel ? ' style="image-rendering:pixelated"' : ""}${opt.opacity != null && opt.opacity < 1 ? ` opacity="${opt.opacity}"` : ""} xlink:href="${url}"/>`);
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
    const e0 = fig.paper === "A3" ? 1.3 : 1;   // 용지 배율(여백)
    // 도면 요소 크기 배율: 용지 배율 × 고른 글자·기호 크기(el.size). 글자·기호·범례·축척 막대가 같이 커지고 여백은 그대로
    const e = e0 * ((fig.el && fig.el.size) || 1);
    const m = 10 * e0;
    const top = fig.el.title && fig.title ? 13 * e : 0;
    const foot = 6 * e;
    // 문헌조사 위치도·법정보호종 출현위치도: 문헌자료 표를 틀 아래에 둘 때(둘째 쪽·넣지 않음이면 도면만). 법정보호종 위치 미기재 주석은
    // 표를 넣지 않아도 틀 아래에(둘째 쪽이면 둘째 쪽에). 쓸 수 있는 높이의 45%까지
    const litKind = fig.kind === "lit" || fig.kind === "sp";
    const below = litKind && fig.lit && fig.lit.table === "below";
    const note = fig.kind === "sp" && fig.lit && fig.lit.table !== "page2" ? fig.spNote || [] : [];
    const tab = litKind && (below || note.length) ? litTable(below ? fig.litRows || [] : [], W - 2 * m, e, (H - 2 * m - top - foot) * 0.45, 1, note) : null;
    const tabH = tab ? tab.h + 3 * e : 0;
    return { W, H, e, frame: { x: m, y: m + top, w: W - 2 * m, h: H - 2 * m - top - foot - tabH }, m, top, foot, tab };
  };
  // 문헌자료 표: 기호 칸 + 「번호. 표기」. 10건까지 한 열, 넘으면 두 열로 반씩(17건이면 9·8, 많으면 한 열에 10건 넘게).
  // 칸 너비를 넘으면 낱말 사이(안 되면 글자)에서 줄을 나누고, 높이가 maxH를 넘으면 글자를 줄임(s0배에서 55%까지).
  // note: 법정보호종 출현위치도의 「주) 정확한 출현위치가 기재되지 않은 법정보호종」 줄들(표 아래 전체 폭)
  const LIT_PER_COL = 10;
  // 9격자 범위를 쓰는 도면: 문헌조사 위치도·보호구역 위치도·법정보호종 출현위치도
  const GRID_KINDS = ["lit", "pa", "sp"];
  const NOTE_TITLE = "주) 정확한 출현위치가 기재되지 않은 법정보호종";
  const litTable = (rows, w, e, maxH = Infinity, s0 = 1, note = []) => {
    if (!rows.length && !note.length) return null;
    const cols = rows.length > LIT_PER_COL ? 2 : 1, per = Math.ceil(rows.length / cols) || 1;
    const head = rows.length ? 6.4 * e : 0, pad = 2.4 * e, cw = (w - pad * 2) / cols;
    let T = null;
    for (let step = 0; s0 - step * 0.05 >= 0.549; step++) {
      const s = s0 - step * 0.05, fs = 6.6 * e * s, lh = 3.5 * e * s, sym = 7 * e * Math.max(s, 0.8), tw = cw - sym - 2 * e;
      const wrap = (t, width) => {
        const out = [];
        let cur = "";
        for (const word of t.split(/(?<=\s)/)) {
          if (cur && textW(cur + word, fs) > width) { out.push(cur.trimEnd()); cur = ""; }
          let wd = word;
          while (textW(wd, fs) > width) {
            let k = wd.length;
            while (k > 1 && textW(wd.slice(0, k), fs) > width) k--;
            out.push(wd.slice(0, k));
            wd = wd.slice(k);
          }
          cur += wd;
        }
        if (cur.trim()) out.push(cur.trimEnd());
        return out;
      };
      const items = rows.map((r) => ({ r, lines: wrap(`${r.n}. ${r.text}`, tw) }));
      const colItems = Array.from({ length: cols }, (_, i) => items.slice(i * per, (i + 1) * per));
      const colLines = colItems.map((c) => c.reduce((n, it) => n + it.lines.length, 0));
      const noteLines = note.length ? [NOTE_TITLE, ...note.flatMap((t) => wrap(t, w - pad * 2))] : [];
      const body = rows.length ? Math.max(...colLines) * lh : 0, gap = rows.length && noteLines.length ? pad * 0.8 : 0;
      T = { h: head + body + gap + noteLines.length * lh + pad, fs, lh, head, pad, sym, cw, colItems, s, noteLines, noteY: head + body + gap + pad * 0.3, rows: rows.length };
      if (T.h <= maxH) break;
    }
    return T;
  };
  // 문헌자료 표 그리기(첫 쪽 틀 아래·둘째 쪽 같이 씀): 위치가 있는 문헌은 도면과 같은 기호, 그 아래 법정보호종 위치 미기재 주석
  const drawLitTable = (pen, T, x, y, w, e) => {
    pen.path([[[x, y], [x + w, y], [x + w, y + T.h], [x, y + T.h]]], { closed: true, fill: "#ffffff", stroke: "#333333", width: 0.25 * e, join: "miter" });
    if (T.rows) {
      pen.text("문 헌 자 료", x + w / 2, y + T.head / 2 + 0.2 * e, { size: 8.5 * e, weight: 700, align: "center", base: "middle", color: "#111" });
      pen.path([[[x + T.pad * 0.6, y + T.head], [x + w - T.pad * 0.6, y + T.head]]], { stroke: "#333333", width: 0.2 * e });
    }
    const r0 = 1.3 * e * Math.max(T.s, 0.8);
    T.colItems.forEach((col, ci) => {
      let cy = y + T.head + T.pad * 0.3;
      const cx = x + T.pad + ci * T.cw;
      if (ci) pen.path([[[cx - T.pad * 0.4, y + T.head + 1 * e], [cx - T.pad * 0.4, y + T.noteY - T.pad * 0.6]]], { stroke: "#bbbbbb", width: 0.2 * e });
      col.forEach((it) => {
        const g = it.r.geo, c = it.r.color || "#7b2cbf", my0 = cy + T.lh / 2, s = T.sym - 2.2 * e;
        if (g && g.kind === "area") pen.path([[[cx, my0 - r0], [cx + s, my0 - r0], [cx + s, my0 + r0], [cx, my0 + r0]]], it.r.outline
          ? { closed: true, fill: c, fillOpacity: 0.08, stroke: c, width: 0.4 * e, dash: [1.2 * e, 0.7 * e], join: "miter" }
          : { closed: true, fill: c, fillOpacity: 0.35, stroke: c, width: 0.35 * e, join: "miter" });
        if (g && g.kind === "line") pen.path([[[cx, my0], [cx + s, my0]]], { stroke: c, width: 1 * e });
        if (g && g.kind === "point") pen.path([Array.from({ length: 25 }, (_, k) => [cx + s / 2 + r0 * Math.cos((k / 24) * 2 * Math.PI), my0 + r0 * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: c });
        it.lines.forEach((ln, li) => pen.text(ln, cx + T.sym, cy + T.lh * (li + 0.5), { size: T.fs, align: "left", base: "middle", color: "#1f1f1f" }));
        cy += it.lines.length * T.lh;
      });
    });
    if (T.noteLines.length) {
      if (T.rows) pen.path([[[x + T.pad * 0.6, y + T.noteY - T.pad * 0.5], [x + w - T.pad * 0.6, y + T.noteY - T.pad * 0.5]]], { stroke: "#bbbbbb", width: 0.2 * e });
      T.noteLines.forEach((ln, i) => pen.text(ln, x + T.pad, y + T.noteY + T.lh * (i + 0.5), { size: T.fs, weight: i ? 400 : 700, align: "left", base: "middle", color: i ? "#c62828" : "#1f1f1f" }));
    }
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
    const b = NATIONAL.includes(fig.kind) ? KOREA_BOX : GRID_KINDS.includes(fig.kind) && fig.lit && fig.lit.grid ? fig.lit.grid.bounds : U.bboxOf(site.features);
    const X = (mx(b[0]) + mx(b[2])) / 2 + (fig.offset ? fig.offset[0] : 0);
    const Y = (my(b[1]) + my(b[3])) / 2 + (fig.offset ? fig.offset[1] : 0);
    return [ilon(X), ilat(Y)];
  };
  // 확대 그림(식생기후대·식물상 지역): 틀 왼쪽 아래 크기, 사업지구가 꽉 차게(가로·세로 중 더 꽉 차는 쪽에 맞추고 여백 20%, 점이면 약 500 m)
  const insetSize = (F) => { const w = F.w * 0.4; return { w, h: Math.min(F.h * 0.26, w * 0.62) }; };
  const insetView = (fig, site, rect) => {
    const b = U.bboxOf(site.features), lon0 = (b[0] + b[2]) / 2, lat0 = (b[1] + b[3]) / 2, c = Math.cos(lat0 * RAD);
    const dx = Math.max((mx(b[2]) - mx(b[0])) * c, 400), dy = Math.max((my(b[3]) - my(b[1])) * c, 400);
    return makeView(rect, lon0, lat0, Math.max(dx / rect.w, dy / rect.h) * 1.2 * 1000);
  };
  // 주변 범위를 그리는지: 위성 현황도는 늘, 생태축·생태·자연도는 켰을 때
  const FIELD_KINDS = ["field", "fsp", "inv"];
  const ringsOn = (fig) => fig.kind === "sat" || FIELD_KINDS.includes(fig.kind) || (fig.kind === "eco" && fig.eco.rings) || (fig.kind === "nat" && fig.nat.rings);
  // 주변 범위(km). 현지조사 위치도·현지조사시 법정보호종 출현위치도는 조사범위(fieldRings, m)
  const ringKms = (fig) => (FIELD_KINDS.includes(fig.kind) ? (fig.fieldRings || []).map((r) => r.m / 1000) : fig.rings);
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
    // 문헌조사·보호구역 위치도: 9격자가 틀에 꽉 차게(500 단위로 올림)
    if (GRID_KINDS.includes(fig.kind)) {
      const g = fig.lit && fig.lit.grid;
      if (!g) return 50000;
      const k = g.bounds, c = Math.cos(((k[1] + k[3]) / 2) * RAD);
      const need = Math.max(((mx(k[2]) - mx(k[0])) * c) / (frame.w * 0.98), ((my(k[3]) - my(k[1])) * c) / (frame.h * 0.98)) * 1000;
      return Math.ceil(need / 500) * 500;
    }
    const rings = ringsOn(fig) ? ringKms(fig) : [];
    const padKm = rings.length ? Math.max(...rings) : fig.kind === "sat" ? 0.5 : FIELD_KINDS.includes(fig.kind) ? 0.3 : 1;
    const c0 = Math.cos(lat0 * RAD);
    let wM = (mx(b[2]) - mx(b[0])) * c0 + 2 * padKm * 1000;
    let hM = (my(b[3]) - my(b[1])) * c0 + 2 * padKm * 1000;
    // 조사지점·출현 지점(extraPts)이 범위 밖에 있으면 그것까지(사업지구 가운데 기준, 둘레 50 m)
    const X0 = (mx(b[0]) + mx(b[2])) / 2, Y0 = (my(b[1]) + my(b[3])) / 2;
    (fig.extraPts || []).forEach(([lon, lat]) => { wM = Math.max(wM, 2 * Math.abs(mx(lon) - X0) * c0 + 100); hM = Math.max(hM, 2 * Math.abs(my(lat) - Y0) * c0 + 100); });
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
  // lines: 흑백 바탕이면 선만 뗀 그림(흰색은 투명, 어두운 만큼 검게)도 만듦 — 불투명한 생태·자연도 등급 위에 바탕 선을 다시 얹을 때
  const basemap = async (v, k, onProgress, alive, src = BASES.sat, gray = false, lines = false) => {
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
    let lineCv = null;
    if (lines && gray && alive()) {
      lineCv = document.createElement("canvas");
      lineCv.width = pxW; lineCv.height = pxH;
      const lc = lineCv.getContext("2d"), img = c.getImageData(0, 0, pxW, pxH), d = img.data;
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = 255 - d[i]; d[i] = d[i + 1] = d[i + 2] = 0; }
      lc.putImageData(img, 0, 0);
    }
    return { canvas: cv, lines: lineCv, z, missing, total };
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

  // ---------- 지형 고도(흐름 방향 판단용): AWS Terrain Tiles(terrarium — SRTM 등, CORS 됨) ----------
  // 틀 범위를 덮는 타일(36장 넘지 않는 확대 단계)을 이어 붙여 경위도의 고도(m)를 돌려주는 함수로. 고도 = R×256 + G + B/256 − 32768, 없는 곳은 NaN
  const DEM_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const demLayer = async (v, alive) => {
    const [X0, Y0, X1, Y1] = v.mBox;
    let z = 13, ts, tx0, tx1, ty0, ty1;
    for (;; z--) {
      ts = WORLD / 2 ** z;
      tx0 = Math.floor((X0 + WORLD / 2) / ts); tx1 = Math.floor((X1 + WORLD / 2) / ts);
      ty0 = Math.floor((WORLD / 2 - Y1) / ts); ty1 = Math.floor((WORLD / 2 - Y0) / ts);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 36 || z <= 8) break;
    }
    const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(async () => { if (!alive()) return; const im = await loadImg(DEM_URL(z, tx, ty)); if (im) g.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); });
    await pool(jobs, 8);
    const d = g.getImageData(0, 0, W, H).data;
    const px = (i, j) => { if (i < 0 || j < 0 || i >= W || j >= H) return NaN; const k = (j * W + i) * 4; return d[k + 3] ? d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768 : NaN; };
    // 이웃 네 칸 사이를 고르게(쌍선형)
    const at = (lon, lat) => {
      const fx = ((mx(lon) + WORLD / 2) / ts - tx0) * 256 - 0.5, fy = ((WORLD / 2 - my(lat)) / ts - ty0) * 256 - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, w = fy - j;
      return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - w) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * w;
    };
    return { at, z };
  };

  // 하천 선 흐름 방향 바로잡기(메르카토르 m). 오픈스트리트맵은 흐르는 방향으로 그리지만 거꾸로 그린 선도 있어, 물줄기 연결로 확인:
  // 한쪽 끝만 '빈 끝'(다른 하천 선·물 면(실폭하천·저수지·하천구역·토지피복 수계)·바다 어디에도 안 닿음 = 상류 끝)이면 반대쪽(합류점·물 면·바다)으로 흐름.
  // 두 끝이 다 닿았거나 다 비었으면(댐 아래로 나가는 물길 등 애매한 경우) 그린 방향 그대로. 판단 범위(box) 밖 끝은 이웃 자료가 없을 수 있어 빈 끝으로 보지 않음.
  // 돌려줌: 뒤집을 선 id 모음
  const flowFlips = (ways, waters, land, box) => {
    const TOL = 12, T2 = TOL * TOL;   // 닿았다고 볼 거리(m): 하천 선 줄이기 4 m와 면 경계 오차
    const bbOf = (r) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < r.length; i += 2) { if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i]; if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1]; } return [x0, y0, x1, y1]; };
    const segD2 = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((x - ax) * dx + (y - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2; };
    const inPoly = (x, y, poly) => { let c = false; poly.forEach((r) => { for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; }); return c; };
    const nearPoly = (x, y, poly) => poly.some((r) => { for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (segD2(x, y, r[j], r[j + 1], r[i], r[i + 1]) <= T2) return true; return false; });
    const W = waters.map((p) => ({ p, b: bbOf(p[0]) }));
    const Ld = land ? land.map((p) => ({ p, b: bbOf(p[0]) })) : null;
    const hit = (b, x, y, m) => x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
    const wet = (x, y) => W.some(({ p, b }) => hit(b, x, y, TOL) && (inPoly(x, y, p) || nearPoly(x, y, p)))
      || (!!Ld && !Ld.some(({ p, b }) => hit(b, x, y, 0) && inPoly(x, y, p)));   // 육지 밖 = 바다
    const lines = ways.map((w) => { const f = w.pts.flat(); return { w, b: bbOf(f) }; });
    const touch = (x, y, self) => lines.some(({ w, b }, j) => {
      if (j === self || !hit(b, x, y, TOL)) return false;
      for (let i = 1; i < w.pts.length; i++) if (segD2(x, y, w.pts[i - 1][0], w.pts[i - 1][1], w.pts[i][0], w.pts[i][1]) <= T2) return true;
      return false;
    });
    const inBox = ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
    const free = (p, i) => inBox(p) && !touch(p[0], p[1], i) && !wet(p[0], p[1]);
    const flips = new Set();
    ways.forEach((w, i) => {
      const a = w.pts[0], b = w.pts[w.pts.length - 1];
      if (!inBox(a) && !inBox(b)) return;
      const fa = free(a, i), fb = free(b, i);
      if (fb && !fa) flips.add(w.id);   // 끝(b)이 상류 끝 → 처음(a) 쪽으로 흐름
    });
    return flips;
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
  // 실폭하천·호수/저수지(국토지리정보원 연속수치지형도, tools/build_topo.py): 기본지도에 파랗게 칠해진 물 면의 원본
  const topoLayer = binLayer("data/topo");
  const waterZones = async (v) => { const d = await waterLayer(v); return { river: d.polys, small: d.grouped }; };

  // ---------- 문헌조사 위치도: 1:25,000 도엽 E1~E9 칸과 도엽별 전국자연환경조사 문헌(data/lit, tools/build_lit.py) ----------
  let litP = null;
  // 문헌 위치 자료(포털 원자료에서 만든 것): 조류센서스 조사지역·내륙습지·생물측정망 지점·유역 목록은 쓸 때 한 번 받고, 유역 모양은 코드별로
  const litFiles = new Map();
  const litPlace = (name) => {
    if (!litFiles.has(name)) litFiles.set(name, fetch(`data/lit/${name}.json`).then((r) => { if (!r.ok) throw new Error(`${name} ${r.status}`); return r.json(); }).catch((err) => { litFiles.delete(name); throw err; }));
    return litFiles.get(name);
  };
  const litBasin = (code) => litPlace(`basins/${code}`);

  // ---------- 보호구역 위치도: 보호구역 종합포털(protect.biogrideia.com)의 구역 목록과 구역별 원본 경계 ----------
  const PA_BASE = "https://protect.biogrideia.com/data/";
  let paIdx = null;
  const paIndex = () => paIdx || (paIdx = fetch(`${PA_BASE}index.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((err) => { paIdx = null; throw err; }));
  const paFiles = new Map();
  const paArea = (id) => {
    if (!paFiles.has(id)) {
      paFiles.set(id, fetch(`${PA_BASE}area/${id}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((err) => { paFiles.delete(id); throw err; }));
      while (paFiles.size > 300) paFiles.delete(paFiles.keys().next().value);
    }
    return paFiles.get(id);
  };
  // 고리를 축에 나란한 사각형으로 자름(서덜랜드-호지먼, 좌표계는 상관없음)
  // 면 이름 자리: 무게중심(면 밖이면 가장 가까운 꼭짓점)과 넓이. 2점 이하면 null
  const labelPt = (pts) => {
    if (pts.length < 3) return null;
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f; }
    if (Math.abs(a) < 1e-9) return null;
    cx /= 3 * a; cy /= 3 * a;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > cy) !== (pts[j][1] > cy) && cx < ((pts[j][0] - pts[i][0]) * (cy - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
    if (!inside) [cx, cy] = pts.reduce((b, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? p : b));
    return [cx, cy, Math.abs(a / 2)];
  };
  const clipRect = (pts, x0, y0, x1, y1) => {
    let out = pts;
    const E = [
      [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
      [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
      [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
      [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
    ];
    for (const [inside, cut] of E) {
      const src = out;
      out = [];
      for (let i = 0; i < src.length; i++) {
        const a = src[(i + src.length - 1) % src.length], b = src[i];
        if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
      }
      if (!out.length) break;
    }
    return out;
  };
  // 9격자(경위도 사각형 [서, 남, 동, 북])에 걸치는 보호구역: 목록의 범위로 먼저 고르고, 경계를 받아 사각형 안에 든 부분이 있는 것만
  const paLoad = async (bounds, layerIds) => {
    const d = await paIndex();
    const want = new Set(layerIds), [w, s, e, n] = bounds;
    const cand = d.areas.filter((a) => want.has(d.layers[a[1]].id) && a[8] && a[8][0] <= e && a[8][2] >= w && a[8][1] <= n && a[8][3] >= s);
    const areas = [];
    await pool(cand.map((a) => async () => {
      let fc;
      try { fc = await paArea(a[0]); } catch (_) { return; }
      // polys: 떨어진 조각(면)마다 [바깥 고리, 구멍…] — 이격거리는 조각마다 잼. rings: 그리기용으로 모든 고리
      const polys = [];
      (fc.features || []).forEach((f) => {
        const g = f.geometry;
        (g && g.type === "Polygon" ? [g.coordinates] : g && g.type === "MultiPolygon" ? g.coordinates : []).forEach((p) => polys.push(p.map((r) => r.map((q) => [q[0], q[1]]))));
      });
      const rings = polys.flat();
      if (!rings.some((r) => clipRect(r, w, s, e, n).length >= 3)) return;
      const L = d.layers[a[1]];
      areas.push({ id: a[0], order: a[1], layer: L.id, layerName: L.name, color: L.color, law: L.law, name: a[2], sub: a[3], sido: a[4], sigg: a[5], notice: a[6], ha: a[7], rings, polys });
    }), 8);
    areas.sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, "ko"));
    return { areas };
  };
  // 사업지구와 보호구역의 관계·최단 이격거리(EPSG:5186 평면, GIS에서 재는 값과 같은 방식)·방향(사업지구 가운데에서 가장 가까운 지점을 본 8방위).
  // 한 구역이 떨어진 조각 여럿이면(시군 단위로 묶인 야생생물보호구역 등) 조각마다 재어 parts에 두고(bounds 안에 든 조각 표시),
  // 구역 값은 가장 가까운 조각
  const paMeasure = (site, areas, bounds = null) => {
    const fwd = proj4("WGS84", crsDef("5186")), inv = proj4(crsDef("5186"), "WGS84");
    const sSegs = [], sPolys = [];
    const addLine = (line) => { const q = line.map((c) => fwd.forward([c[0], c[1]])); if (q.length === 1) sSegs.push([q[0], q[0]]); for (let i = 1; i < q.length; i++) sSegs.push([q[i - 1], q[i]]); return q; };
    site.features.forEach((f) => {
      const g = f.geometry;
      if (g.type === "Polygon") sPolys.push(g.coordinates.map(addLine));
      if (g.type === "MultiPolygon") g.coordinates.forEach((p) => sPolys.push(p.map(addLine)));
      if (g.type === "LineString") addLine(g.coordinates);
      if (g.type === "MultiLineString") g.coordinates.forEach(addLine);
      if (g.type === "Point") addLine([g.coordinates]);
      if (g.type === "MultiPoint") g.coordinates.forEach((c) => addLine([c]));
    });
    const sv = sSegs.map((sg) => sg[0]);
    const cx = (Math.min(...sv.map((p) => p[0])) + Math.max(...sv.map((p) => p[0]))) / 2, cy = (Math.min(...sv.map((p) => p[1])) + Math.max(...sv.map((p) => p[1]))) / 2;
    const inRings = (x, y, rings) => { let c = false; rings.forEach((r) => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; }); return c; };
    const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const cross = (a, b, c, d) => side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
    const near = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const q = [a[0] + t * dx, a[1] + t * dy];
      return [(p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2, q];
    };
    const DIRS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
    // 조각 하나(바깥 고리와 구멍들)
    const measurePart = (poly) => {
      const rings = poly.map((r) => r.map((c) => fwd.forward(c)));
      const aSegs = [];
      rings.forEach((r) => { for (let i = 1; i < r.length; i++) aSegs.push([r[i - 1], r[i]]); });
      const hit = sv.some(([x, y]) => inRings(x, y, rings)) || sPolys.some((sp) => rings.some((r) => r.some(([x, y]) => inRings(x, y, sp))))
        || sSegs.some(([a, b]) => aSegs.some(([c, d]) => cross(a, b, c, d)));
      if (hit) return { rel: "겹침", dist: 0, dir: "" };
      let best = null;
      for (const [a, b] of sSegs) {
        for (const [c, d] of aSegs) {
          for (const [p, s0, s1, flip] of [[a, c, d, 0], [b, c, d, 0], [c, a, b, 1], [d, a, b, 1]]) {
            const [d2, q] = near(p, s0, s1);
            if (!best || d2 < best.d2) best = flip ? { d2, s: q, t: p } : { d2, s: p, t: q };
          }
        }
      }
      if (!best) return { rel: "이격", dist: NaN, dir: "" };
      const ang = (Math.atan2(best.t[0] - cx, best.t[1] - cy) * 180) / Math.PI;
      return { rel: "이격", dist: Math.sqrt(best.d2), dir: DIRS[((Math.round(ang / 45) % 8) + 8) % 8], from: inv.forward(best.s), to: inv.forward(best.t) };
    };
    const closer = (a, b) => (b.dist < a.dist || (Number.isFinite(b.dist) && !Number.isFinite(a.dist)) ? b : a);
    // 두 바깥 고리가 tol(m) 안으로 맞닿거나 겹치는지(범위로 먼저 거르고, 꼭짓점-선분 거리·선분 교차로)
    const touch = (r1, b1, r2, b2, tol) => {
      if (b1[0] > b2[2] + tol || b2[0] > b1[2] + tol || b1[1] > b2[3] + tol || b2[1] > b1[3] + tol) return false;
      const t2 = tol * tol, inB = (p, b) => p[0] >= b[0] - tol && p[0] <= b[2] + tol && p[1] >= b[1] - tol && p[1] <= b[3] + tol;
      const segs = (r, b) => { const o = []; for (let i = 1; i < r.length; i++) if (inB(r[i - 1], b) || inB(r[i], b)) o.push([r[i - 1], r[i]]); return o; };
      const s1 = segs(r1, b2), s2 = segs(r2, b1);
      for (const p of r1) if (inB(p, b2)) for (const [a, b] of s2) if (near(p, a, b)[0] <= t2) return true;
      for (const p of r2) if (inB(p, b1)) for (const [a, b] of s1) if (near(p, a, b)[0] <= t2) return true;
      return s1.some(([a, b]) => s2.some(([c, d]) => cross(a, b, c, d)));
    };
    const out = areas.map((A) => {
      const polys = A.polys || [A.rings];
      const res = polys.map((poly) => ({ ...measurePart(poly), inGrid: !bounds || poly.some((r) => clipRect(r, ...bounds).length >= 3) }));
      // 맞닿거나 겹친 조각(10 m 안, 강을 따라 이어진 띠 등)은 한 덩어리로 묶고, 덩어리마다 가장 가까운 값을 씀
      const outer = polys.map((poly) => poly[0].map((c) => fwd.forward(c)));
      const bb = outer.map((r) => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))]);
      const up = polys.map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
      for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) if (root(i) !== root(j) && touch(outer[i], bb[i], outer[j], bb[j], 10)) up[root(j)] = root(i);
      const groups = new Map();
      res.forEach((r, i) => {
        const g = groups.get(root(i));
        groups.set(root(i), g ? { ...closer(g, r), inGrid: g.inGrid || r.inGrid, outer: [...g.outer, outer[i]], bb: [...g.bb, bb[i]], polys: [...g.polys, polys[i]] } : { ...r, outer: [outer[i]], bb: [bb[i]], polys: [polys[i]] });
      });
      const parts = [...groups.values()];
      const best = parts.reduce(closer, parts[0] || { rel: "이격", dist: NaN, dir: "" });
      return { ...A, parts, rel: best.rel, dist: best.dist, dir: best.dir, from: best.from, to: best.to };
    });
    // 같은 종류의 다른 구역끼리 겹치거나 맞닿은 덩어리(같은 곳이 여러 자료로 중복 등재된 야생생물보호구역 등)는
    // 9격자 안에서 가장 가까운 것 하나에만 치수선(draw)
    const byLayer = new Map();
    out.forEach((A) => A.parts.forEach((p) => { if (p.inGrid) { if (!byLayer.has(A.layer)) byLayer.set(A.layer, []); byLayer.get(A.layer).push(p); } }));
    byLayer.forEach((ps) => {
      const up = ps.map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
      const meet = (p, q) => p.outer.some((r1, a) => q.outer.some((r2, b) => touch(r1, p.bb[a], r2, q.bb[b], 10)));
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (root(i) !== root(j) && meet(ps[i], ps[j])) up[root(j)] = root(i);
      const keep = new Map();
      ps.forEach((p, i) => { const k = root(i), had = keep.get(k); keep.set(k, had ? closer(had, p) : p); });
      ps.forEach((p, i) => { p.draw = keep.get(root(i)) === p; });
    });
    return out;
  };
  const litData = () => litP || (litP = Promise.all(["sheets", "nes"].map((n) => fetch(`data/lit/${n}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })))
    .then(([s, nes]) => ({ sheets: s.sheets, source: s.source, nes }))
    .catch((err) => { litP = null; throw err; }));
  // 경위도 한 점이 든 칸. 도엽([번호, 이름, 서, 남, 동, 북])을 3×3으로 똑같이 나눔(왼쪽 위 E1 → 오른쪽 아래 E9)
  const cellAt = (sheets, lon, lat) => {
    for (const [code, name, w, s, e, n] of sheets) {
      if (lon < w || lon >= e || lat <= s || lat > n) continue;
      const cw = (e - w) / 3, ch = (n - s) / 3;
      const c = Math.min(2, Math.floor((lon - w) / cw)), r = Math.min(2, Math.floor((n - lat) / ch));
      return { code, name, id: `E${r * 3 + c + 1}`, b: [w + c * cw, n - (r + 1) * ch, w + (c + 1) * cw, n - r * ch] };
    }
    return null;
  };
  // 사업지구 가운데가 든 칸과 둘레 8칸(9격자). 바다처럼 도엽이 없는 칸은 빠짐
  const nineGrid = (sheets, lon, lat) => {
    const c0 = cellAt(sheets, lon, lat);
    if (!c0) return null;
    const [w, s, e, n] = c0.b, cw = e - w, ch = n - s, cx = (w + e) / 2, cy = (s + n) / 2;
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const cell = cellAt(sheets, cx + (c - 1) * cw, cy - (r - 1) * ch);
      if (cell) cells.push({ ...cell, r, c });
    }
    return { cells, bounds: [cx - 1.5 * cw, cy - 1.5 * ch, cx + 1.5 * cw, cy + 1.5 * ch], center: c0 };
  };
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

  // 현지조사 지점 기호: 식생 네모, 육수 세모, 기타 동그라미(흰 테두리)
  const FIELD_PT_NAME = { veg: "식생 조사지점", water: "육수 조사지점", etc: "기타 조사지점" };
  const fieldSym = (pen, kind, x, y, e) => {
    const c = FIELD.pts[kind] || FIELD.pts.etc, st = { closed: true, fill: c, stroke: "#ffffff", width: 0.35 * e, join: "miter" };
    if (kind === "veg") { const a = 1.7 * e; pen.path([[[x - a, y - a], [x + a, y - a], [x + a, y + a], [x - a, y + a]]], st); }
    else if (kind === "water") { const a = 2.2 * e; pen.path([[[x, y - a], [x + a * 0.95, y + a * 0.7], [x - a * 0.95, y + a * 0.7]]], st); }
    else pen.path([Array.from({ length: 25 }, (_, k) => [x + 1.75 * e * Math.cos((k / 24) * 2 * Math.PI), y + 1.75 * e * Math.sin((k / 24) * 2 * Math.PI)])], st);
  };

  // 법정보호종 기호: 모양(동그라미·세모·네모·마름모·역세모·오각·별·육각) × 색, 반지름 1 기준 꼭짓점
  const SYM_SHAPES = ["circle", "triangle", "square", "diamond", "invtri", "pentagon", "star", "hexagon"];
  const SYM_COLORS = ["#e03131", "#f08c00", "#7048e8", "#1c7ed6", "#212529", "#c2255c", "#0c8599", "#ae3ec9", "#d9480f", "#8d5524"];   // 초록 없음(1등급·산림과 구별)
  const ngon = (n, r, rot = -Math.PI / 2) => Array.from({ length: n }, (_, k) => [r * Math.cos(rot + (k / n) * 2 * Math.PI), r * Math.sin(rot + (k / n) * 2 * Math.PI)]);
  const symPts = (shape) => ({
    triangle: [[0, -1.15], [1.05, 0.75], [-1.05, 0.75]], square: [[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]],
    diamond: [[0, -1.15], [1.05, 0], [0, 1.15], [-1.05, 0]], invtri: [[-1.05, -0.75], [1.05, -0.75], [0, 1.15]], pentagon: ngon(5, 1.05), hexagon: ngon(6, 1),
    star: ngon(10, 1).map((p, k) => (k % 2 ? [p[0] * 0.5, p[1] * 0.5] : [p[0] * 1.25, p[1] * 1.25])),
  }[shape] || ngon(24, 0.95));
  // 종 차례(i)마다 다른 기호(모양 8 × 색 10, 40종까지 겹치지 않음)
  const symOf = (i) => ({ shape: SYM_SHAPES[i % SYM_SHAPES.length], color: SYM_COLORS[i % SYM_COLORS.length] });
  const speciesSym = (pen, sym, x, y, e) => {
    const r = 1.9 * e;
    pen.path([symPts(sym.shape).map(([a, b]) => [x + a * r, y + b * r])], { closed: true, fill: sym.color, stroke: "#ffffff", width: 0.35 * e, join: "miter" });
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
      base: baseSrc ? basemap(v, k, ctl.onTiles, alive, baseSrc, fig.gray, nat || ((fig.kind === "lit" || fig.kind === "sp") && fig.lit.nat)).catch((err) => { console.warn(err); warn.push("바탕지도를 받지 못했습니다."); return null; }) : null,
      labels: labelsOn ? basemap(v, k, null, alive, LABELS).catch((err) => { console.warn(err); return null; }) : null,
      lc: eco && (fig.eco.forest || fig.eco.water || fig.eco.tidal) ? landcover(v).catch((err) => { console.warn(err); warn.push(err.message && /범위|자료/.test(err.message) ? err.message : "토지피복 자료를 받지 못했습니다."); return null; }) : null,
      osm: eco && (fig.eco.peaks || fig.eco.wnames || fig.eco.flow || fig.eco.streams) ? osm(v).catch((err) => { console.warn(err); warn.push("이름·하천 자료를 받지 못했습니다."); return null; }) : null,
      rings: wantRings && ringKms(fig).length ? ringGeoms(site, ringKms(fig)).catch((err) => { console.warn(err); warn.push("주변 범위를 계산하지 못했습니다."); return null; }) : null,
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
    const demJob = eco && fig.eco.flow ? demLayer(v, alive).catch((err) => { console.warn(err); return null; }) : null;
    const topoJob = eco && fig.eco.topo ? topoLayer(v).then((d) => d.polys).catch((err) => { console.warn(err); warn.push("실폭하천·호수/저수지 자료를 받지 못했습니다."); return null; }) : null;
    const clsJob = fig.kind === "veg" ? vegLayer() : fig.kind === "flo" ? floLayer() : null;
    const clsSafe = clsJob ? clsJob.catch((err) => { console.warn(err); warn.push("구분도 자료를 받지 못했습니다."); return null; }) : null;
    const paJob = fig.kind === "pa" && fig.lit.grid ? paLoad(fig.lit.grid.bounds, [...fig.pa.layers]).then((r) => ({ areas: paMeasure(site, r.areas, fig.lit.grid.bounds) })).catch((err) => { console.warn(err); warn.push("보호구역 자료(보호구역 종합포털)를 받지 못했습니다."); return null; }) : null;
    const natJob = nat || ((fig.kind === "lit" || fig.kind === "sp") && fig.lit.nat) ? natLayer(v).catch((err) => { console.warn(err); warn.push("생태·자연도 자료를 받지 못했습니다."); return null; }) : null;
    const api1Job = nat && fig.nat.dist1 && fig.ecoKey ? eco1Frame(v, fig.ecoKey).catch((err) => { console.warn(err); warn.push(`${err.message} 1등급 이격거리는 정기고시 원본 경계로 계산했습니다.`); return null; }) : null;
    const landJob = eco && fig.eco.sea ? landPolys(v).catch((err) => { console.warn(err); warn.push("해안선 자료를 받지 못해 바다를 칠하지 않았습니다."); return null; }) : null;
    // 원본 경계(API)가 늦으면(미리보기) 단순화 경계로 먼저 그리고, 도착하면 onLate로 다시 그림
    let api1 = api1Job;
    if (api1Job && ctl.osmWait != null) {
      const LATE = {};
      api1 = Promise.race([api1Job, new Promise((res) => setTimeout(() => res(LATE), ctl.osmWait))]).then((x) => {
        if (x !== LATE) return x;
        warn.push("최신 DB(API)를 받는 중이라 1등급 이격거리는 우선 정기고시 원본 경계로 그렸습니다.");
        api1Job.then((d) => ctl.onLate && ctl.onLate(!!d));
        return null;
      });
    }
    let [base, lc, os, rings, wz, land, nd, cls, labels, g1api, topo, paD, dem] = await Promise.all([jobs.base, jobs.lc, osmJob, jobs.rings, wzJob, landJob, natJob, clsSafe, jobs.labels, api1, topoJob, paJob, demJob]);
    // 안전장치: API가 1등급을 하나도 주지 않았는데 조각에는 틀 안에 1등급이 있으면 조각으로
    if (g1api && !g1api.length && nd && nd[1] && nd[1].length) { warn.push("API 응답에서 1등급 면을 찾지 못해 1등급 이격거리는 정기고시 원본 경계로 계산했습니다."); g1api = null; }
    if (lc && lc.nodata > 0.15) warn.push(`이 범위의 ${Math.round(lc.nodata * 100)}%는 토지피복 분류가 없어(접경지역·먼바다 등) 산림·수계가 빠질 수 있습니다.`);
    return { L: L0, v, base, baseKey, labels, g1api, lc, osm: os, rings, wz, topo, land, nd, cls, natl, pa: paD, dem, warn };
  };

  // 실제로 그림. pen: CanvasPen·SvgPen·NullPen. 반환: 이름표 후보(고치기 목록용)
  const paint = (pen, fig, site, D) => {
    const { L: Lo, v, base, baseKey, labels, g1api, lc, osm: os, rings, wz, topo, land, nd, cls, natl, dem } = D;
    const { W, H, e, frame: F } = Lo;
    // sp(법정보호종 출현위치도)는 문헌조사 위치도(lit) 위에 종 이름을 더한 것
    const eco = fig.kind === "eco", nat = fig.kind === "nat", sp = fig.kind === "sp", lit = fig.kind === "lit" || sp, pa = fig.kind === "pa", occ = fig.kind === "fsp" || fig.kind === "inv", fld = fig.kind === "field" || occ;
    // 생태·자연도 등급을 그리는지(생태·자연도 도면은 고른 것만, 문헌조사 위치도는 켰을 때 셋 다)
    const natOn = nat ? fig.nat : lit && fig.lit.nat ? { g1: true, g2: true, sep: true } : null;
    const natSolid = !!natOn && (!base || !!base.lines), natOp = natSolid ? 1 : NAT.op;
    const P = (lon, lat) => v.fromLL(lon, lat);
    const PM = (X, Y) => v.fromM(X, Y);
    const inF = (x, y, pad = 0) => x >= F.x + pad && x <= F.x + F.w - pad && y >= F.y + pad && y <= F.y + F.h - pad;
    const halo = "#ffffff";
    const occupied = [];
    const labelsOut = [];

    // 종이
    pen.path([[[0, 0], [W, 0], [W, H], [0, H]]], { closed: true, fill: "#ffffff" });

    // 도면 요소 자리(이름표가 피하도록 먼저 계산). 틀 모서리 요소(방위표·축척 막대·범례·확대 그림)는 크기와 상관없이
    // 틀에서 같은 거리(cm, 용지 배율 × 3 mm)에 두고, 크기는 글자·기호 크기를 따르지 않고 저마다(nsize·sbsize·lsize)
    const e0 = Lo.e / ((fig.el && fig.el.size) || 1), cm = 3 * e0;
    const elE = (k) => e0 * ((fig.el && fig.el[k]) || 1);
    const en = elE("nsize");
    const north = fig.el.north ? { cx: F.x + F.w - cm - 3.6 * en, top: F.y + cm, h: 13 * en, e: en } : null;
    if (north) occupied.push([north.cx - 5 * en, F.y, F.x + F.w, north.top + north.h + 2 * en]);

    // 축척 막대: 틀 폭의 24% 안에서 가장 긴 막대. 숫자끼리 겹치면 더 긴 막대(틀 폭의 42%까지) → 한 칸 건너 숫자 → 양 끝 숫자만
    let sb = null;
    if (fig.el.scalebar) {
      const es = elE("sbsize"), fs = 6.8 * es, pad = 2.4 * es, bh = 9.2 * es;
      const NICE = [[50, 5], [100, 4], [200, 4], [250, 5], [400, 4], [500, 5], [1000, 4], [1500, 3], [2000, 4], [2500, 5], [3000, 3], [4000, 4], [5000, 5], [10000, 4], [20000, 4],
        [25000, 5], [50000, 5], [100000, 4], [200000, 4]];
      const cands = NICE.map(([len, seg]) => {
        const km = len >= 2000;
        return { len, seg, km, barW: (len * 1000) / v.scale, labels: Array.from({ length: seg + 1 }, (_, i) => { const val = (len * i) / seg; return km ? fmtNum(val / 1000) : fmtNum(val); }) };
      });
      const target = F.w * 0.24, maxW = F.w * 0.42;
      const base = cands.filter((c) => c.barW <= target).pop() || cands[0];
      const tries = [[base, 1], ...cands.filter((c) => c.barW > base.barW && c.barW <= maxW).map((c) => [c, 1])];
      if (base.seg % 2 === 0) tries.push([base, 2]);
      tries.push([base, base.seg]);
      const shown = (c, k) => c.labels.map((_, i) => i).filter((i) => i % k === 0 || i === c.seg);
      const fits = ([c, k]) => { const idx = shown(c, k); return idx.every((i, j) => !j || ((i - idx[j - 1]) * c.barW) / c.seg >= (textW(c.labels[idx[j - 1]], fs) + textW(c.labels[i], fs)) / 2 + 1.5 * es); };
      const [c, k] = tries.find(fits) || tries[tries.length - 1];
      const { barW, seg, len } = c, unit = c.km ? "km" : "m", keep = new Set(shown(c, k));
      const labels = c.labels.map((t, i) => (keep.has(i) ? t : ""));
      const bw = barW + pad * 2 + textW(`${labels[seg]} ${unit}`, fs) / 2 + textW(` ${unit}`, fs) / 2 + textW(labels[0], fs) / 2;
      const x = F.x + cm, y = F.y + F.h - cm - bh;
      sb = { x, y, bw, bh, barW, seg, labels, unit, fs, pad, len, e: es };
      occupied.push([x - 1, y - 1, x + bw + 1, y + bh + 1]);
    }

    // 확대 그림(전국 도면에서 사업지 둘레): 왼쪽 아래, 축척 막대 위
    let inset = null;
    if (natl && fig.natl.inset) {
      // 제주를 가리지 않게 제주 북쪽(북위 33.9도) 위에 둠
      const { w, h } = insetSize(F);
      const bottom = Math.min(sb ? sb.y - cm : F.y + F.h - cm, v.fromLL(126, 33.9)[1] - 2 * e);
      inset = { x: F.x + cm, y: bottom - h, w, h };
      occupied.push([inset.x - 1, inset.y - 1, inset.x + w + 1, inset.y + h + 1]);
    }

    // 범례 항목
    const legend = [];
    const sitePoly = site.features.some((f) => U.kindOf(f.geometry) === "polygon");
    const siteName = fig.siteText || "사업지구";
    legend.push({ type: natl ? "point" : sitePoly ? "outline" : site.features.some((f) => U.kindOf(f.geometry) === "line") ? "line" : "point", color: COLOR.site, label: siteName });
    if (lit && fig.lit.grid) legend.push({ type: "outline", color: "#1f1f1f", label: "문헌조사 범위(9격자)" });
    if (pa && fig.lit.grid) legend.push({ type: "outline", color: "#1f1f1f", label: "검토 범위(9격자)" });
    if (sp && (fig.spRows || []).some((r) => r.kind === "point")) legend.push({ type: "point", color: "#a61e4d", label: "법정보호종 출현 지점" });
    // 보호구역: 9격자에 걸친 종류만(포털의 종류 순서)
    if (pa && D.pa) [...new Map([...D.pa.areas].sort((a, b) => a.order - b.order).map((A) => [A.layer, A])).values()]
      .forEach((A) => legend.push({ type: "fill", color: A.color, opacity: 0.32, label: A.layerName }));
    if (natOn && (nat || nd)) {
      const pre = lit ? "생태·자연도 " : "";
      if (natOn.g1) legend.push({ type: "fill", color: NAT.g1, opacity: natOp, label: `${pre}1등급` });
      if (natOn.g2) legend.push({ type: "fill", color: NAT.g2, opacity: natOp, label: `${pre}2등급` });
      if (nat) legend.push({ type: "box", label: "3등급" });
      if (natOn.sep) legend.push({ type: "fill", color: NAT.sep, opacity: natOp, label: "별도관리지역" });
    }
    if (natl && cls) cls.classes.forEach((c) => legend.push({ type: "fill", color: c.color, opacity: 1, label: c.name }));
    if (eco && lc && fig.eco.forest) legend.push({ type: "fill", color: COLOR.forest, opacity: 0.6, label: fig.eco.forestName || "산림생태계" });   // 흰 바탕 범례에서는 조금 진하게
    if (eco && (lc && (fig.eco.water || fig.eco.tidal) || land && fig.eco.sea || os && fig.eco.streams || wz && (fig.eco.rzone || fig.eco.szone) || topo && fig.eco.topo)) legend.push({ type: "fill", color: COLOR.water, opacity: 1, label: fig.eco.waterName || "수생태계" });
    if (eco && (fig.arrows || []).some((a) => a.kind === "forest")) legend.push({ type: "arrow", color: COLOR.arrowForest, label: "산림축" });
    if (eco && (fig.arrows || []).some((a) => a.kind === "water")) legend.push({ type: "arrow", color: COLOR.arrowWater, label: "수계축" });
    if (eco && fig.eco.flow && ((os && os.ways.length) || dem)) legend.push({ type: "flow", color: COLOR.flow, label: "하천 흐름 방향" });
    if (eco && os && fig.eco.peaks && os.peaks.length) legend.push({ type: "peak", color: COLOR.peak, label: "산봉우리" });
    if (rings && !fld) rings.forEach((r, i) => legend.push({ type: "dash", color: COLOR.rings[i % COLOR.rings.length], label: `${fmtNum(r.km)} km 범위` }));
    // 현지조사 위치도: 조사범위 → 조사경로 → 조사지점. 현지조사시 법정보호종 출현위치도: 조사범위 → (조사경로) → 종마다 기호
    if (fld) {
      if (rings) (fig.fieldRings || []).forEach((r, i) => legend.push({ type: "ring", color: FIELD.rings[i % FIELD.rings.length], label: r.label }));
      (fig.fieldRoutes || []).forEach((r) => legend.push({ type: "route", color: r.color, label: r.name }));
      if (!occ) Object.entries(FIELD_PT_NAME).forEach(([k, name]) => { if ((fig.field.points || []).some((q) => q.kind === k)) legend.push({ type: "fpt", kind: k, label: name }); });
      if (occ) (fig.occSpecies || []).forEach((q) => legend.push({ type: "occ", sym: q.sym, kinds: q.kinds, label: q.label }));
    }
    let lg = null;
    const legendTitle = { nat: "생태·자연도", veg: "한국 식생기후 분포도", flo: "한국 식물상 지역" }[fig.kind] || "범   례";
    if (fig.el.legend) {
      // 범례는 글자·기호 크기를 따르지 않고 범례 크기(el.lsize)로 따로
      const e = elE("lsize");
      const fs = 8.2 * e, rowH = 5.4 * e, sym = 9 * e, pad = 3 * e, titleH = 7.4 * e;
      // 글꼴이 없는 프로그램(SVG를 맑은 고딕으로 열 때 등)에서도 넘치지 않게 여유를 둠
      const tw = Math.max(textW(legendTitle, 9.5 * e, 700), ...legend.map((it) => textW(it.label, fs))) * 1.12;
      const bw = Math.max(34 * e, pad * 2 + sym + 2.6 * e + tw), bh = titleH + legend.length * rowH + pad * 0.9;
      const x = F.x + F.w - cm - bw, y = F.y + F.h - cm - bh;
      lg = { x, y, bw, bh, fs, rowH, sym, pad, titleH, e };
      occupied.push([x - 1, y - 1, x + bw + 1, y + bh + 1]);
    }

    // 제목
    if (fig.el.title && fig.title) pen.text(fig.title, W / 2, Lo.m + Lo.top / 2 - 1 * e, { size: 15 * e, weight: 700, align: "center", base: "middle", color: "#111" });

    pen.clip(F.x, F.y, F.w, F.h);
    // 바탕
    if (base) pen.image(base.canvas, F.x, F.y, F.w, F.h);
    if (labels && !natSolid) pen.image(labels.canvas, F.x, F.y, F.w, F.h, { png: true });
    if (fig.base > 0) pen.path([[[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]]], { closed: true, fill: "#ffffff", fillOpacity: Math.min(1, fig.base) });
    // 식생기후대(그림)·식물상 지역(격자)을 주어진 지도 변환으로 그림(본 지도와 확대 그림이 같이 씀)
    const drawClasses = (vw, op = 1) => {
      if (!cls) return;
      if (fig.kind === "veg") {
        const [w0, s0, e0, n0] = cls.idx.bounds, a = vw.fromLL(w0, n0), b = vw.fromLL(e0, s0);
        pen.image(cls.warped, a[0], a[1], b[0] - a[0], b[1] - a[1], { png: true, pixel: true, opacity: op });
      } else {
        cls.classes.forEach((z) => {
          const parts = cls.cells.filter((c) => c[0] === z.v).map((c) => c[1].map(([X, Y]) => vw.fromM(X, Y)));
          pen.path(parts, op < 1 ? { closed: true, fill: z.color, fillOpacity: op, stroke: "#ffffff", width: 0.15, strokeOpacity: 0.6 } : { closed: true, fill: z.color, stroke: z.color, width: 0.05 });
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
    // 생태·자연도: 2등급 → 1등급 → 별도관리지역(등급 위에 겹쳐 있음) 순으로. 흑백 바탕이면 불투명하게 칠한 뒤 바탕 선·지명을 위에 다시 얹음
    if (natOn && nd) {
      if (natOn.g2) pen.path(polyParts(nd[2], 0.3), { closed: true, fill: NAT.g2, fillOpacity: natOp });
      if (natOn.g1) pen.path(polyParts(nd[1], 0.3), { closed: true, fill: NAT.g1, fillOpacity: natOp });
      if (natOn.sep) pen.path(polyParts(nd[9], 0.3), { closed: true, fill: NAT.sep, fillOpacity: natOp });
    }
    if (natSolid && base) pen.image(base.lines, F.x, F.y, F.w, F.h, { png: true, opacity: 1 - Math.min(1, fig.base || 0) });
    if (labels && natSolid) pen.image(labels.canvas, F.x, F.y, F.w, F.h, { png: true });
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
    // 실폭하천·호수/저수지: 폭 2~3 m 수로도 작은 축척에서 보이게 같은 색 테두리를 얇게(아주 작은 웅덩이는 뺌)
    if (eco && topo && fig.eco.topo) pen.path(polyParts(topo, 0.05), { closed: true, fill: COLOR.water, stroke: COLOR.water, width: 0.15 * e });
    // 하천 선(오픈스트리트맵): 하천구역·소하천구역에 빠진 물길(지정 구간 밖 상류 등)을 같은 색으로 이어 칠함
    const wayPage = os ? os.ways.map((w) => ({ ...w, pp: w.pts.map(([X, Y]) => PM(X, Y)) })) : [];
    if (eco && os && fig.eco.streams) {
      pen.path(wayPage.filter((w) => w.kind === "stream").map((w) => simplify(w.pp, 0.05)), { stroke: COLOR.water, width: 0.6 * e });
      pen.path(wayPage.filter((w) => w.kind === "river").map((w) => simplify(w.pp, 0.05)), { stroke: COLOR.water, width: 0.9 * e });
    }

    // 문헌조사 위치도: 9격자 밖을 옅게 덮고, 문헌 위치(면·선·점) → 칸 선·도엽 경계. 이름표·문헌 번호는 사업지구 위에 나중에
    const litLater = [];
    let litOut = [];   // 위치가 9격자 밖에만 있어 그리지 않은 문헌
    if ((lit || pa) && fig.lit.grid) {
      const g = fig.lit.grid;
      const R = (b) => { const a = P(b[0], b[3]), c = P(b[2], b[1]); return [[a[0], a[1]], [c[0], a[1]], [c[0], c[1]], [a[0], c[1]]]; };
      const fr = [[F.x - 5, F.y - 5], [F.x + F.w + 5, F.y - 5], [F.x + F.w + 5, F.y + F.h + 5], [F.x - 5, F.y + F.h + 5]];
      pen.path([fr, R(g.bounds)], { closed: true, fill: "#ffffff", fillOpacity: 0.5 });
      // 문헌 위치는 9격자(틀 안에 보이는 부분) 안쪽만 그리고, 번호표도 격자 안에 든 부분에 붙임. 격자 밖에만 있는 문헌은 그리지 않고 알려 줌
      const GB = R(g.bounds);
      const gx0 = Math.max(GB[0][0], F.x), gy0 = Math.max(GB[0][1], F.y), gx1 = Math.min(GB[2][0], F.x + F.w), gy1 = Math.min(GB[2][1], F.y + F.h);
      const inG = (x, y) => x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1;
      // 고리를 격자 사각형으로 자름(서덜랜드-호지먼)
      const clipRing = (pts) => {
        let out = pts;
        const E = [
          [(p) => p[0] >= gx0, (a, b) => [gx0, a[1] + ((b[1] - a[1]) * (gx0 - a[0])) / (b[0] - a[0])]],
          [(p) => p[0] <= gx1, (a, b) => [gx1, a[1] + ((b[1] - a[1]) * (gx1 - a[0])) / (b[0] - a[0])]],
          [(p) => p[1] >= gy0, (a, b) => [a[0] + ((b[0] - a[0]) * (gy0 - a[1])) / (b[1] - a[1]), gy0]],
          [(p) => p[1] <= gy1, (a, b) => [a[0] + ((b[0] - a[0]) * (gy1 - a[1])) / (b[1] - a[1]), gy1]],
        ];
        for (const [inside, cut] of E) {
          const src = out;
          out = [];
          for (let i = 0; i < src.length; i++) {
            const a = src[(i + src.length - 1) % src.length], b = src[i];
            if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
          }
          if (!out.length) break;
        }
        return out;
      };
      // 잘린 고리의 무게중심(굽은 강처럼 중심이 면 밖이면 중심에서 가장 가까운 꼭짓점)과 넓이
      // 선분을 격자 사각형으로 자름(리앙-바스키)
      const clipSegG = (ax, ay, bx, by) => {
        let t0 = 0, t1 = 1;
        const dx = bx - ax, dy = by - ay;
        for (const [p, q] of [[-dx, ax - gx0], [dx, gx1 - ax], [-dy, ay - gy0], [dy, gy1 - ay]]) {
          if (p === 0) { if (q < 0) return null; continue; }
          const r = q / p;
          if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
        return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
      };
      // 같은 위치를 쓰는 문헌(같은 조사지역의 여러 해 등)은 한 번만 그리고 번호를 모아 붙임
      const marks = new Map(), outside = new Map();
      const dot = (x, y, r, col) => pen.path([Array.from({ length: 25 }, (_, k) => [x + r * Math.cos((k / 24) * 2 * Math.PI), y + r * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: col, stroke: "#ffffff", width: 0.35 * e });
      (fig.litRows || []).forEach((it) => {
        if (!it.geo || !it.geo.parts.length) return;
        const had = marks.get(it.geoKey);
        if (had) { had.nums.push(it.n); return; }
        if (outside.has(it.geoKey)) { outside.get(it.geoKey).push(it.id); return; }
        const col = it.color || "#7b2cbf", kind = it.geo.kind;
        const parts = it.geo.parts.map((p) => p.map(([lon, lat]) => P(lon, lat)));
        let at = null;
        if (kind === "area") {
          parts.forEach((p) => { const c = labelPt(clipRing(p)); if (c && (!at || c[2] > at[2])) at = c; });
          if (at && at[2] < 0.3) at = null;   // 격자 안에 든 넓이가 0.3 ㎟도 안 되면 밖으로 봄
        } else if (kind === "line") {
          const segs = [];
          parts.forEach((p) => { for (let i = 1; i < p.length; i++) { const c = clipSegG(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]); if (c) segs.push(c); } });
          const total = segs.reduce((s, c) => s + Math.hypot(c[2] - c[0], c[3] - c[1]), 0);
          let acc = 0;
          if (total > 0.5) for (const c of segs) {
            const L = Math.hypot(c[2] - c[0], c[3] - c[1]);
            if (acc + L >= total / 2) { const t = (total / 2 - acc) / (L || 1); at = [c[0] + (c[2] - c[0]) * t, c[1] + (c[3] - c[1]) * t]; break; }
            acc += L;
          }
        } else at = parts.flat().find(([x, y]) => inG(x, y)) || null;
        if (!at) { outside.set(it.geoKey, [it.id]); return; }
        pen.clip(gx0, gy0, gx1 - gx0, gy1 - gy0);
        if (kind === "area") {
          // 유역처럼 넓은 구역(outline)은 옅게 칠하고 점선 테두리만
          pen.path(parts, it.outline ? { closed: true, fill: col, fillOpacity: 0.07, stroke: col, width: 0.6 * e, dash: [2 * e, 1.2 * e] } : { closed: true, fill: col, fillOpacity: 0.28, stroke: col, width: 0.45 * e });
        } else if (kind === "line") {
          pen.path(parts, { stroke: "#ffffff", width: 1.7 * e, strokeOpacity: 0.8 });
          pen.path(parts, { stroke: col, width: 1 * e });
        } else parts.forEach((p) => p.forEach(([x, y]) => dot(x, y, 1.5 * e, col)));
        pen.unclip();
        // 유역처럼 넓은 구역(outline)은 가운데 번호표로는 어느 테두리인지 알기 어려워, 테두리 위 자리(격자 안, 사업지구 쪽부터)를 후보로 둠
        let edge = null;
        if (kind === "area" && it.outline) {
          const cx = (gx0 + gx1) / 2, cy = (gy0 + gy1) / 2, inR = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
          edge = [];
          parts.forEach((p) => {
            for (let i = 0; i < p.length; i++) {
              const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
              if (!L) continue;
              const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
              for (let t = 0; t < L; t += 3 * e) {
                const x = a[0] + ((b[0] - a[0]) * t) / L, y = a[1] + ((b[1] - a[1]) * t) / L;
                if (x < gx0 + 2 * e || x > gx1 - 2 * e || y < gy0 + 2 * e || y > gy1 - 2 * e) continue;
                const s = inR(x + nx * e, y + ny * e, p) ? 1 : -1;   // 면 안쪽을 향하는 법선
                edge.push({ x, y, nx: nx * s, ny: ny * s, d: Math.hypot(x - cx, y - cy) });
              }
            }
          });
          edge.sort((u, w) => u.d - w.d);
          if (!edge.length) edge = null;
        }
        marks.set(it.geoKey, { nums: [it.n], x: at[0], y: at[1], col, kind, edge });
      });
      litOut = [...outside.values()].flat();
      // 보호구역 위치도: 9격자에 걸치는 보호구역을 종류 색으로(넓은 것부터 칠해 작은 것이 위에), 격자 안쪽만
      if (pa && D.pa) {
        const list = [...D.pa.areas].sort((a, b) => b.ha - a.ha);
        pen.clip(gx0, gy0, gx1 - gx0, gy1 - gy0);
        list.forEach((A) => pen.path(A.rings.map((r) => r.map(([lon, lat]) => P(lon, lat))), { closed: true, fill: A.color, fillOpacity: 0.32, stroke: A.color, width: 0.45 * e }));
        pen.unclip();
        // 이격거리(선택): 9격자 안에 든 조각마다 사업지구에서 가장 가까운 지점까지 치수선과 거리(1 m 단위, 1 km 넘으면 km 소수 둘째 자리).
        // 맞닿은 조각처럼 가까운 지점이 용지에서 1.5 mm 안이면 짧은 것 하나만
        const ticks = [];
        if (fig.pa.dist) D.pa.areas.forEach((A) => (A.parts || [A]).filter((pt) => pt.inGrid !== false && pt.draw !== false && pt.rel === "이격" && pt.from)
          .sort((p, q) => p.dist - q.dist).forEach((pt) => {
            const tp = P(...pt.to);
            if (ticks.some((q) => Math.hypot(q[0] - tp[0], q[1] - tp[1]) < 1.5 * e)) return;
            ticks.push(tp);
            litLater.push(() => drawDist(A, pt));
          }));
        const drawDist = (A, pt) => {
          const c = clipSegG(...P(...pt.from), ...P(...pt.to));
          if (!c) return;
          const a = [c[0], c[1]], b = [c[2], c[3]], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          pen.path([[a, b]], { stroke: "#ffffff", width: 1.1 * e });
          pen.path([[a, b]], { stroke: A.color, width: 0.45 * e, dash: [1.2 * e, 0.6 * e] });
          pen.path([Array.from({ length: 17 }, (_, k) => [b[0] + 0.7 * e * Math.cos((k / 16) * 2 * Math.PI), b[1] + 0.7 * e * Math.sin((k / 16) * 2 * Math.PI)])], { closed: true, fill: A.color, stroke: "#ffffff", width: 0.2 * e });
          const t = pt.dist >= 1000 ? `${(pt.dist / 1000).toFixed(2)} km` : `${Math.round(pt.dist).toLocaleString("ko-KR")} m`, fs = 6.6 * e;
          let deg = (ang * 180) / Math.PI;
          if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;
          const off = fs * PT * 0.8, nx = Math.sin(deg * RAD), ny = -Math.cos(deg * RAD);
          pen.text(t, (a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off, { size: fs, weight: 700, align: "center", base: "middle", angle: deg, color: "#111", halo: "#ffffff", haloWidth: 0.55 * e });
        };
      }
      // 칸 선(흰 테 위 검은 선), 도엽 경계는 굵게
      const cellR = g.cells.map((c) => R(c.b));
      pen.path(cellR, { closed: true, stroke: "#ffffff", width: 1.1 * e, strokeOpacity: 0.8, join: "miter" });
      pen.path(cellR, { closed: true, stroke: "#1f1f1f", width: 0.35 * e, join: "miter" });
      const sheets = new Map();
      g.cells.forEach((c) => {
        const s = sheets.get(c.code) || { code: c.code, name: c.name, b: [...c.b], top: c };
        s.b = [Math.min(s.b[0], c.b[0]), Math.min(s.b[1], c.b[1]), Math.max(s.b[2], c.b[2]), Math.max(s.b[3], c.b[3])];
        if (c.r < s.top.r || (c.r === s.top.r && c.c < s.top.c)) s.top = c;
        sheets.set(c.code, s);
      });
      pen.path([...sheets.values()].map((s) => R(s.b)), { closed: true, stroke: "#1f1f1f", width: 0.9 * e, join: "miter" });
      // 칸 이름(E1~E9)은 칸 왼쪽 위(아래 모서리의 축척 막대·범례를 피함), 도엽의 맨 왼쪽 위 칸에는 그 옆에 도엽 이름(번호)
      g.cells.forEach((c) => {
        // 칸 왼쪽 위가 틀 밖이면(가운데를 옮긴 때) 칸이 보이는 부분의 왼쪽 위로
        const [cx0, cy0] = P(c.b[0], c.b[3]), [cx1, cy1] = P(c.b[2], c.b[1]);
        if (cx1 < F.x || cx0 > F.x + F.w || cy1 < F.y || cy0 > F.y + F.h) return;
        const x0 = Math.max(cx0, F.x), y0 = Math.max(cy0, F.y), fsE = 12 * e, fsS = 9.5 * e;
        const s = sheets.get(c.code), first = (lit ? fig.lit.sheetName : fig.pa.sheetName) && s.top === c;
        const t = s.name && s.name !== s.code ? `${s.name}(${s.code})` : s.code;
        litLater.push(() => {
          pen.text(c.id, x0 + 2 * e, y0 + 1.8 * e, { size: fsE, weight: 800, align: "left", base: "top", color: "#1f1f1f", halo: "#ffffff", haloWidth: 0.7 * e });
          if (first) pen.text(t, x0 + 3.2 * e + textW(c.id, fsE, 800), y0 + 1.8 * e + (fsE - fsS) * PT * 0.8, { size: fsS, weight: 700, align: "left", base: "top", color: "#1f1f1f", halo: "#ffffff", haloWidth: 0.6 * e });
        });
        occupied.push([x0, y0, x0 + 4 * e + textW(first ? `${c.id} ${t}` : c.id, fsE, 800), y0 + 2.5 * e + fsE * PT]);
      });
      // 보호구역 이름(칸 이름 자리를 잡은 뒤): 격자 안에 든 부분의 가운데(작은 것부터 자리를 잡고, 겹치면 위·아래로 비켜 보고 안 되면 뺌).
      // 야생생물보호구역·산림보호구역(산림유전자원보호림 포함)은 시군 단위로 묶여 이름이 쓸모없어, 떨어진 덩어리마다 범례처럼 종류 이름
      // (같은 자리에 겹쳐 등재된 덩어리는 하나만)
      const GENERIC = { wildlife: "야생생물보호구역", forest: "산림보호구역", "forest-genetic": "산림유전자원보호림" };
      const nameJobs = [];
      if (pa && D.pa && fig.pa.names) D.pa.areas.forEach((A) => {
        if (!GENERIC[A.layer]) return nameJobs.push({ text: A.name, rings: A.rings, size: A.ha });
        (A.parts || []).filter((p) => p.inGrid && p.draw !== false && p.polys).forEach((p) =>
          nameJobs.push({ text: GENERIC[A.layer], rings: p.polys.flat(), size: p.bb.reduce((n, b) => n + ((b[2] - b[0]) * (b[3] - b[1])) / 1e4, 0) }));
      });
      nameJobs.sort((a, b) => a.size - b.size).forEach((J) => {
        let at = null;
        J.rings.forEach((r) => { const c = labelPt(clipRing(r.map(([lon, lat]) => P(lon, lat)))); if (c && (!at || c[2] > at[2])) at = c; });
        if (!at) return;
        const fs = 6.8 * e, w = textW(J.text, fs, 700) + 1, h = fs * PT + 0.8;
        let box = null;
        for (const dy of [0, -h - 0.6, h + 0.6]) {
          const x = Math.max(gx0 + 0.5, Math.min(gx1 - w - 0.5, at[0] - w / 2)), y = Math.max(gy0 + 0.5, Math.min(gy1 - h - 0.5, at[1] - h / 2 + dy));
          if (!boxHit([x, y, x + w, y + h], occupied)) { box = [x, y, x + w, y + h]; break; }
        }
        if (!box) return;
        occupied.push(box);
        litLater.push(() => pen.text(J.text, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, { size: fs, weight: 700, align: "center", base: "middle", color: "#1f1f1f", halo: "#ffffff", haloWidth: 0.6 * e }));
      });
      // 문헌 번호표: 위치 가운데(점은 오른쪽), 다른 글자와 겹치면 위·아래·옆으로 비켜 봄
      marks.forEach((m) => litLater.push(() => {
        const t = `문헌${m.nums.join("·")}`, fs = 7.2 * e, w = textW(t, fs, 700) + 2.4 * e, h = fs * PT + 1.6 * e;
        let x = m.kind === "point" ? m.x + 2.2 * e : m.x - w / 2, y = m.y - h / 2;
        // 번호표도 격자 안에만(격자 가장자리에 걸리면 안쪽으로 밀어 넣음)
        const keep = (bx, by) => [Math.max(gx0 + 0.5, Math.min(gx1 - w - 0.5, bx)), Math.max(gy0 + 0.5, Math.min(gy1 - h - 0.5, by))];
        [x, y] = keep(x, y);
        // 유역은 테두리 바로 안쪽(번호표 가장자리가 테두리에 닿게)에서 빈자리를 찾고, 없으면 가운데
        const onEdge = m.edge && m.edge.find((c) => {
          const o = (Math.abs(c.nx) * w) / 2 + (Math.abs(c.ny) * h) / 2 + 0.6 * e, [bx, by] = keep(c.x + c.nx * o - w / 2, c.y + c.ny * o - h / 2);
          if (boxHit([bx, by, bx + w, by + h], occupied)) return false;
          x = bx; y = by;
          return true;
        });
        if (!onEdge) for (const [dx, dy] of [[0, 0], [0, -h - 1], [0, h + 1], [w * 0.6, 0], [-w * 0.6, 0]]) {
          const [bx, by] = keep(x + dx, y + dy);
          if (!boxHit([bx, by, bx + w, by + h], occupied)) { x = bx; y = by; break; }
        }
        occupied.push([x, y, x + w, y + h]);
        m.box = [x, y, x + w, y + h];
        pen.path([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], { closed: true, fill: "#ffffff", fillOpacity: 0.95, stroke: m.col, width: 0.4 * e, join: "miter" });
        pen.text(t, x + w / 2, y + h / 2, { size: fs, weight: 700, align: "center", base: "middle", color: m.col });
      }));
      // 법정보호종 출현위치도: 칸(전국자연환경조사)·문헌 위치(조류센서스·습지·측정망·유역·평가서)·직접 찍은 지점마다 종(문헌 번호)을
      // 붉은 글자 상자로. 번호표 자리를 잡은 뒤에 놓고, 다른 글자와 겹치면 비켜 봄
      if (sp && fig.spRows) {
        const SPC = "#c62828", fs = 6.2 * e, lh = fs * PT * 1.28, padX = 1 * e, padY = 0.6 * e;
        // 「, 」 사이(괄호 안 쉼표는 그대로)에서 줄을 나눔
        const wrapTok = (text, maxW) => {
          const out = [];
          let cur = "";
          text.split(/,\s*(?![^()]*\))/).forEach((t) => {
            const nx = cur ? `${cur}, ${t}` : t;
            if (cur && textW(nx, fs, 600) > maxW) { out.push(`${cur},`); cur = t; } else cur = nx;
          });
          if (cur) out.push(cur);
          return out;
        };
        const keepIn = (bx, by, w, h) => [Math.max(gx0 + 0.5, Math.min(gx1 - w - 0.5, bx)), Math.max(gy0 + 0.5, Math.min(gy1 - h - 0.5, by))];
        // 처음 몇 자리(cands)가 다른 글자·상자와 겹치면 기준점(anchor) 둘레를 2.5 mm씩 넓혀 가며(16방향, 45 mm까지) 빈자리를 찾고,
        // 기준점에서 떨어지면 가는 이음선으로 잇음. 끝까지 없으면 첫 자리(겹침)
        const placeBox = (lines, cands, col = SPC, anchor = null) => {
          const w = Math.max(...lines.map((l) => textW(l, fs, 600))) + 2 * padX, h = lines.length * lh + 2 * padY;
          const list = cands(w, h);
          if (anchor) for (let rr = 4 * e; rr <= 45 * e; rr += 2.5 * e) for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * Math.PI; list.push([anchor[0] + rr * Math.cos(a) - w / 2, anchor[1] + rr * Math.sin(a) - h / 2]); }
          let pos = null;
          for (const [cx, cy] of list) { const [bx, by] = keepIn(cx, cy, w, h); if (!boxHit([bx, by, bx + w, by + h], occupied)) { pos = [bx, by]; break; } }
          if (!pos) pos = keepIn(list[0][0], list[0][1], w, h);
          const [x, y] = pos;
          occupied.push([x, y, x + w, y + h]);
          if (anchor) {
            const qx = Math.max(x, Math.min(x + w, anchor[0])), qy = Math.max(y, Math.min(y + h, anchor[1]));
            if (Math.hypot(qx - anchor[0], qy - anchor[1]) > 3 * e) pen.path([[anchor, [qx, qy]]], { stroke: col, width: 0.25 * e, strokeOpacity: 0.85 });
          }
          pen.path([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], { closed: true, fill: "#ffffff", fillOpacity: 0.9, stroke: col, width: 0.3 * e, join: "miter" });
          lines.forEach((ln, i) => pen.text(ln, x + padX, y + padY + lh * (i + 0.5), { size: fs, weight: 600, align: "left", base: "middle", color: col }));
        };
        fig.spRows.forEach((r) => litLater.push(() => {
          if (r.kind === "cell") {
            // 칸 왼쪽 위, 칸 이름 아래(막히면 칸 안에서 3 mm씩 내려가며, 오른쪽으로도)
            const c = g.cells.find((q) => q.code === r.code && q.id === r.cell);
            if (!c) return;
            const [x0, y0] = P(c.b[0], c.b[3]), [x1, y1] = P(c.b[2], c.b[1]);
            const lines = wrapTok(r.text, x1 - x0 - 6 * e - 2 * padX), top = Math.max(y0, gy0) + 2 * e + 12 * e * PT + 1.2 * e;
            placeBox(lines, (w, h) => {
              const out = [[x0 + 2 * e, top]];
              for (let yy = top + 3 * e; yy + h <= y1 - 1 * e; yy += 3 * e) out.push([x0 + 2 * e, yy], [x1 - 2 * e - w, yy]);
              return out;
            }, r.color);
          } else if (r.kind === "geo") {
            // 문헌 번호표 아래(안 되면 위·오른쪽·왼쪽, 그래도 막히면 둘레에서 찾고 이음선)
            const m = marks.get(r.geoKey);
            if (!m) return;
            const b = m.box || [m.x - 5 * e, m.y - 2 * e, m.x + 5 * e, m.y + 2 * e];
            placeBox(wrapTok(r.text, 52 * e), (w, h) => [[b[0], b[3] + 0.6 * e], [b[0], b[1] - 0.6 * e - h], [b[2] + 0.8 * e, b[1]], [b[0] - 0.8 * e - w, b[1]]], r.color, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
          } else if (r.kind === "point") {
            const [px, py] = P(...r.point);
            if (!inG(px, py)) return;
            pen.path([Array.from({ length: 25 }, (_, k) => [px + 1.3 * e * Math.cos((k / 24) * 2 * Math.PI), py + 1.3 * e * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: r.color || SPC, stroke: "#ffffff", width: 0.35 * e });
            placeBox(wrapTok(r.text, 52 * e), (w, h) => [[px + 2.2 * e, py - h / 2], [px - 2.2 * e - w, py - h / 2], [px - w / 2, py + 2.2 * e], [px - w / 2, py - 2.2 * e - h]], r.color, [px, py]);
          }
        }));
      }
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
        const col = fld ? FIELD.rings[i % FIELD.rings.length] : COLOR.rings[i % COLOR.rings.length];
        const parts = r.rings.map((ring) => ring.map(([lon, lat]) => P(lon, lat)));
        pen.path(parts, { closed: true, stroke: "#000000", width: 0.9 * e, strokeOpacity: fld ? 0.45 : 0.35 });
        // 현지조사 위치도는 조사경로(점선)와 헷갈리지 않게 실선
        pen.path(parts, fld ? { closed: true, stroke: col, width: 0.6 * e } : { closed: true, stroke: col, width: 0.55 * e, dash: [2.4 * e, 1.3 * e] });
        // 이름: 범위 고리의 가장 위(북쪽) 점, 틀 밖이면 틀 안에서 가장 위 점
        const all = parts.flat().filter(([x, y]) => inF(x, y, 6 * e));
        if (all.length) {
          const top = all.reduce((a, b) => (b[1] < a[1] ? b : a));
          ringLabels.push({ t: fld ? `${fmtNum(Math.round(r.km * 1000))} m` : `${fmtNum(r.km)} km`, x: top[0], y: top[1] + 1.2 * e, color: col });
        }
      });
    }

    // 현지조사 경로(겹친 길은 합친 것): 어두운 테두리 위에 점선
    if (fld) (fig.fieldRoutes || []).forEach((r) => {
      const parts = r.lines.map((l) => simplify(l.map(([lon, lat]) => P(lon, lat)), 0.05)).filter((l) => l.length >= 2);
      pen.path(parts, { stroke: "#000000", width: 1.35 * e, strokeOpacity: 0.4 });
      pen.path(parts, { stroke: r.color, width: 0.75 * e, dash: [1.8 * e, 1 * e] });
    });

    // 출현 기록 면·선(종 색): 사업지구 아래. 점은 사업지구 위
    const occRecs = occ ? fig.occRecs || [] : [];
    occRecs.filter((r) => r.kind === "area").forEach((r) => {
      const ring = r.pts.map(([lon, lat]) => P(lon, lat));
      pen.path([ring], { closed: true, fill: r.sym.color, fillOpacity: 0.35, stroke: "#ffffff", width: 1.1 * e, strokeOpacity: 0.7 });
      pen.path([ring], { closed: true, stroke: r.sym.color, width: 0.55 * e });
    });
    occRecs.filter((r) => r.kind === "line").forEach((r) => {
      const l = r.pts.map(([lon, lat]) => P(lon, lat));
      pen.path([l], { stroke: "#ffffff", width: 1.9 * e, strokeOpacity: 0.8 });
      pen.path([l], { stroke: r.sym.color, width: 1 * e });
    });

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
    // 사업지구 둘레 사각형: 이름표는 피하고, 흐름 화살표는 피하지 않음(siteBox)
    const siteBox = [sb0[0] - 1, sb0[1] - 1, sb0[2] + 1, sb0[3] + 1];
    occupied.push(siteBox);
    const hitNoSite = (box) => boxHit(box, occupied.filter((b) => b !== siteBox));

    // 지점 이름표: 기호 둘레 여덟 자리 중 빈 곳(오른쪽부터, 다 막히면 오른쪽)
    const ptLabel = (t, x, y, size = 7.5) => {
      const fs = size * e, h = fs * PT * 1.15, w = textW(t, fs, 700), g = 2.6 * e;
      const cands = [[x + g, y - h / 2], [x - g - w, y - h / 2], [x - w / 2, y - g - h], [x - w / 2, y + g], [x + g, y - g - h], [x + g, y + g], [x - g - w, y - g - h], [x - g - w, y + g]];
      const at = cands.find(([bx, by]) => !boxHit([bx, by, bx + w, by + h], occupied)) || cands[0];
      occupied.push([at[0], at[1], at[0] + w, at[1] + h]);
      pen.text(t, at[0], at[1] + h / 2, { size: fs, weight: 700, align: "left", base: "middle", color: "#111111", halo: "#ffffff", haloWidth: 0.55 * e });
    };
    // 현지조사 지점(St.·W.): 기호를 모두 그린 뒤 이름
    if (fld && !occ) {
      const pts = (fig.field.points || []).map((q) => ({ q, at: P(q.pt[0], q.pt[1]) })).filter(({ at }) => inF(at[0], at[1]));
      pts.forEach(({ q, at }) => { fieldSym(pen, q.kind, at[0], at[1], e); occupied.push([at[0] - 2.1 * e, at[1] - 2.1 * e, at[0] + 2.1 * e, at[1] + 2.1 * e]); });
      pts.forEach(({ q, at }) => ptLabel(q.label, at[0], at[1]));
    }
    // 출현 기록 점: 종마다 기호(범례). 고르면 종명 이름표 — 점은 기호 옆, 면은 틀 안 부분의 가운데, 선은 길이 가운데
    if (occ) {
      const pts = occRecs.filter((r) => r.kind === "point").map((q) => ({ q, at: P(q.pts[0][0], q.pts[0][1]) })).filter(({ at }) => inF(at[0], at[1]));
      pts.forEach(({ q, at }) => { speciesSym(pen, q.sym, at[0], at[1], e); occupied.push([at[0] - 2.1 * e, at[1] - 2.1 * e, at[0] + 2.1 * e, at[1] + 2.1 * e]); });
      if (fig.occ.label === "name") {
        pts.forEach(({ q, at }) => ptLabel(q.name, at[0], at[1]));
        occRecs.forEach((q) => {
          const pp = q.pts.map(([lon, lat]) => P(lon, lat));
          if (q.kind === "area") {
            const c = labelPt(clipRect(pp, F.x, F.y, F.x + F.w, F.y + F.h));
            if (c && inF(c[0], c[1])) ptLabel(q.name, c[0], c[1]);
          } else if (q.kind === "line") {
            let L = 0;
            const cum = pp.map((p, i) => (L += i ? Math.hypot(p[0] - pp[i - 1][0], p[1] - pp[i - 1][1]) : 0));
            const i = Math.max(0, cum.findIndex((v) => v >= L / 2));
            if (inF(pp[i][0], pp[i][1])) ptLabel(q.name, pp[i][0], pp[i][1]);
          }
        });
      }
    }

    litLater.forEach((fn) => fn());

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
      (g1api || nd[1]).forEach((poly) => {
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
        // 거리는 두 점의 경위도로 다시 계산(그 자리 위도의 1도 길이, 타원체 급수) — 지도 투영 오차를 없앰
        if (best) {
          // EPSG:5186 평면 거리(GIS에서 재는 값과 같은 방식)
          const tr5186 = proj4("WGS84", crsDef("5186")), p1 = tr5186.forward(v.toLL(...best.a)), p2 = tr5186.forward(v.toLL(...best.b));
          dist1 = { m: Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), api: !!g1api };
        }
      } else dist1 = { none: true };
      // 1 m 단위(1 m 미만은 cm)
      const distText = (m) => (m < 1 ? `${Math.round(m * 100)} cm` : `${Math.round(m).toLocaleString("ko-KR")} m`);
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
    const place = [], flowSpots = [];
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
      // 흐름 방향: 강·이름 있는 하천부터 이름 없는 개천까지 모든 하천 선에 간격을 두고(용지에서 짧은 선은 뺌).
      // 방향은 틀 안에 보이는 부분의 양 끝 지형 고도 차가 3 m 넘으면 높은 쪽 → 낮은 쪽, 아니면 선 방향(오픈스트리트맵은 흐르는 방향으로 그림)을
      // 물줄기 연결로 바로잡은 것(flowFlips: 합류점·물 면·바다 쪽으로)
      if (fig.eco.flow) {
        const gap = 100 * e, len = 6 * e, spots = flowSpots;   // 간격(사용자 요청으로 처음 36e에서 30%, 다시 절반으로 줄임)
        const mb = v.mBox, mx0 = (mb[2] - mb[0]) * 0.1, my0 = (mb[3] - mb[1]) * 0.1;
        const waters = [...(topo || []), ...(wz ? [...wz.river, ...wz.small] : []), ...(lc ? lc.water : [])];
        const flips = flowFlips(os.ways, waters, land || null, [mb[0] - mx0, mb[1] - my0, mb[2] + mx0, mb[3] + my0]);
        const plen = (pp) => pp.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - pp[i - 1][0], p[1] - pp[i - 1][1]) : 0), 0);
        wayPage.map((w) => ({ w, L: plen(w.pp) })).filter(({ L }) => L >= 15 * e)
          .sort((a, b) => (b.w.kind === "river") - (a.w.kind === "river") || !!b.w.name - !!a.w.name || b.L - a.L).forEach(({ w }) => {
          let rev = flips.has(w.id);
          if (dem) {
            const inIdx = w.pp.map((p, i) => (inF(p[0], p[1]) ? i : -1)).filter((i) => i >= 0);
            if (inIdx.length >= 2) {
              const zOf = (p) => { const [lon, lat] = v.toLL(p[0], p[1]); return dem.at(lon, lat); }, z0 = zOf(w.pp[inIdx[0]]), z1 = zOf(w.pp[inIdx[inIdx.length - 1]]);
              if (Number.isFinite(z0) && Number.isFinite(z1) && Math.abs(z1 - z0) >= 3) rev = z1 > z0;
            }
          }
          const pp = rev ? [...w.pp].reverse() : w.pp;
          let acc = gap * 0.5;
          for (let i = 1; i < pp.length; i++) {
            const seg = Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]);
            while (acc <= seg) {
              const t = acc / seg;
              const x = pp[i - 1][0] + (pp[i][0] - pp[i - 1][0]) * t, y = pp[i - 1][1] + (pp[i][1] - pp[i - 1][1]) * t;
              const a = Math.atan2(pp[i][1] - pp[i - 1][1], pp[i][0] - pp[i - 1][0]);
              const box = [x - len / 2 - 0.5, y - len / 2 - 0.5, x + len / 2 + 0.5, y + len / 2 + 0.5];
              if (inF(x, y, 6 * e) && !spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < gap * 0.55) && !hitNoSite(box)) {
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
    // 흐름 방향(물길 면): 하천 선이 없는 물길(소하천구역·하천구역·실폭하천)도 지형 고도로 방향을 정해 화살표를 놓음.
    // 면을 0.5 mm 격자로 그려 일정 간격 자리마다 물길이 뻗은 방향(둘레 물 칸의 주성분)을 구하고 폭 가운데로 옮긴 뒤, 물길을 따라 낮은 쪽으로.
    // 넓은 면(저수지 등)·길쭉하지 않은 곳은 뺌
    if (eco && fig.eco.flow && dem) {
      const polys = [...(wz && fig.eco.szone ? wz.small : []), ...(wz && fig.eco.rzone ? wz.river : []), ...(topo && fig.eco.topo ? topo : [])];
      if (polys.length) {
        const res = 0.5, MW = Math.ceil(F.w / res), MH = Math.ceil(F.h / res);
        const mc = document.createElement("canvas");
        mc.width = MW; mc.height = MH;
        const g = mc.getContext("2d", { willReadFrequently: true });
        g.setTransform(1 / res, 0, 0, 1 / res, -F.x / res, -F.y / res);
        // 폭이 몇 m뿐인 물길도 격자에서 끊기지 않게 테두리를 0.7 mm로 둘러 그리고, 하천 선(오픈스트리트맵)도 같이 그림
        g.lineJoin = g.lineCap = "round";
        g.lineWidth = 0.7;
        polys.forEach((poly) => {
          g.beginPath();
          poly.forEach((r) => { for (let i = 0; i < r.length; i += 2) { const [x, y] = PM(r[i], r[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); });
          g.fill("evenodd");
          g.stroke();
        });
        if (os) {
          g.beginPath();
          os.ways.forEach((w) => w.pts.forEach(([X, Y], i) => { const [x, y] = PM(X, Y); if (i) g.lineTo(x, y); else g.moveTo(x, y); }));
          g.lineWidth = 0.9;
          g.stroke();
        }
        const md = g.getImageData(0, 0, MW, MH).data, N = MW * MH, wetP = (p) => md[p * 4 + 3] > 127;
        const wet = (i, j) => i >= 0 && j >= 0 && i < MW && j < MH && wetP(j * MW + i);
        // 하류 찾기: 자리에서 물 칸만 따라(8방향) 양쪽으로 땅 250 m(용지 6 mm 이상)씩 걸어가, 물길 방향(주성분)의 앞쪽·뒤쪽 끝 칸들의 평균 고도를 비교.
        // 곧은 선이 아니라 물길 모양을 따라가 굽은 물길에서도 맞음. 고도 자료 오차로 혼자 거꾸로인 자리는 뒤에서 이웃끼리 맞춰 바로잡음
        const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        const elevPx = (p) => { const [lon, lat] = v.toLL(F.x + ((p % MW) + 0.5) * res, F.y + (((p / MW) | 0) + 0.5) * res); return dem.at(lon, lat); };
        // 앞·뒤 구분은 출발 칸에서 처음 내디딘 쪽을 끝까지 이어받음(넓은 저수지로 퍼져도 섞이지 않게)
        const Lpx = Math.max(12, (250 * 1000) / v.scale / res), stamp = new Int32Array(N).fill(-1), dd = new Float32Array(N), sd = new Uint8Array(N);
        let runId = 0;
        const candAt = new Map();   // 후보 자리 칸 → 후보 번호(물길로 이어진 이웃 찾기)
        const downhill = (i0, j0, ux, uy, nearMax) => {
          const p0 = j0 * MW + i0, id = runId++, qu = [p0], side = [[], []], near = [], lim = Math.max(Lpx, nearMax);
          stamp[p0] = id;
          dd[p0] = 0;
          for (let h = 0; h < qu.length; h++) {
            const p = qu[h], i = p % MW, j = (p / MW) | 0, d1 = dd[p] + 1;
            if (d1 > lim) continue;
            for (const [di, dj] of NB) {
              const ii = i + di, jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= MW || jj >= MH) continue;
              const q = jj * MW + ii;
              if (stamp[q] === id || !wetP(q)) continue;
              stamp[q] = id;
              dd[q] = d1;
              sd[q] = p === p0 ? (di * ux + dj * uy > 0 ? 0 : 1) : sd[p];
              qu.push(q);
              if (d1 <= Lpx) side[sd[q]].push(q);
              if (d1 <= nearMax && candAt.has(q)) near.push(candAt.get(q));
            }
          }
          // 양쪽마다 가장 멀리 간 칸들(최대 거리의 80% 넘는 것)의 평균 고도. 한쪽으로 충분히(땅 100 m) 못 가면(물길 끝·끊긴 곳) 정하지 않음 — 이웃이 정함
          const far = (arr) => {
            const mxd = arr.length ? Math.max(...arr.map((q) => dd[q])) : 0;
            if (mxd < Lpx * 0.4) return NaN;
            const ends = arr.filter((q) => dd[q] >= mxd * 0.8), st = Math.max(1, Math.floor(ends.length / 12));
            let sum = 0, n = 0;
            for (let k = 0; k < ends.length; k += st) { const z = elevPx(ends[k]); if (Number.isFinite(z)) { sum += z; n++; } }
            return n ? sum / n : NaN;
          };
          const zf = far(side[0]), zb = far(side[1]), dz = zb - zf;   // 앞쪽이 낮으면 +
          return { dz: Number.isFinite(dz) ? dz : 0, near };
        };
        const step = Math.max(4, Math.round((9 * e) / res)), half = step >> 1, R = Math.max(3, Math.round((3.5 * e) / res)), maxW = (5 * e) / res;
        const gap = 100 * e, len = 6 * e, cands = [];
        for (let j = half; j < MH; j += step) {
          for (let i = half; i < MW; i += step) {
            let b = null;
            for (let dj = -half; dj <= half; dj++) for (let di = -half; di <= half; di++) if (wet(i + di, j + dj)) { const d2 = di * di + dj * dj; if (!b || d2 < b.d2) b = { i: i + di, j: j + dj, d2 }; }
            if (!b) continue;
            let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R && wet(b.i + di, b.j + dj)) { n++; sx += di; sy += dj; sxx += di * di; syy += dj * dj; sxy += di * dj; }
            if (n < 6) continue;
            const ax = sx / n, ay = sy / n, A = sxx / n - ax * ax, B = sxy / n - ax * ay, C = syy / n - ay * ay;
            const tr = (A + C) / 2, disc = Math.sqrt(Math.max(0, tr * tr - (A * C - B * B))), l1 = tr + disc, l2 = tr - disc;
            if (l1 < 4 * Math.max(l2, 0.25)) continue;   // 길쭉하지 않으면(저수지·합류부) 뺌
            const th = 0.5 * Math.atan2(2 * B, A - C), ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
            let lo = 0, hi = 0;
            while (lo < 2 * R && wet(Math.round(b.i - vx * (lo + 1)), Math.round(b.j - vy * (lo + 1)))) lo++;
            while (hi < 2 * R && wet(Math.round(b.i + vx * (hi + 1)), Math.round(b.j + vy * (hi + 1)))) hi++;
            if (lo + hi + 1 > maxW) continue;   // 폭이 넓으면(넓은 면) 뺌
            const ci = b.i + (vx * (hi - lo)) / 2, cj = b.j + (vy * (hi - lo)) / 2, ri = Math.round(ci), rj = Math.round(cj);
            const [pi, pj] = wet(ri, rj) ? [ri, rj] : [b.i, b.j], p = pj * MW + pi;
            if (candAt.has(p)) continue;
            candAt.set(p, cands.length);
            cands.push({ i: pi, j: pj, ux, uy, x: F.x + (ci + 0.5) * res, y: F.y + (cj + 0.5) * res });
          }
        }
        // 자리마다 방향(sg: +1이면 주성분 앞쪽이 하류)과 확신(고도 차 |dz|, 1.5 m 안이면 정하지 않음), 물길로 이어진 이웃(걸음 2.2칸 안)
        cands.forEach((c) => { const r = downhill(c.i, c.j, c.ux, c.uy, step * 2.2); c.w = Math.abs(r.dz); c.sg = c.w >= 1.5 ? Math.sign(r.dz) : 0; c.near = r.near; });
        // 이웃끼리 맞추기: 이웃 둘의 화살표가 둘을 잇는 방향으로 같은 쪽을 가리키면 어긋나지 않은 것. 혼자 거꾸로인 자리는 이웃 확신 합이 더 크면 뒤집고,
        // 방향을 못 정한 자리는 이웃이 충분히 한쪽이면 그 방향으로(다섯 번 되풀이)
        const agree = (c, sc, d) => { const dx = d.i - c.i, dy = d.j - c.j, a = (c.ux * dx + c.uy * dy) * sc, b = (d.ux * dx + d.uy * dy) * d.sg; return a * b > 0 ? 1 : -1; };
        for (let it = 0; it < 5; it++) {
          let changed = false;
          cands.forEach((c) => {
            const nb = c.near.map((k) => cands[k]).filter((d) => d !== c && d.sg);
            if (!nb.length) return;
            const score = (sc) => (sc === c.sg ? c.w : 0) + nb.reduce((t, d) => t + Math.min(d.w, 20) * agree(c, sc, d), 0);
            const sp = score(1), sm = score(-1), best = sp >= sm ? 1 : -1;
            if (c.sg ? best !== c.sg && Math.abs(sp - sm) > 1 : Math.abs(sp - sm) >= 3) { c.sg = best; changed = true; }
          });
          if (!changed) break;
        }
        // 확신이 큰 자리부터 간격을 두고 놓음
        cands.filter((c) => c.sg).sort((a, b) => b.w - a.w).forEach((c) => {
          const { x, y } = c;
          if (!inF(x, y, 6 * e) || flowSpots.some(([fx, fy]) => Math.hypot(fx - x, fy - y) < gap * 0.55)) return;
          const box = [x - len / 2 - 0.5, y - len / 2 - 0.5, x + len / 2 + 0.5, y + len / 2 + 0.5];
          if (hitNoSite(box)) return;
          const a = Math.atan2(c.uy, c.ux) + (c.sg > 0 ? 0 : Math.PI);
          flowSpots.push([x, y]);
          occupied.push(box);
          place.push(() => pen.path([flowArrow(x, y, a, len)], { closed: true, fill: COLOR.flow, stroke: "#ffffff", width: 0.3 * e }));
        });
        D.demUsed = flowSpots.length > 0;
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
      const iv = insetView(fig, site, inset);
      pen.clip(inset.x, inset.y, inset.w, inset.h);
      pen.path([[[inset.x, inset.y], [inset.x + inset.w, inset.y], [inset.x + inset.w, inset.y + inset.h], [inset.x, inset.y + inset.h]]], { closed: true, fill: "#ffffff" });
      drawClasses(iv);
      const ip = [], il = [], it = [];
      site.features.forEach((f) => {
        const g = f.geometry, P2 = (c) => iv.fromLL(c[0], c[1]);
        if (g.type === "Polygon") g.coordinates.forEach((r) => ip.push(r.map(P2)));
        if (g.type === "MultiPolygon") g.coordinates.forEach((pp) => pp.forEach((r) => ip.push(r.map(P2))));
        if (g.type === "LineString") il.push(g.coordinates.map(P2));
        if (g.type === "MultiLineString") g.coordinates.forEach((l) => il.push(l.map(P2)));
        if (g.type === "Point") it.push(P2(g.coordinates));
        if (g.type === "MultiPoint") g.coordinates.forEach((c) => it.push(P2(c)));
      });
      pen.path(ip, { closed: true, stroke: "#ffffff", width: 1.2 * e, strokeOpacity: 0.8 });
      pen.path(ip, { closed: true, stroke: COLOR.site, width: 0.6 * e });
      pen.path(il, { stroke: "#ffffff", width: 1.4 * e, strokeOpacity: 0.8 });
      pen.path(il, { stroke: COLOR.site, width: 0.8 * e });
      it.forEach(([x, y]) => pen.path([Array.from({ length: 25 }, (_, k) => [x + 1.1 * e * Math.cos((k / 24) * 2 * Math.PI), y + 1.1 * e * Math.sin((k / 24) * 2 * Math.PI)])], { closed: true, fill: COLOR.site, stroke: "#ffffff", width: 0.3 * e }));
      // 사업지구가 확대 그림에서도 3 mm보다 작으면 둘레에 원을 둘러 찾기 쉽게
      const all = [...ip.flat(), ...il.flat(), ...it];
      if (all.length) {
        const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 3 * e) {
          const rr = 2.6 * e, ring = Array.from({ length: 41 }, (_, k) => [cx + rr * Math.cos((k / 40) * 2 * Math.PI), cy + rr * Math.sin((k / 40) * 2 * Math.PI)]);
          pen.path([ring], { closed: true, stroke: "#ffffff", width: 0.9 * e, strokeOpacity: 0.85 });
          pen.path([ring], { closed: true, stroke: COLOR.site, width: 0.45 * e });
        }
      }
      pen.unclip();
      pen.path([[[inset.x, inset.y], [inset.x + inset.w, inset.y], [inset.x + inset.w, inset.y + inset.h], [inset.x, inset.y + inset.h]]], { closed: true, stroke: "#111111", width: 0.3 * e, join: "miter" });
    }
    ringLabels.forEach((r) => pen.text(r.t, r.x, r.y, { size: 7.5 * e, weight: 700, align: "center", base: "top", color: r.color, halo: "#000000", haloWidth: 0.45 * e }));
    gridLabels.forEach((g) => pen.text(g.t, g.x, g.y, { size: 6 * e, align: g.align, base: g.base, color: "#ffffff", halo: "#222222", haloWidth: 0.4 * e }));
    pen.unclip();

    // 방위표
    if (north) {
      const { cx, top, h, e } = north, w = 3.3 * e, ty = top + 4.4 * e, by = top + h, notch = ty + (by - ty) * 0.7;
      pen.text("N", cx, top + 3.4 * e, { size: 9.5 * e, weight: 700, align: "center", color: "#111", halo, haloWidth: 0.55 * e });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch], [cx - w, by]]], { closed: true, stroke: "#ffffff", width: 1 * e });
      pen.path([[[cx, ty], [cx, notch], [cx - w, by]]], { closed: true, fill: "#1f1f1f" });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch]]], { closed: true, fill: "#ffffff" });
      pen.path([[[cx, ty], [cx + w, by], [cx, notch], [cx - w, by]]], { closed: true, stroke: "#1f1f1f", width: 0.3 * e });
    }
    // 축척 막대
    if (sb) {
      const { x, y, bw, bh, barW, seg, labels, unit, fs, pad, e } = sb;
      pen.path([[[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]]], { closed: true, fill: "#ffffff", fillOpacity: 0.92, stroke: "#333333", width: 0.2 * e });
      const bx = x + pad + textW(labels[0], fs) / 2, by = y + 2.2 * e, bH = 1.7 * e;
      for (let i = 0; i < seg; i++) {
        const sx = bx + (barW * i) / seg;
        pen.path([[[sx, by], [sx + barW / seg, by], [sx + barW / seg, by + bH], [sx, by + bH]]], { closed: true, fill: i % 2 ? "#ffffff" : "#1f1f1f" });
      }
      pen.path([[[bx, by], [bx + barW, by], [bx + barW, by + bH], [bx, by + bH]]], { closed: true, stroke: "#1f1f1f", width: 0.25 * e });
      labels.forEach((t, i) => { if (t) pen.text(i === seg ? `${t} ${unit}` : t, bx + (barW * i) / seg + (i === seg ? textW(` ${unit}`, fs) / 2 : 0), by + bH + 1.2 * e, { size: fs, align: "center", base: "top", color: "#1f1f1f" }); });
    }
    // 범례
    if (lg) {
      const { x, y, bw, bh, fs, rowH, sym, pad, titleH, e } = lg;
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
        if (it.type === "ring") {
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: "#5f6368", width: 1 * e, cap: "butt" });
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: it.color, width: 0.6 * e, cap: "butt" });
        }
        if (it.type === "route") {
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: "#5f6368", width: 1.35 * e, cap: "butt" });
          pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: it.color, width: 0.75 * e, dash: [1.8 * e, 1 * e], cap: "butt" });
        }
        if (it.type === "fpt") fieldSym(pen, it.kind, sx + sym / 2, cy, e);
        if (it.type === "occ") {
          const k = new Set(it.kinds);
          if (k.has("area")) pen.path([r], { closed: true, fill: it.sym.color, fillOpacity: 0.4, stroke: it.sym.color, width: 0.55 * e, join: "miter" });
          if (k.has("line")) pen.path([[[sx, cy], [sx + sym, cy]]], { stroke: it.sym.color, width: 1 * e, cap: "butt" });
          if (k.has("point")) speciesSym(pen, it.sym, sx + sym / 2, cy, e);
        }
        if (it.type === "arrow") pen.path([arrowShape([[sx, cy], [sx + sym, cy]], 2.2 * e)], { closed: true, fill: it.color, fillOpacity: 0.85 });
        if (it.type === "flow") pen.path([flowArrow(sx + sym / 2, cy, 0, 5 * e)], { closed: true, fill: it.color });
        if (it.type === "peak") { const s = 1.8 * e, px = sx + sym / 2; pen.path([[[px, cy - s], [px + s * 0.95, cy + s * 0.62], [px - s * 0.95, cy + s * 0.62]]], { closed: true, fill: it.color }); }
        pen.text(it.label, sx + sym + 2.6 * e, cy, { size: fs, align: "left", base: "middle", color: "#1f1f1f" });
      });
    }
    // 틀
    pen.path([[[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]]], { closed: true, stroke: "#1f1f1f", width: 0.35 * e, join: "miter" });
    // 문헌자료 표(문헌조사 위치도, 틀 아래)
    const T = lit ? Lo.tab : null;
    if (T) drawLitTable(pen, T, F.x, F.y + F.h + 2.5 * e, F.w, e);
    // 출처·축척
    const fy = F.y + F.h + (T ? T.h + 3 * e : 0) + Lo.foot * 0.62;
    if (fig.el.source) {
      const src = [BASES[baseKey].src || ""];
      if (labels) src.push(LABELS.src);
      if ((lit || pa) && fig.lit.grid) src.push("도엽: BioGrid EIA 기준 1:25,000 도엽(국토지리정보원)");
      if (pa && D.pa) src.push("보호구역: 보호구역 종합포털(protect.biogrideia.com — 국토교통부 브이월드·한국보호지역 통합DB)");
      if (lit && fig.lit.imported) src.push("문헌 위치: BioGrid EIA");
      if (natOn && nd && nd.source) src.push(nd.source.replace(/^생태·자연도 /, "생태·자연도: "));
      if (natl && cls) src.push(fig.kind === "veg" ? `식생기후대: ${cls.source}(구분: 한국의 숲 Ⅵ, 국립수목원 2020)` : `식물상 지역: ${cls.source}`);
      if (fld && (fig.fieldRoutes || []).length) src.push("조사경로: 현지조사 GPS 기록");
      if (occ && occRecs.length) src.push("출현 기록: 현지조사", ...(fig.listSource ? [fig.listSource] : []));
      if (eco && lc) src.push("토지피복: 환경부 세분류 토지피복지도(2025)");
      if (eco && wz && fig.eco.rzone) src.push("하천구역: 국토교통부 브이월드 하천망");
      if (eco && wz && fig.eco.szone) src.push("소하천구역: 국토교통부 연속주제도");
      if (eco && topo && fig.eco.topo) src.push("실폭하천·호수/저수지: 국토지리정보원 연속수치지형도");
      if (eco && land && fig.eco.sea) src.push("해안선: 국토교통부 브이월드 시군구 경계");
      if (eco && os) src.push("이름·하천: © OpenStreetMap 기여자");
      if (eco && D.demUsed) src.push("흐름 방향 고도: AWS Terrain Tiles(SRTM 등)");
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
    return { labels: labelsOut, dist1, litOut, pa: pa && D.pa ? D.pa.areas : null };
  };

  // 문헌조사 위치도 둘째 쪽: 첫 쪽과 같은 용지에 제목과 문헌자료 표만(표가 쪽을 넘으면 글자를 줄임)
  const paintLitPage = (pen, fig) => {
    const Lo = layout({ ...fig, lit: { ...fig.lit, table: "none" } }), { W, H, e, m } = Lo;
    const top = fig.el.title && fig.title ? 13 * e : 0;
    pen.path([[[0, 0], [W, 0], [W, H], [0, H]]], { closed: true, fill: "#ffffff" });
    if (top) pen.text(fig.title, W / 2, m + top / 2 - 1 * e, { size: 15 * e, weight: 700, align: "center", base: "middle", color: "#111" });
    // 둘째 쪽은 자리가 넉넉해 글자를 1.3배부터(넘치면 줄임)
    const T = litTable(fig.litRows || [], W - 2 * m, e, H - 2 * m - top, 1.3, fig.kind === "sp" ? fig.spNote || [] : []);
    if (T) drawLitTable(pen, T, m, m + top, W - 2 * m, e);
    else pen.text("도면에 넣은 문헌이 없습니다.", W / 2, m + top + 10 * e, { size: 9 * e, align: "center", base: "middle", color: "#555555" });
    return { layout: Lo, labels: [], warn: [] };
  };
  const renderLitPage = async (pen, fig) => {
    const np = new NullPen();
    paintLitPage(np, fig);
    await ensureFonts(np.strings);
    return paintLitPage(pen, fig);
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

  // ---------- 국립생태원 생태자연도 WFS(공공데이터포털): 원본 경계로 정확한 면적·이격거리 ----------
  // 범위는 EPSG:5186 x,y(동,북), 한 번에 500개까지라 꽉 차면 4등분해 다시 받음. 별도관리지역은 이 API에 없음
  const ECO_WFS = "https://apis.data.go.kr/B553084/ecoapi/EcologyzmpService/wfs/getEcologyzmpWFS";
  const parseEcoGml = (text, box) => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("errMsg")[0] || doc.getElementsByTagNameNS("*", "ExceptionText")[0] || doc.getElementsByTagName("ServiceException")[0];
    if (err) throw new Error(`생태자연도 API: ${err.textContent.trim()}`);
    if (doc.getElementsByTagName("parsererror").length) throw new Error("생태자연도 API 응답을 읽지 못했습니다.");
    const nums = (s, pairSep) => {
      const out = [];
      if (pairSep) s.trim().split(/\s+/).forEach((p) => { const [x, y] = p.split(",").map(Number); if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]); });
      else { const v = s.trim().split(/[\s,]+/).map(Number); for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]]); }
      return out;
    };
    const members = [...doc.getElementsByTagNameNS("*", "featureMember"), ...doc.getElementsByTagNameNS("*", "member")];
    const feats = members.map((m) => {
      const f = m.firstElementChild;
      if (!f) return null;
      const gEl = f.getElementsByTagNameNS("*", "eczm_grad")[0];
      const polys = [...f.getElementsByTagNameNS("*", "Polygon")].map((pg) => [...pg.getElementsByTagNameNS("*", "LinearRing")].map((lr) => {
        const c = lr.getElementsByTagNameNS("*", "coordinates")[0], pl = lr.getElementsByTagNameNS("*", "posList")[0];
        if (c) return nums(c.textContent, true);
        if (pl) return nums(pl.textContent, false);
        return [...lr.getElementsByTagNameNS("*", "pos")].map((p) => nums(p.textContent, false)[0]).filter(Boolean);
      }).filter((r) => r.length >= 3)).filter((p) => p.length);
      return { id: f.getAttribute("fid") || f.getAttribute("gml:id") || f.getAttributeNS("http://www.opengis.net/gml", "id") || "", grade: gEl ? +gEl.textContent : 0, polys };
    }).filter((x) => x && x.polys.length);
    // 좌표 순서가 북,동으로 오면 바꿈(요청 범위 안에 드는 쪽으로)
    const pt = feats[0] && feats[0].polys[0][0][0];
    if (pt && !(pt[0] >= box[0] - 5000 && pt[0] <= box[2] + 5000) && pt[1] >= box[0] - 5000 && pt[1] <= box[2] + 5000) {
      feats.forEach((f) => f.polys.forEach((p) => p.forEach((r) => r.forEach((c) => c.reverse()))));
    }
    return feats;
  };
  const ecoFetch = async (key, box, grade, depth = 0) => {
    const url = `${ECO_WFS}?ServiceKey=${encodeURIComponent(key)}&typeName=tbl_opn_eczm&bbox=${box.map((v) => v.toFixed(2)).join(",")}&maxFeatures=500&eczmGr=${grade}`;
    let text = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
      try { text = await (await fetch(url, { signal: ctl.signal })).text(); } catch (_) { text = ""; } finally { clearTimeout(t); }
      if (text && !/SERVICETIMEOUT/.test(text)) break;
    }
    if (!text || /SERVICETIMEOUT/.test(text)) throw new Error("생태자연도 API(국립생태원)가 응답하지 않습니다.");
    const feats = parseEcoGml(text, box);
    if (feats.length < 500 || depth >= 4) return feats;
    const [x0, y0, x1, y1] = box, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, seen = new Set(), out = [];
    for (const b of [[x0, y0, xm, ym], [xm, y0, x1, ym], [x0, ym, xm, y1], [xm, ym, x1, y1]]) {
      for (const f of await ecoFetch(key, b, grade, depth + 1)) {
        const k = f.id || JSON.stringify(f.polys[0][0][0]);
        if (!seen.has(k)) { seen.add(k); out.push(f); }
      }
    }
    return out;
  };
  // 1·2등급(사업지구 안 부분)과 별도관리지역으로 서로 겹치지 않는 면적 나누기
  const splitGrades = (total, S1, S2, SS) => {
    const A = (f) => (f ? geomArea5186(f.geometry) : 0);
    const cut = (f) => { if (!f || !SS) return 0; try { return A(turf.intersect(turf.featureCollection([f, SS]))); } catch (err) { console.warn(err); return 0; } };
    const o1 = cut(S1), o2 = cut(S2), g1 = A(S1) - o1, g2 = A(S2) - o2, sep = A(SS);
    return { g1, g2, sep, g3: Math.max(0, total - g1 - g2 - sep), overlap: o1 + o2 };
  };
  const ringArea5186 = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };
  const geomArea5186 = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [])
    .reduce((s, p) => s + p.reduce((t, r, i) => t + (i ? -1 : 1) * ringArea5186(r), 0), 0);
  // 원본 경계(API)로 사업지구 안 1·2등급 면적(EPSG:5186 평면 넓이 — GIS에서 재는 값과 같은 방식). 별도관리지역은 조각으로 따로 셈
  const natAreasApi = async (site, key) => {
    await U.loadScript(U.LIB.turf, "turf");
    const tr = proj4("WGS84", crsDef("5186"));
    const polys = site.features.filter((f) => /Polygon/.test(f.geometry.type));
    if (!polys.length) throw new Error("면적은 면(구역) 경계일 때만 계산합니다.");
    const to = (g) => ({ type: g.type, coordinates: (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((p) => p.map((r) => r.map((c) => tr.forward([c[0], c[1]])))) });
    const ps = polys.map((f) => turf.feature(((g) => (g.type === "MultiPolygon" ? g : { type: "Polygon", coordinates: g.coordinates[0] }))(to(f.geometry))));
    const sitePoly = ps.length === 1 ? ps[0] : turf.union(turf.featureCollection(ps));
    const b = turf.bbox(sitePoly), box = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
    const [f1, f2, tiles] = await Promise.all([ecoFetch(key, box, 1), ecoFetch(key, box, 2), natAreas(site).catch(() => null)]);
    const inside = (feats) => {
      const out = [];
      feats.forEach((f) => f.polys.forEach((rings) => {
        const closed = rings.map((r) => (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]]));
        try { const x = turf.intersect(turf.featureCollection([sitePoly, turf.polygon(closed)])); if (x) out.push(x); } catch (err) { console.warn(err); }
      }));
      return out.length > 1 ? turf.union(turf.featureCollection(out)) : out[0] || null;
    };
    // 안전장치: API가 등급 면을 하나도 주지 않았는데 조각에는 1·2등급이 있으면 응답을 믿지 않음(형식이 다르거나 빈 응답)
    if (!f1.length && !f2.length && tiles && tiles.g1 + tiles.g2 > tiles.total * 0.01) throw new Error("API 응답에서 등급 면을 찾지 못했습니다.");
    const total = geomArea5186(sitePoly.geometry);
    return { total, ...splitGrades(total, inside(f1), inside(f2), tiles ? tiles.sepGeom : null), api: true,
      source: `공공데이터포털 국립생태원 생태자연도 WFS(최신 DB, 조회 ${new Date().toISOString().slice(0, 10)})`, sepSource: tiles && tiles.source };
  };
  // 도면 틀 안 1등급(원본 경계)을 메르카토르 고리로(조각과 같은 꼴) — 이격거리용, 틀 범위별로 기억
  const ECO1 = { key: "", val: null };
  const eco1Frame = async (v, key) => {
    const tr = proj4("WGS84", crsDef("5186")), back = proj4(crsDef("5186"), "WGS84");
    const F = v.frame, cs = [[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]].map(([x, y]) => tr.forward(v.toLL(x, y)));
    const box = [Math.min(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1])), Math.max(...cs.map((c) => c[0])), Math.max(...cs.map((c) => c[1]))];
    const k = box.map((x) => Math.round(x)).join(",");
    if (ECO1.key === k) return ECO1.val;
    const feats = await ecoFetch(key, box, 1);
    const val = feats.flatMap((f) => f.polys.map((rings) => rings.map((r) => {
      const a = new Float64Array(r.length * 2);
      r.forEach((c, i) => { const [lon, lat] = back.forward(c); a[2 * i] = mx(lon); a[2 * i + 1] = my(lat); });
      return a;
    })));
    ECO1.key = k;
    ECO1.val = val;
    return val;
  };

  // 사업지구 안 생태·자연도 등급별 면적(㎡): 사업지구 면과 정기고시 원본 등급 경계(조각, 1 cm 안)를 겹쳐 EPSG:5186 평면 넓이로 계산
  // (GIS에서 재는 값과 같은 방식). 1·2·3등급·별도관리지역은 서로 겹치지 않는 구분이므로 3등급은 사업지구에서 1·2등급과
  // 별도관리지역을 뺀 나머지, 등급 면과 겹치는 별도관리지역이 있으면 그 부분은 별도관리지역으로 셈(겹친 넓이는 overlap)
  const natAreas = async (site) => {
    await U.loadScript(U.LIB.turf, "turf");
    const polys = site.features.filter((f) => /Polygon/.test(f.geometry.type));
    if (!polys.length) throw new Error("면적은 면(구역) 경계일 때만 계산합니다.");
    const tr = proj4("WGS84", crsDef("5186"));
    const to = (g) => (g.type === "Polygon" ? { type: "Polygon", coordinates: g.coordinates.map((r) => r.map((c) => tr.forward([c[0], c[1]]))) }
      : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map((r) => r.map((c) => tr.forward([c[0], c[1]])))) });
    const ps = polys.map((f) => turf.feature(to(f.geometry)));
    const sitePoly = ps.length === 1 ? ps[0] : turf.union(turf.featureCollection(ps));
    const lb = U.bboxOf(polys);
    const nd = await natLayer({ llBox: [lb[0] - 0.002, lb[1] - 0.002, lb[2] + 0.002, lb[3] + 0.002] });
    const b = turf.bbox(sitePoly);
    const toFeat = (rings) => {
      const rs = rings.map((r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(tr.forward([ilon(r[i]), ilat(r[i + 1])])); if (o.length) o.push(o[0].slice()); return o; }).filter((r) => r.length >= 4);
      return rs.length ? turf.polygon(rs) : null;
    };
    // 사업지구 안에 든 부분을 모아 하나로
    const inside = (code) => {
      const out = [];
      for (const p of nd[code] || []) {
        const f = toFeat(p);
        if (!f) continue;
        const fb = turf.bbox(f);
        if (fb[0] > b[2] || fb[2] < b[0] || fb[1] > b[3] || fb[3] < b[1]) continue;
        try { const x = turf.intersect(turf.featureCollection([sitePoly, f])); if (x) out.push(x); } catch (err) { console.warn(err); }
      }
      return out.length > 1 ? turf.union(turf.featureCollection(out)) : out[0] || null;
    };
    const total = geomArea5186(sitePoly.geometry);
    const S1 = inside(1), S2 = inside(2), SS = inside(9);
    return { total, ...splitGrades(total, S1, S2, SS), source: nd.source, sepGeom: SS };
  };

  window.Carto = { render, natAreas, natAreasApi, layout, makeView, autoScale, centerOf, SCALES, scalesFor, NATIONAL, BASES, hasVworld: !!VW_KEY, CanvasPen, SvgPen, mx, my, ilon, ilat, COLOR, arrowShape, litData, nineGrid, renderLitPage, litPlace, litBasin, paLoad, paMeasure, symPts, symOf };
})();
