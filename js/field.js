// 현지조사 위치도 — 조사원 경로 파일(GPX·KML·GeoJSON) 읽기, 튀는 점·차량 이동·먼 길 빼기, 부드럽게, 겹친 길 합치기, 고친 것(지우개·그린 길) 적용
(() => {
  const RAD = Math.PI / 180, R = 6371008.8;

  // ---------- 파일 읽기 → { lines: [[[lon, lat, t]]], pts: [{ name, lon, lat }] } (t: 초, 없으면 null) ----------
  const xml = (text) => {
    const d = new DOMParser().parseFromString(text, "application/xml");
    if (d.getElementsByTagName("parsererror").length) throw new Error("경로 파일을 읽지 못했습니다.");
    return d;
  };
  const tags = (el, name) => Array.from(el.getElementsByTagNameNS("*", name));
  const kids = (el, name) => Array.from(el.children).filter((c) => c.localName === name);
  const kidText = (el, name) => { const c = kids(el, name)[0]; return c ? c.textContent.trim() : ""; };
  const sec = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? Math.round(t / 1000) : null; };
  const fromGpx = (text) => {
    const d = xml(text), lines = [], pts = [];
    const pt = (p) => [+p.getAttribute("lon"), +p.getAttribute("lat"), sec(kidText(p, "time"))];
    tags(d, "trkseg").forEach((s) => lines.push(kids(s, "trkpt").map(pt)));
    tags(d, "rte").forEach((r) => lines.push(kids(r, "rtept").map(pt)));
    tags(d, "wpt").forEach((w) => { const [lon, lat] = pt(w); pts.push({ name: kidText(w, "name"), desc: kidText(w, "desc") || kidText(w, "cmt"), lon, lat }); });
    return { lines, pts };
  };
  const fromKml = (text) => {
    const d = xml(text), lines = [], pts = [];
    const cs = (s) => s.trim().split(/\s+/).map((t) => t.split(",").map(Number)).filter((c) => c.length >= 2).map((c) => [c[0], c[1], null]);
    tags(d, "Placemark").forEach((pm) => {
      const name = kidText(pm, "name");
      tags(pm, "LineString").forEach((g) => { const c = tags(g, "coordinates")[0]; if (c) lines.push(cs(c.textContent)); });
      // gx:Track: <when>과 <gx:coord>가 차례로 짝
      tags(pm, "Track").forEach((g) => {
        const when = kids(g, "when").map((w) => sec(w.textContent.trim()));
        lines.push(kids(g, "coord").map((c, i) => { const [lon, lat] = c.textContent.trim().split(/\s+/).map(Number); return [lon, lat, when[i] == null ? null : when[i]]; }));
      });
      const desc = kidText(pm, "description").replace(/<[^>]*>/g, " ").trim();
      tags(pm, "Point").forEach((g) => { const c = tags(g, "coordinates")[0], q = c ? cs(c.textContent)[0] : null; if (q) pts.push({ name, desc, lon: q[0], lat: q[1] }); });
    });
    return { lines, pts };
  };
  const fromGeoJSON = (text) => {
    const j = JSON.parse(text), lines = [], pts = [];
    const fs = j.type === "FeatureCollection" ? j.features || [] : j.type === "Feature" ? [j] : [{ geometry: j }];
    const c3 = (c) => [c[0], c[1], null];
    fs.forEach((f) => {
      const g = f && f.geometry, p = (f && f.properties) || {};
      if (!g) return;
      if (g.type === "LineString") lines.push(g.coordinates.map(c3));
      if (g.type === "MultiLineString") g.coordinates.forEach((l) => lines.push(l.map(c3)));
      if (g.type === "Point") pts.push({ name: String(p.name || p.Name || p.NAME || ""), desc: String(p.desc || p.description || ""), lon: g.coordinates[0], lat: g.coordinates[1] });
    });
    return { lines, pts };
  };
  const parse = (name, text) => {
    const x = (name.split(".").pop() || "").toLowerCase();
    const r = x === "gpx" ? fromGpx(text) : x === "kml" ? fromKml(text) : x === "geojson" || x === "json" ? fromGeoJSON(text) : null;
    if (!r) throw new Error(`${name}: GPX·KML·KMZ·GeoJSON만 읽습니다.`);
    if (r.lines.some((l) => l.some((c) => Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90))) throw new Error(`${name}: 경위도(WGS84) 좌표가 아닙니다.`);
    const ok = (c) => Number.isFinite(c[0]) && Number.isFinite(c[1]);
    return { lines: r.lines.map((l) => l.filter(ok)).filter((l) => l.length >= 2), pts: r.pts.filter((p) => ok([p.lon, p.lat])) };
  };

  // ---------- 평면(m) ----------
  // 사업지 둘레 몇 km 안이라 등장방형으로 충분(1 m 미만 차이)
  const plane = ([lon0, lat0]) => {
    const kx = R * RAD * Math.cos(lat0 * RAD), ky = R * RAD;
    return { fwd: (c) => [(c[0] - lon0) * kx, (c[1] - lat0) * ky], inv: (p) => [lon0 + p[0] / kx, lat0 + p[1] / ky] };
  };
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const length = (l) => { let s = 0; for (let i = 1; i < l.length; i++) s += dist(l[i - 1], l[i]); return s; };
  // 경위도 선의 길이(m)
  const lengthLL = (l) => {
    if (l.length < 2) return 0;
    const P = plane(l[0]);
    return length(l.map(P.fwd));
  };
  // 더글러스-포이커 줄이기
  const simplify = (pts, tol) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      let best = -1, bi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = L ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L : dist(pts[i], pts[a]);
        if (d > best) { best = d; bi = i; }
      }
      if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  // 점 사이가 step(m)를 넘지 않게 채움
  const resample = (pts, step) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.ceil(dist(pts[i - 1], pts[i]) / step);
      for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    return out;
  };

  // 선을 따라 같은 간격(step m)으로 다시 찍음
  const even = (pts, step) => {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = dist(a, b);
      let t = step - carry;
      for (; t <= L; t += step) out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]);
      carry = L - (t - step);
    }
    const last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > step * 0.3) out.push(last); else out[out.length - 1] = last;
    return out;
  };
  // 부드럽게: 앞뒤 s(m) 안 점들을 가우스 가중 평균(GPS 잔떨림을 펴고 큰 굽이는 남김). 끝으로 갈수록 창을 줄여 끝점은 그대로
  const smooth = (pts, s) => {
    if (!(s > 0) || pts.length < 3) return pts;
    const step = Math.max(1, s / 6), q = even(pts, step), k = Math.max(1, Math.round(s / step)), sig = k / 2;
    const w = Array.from({ length: 2 * k + 1 }, (_, i) => Math.exp(-((i - k) ** 2) / (2 * sig * sig)));
    return q.map((p, i) => {
      const r = Math.min(k, i, q.length - 1 - i);
      if (!r) return p;
      let sx = 0, sy = 0, sw = 0;
      for (let j = -r; j <= r; j++) { const ww = w[j + k]; sx += q[i + j][0] * ww; sy += q[i + j][1] * ww; sw += ww; }
      return [sx / sw, sy / sw];
    });
  };
  // 직접 그린 길의 꺾인 곳을 둥글게(차이킨 두 번, 끝점은 그대로)
  const chaikin = (pts, n = 2) => {
    let q = pts;
    for (let it = 0; it < n && q.length >= 3; it++) {
      const o = [q[0]];
      for (let i = 0; i < q.length - 1; i++) {
        const [a, b] = [q[i], q[i + 1]];
        if (i > 0) o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        if (i < q.length - 2) o.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      o.push(q[q.length - 1]);
      q = o;
    }
    return q;
  };

  // ---------- 다듬기 ----------
  // 같은 자리 점·튀는 점(앞뒤 점에서 멀리 갔다 돌아온 점)을 빼고, 차량 이동(앞뒤 15초 평균 시속 15 km 넘음, 시각이 있을 때)은 빼고,
  // 300 m 넘게 건너뛴 곳(신호를 놓친 곳)은 끊음. st: 길이 집계(m)
  const CAR = 15 / 3.6, JUMP = 300;
  const clean = (line, P, car, st) => {
    const a = [];
    line.forEach((c) => { const p = P.fwd(c), l = a[a.length - 1]; p[2] = c[2]; if (!l || dist(l, p) >= 0.5) a.push(p); });
    for (let pass = 0; pass < 2; pass++) {
      for (let i = a.length - 2; i >= 1; i--) {
        const d1 = dist(a[i - 1], a[i]), d2 = dist(a[i], a[i + 1]);
        if (d1 > 40 && d2 > 40 && dist(a[i - 1], a[i + 1]) < 0.3 * Math.min(d1, d2)) a.splice(i, 1);
      }
    }
    const bad = new Uint8Array(a.length);
    if (car && a.filter((p) => p[2] != null).length >= a.length * 0.8) {
      const cum = [0];
      for (let i = 1; i < a.length; i++) cum.push(cum[i - 1] + dist(a[i - 1], a[i]));
      let lo = 0, hi = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i][2] == null) continue;
        while (lo < i - 1 && (a[lo][2] == null || a[i][2] - a[lo][2] > 15)) lo++;
        if (hi < i + 1) hi = Math.min(a.length - 1, i + 1);
        while (hi + 1 < a.length && a[hi + 1][2] != null && a[hi + 1][2] - a[i][2] <= 15) hi++;
        const dt = a[hi][2] != null && a[lo][2] != null ? a[hi][2] - a[lo][2] : 0;
        if (dt > 0 && (cum[hi] - cum[lo]) / dt > CAR) bad[i] = 1;
      }
    }
    const out = [];
    let cur = [];
    const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
    a.forEach((p, i) => {
      if (i) st.raw += dist(a[i - 1], p);
      if (bad[i]) { if (i && bad[i - 1]) st.car += dist(a[i - 1], p); flush(); return; }
      if (cur.length && dist(cur[cur.length - 1], p) > JUMP) flush();
      cur.push([p[0], p[1]]);
    });
    flush();
    return out;
  };

  // ---------- 먼 길 자르기 ----------
  // 사업지구(평면 m): 경계 선분과 면(안쪽은 거리 0)
  const siteGeom = (features, P) => {
    const segs = [], polys = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
    const line = (cs) => { const q = cs.map(P.fwd); q.forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }); if (q.length === 1) segs.push([q[0], q[0]]); for (let i = 1; i < q.length; i++) segs.push([q[i - 1], q[i]]); return q; };
    features.forEach((f) => {
      const g = f.geometry;
      if (g.type === "Polygon") polys.push(g.coordinates.map(line));
      if (g.type === "MultiPolygon") g.coordinates.forEach((p) => polys.push(p.map(line)));
      if (g.type === "LineString") line(g.coordinates);
      if (g.type === "MultiLineString") g.coordinates.forEach(line);
      if (g.type === "Point") line([g.coordinates]);
      if (g.type === "MultiPoint") g.coordinates.forEach((c) => line([c]));
    });
    return { segs, polys, bb };
  };
  const inRings = ([x, y], rings) => { let c = false; rings.forEach((r) => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; }); return c; };
  // 사업지구에서 far(m)보다 먼 부분은 잘라 냄(앱을 끄지 않고 돌아간 길 등)
  const farCut = (lines, G, far, st) => {
    const f2 = far * far, b = G.bb;
    const near = (p) => {
      if (p[0] < b[0] - far || p[0] > b[2] + far || p[1] < b[1] - far || p[1] > b[3] + far) return false;
      if (G.polys.some((rings) => inRings(p, rings))) return true;
      return G.segs.some(([a, c]) => segNear(p, a, c)[0] <= f2);
    };
    const out = [];
    lines.forEach((l) => {
      let cur = [];
      const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
      l.forEach((p, i) => { if (near(p)) cur.push(p); else { if (i) st.far += dist(l[i - 1], p); flush(); } });
      flush();
    });
    return out;
  };

  // 사업지구에서 각 점(경위도)까지 거리(m, 면 안은 0)
  const siteDist = (features, lls) => {
    if (!lls.length) return [];
    const P = plane(lls[0]), G = siteGeom(features, P);
    return lls.map((ll) => {
      const p = P.fwd(ll);
      if (G.polys.some((rings) => inRings(p, rings))) return 0;
      let best = Infinity;
      G.segs.forEach(([a, c]) => { best = Math.min(best, segNear(p, a, c)[0]); });
      return Math.sqrt(best);
    });
  };

  // ---------- 겹친 길 합치기 ----------
  // 선분 격자 색인: 점에서 tol 안에 있는 가장 가까운 선분 위 점
  const segNear = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const q = [a[0] + t * dx, a[1] + t * dy];
    return [(p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2, q];
  };
  const makeIndex = (cell) => {
    const m = new Map();
    const put = (a, b) => {
      const i0 = Math.floor(Math.min(a[0], b[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const j0 = Math.floor(Math.min(a[1], b[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i}|${j}`; if (!m.has(k)) m.set(k, []); m.get(k).push([a, b]); }
    };
    const near = (p, tol) => {
      let best = null;
      const i0 = Math.floor((p[0] - tol) / cell), i1 = Math.floor((p[0] + tol) / cell), j0 = Math.floor((p[1] - tol) / cell), j1 = Math.floor((p[1] + tol) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const segs = m.get(`${i}|${j}`);
        if (segs) for (const [a, b] of segs) { const r = segNear(p, a, b); if (r[0] <= tol * tol && (!best || r[0] < best[0])) best = r; }
      }
      return best && best[1];
    };
    return { put, near };
  };
  // 긴 경로부터 차례로, 이미 넣은 길에서 tol(m) 안을 지나는 부분은 빼고 새로 간 부분만 더함.
  // 갔다가 되돌아온 길도 합치도록 자기 경로는 지나온 거리 4·tol 뒤부터 비교. 길을 건너거나 갈라지는 곳이 끊기지 않게 짧은 겹침(3·tol 미만)은 남기고,
  // 겹친 길이 잠깐 벗어난 짧은 조각(2·tol 미만, 끝은 tol 미만)은 빼며, 새로 더한 조각의 끝은 이미 넣은 길에 붙임
  const merge = (lines, tol) => {
    if (!(tol > 0)) return lines.map((l) => simplify(l, 0.5));
    const step = Math.max(1.5, tol / 4), idx = makeIndex(tol), out = [];
    lines.map((l) => [l, length(l)]).sort((x, y) => y[1] - x[1]).forEach(([l]) => {
      const q = resample(l, step), n = q.length, lag = Math.ceil((4 * tol) / step);
      const cov = new Uint8Array(n), snap = new Array(n).fill(null);
      let put = 0;
      for (let i = 0; i < n; i++) {
        for (; put + 1 <= i - lag; put++) idx.put(q[put], q[put + 1]);
        const h = idx.near(q[i], tol);
        if (h) { cov[i] = 1; snap[i] = h; }
      }
      for (; put + 1 < n; put++) idx.put(q[put], q[put + 1]);
      const runs = [];
      for (let i = 0; i < n;) { let j = i; while (j + 1 < n && cov[j + 1] === cov[i]) j++; runs.push({ s: i, e: j, c: cov[i] }); i = j + 1; }
      const len = (r) => (r.e - r.s + 1) * step;
      runs.forEach((r, k) => { if (r.c && k > 0 && k < runs.length - 1 && len(r) < 3 * tol) r.c = 0; });
      runs.forEach((r, k) => {
        if (r.c || runs.length === 1) return;
        const inner = k > 0 && k < runs.length - 1 && runs[k - 1].c && runs[k + 1].c;
        if (len(r) < (inner ? 2 * tol : tol)) r.c = 1;
      });
      const flag = new Uint8Array(n);
      runs.forEach((r) => { for (let i = r.s; i <= r.e; i++) flag[i] = r.c; });
      for (let i = 0; i < n;) {
        if (flag[i]) { i++; continue; }
        let j = i;
        while (j + 1 < n && !flag[j + 1]) j++;
        const pts = q.slice(i, j + 1);
        if (i > 0) pts.unshift(snap[i - 1] || q[i - 1]);
        if (j < n - 1) pts.push(snap[j + 1] || q[j + 1]);
        if (pts.length >= 2 && length(pts) >= Math.min(tol, 10)) out.push(simplify(pts, 1));
        i = j + 1;
      }
    });
    return out;
  };

  // ---------- 고친 것 ----------
  // 지우개: 가운데 점들 cs에서 r(m) 안에 드는 부분을 잘라 냄
  const erase = (lines, cs, r) => {
    const bb = [Math.min(...cs.map((c) => c[0])) - r, Math.min(...cs.map((c) => c[1])) - r, Math.max(...cs.map((c) => c[0])) + r, Math.max(...cs.map((c) => c[1])) + r];
    const out = [];
    lines.forEach((l) => {
      const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]);
      if (Math.min(...xs) > bb[2] || Math.max(...xs) < bb[0] || Math.min(...ys) > bb[3] || Math.max(...ys) < bb[1]) { out.push(l); return; }
      let cur = [];
      // 지우고 남은 부스러기(지우개 반지름보다 짧은 조각)도 뺌
      const flush = () => { if (cur.length >= 2 && length(cur) >= r) out.push(simplify(cur, 0.3)); cur = []; };
      resample(l, Math.max(0.3, r / 5)).forEach((p) => { if (cs.some((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 <= r * r)) flush(); else cur.push(p); });
      flush();
    });
    return out;
  };

  // 경로 묶음 [{ g, lines: [[[lon, lat, t]]] }] → 다듬고 합친 선 [{ g, lines: [[[lon, lat]]] }], 길이 집계(km)
  // site: 사업지구 GeoJSON 피처(far m보다 먼 길을 자를 때)
  const build = (sets, { origin, tol, car, soft, site, far }) => {
    const P = plane(origin), st = { raw: 0, car: 0, far: 0 }, G = site && far > 0 ? siteGeom(site, P) : null;
    const out = sets.map(({ g, lines }) => {
      let cl = lines.flatMap((l) => clean(l, P, car, st));
      if (G) cl = farCut(cl, G, far, st);
      cl = cl.filter((l) => length(l) >= 10).map((l) => simplify(smooth(l, soft), 0.3));
      return { g, lines: merge(cl, tol).map((l) => l.map(P.inv)) };
    });
    const km = (m) => Math.round(m / 10) / 100;
    return { sets: out, stats: { raw: km(st.raw), car: km(st.car), far: km(st.far), out: km(out.reduce((s, x) => s + x.lines.reduce((t, l) => t + length(l.map(P.fwd)), 0), 0)) } };
  };
  // 점에서 snap(m) 안의 가장 가까운 기존 길 위 점
  const nearestOn = (S, p, snap) => {
    let best = null;
    S.forEach((x) => x.lines.forEach((l) => { for (let i = 1; i < l.length; i++) { const r = segNear(p, l[i - 1], l[i]); if (r[0] <= snap * snap && (!best || r[0] < best[0])) best = r; } }));
    return best && best[1];
  };
  // 고친 것을 차례로: { t: "add", g, pts, snap } 길 더하기(끝이 snap m 안에 기존 길이 있으면 거기에 붙이고 꺾인 곳은 둥글게),
  // { t: "erase", c: [[lon, lat]], r: m } 지우기(모든 묶음에서)
  const applyEdits = (sets, edits, origin) => {
    if (!edits.length) return sets;
    const P = plane(origin);
    let S = sets.map((x) => ({ g: x.g, lines: x.lines.map((l) => l.map(P.fwd)) }));
    edits.forEach((ed) => {
      if (ed.t === "add" && ed.pts.length >= 2) {
        let s = S.find((x) => x.g === ed.g);
        if (!s) S.push((s = { g: ed.g, lines: [] }));
        const q = ed.pts.map(P.fwd);
        if (ed.snap > 0) [0, q.length - 1].forEach((i) => { const h = nearestOn(S, q[i], ed.snap); if (h) q[i] = h; });
        s.lines.push(chaikin(q));
      }
      if (ed.t === "erase" && ed.c.length) { const cs = ed.c.map(P.fwd); S = S.map((x) => ({ g: x.g, lines: erase(x.lines, cs, ed.r) })); }
    });
    return S.map((x) => ({ g: x.g, lines: x.lines.map((l) => l.map(P.inv)) }));
  };

  window.Field = { parse, build, applyEdits, lengthLL, siteDist };
})();
