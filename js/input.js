// 사업지구 경계 입력 — 파일(SHP·GeoJSON·KML·DXF)·좌표 붙여넣기·지도에 그리기
// (보호구역 종합포털 사업지 분석의 입력 코드를 옮겨 옴) 파일은 브라우저 안에서만 읽음
(() => {
  const { $, $$, esc, fmt, toast, LIB, loadScript, CRS, crsDef, BESSEL, feat, eachXY, mapCoords, bboxOf, kindOf } = U;
  const inKorea = ([x, y]) => x > 123 && x < 133 && y > 32 && y < 40;
  // TM 좌표 X·Y 순서가 둘 다 한반도 상자 안일 때 가리려고 쓰는 남한 대략 윤곽(본토·제주·울릉)
  const MAIN = [[126.1, 37.75], [126.6, 37.95], [127.2, 38.3], [128.35, 38.65], [128.7, 38.45], [129.5, 37.3], [129.65, 36.0], [129.6, 35.4],
    [129.1, 35.0], [128.4, 34.7], [127.6, 34.4], [126.9, 34.2], [126.0, 34.25], [125.95, 35.0], [126.3, 35.8], [126.4, 36.5], [126.05, 36.8], [126.45, 37.2]];
  const inPoly = (x, y, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  };
  const inCore = ([x, y]) => inPoly(x, y, MAIN) || (x > 126.1 && x < 127.0 && y > 33.1 && y < 33.6) || (x > 130.7 && x < 132 && y > 37.2 && y < 37.6);
  const RAD = Math.PI / 180;

  // .prj(WKT)에서 proj4 정의 만들기. 횡메르카토르는 직접 풀어 Bessel(옛 한국 측지계)이면 좌표 이동값을 붙임
  // (.prj에는 이동값이 없어 그대로 쓰면 수백 m 어긋남)
  const fromPrj = (wkt) => {
    if (!wkt || !wkt.trim()) return null;
    const sph = /SPHEROID\s*\[\s*"[^"]*"\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(wkt);
    const a = sph ? parseFloat(sph[1]) : 6378137;
    const rf = sph ? parseFloat(sph[2]) : 298.257222101;
    const bessel = Math.abs(a - 6377397.155) < 1;
    const datum = bessel ? BESSEL : `+a=${a} +rf=${rf}`;
    if (!/PROJCS/i.test(wkt)) return bessel ? `+proj=longlat ${BESSEL} +no_defs` : "geo";
    if (!/Transverse_Mercator/i.test(wkt)) return wkt;   // 그 밖의 투영은 proj4가 WKT를 직접 읽게 함
    const p = (name, d) => {
      const m = new RegExp(`PARAMETER\\s*\\[\\s*"${name}"\\s*,\\s*(-?[\\d.eE+-]+)`, "i").exec(wkt);
      return m ? parseFloat(m[1]) : d;
    };
    return `+proj=tmerc +lat_0=${p("Latitude_Of_Origin", 0)} +lon_0=${p("Central_Meridian", 0)} +k=${p("Scale_Factor", 1)} ` +
      `+x_0=${p("False_Easting", 0)} +y_0=${p("False_Northing", 0)} ${datum} +units=m +no_defs`;
  };

  // 경계 다듬기: 높이(Z) 버림, 잘못된 좌표 버림, 면 고리 닫기, 묶음(GeometryCollection) 풀기
  const normalize = (features) => {
    const out = [];
    const ok = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);
    const pts = (cs) => (cs || []).filter(ok).map((c) => [c[0], c[1]]);
    const ring = (cs) => {
      const r = pts(cs);
      if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0].slice());
      return r.length >= 4 ? r : null;
    };
    const poly = (p) => { const rs = (p || []).map(ring); return rs[0] ? rs.filter(Boolean) : null; };
    const add = (g, props) => {
      if (!g) return;
      const c = g.coordinates;
      if (g.type === "GeometryCollection") return g.geometries.forEach((x) => add(x, props));
      if (g.type === "Point" && ok(c)) out.push(feat({ type: "Point", coordinates: [c[0], c[1]] }, props));
      if (g.type === "MultiPoint") pts(c).forEach((p) => out.push(feat({ type: "Point", coordinates: p }, props)));
      if (g.type === "LineString") { const l = pts(c); if (l.length >= 2) out.push(feat({ type: "LineString", coordinates: l }, props)); }
      if (g.type === "MultiLineString") { const ls = c.map(pts).filter((l) => l.length >= 2); if (ls.length) out.push(feat({ type: "MultiLineString", coordinates: ls }, props)); }
      if (g.type === "Polygon") { const p = poly(c); if (p) out.push(feat({ type: "Polygon", coordinates: p }, props)); }
      if (g.type === "MultiPolygon") { const ps = c.map(poly).filter(Boolean); if (ps.length) out.push(feat({ type: "MultiPolygon", coordinates: ps }, props)); }
    };
    features.forEach((f) => add(f.geometry, f.properties || {}));
    return out;
  };

  // 넓이(ha)·길이(km) — 중심 위도의 1도 길이로 국지 평면 계산
  const KX = (φ) => 111412.84 * Math.cos(φ) - 93.5 * Math.cos(3 * φ) + 0.118 * Math.cos(5 * φ);
  const KY = (φ) => 111132.92 - 559.82 * Math.cos(2 * φ) + 1.175 * Math.cos(4 * φ) - 0.0023 * Math.cos(6 * φ);
  const measure = (features) => {
    const b = bboxOf(features);
    const φ = ((b[1] + b[3]) / 2) * RAD, kx = KX(φ), ky = KY(φ);
    const n = { point: 0, line: 0, polygon: 0 };
    let ha = 0, km = 0;
    features.forEach((f) => {
      const g = f.geometry, k = kindOf(g);
      n[k]++;
      if (k === "polygon") {
        (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach((p) => p.forEach((r, i) => {
          let a = 0;
          for (let s = 0, t = r.length - 1; s < r.length; t = s++) a += (r[t][0] - r[s][0]) * (r[t][1] + r[s][1]);
          ha += ((i ? -1 : 1) * Math.abs(a / 2) * kx * ky) / 1e4;
        }));
      }
      if (k === "line") {
        (g.type === "LineString" ? [g.coordinates] : g.coordinates).forEach((l) => {
          for (let i = 1; i < l.length; i++) km += Math.hypot((l[i][0] - l[i - 1][0]) * kx, (l[i][1] - l[i - 1][1]) * ky) / 1000;
        });
      }
    });
    return { n, ha, km, b };
  };

  // ---------- 상태·지도 ----------
  const IN = { site: null, raw: null, map: null, onChange: () => {} };
  const SITE_STYLE = { color: "#e03131", weight: 3, opacity: 1, fillColor: "#e03131", fillOpacity: 0.08 };
  const initMap = () => {
    IN.map = L.map("map", { zoomSnap: 0.5, minZoom: 6, maxZoom: 19 }).setView([36.3, 127.8], 7);
    const base = {
      "위성 영상": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: "영상 &copy; Esri, Maxar, Earthstar Geographics" }),
      "일반 지도": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자' }),
    };
    base["위성 영상"].addTo(IN.map);
    L.control.layers(base, null, { position: "topright" }).addTo(IN.map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(IN.map);
    IN.renderer = L.canvas({ padding: 0.3 });
    IN.siteLayer = L.featureGroup().addTo(IN.map);
    IN.drawLayer = L.featureGroup().addTo(IN.map);
    IN.map.on("click", onMapClick);
    IN.map.on("dblclick", () => { if (D.mode === "line" || D.mode === "polygon") finishDraw(); });
  };
  const drawSite = () => {
    IN.siteLayer.clearLayers();
    if (!IN.site) return;
    const g = L.geoJSON({ type: "FeatureCollection", features: IN.site.features }, {
      renderer: IN.renderer, interactive: false, style: () => SITE_STYLE,
      pointToLayer: (f, ll) => L.circleMarker(ll, { renderer: IN.renderer, interactive: false, radius: 7, color: "#fff", weight: 2, fillColor: "#e03131", fillOpacity: 1 }),
    });
    IN.siteLayer.addLayer(g);
    const b = g.getBounds();
    if (b.isValid()) {
      if (b.getNorthEast().equals(b.getSouthWest())) IN.map.setView(b.getCenter(), Math.max(IN.map.getZoom(), 15));
      else IN.map.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
    }
  };

  // raw: 파일에서 읽은 원래 도형(좌표계·DXF 레이어를 바꿀 때 다시 씀)
  const setSite = (features, label, raw = null) => {
    features = normalize(features);
    if (!features.length) { toast("경계로 쓸 점·선·면을 찾지 못했습니다.", 4000); return false; }
    IN.site = { features, label };
    IN.raw = raw;
    drawSite();
    renderSite();
    const b = bboxOf(features);
    if (!inKorea([b[0], b[1]]) || !inKorea([b[2], b[3]])) toast("경계가 한반도 밖에 있습니다. 좌표나 좌표계를 확인하세요.", 6000);
    IN.onChange(IN.site);
    return true;
  };
  const clearSite = () => { IN.site = null; IN.raw = null; drawSite(); renderSite(); IN.onChange(null); };
  const renderSite = () => {
    const box = $("#site-box");
    if (!IN.site) { box.hidden = true; box.innerHTML = ""; return; }
    const { n, ha, km, b } = measure(IN.site.features);
    const parts = [];
    if (n.polygon) parts.push(`면 ${fmt(n.polygon)}개 · ${fmt(ha, 2)} ha`);
    if (n.line) parts.push(`선 ${fmt(n.line)}개 · ${fmt(km, 3)} km`);
    if (n.point) parts.push(`점 ${fmt(n.point)}개`);
    const dxf = IN.raw && IN.raw.dxf && IN.raw.dxf.layers.size > 1 ? IN.raw.dxf : null;
    box.hidden = false;
    box.innerHTML = `
      <div class="site-head"><b>정한 경계</b><button class="link" id="site-clear">지우기</button></div>
      <div>${esc(parts.join(" / "))}</div>
      <div class="muted small">중심 ${((b[1] + b[3]) / 2).toFixed(5)}, ${((b[0] + b[2]) / 2).toFixed(5)} · ${esc(IN.site.label)}</div>
      ${dxf ? `<label class="small">DXF 레이어 <select id="dxf-layer" class="input">
        <option value="*" ${dxf.pick === "*" ? "selected" : ""}>모든 레이어</option>
        ${[...dxf.layers].map(([name, v]) => `<option value="${esc(name)}" ${dxf.pick === name ? "selected" : ""}>${esc(name)} (면 ${v.polygons.length} · 선 ${v.lines.length})</option>`).join("")}
      </select></label>` : ""}
      ${IN.site.swap ? `<div class="small">TM 좌표를 ${IN.site.swap === "en" ? "X=동쪽, Y=북쪽" : "X=북쪽, Y=동쪽"}으로 읽었습니다. 위치가 틀리면 <button class="link" id="swap">X·Y 바꿔 읽기</button></div>` : ""}`;
    const swap = $("#swap");
    if (swap) swap.onclick = () => { $("#order").value = IN.site.swap === "en" ? "ne" : "en"; useCoords(); };
    $("#site-clear").onclick = clearSite;
    const sel = $("#dxf-layer");
    if (sel) sel.onchange = () => { IN.raw.dxf.pick = sel.value; buildFromRaw(); };
  };

  // ---------- 주소·장소로 지도 옮기기(오픈스트리트맵 Nominatim, 누를 때만 검색어를 보냄) ----------
  let addrList = [];
  const searchAddr = async (q) => {
    const box = $("#addr-res");
    box.hidden = false;
    box.innerHTML = `<p class="muted small pad">찾는 중…</p>`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&accept-language=ko&limit=8&q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(res.status);
      addrList = (await res.json()).map((x) => ({ name: x.name || x.display_name.split(",")[0], sub: x.display_name, lon: +x.lon, lat: +x.lat }));
      box.innerHTML = addrList.length ? addrList.map((x, i) => `<button data-i="${i}">${esc(x.name)}<small>${esc(x.sub)}</small></button>`).join("")
        : `<p class="muted small pad">찾지 못했습니다. 시·군 이름을 붙여 다시 찾아 보세요.</p>`;
    } catch (err) {
      console.warn(err);
      box.innerHTML = `<p class="muted small pad">검색 서버에 연결하지 못했습니다.</p>`;
    }
  };

  // ---------- 좌표 글 읽기 — 한 줄에 한 점. 숫자 둘(또는 번호 + 둘), 한 줄에 여러 쌍도 됨. 도·분·초는 십진수로 바꿈 ----------
  const DMS = /(\d+(?:\.\d+)?)\s*[°˚도]\s*(?:(\d+(?:\.\d+)?)\s*['′’분])?\s*(?:(\d+(?:\.\d+)?)\s*(?:["″”초]|''))?\s*([NSEWnsew북남동서])?/g;
  const parseCoordText = (text) => {
    const rows = [];
    text.split(/\r?\n/).forEach((line) => {
      const s = line.replace(DMS, (_, d, m, sec, h) => {
        let v = +d + (+m || 0) / 60 + (+sec || 0) / 3600;
        if (h && /[SWsw남서]/.test(h)) v = -v;
        return ` ${v} `;
      });
      const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length < 2) return;
      if (nums.length % 2) nums.shift();   // 앞의 점 번호
      for (let i = 0; i < nums.length; i += 2) rows.push([nums[i], nums[i + 1]]);
    });
    return rows;
  };
  const shapeOf = (pts, want) => {
    const kind = want !== "auto" ? want : pts.length === 1 ? "point" : pts.length === 2 ? "line" : "polygon";
    if (kind === "point") return pts.map((p) => feat({ type: "Point", coordinates: p }));
    if (kind === "line") return pts.length >= 2 ? [feat({ type: "LineString", coordinates: pts })] : [];
    return pts.length >= 3 ? [feat({ type: "Polygon", coordinates: [[...pts, pts[0]]] })] : [];
  };
  const useCoords = () => {
    const rows = parseCoordText($("#coord").value);
    if (!rows.length) { toast("좌표를 읽지 못했습니다. 한 줄에 ‘위도, 경도’ 또는 ‘X, Y’로 적어 주세요.", 4500); return; }
    const crs = $("#crs").value;
    let pts, used = "";
    if (crs === "4326") {
      pts = rows.map(([a, b]) => (a >= 32 && a <= 40 && b >= 123 && b <= 133 ? [b, a] : b >= 32 && b <= 40 && a >= 123 && a <= 133 ? [a, b] : null));
      if (pts.some((p) => !p)) { toast("한반도 범위의 위도·경도가 아닙니다. TM 좌표라면 좌표계를 바꿔 주세요.", 5000); return; }
    } else {
      const tr = proj4(crsDef(crs), "WGS84");
      const en = rows.map(([a, b]) => tr.forward([a, b]));
      const ne = rows.map(([a, b]) => tr.forward([b, a]));
      const order = $("#order").value;
      let okEn = en.every(inKorea), okNe = ne.every(inKorea);
      if (okEn && okNe) {
        const cEn = en.every(inCore), cNe = ne.every(inCore);
        if (cEn !== cNe) { okEn = cEn; okNe = cNe; }
      }
      if (order === "en" || order === "ne") used = order;
      else if (okEn) { used = "en"; if (okNe) toast("X·Y 순서가 애매해 X=동쪽으로 읽었습니다. 위치가 틀리면 ‘X·Y 바꿔 읽기’를 누르세요.", 6000); }
      else if (okNe) { used = "ne"; toast("X=북쪽(측량 성과표 순서)으로 읽었습니다.", 3500); }
      else used = "en";
      pts = used === "ne" ? ne : en;
    }
    const orderName = { en: "X=동쪽", ne: "X=북쪽" }[used];
    if (setSite(shapeOf(pts, $("#shape").value), `좌표 ${rows.length}개 (${CRS.find((c) => c.id === crs).name}${orderName ? `, ${orderName}` : ""})`) && used) {
      IN.site.swap = used;
      renderSite();
    }
  };

  // ---------- 그리기 ----------
  const D = { mode: null, pts: [] };
  const drawMsg = () => {
    const need = D.mode === "polygon" ? 3 : 2;
    $("#draw-msg").textContent = `${D.mode === "polygon" ? "구역" : "선"} 꼭짓점 ${D.pts.length}개${D.pts.length < need ? ` — ${need}개 이상 찍으세요` : ""}`;
  };
  const redrawTmp = () => {
    IN.drawLayer.clearLayers();
    const ll = D.pts.map(([x, y]) => [y, x]);
    if (ll.length >= 2) L.polyline(ll, { renderer: IN.renderer, interactive: false, color: "#ffd43b", weight: 2.5 }).addTo(IN.drawLayer);
    if (D.mode === "polygon" && ll.length >= 3) L.polyline([ll[ll.length - 1], ll[0]], { renderer: IN.renderer, interactive: false, color: "#ffd43b", weight: 1.5, dashArray: "5 5" }).addTo(IN.drawLayer);
    ll.forEach((p) => L.circleMarker(p, { renderer: IN.renderer, interactive: false, radius: 4, color: "#ffd43b", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(IN.drawLayer));
    drawMsg();
  };
  const startDraw = (mode) => {
    stopDraw();
    D.mode = mode;
    IN.map.doubleClickZoom.disable();
    $("#map").classList.add("drawing");
    $$("[data-draw]").forEach((b) => b.classList.toggle("on", b.dataset.draw === mode));
    $("#draw-bar").hidden = mode === "point";
    if (mode === "point") toast("지도에서 사업지 위치를 누르세요.");
    else drawMsg();
  };
  const stopDraw = () => {
    D.mode = null;
    D.pts = [];
    if (!IN.map) return;
    IN.drawLayer.clearLayers();
    IN.map.doubleClickZoom.enable();
    $("#map").classList.remove("drawing");
    $$("[data-draw]").forEach((b) => b.classList.remove("on"));
    $("#draw-bar").hidden = true;
  };
  const finishDraw = () => {
    const { mode, pts } = D;
    if (mode === "polygon" && pts.length < 3) return toast("구역은 꼭짓점이 3개 이상 있어야 합니다.");
    if (mode === "line" && pts.length < 2) return toast("선은 꼭짓점이 2개 이상 있어야 합니다.");
    stopDraw();
    setSite(shapeOf(pts, mode), mode === "polygon" ? "지도에 그린 구역" : "지도에 그린 선");
  };
  const onMapClick = (e) => {
    if (!D.mode) return;
    const p = [e.latlng.lng, e.latlng.lat];
    if (D.mode === "point") {
      stopDraw();
      setSite([feat({ type: "Point", coordinates: p })], "지도에 찍은 점");
      return;
    }
    const last = D.pts[D.pts.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) return;   // 두 번 누를 때 겹친 점
    D.pts.push(p);
    redrawTmp();
  };

  // ---------- 파일 읽기 ----------
  const ext = (name) => (/\.([^.]+)$/.exec(name.toLowerCase()) || [])[1] || "";
  const stem = (name) => name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const decode = (buf) => {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (_) { return new TextDecoder("euc-kr").decode(buf); }
  };
  const fromGeoJSON = (text) => {
    const j = JSON.parse(text);
    const fs = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : j.type ? [feat(j)] : [];
    const crsName = j.crs && j.crs.properties && j.crs.properties.name;
    const m = crsName && /EPSG:+(\d+)/i.exec(crsName);
    const def = m ? (m[1] === "4326" ? "geo" : crsDef(m[1]) || null) : crsName && /CRS84/i.test(crsName) ? "geo" : null;
    return { features: fs.filter((f) => f && f.geometry), def };
  };
  const fromKml = (text) => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("KML 파일을 읽지 못했습니다.");
    const tag = (el, name) => (el ? Array.from(el.getElementsByTagNameNS("*", name)) : []);
    const cs = (el) => (el ? el.textContent.trim().split(/\s+/).map((t) => t.split(",").map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]]) : []);
    const fs = [];
    tag(doc, "Placemark").forEach((pm) => {
      const props = { name: (tag(pm, "name")[0] || {}).textContent || "" };
      tag(pm, "Point").forEach((g) => { const c = cs(tag(g, "coordinates")[0]); if (c.length) fs.push(feat({ type: "Point", coordinates: c[0] }, props)); });
      tag(pm, "LineString").forEach((g) => fs.push(feat({ type: "LineString", coordinates: cs(tag(g, "coordinates")[0]) }, props)));
      tag(pm, "Polygon").forEach((g) => {
        const outer = cs(tag(tag(g, "outerBoundaryIs")[0], "coordinates")[0]);
        const holes = tag(g, "innerBoundaryIs").map((h) => cs(tag(h, "coordinates")[0]));
        fs.push(feat({ type: "Polygon", coordinates: [outer, ...holes] }, props));
      });
    });
    return { features: fs, def: "geo" };
  };
  // DXF(ASCII) — ENTITIES 구역의 LWPOLYLINE·POLYLINE·LINE을 레이어별로 모음. 닫힌 선은 면으로, 끝이 이어진 선 조각도 이어 붙여 봄
  const fromDxf = (text) => {
    const L2 = text.split(/\r?\n/);
    const layers = new Map();
    const layer = (name) => { if (!layers.has(name)) layers.set(name, { polygons: [], lines: [] }); return layers.get(name); };
    const pieces = new Map();   // 레이어 → 열린 선 조각
    let inEnt = false, ent = null;
    const flush = () => {
      if (!ent) return;
      const pts = ent.pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      const name = ent.layer || "0";
      if ((ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") && pts.length >= 2) {
        const closed = ent.closed || (pts.length >= 4 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]);
        if (closed && pts.length >= 3) layer(name).polygons.push(pts);
        else { if (!pieces.has(name)) pieces.set(name, []); pieces.get(name).push(pts); }
      } else if (ent.type === "LINE" && pts.length === 2) {
        if (!pieces.has(name)) pieces.set(name, []);
        pieces.get(name).push(pts);
      }
      ent = null;
    };
    for (let i = 0; i + 1 < L2.length; i += 2) {
      const code = parseInt(L2[i], 10), v = L2[i + 1].trim();
      if (code === 2 && v === "ENTITIES") { inEnt = true; continue; }
      if (!inEnt) continue;
      if (code === 0) {
        if (v === "ENDSEC") { flush(); break; }
        if (ent && ent.type === "POLYLINE" && v === "VERTEX") { ent.vertex = true; continue; }
        flush();
        ent = { type: v, pts: [], closed: false, layer: "", vertex: false };
        continue;
      }
      if (!ent) continue;
      if (code === 8 && !ent.vertex) ent.layer = v;
      if (ent.type === "LWPOLYLINE") {
        if (code === 10) ent.pts.push([+v, NaN]);
        else if (code === 20 && ent.pts.length) ent.pts[ent.pts.length - 1][1] = +v;
        else if (code === 70) ent.closed = (parseInt(v, 10) & 1) === 1;
      } else if (ent.type === "POLYLINE") {
        if (code === 70 && !ent.vertex) ent.closed = (parseInt(v, 10) & 1) === 1;
        else if (ent.vertex && code === 10) ent.pts.push([+v, NaN]);
        else if (ent.vertex && code === 20 && ent.pts.length) ent.pts[ent.pts.length - 1][1] = +v;
      } else if (ent.type === "LINE") {
        if (code === 10) ent.pts[0] = [+v, NaN];
        else if (code === 20 && ent.pts[0]) ent.pts[0][1] = +v;
        else if (code === 11) ent.pts[1] = [+v, NaN];
        else if (code === 21 && ent.pts[1]) ent.pts[1][1] = +v;
      }
    }
    flush();
    // 열린 조각 잇기(끝점이 거의 같은 조각끼리)
    pieces.forEach((list, name) => {
      const geo = list.every((p) => p.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90));
      const tol = geo ? 1e-8 : 1e-3;
      const near = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
      const left = list.length <= 5000 ? list.map((p) => p.slice()) : [];
      const out = layer(name);
      if (!left.length) list.forEach((p) => out.lines.push(p));
      while (left.length) {
        let cur = left.pop();
        for (let grown = true; grown;) {
          grown = false;
          for (let i = 0; i < left.length; i++) {
            const p = left[i], h = cur[0], t = cur[cur.length - 1];
            if (near(t, p[0])) cur = cur.concat(p.slice(1));
            else if (near(t, p[p.length - 1])) cur = cur.concat(p.slice(0, -1).reverse());
            else if (near(h, p[p.length - 1])) cur = p.slice(0, -1).concat(cur);
            else if (near(h, p[0])) cur = p.slice(1).reverse().concat(cur);
            else continue;
            left.splice(i, 1);
            grown = true;
            break;
          }
        }
        if (cur.length >= 4 && near(cur[0], cur[cur.length - 1])) out.polygons.push(cur);
        else out.lines.push(cur);
      }
    });
    [...layers].forEach(([k, v]) => { if (!v.polygons.length && !v.lines.length) layers.delete(k); });
    if (!layers.size) throw new Error("DXF에서 폴리선·선을 찾지 못했습니다(블록 안 도형은 읽지 않습니다).");
    // 기본 레이어: 이름에 구역·경계·사업 등이 들어간 면 레이어 → 면이 가장 적은 레이어 → 첫 레이어
    const named = [...layers].find(([k, v]) => v.polygons.length && /구역|경계|사업|계획|부지|편입|boundary|site|area/i.test(k));
    const fewest = [...layers].filter(([, v]) => v.polygons.length).sort((a, b) => a[1].polygons.length - b[1].polygons.length)[0];
    const pick = layers.size === 1 ? [...layers.keys()][0] : (named || fewest || [...layers][0])[0];
    return { layers, pick };
  };
  const dxfFeatures = (dxf) => {
    const fs = [];
    dxf.layers.forEach((v, name) => {
      if (dxf.pick !== "*" && dxf.pick !== name) return;
      v.polygons.forEach((p) => fs.push(feat({ type: "Polygon", coordinates: [p] }, { layer: name })));
      v.lines.forEach((l) => fs.push(feat({ type: "LineString", coordinates: l }, { layer: name })));
    });
    return fs;
  };

  const readFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const sources = [];
    let dxf = null;
    const label = files.map((f) => f.name).join(", ");
    try {
      toast("파일을 읽는 중…", 1500);
      // zip(SHP 묶음·KMZ)은 풀어서 같은 목록에 넣음
      const items = [];
      for (const f of files) {
        if (["zip", "kmz"].includes(ext(f.name))) {
          await loadScript(LIB.jszip, "JSZip");
          const z = await JSZip.loadAsync(f);
          for (const e of Object.values(z.files)) {
            if (e.dir || /(^|\/)__MACOSX\//.test(e.name)) continue;
            items.push({ name: e.name, buf: () => e.async("arraybuffer") });
          }
        } else items.push({ name: f.name, buf: () => f.arrayBuffer() });
      }
      const find = (base, x) => items.find((it) => ext(it.name) === x && stem(it.name).toLowerCase() === base.toLowerCase());
      for (const it of items) {
        const x = ext(it.name);
        if (x === "shp") {
          await loadScript(LIB.shp, "shp");
          const prjItem = find(stem(it.name), "prj");
          const prj = prjItem ? decode(await prjItem.buf()) : "";
          const geoms = await shp.parseShp(await it.buf());   // 좌표는 그대로 받고 좌표계는 아래에서 직접 바꿈
          sources.push({ features: geoms.filter(Boolean).map((g) => feat(g)), def: fromPrj(prj) });
        } else if (x === "geojson" || x === "json") sources.push(fromGeoJSON(decode(await it.buf())));
        else if (x === "kml") sources.push(fromKml(decode(await it.buf())));
        else if (x === "dxf") dxf = fromDxf(decode(await it.buf()));
      }
    } catch (err) {
      console.warn(err);
      toast(err.message || "파일을 읽지 못했습니다.", 5000);
      return;
    }
    if (!sources.length && !dxf) { toast("읽을 수 있는 파일이 없습니다. SHP(.shp, 또는 zip)·GeoJSON·KML·DXF를 올려 주세요.", 5000); return; }
    if (!$("#site-name").value.trim()) $("#site-name").value = stem(files[0].name).slice(0, 40);
    buildFromRaw({ sources, dxf, label: `파일: ${label}` });
  };
  const looksProjected = (features) => {
    let p = false;
    features.forEach((f) => f.geometry && eachXY(f.geometry.coordinates, ([x, y]) => { if (Math.abs(x) > 180 || Math.abs(y) > 90) p = true; }));
    return p;
  };
  const reproject = (features, def) => {
    const tr = proj4(def, "WGS84");
    return normalize(features).map((f) => feat({ type: f.geometry.type, coordinates: mapCoords(f.geometry.coordinates, (c) => tr.forward([c[0], c[1]])) }, f.properties));
  };
  // 파일에서 읽은 도형을 경위도로 바꿔 경계로(좌표계 선택을 바꾸면 다시 부름)
  const buildFromRaw = (R = IN.raw) => {
    if (!R) return;
    const all = [];
    const groups = [...R.sources];
    if (R.dxf) groups.push({ features: dxfFeatures(R.dxf), def: null });
    let guessed = false;
    try {
      for (const g of groups) {
        let def = g.def;
        if (!def && looksProjected(g.features)) { def = crsDef($("#file-crs").value); guessed = true; }
        all.push(...(def && def !== "geo" ? reproject(g.features, def) : g.features));
      }
    } catch (err) {
      console.warn(err);
      toast("좌표계를 바꾸지 못했습니다. ‘좌표계 정보가 없으면’에서 맞는 좌표계를 골라 주세요.", 6000);
      return;
    }
    const crsName = CRS.find((c) => c.id === $("#file-crs").value).name;
    setSite(all, guessed ? `${R.label} · ${crsName}로 읽음` : R.label, R);
  };

  // ---------- 화면 연결 ----------
  const init = () => {
    const opts = (list, sel) => list.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    $("#crs").innerHTML = opts(CRS, "4326");
    $("#file-crs").innerHTML = opts(CRS.filter((c) => c.id !== "4326"), "5186");
    $$("#in-tabs button").forEach((b) => b.addEventListener("click", () => {
      $$("#in-tabs button").forEach((x) => x.classList.toggle("on", x === b));
      $$("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.in; });
      if (b.dataset.in !== "draw") stopDraw();
      IN.onTab && IN.onTab(b.dataset.in);
    }));
    const file = $("#file"), drop = $("#drop");
    file.addEventListener("change", () => { readFiles(file.files); file.value = ""; });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => readFiles(e.dataTransfer.files));
    $("#file-crs").addEventListener("change", () => { if (IN.raw) buildFromRaw(); });
    $("#coord-go").addEventListener("click", useCoords);
    $("#addr-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#addr").value.trim(); if (q) searchAddr(q); });
    $("#addr-res").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      const x = addrList[+b.dataset.i];
      IN.onTab && IN.onTab("draw");
      IN.map.setView([x.lat, x.lon], 16);
      $("#addr-res").hidden = true;
    });
    $$("[data-draw]").forEach((b) => b.addEventListener("click", () => { IN.onTab && IN.onTab("draw"); startDraw(b.dataset.draw); }));
    $("#draw-done").addEventListener("click", finishDraw);
    $("#draw-undo").addEventListener("click", () => { D.pts.pop(); redrawTmp(); });
    $("#draw-cancel").addEventListener("click", stopDraw);
    initMap();
  };

  window.Input = { IN, init, setSite, clearSite, stopDraw };
})();
