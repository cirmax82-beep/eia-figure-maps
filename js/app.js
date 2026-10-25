// 화면 — 도면 설정, 미리보기(끌어서 가운데 옮기기·축 화살표 그리기), 이름표 고치기, PNG·PDF·SVG 받기
(() => {
  const { $, $$, esc, fmt, debounce, toast, LIB, loadScript, saveBlob, safeName } = U;
  const { IN } = Input;

  const TITLES = { sat: "위성사진 현황도", eco: "생태축 현황도", nat: "생태·자연도", veg: "한국 식생기후대 분포도", flo: "한국 식물상 지역", lit: "문헌조사 위치도" };
  const newFig = (kind) => ({
    kind, paper: "A4", orient: Carto.NATIONAL.includes(kind) || kind === "lit" ? "port" : "land", scaleMode: "auto", scale: 5000, offset: [0, 0],
    basemap: kind === "nat" ? "vwhite" : kind === "lit" && Carto.hasVworld ? "vbase" : "sat", base: 0, gray: false, baseLabels: false,
    title: TITLES[kind],
    el: { title: true, north: true, scalebar: true, legend: true, source: true, sitelabel: kind === "sat" || kind === "lit", grid: "none" },
    rings: [1, 2],
    eco: { forest: true, water: true, sea: true, tidal: false, rzone: true, szone: true, topo: true, peaks: true, wnames: true, flow: true, streams: true, rings: false, forestName: "산림생태계", waterName: "수생태계" },
    nat: { g1: true, g2: true, sep: true, rings: false, dist1: false },
    natl: { inset: true },
    // 문헌조사 위치도: 9격자(grid), 포털 공간자료(imported), 직접 찍은 문헌(manual), 목록에서 뺀 것·고친 이름·색
    lit: { nat: false, table: true, sheetName: true, grid: null, gridKey: "", imported: null, manual: [], seq: 0, hide: new Set(), text: new Map(), colors: new Map() },
    arrows: [], labelHide: new Set(), labelText: new Map(),
  });
  const S = { cur: "sat", figs: Object.fromEntries(Object.keys(TITLES).map((k) => [k, newFig(k)])), view: "map", last: null, busy: false };
  const fig = () => S.figs[S.cur];
  const site = () => IN.site;
  const resolveScale = (f) => { if (f.scaleMode === "auto") f.scale = Carto.autoScale(f, site()); return f.scale; };

  // ---------- 설정 칸 ↔ 도면 ----------
  const CHECKS = { "o-forest": ["eco", "forest"], "o-water": ["eco", "water"], "o-tidal": ["eco", "tidal"], "o-sea": ["eco", "sea"], "o-rzone": ["eco", "rzone"], "o-szone": ["eco", "szone"], "o-topo": ["eco", "topo"], "o-peaks": ["eco", "peaks"], "o-wnames": ["eco", "wnames"], "o-flow": ["eco", "flow"],
    "o-streams": ["eco", "streams"], "o-eco-rings": ["eco", "rings"], "e-title": ["el", "title"], "e-north": ["el", "north"], "e-scalebar": ["el", "scalebar"],
    "e-legend": ["el", "legend"], "e-source": ["el", "source"], "e-sitelabel": ["el", "sitelabel"],
    "o-gray": ["", "gray"], "o-labels": ["", "baseLabels"],
    "n-g1": ["nat", "g1"], "n-g2": ["nat", "g2"], "n-sep": ["nat", "sep"], "n-rings": ["nat", "rings"], "n-dist1": ["nat", "dist1"], "v-inset": ["natl", "inset"],
    "l-nat": ["lit", "nat"], "l-table": ["lit", "table"], "l-sheet": ["lit", "sheetName"] };
  const scaleOptions = () => {
    const f = fig();
    const auto = site() ? ` (1:${fmt(Carto.autoScale(f, site()))})` : "";
    $("#o-scale").innerHTML = `<option value="auto">자동${auto}</option>` + Carto.scalesFor(f).map((s) => `<option value="${s}">1:${fmt(s)}</option>`).join("");
    $("#o-scale").value = f.scaleMode === "auto" ? "auto" : String(f.scale);
  };
  const syncControls = () => {
    const f = fig();
    $("#o-paper").value = f.paper;
    $("#o-orient").value = f.orient;
    // 바탕지도 목록: 브이월드 바탕은 인증키가 있어야 고를 수 있음
    $("#o-basemap").innerHTML = Object.entries(Carto.BASES).map(([k, b]) => `<option value="${k}" ${b.key && !Carto.hasVworld ? "disabled" : ""}>${b.name}${b.key && !Carto.hasVworld ? " (인증키 필요)" : ""}</option>`).join("");
    $("#o-basemap").value = f.basemap;
    $("#o-base").value = String(f.base);
    $("#o-labels").disabled = !Carto.hasVworld;
    $("#o-title").value = f.title;
    $("#o-rings").value = f.rings.join(", ");
    $("#o-forest-name").value = f.eco.forestName;
    $("#o-water-name").value = f.eco.waterName;
    Object.entries(CHECKS).forEach(([id, [g, k]]) => { $(`#${id}`).checked = !!(g ? f[g][k] : f[k]); });
    $("#e-grid").value = f.el.grid;
    scaleOptions();
    $$("[data-figpane]").forEach((p) => { p.hidden = !p.dataset.figpane.split(" ").includes(f.kind); });
    $$("#fig-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.fig === S.cur));
    renderArrowList();
    syncMapBase();
  };
  // 경계 지도 바탕도 고른 도면의 바탕·흑백·지명 겹치기를 따름
  const syncMapBase = () => {
    const f = fig();
    if (!IN.setBase) return;
    IN.setBase(f.basemap);
    IN.setLabels(f.baseLabels);
    IN.setGray(f.gray);
  };
  const parseRings = (s) => [...new Set((s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => x > 0 && x <= 20))].sort((a, b) => a - b).slice(0, 5);
  const readControls = () => {
    const f = fig();
    f.paper = $("#o-paper").value;
    f.orient = $("#o-orient").value;
    f.base = parseFloat($("#o-base").value);
    f.basemap = $("#o-basemap").value;
    f.title = $("#o-title").value.trim();
    f.rings = parseRings($("#o-rings").value);
    f.eco.forestName = $("#o-forest-name").value.trim() || "산림생태계";
    f.eco.waterName = $("#o-water-name").value.trim() || "수생태계";
    Object.entries(CHECKS).forEach(([id, [g, k]]) => { if (g) f[g][k] = $(`#${id}`).checked; else f[k] = $(`#${id}`).checked; });
    f.el.grid = $("#e-grid").value;
    const sv = $("#o-scale").value;
    if (sv === "auto") f.scaleMode = "auto"; else { f.scaleMode = "fixed"; f.scale = +sv; }
  };

  // ---------- 보기 바꾸기 ----------
  const setView = (v) => {
    S.view = v;
    $$("#view-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $("#map").hidden = v !== "map";
    $("#preview").hidden = v !== "preview";
    if (v === "map") setTimeout(() => IN.map.invalidateSize(), 0);
    else { stopArrow(); renderPreview(); }
  };
  const status = (t) => { $("#status").textContent = t || ""; };

  // ---------- 미리보기 ----------
  let gen = 0;
  const renderPreview = async () => {
    if (S.view !== "preview") return;
    const cv = $("#pv");
    if (!site()) {
      cv.width = cv.height = 1;
      $("#paper").classList.add("empty");
      status("먼저 사업지구 경계를 넣으세요.");
      return;
    }
    $("#paper").classList.remove("empty");
    const f = fig();
    f.siteText = siteText();
    f.ecoKey = ecoKey();
    if (f.kind === "lit") await prepLit(f);
    resolveScale(f);
    scaleOptions();
    const Lo = Carto.layout(f);
    const box = $("#preview");
    // 좁은 화면(위아래로 쌓을 때)은 폭에만 맞춤
    const narrow = window.innerWidth <= 860;
    const availW = Math.max(200, box.clientWidth - (narrow ? 24 : 32)), availH = narrow ? availW * 2 : Math.max(200, box.clientHeight - 64);
    const sc = Math.min(availW / Lo.W, availH / Lo.H);
    const cssW = Math.floor(Lo.W * sc), cssH = Math.floor(Lo.H * sc);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const k = (cssW * dpr) / Lo.W;
    const my = ++gen;
    if (!S.last) { $("#paper").style.width = `${cssW}px`; $("#paper").style.height = `${cssH}px`; }
    const off = document.createElement("canvas");
    off.width = Math.round(Lo.W * k);
    off.height = Math.round(Lo.H * k);
    status("도면을 그리는 중…");
    try {
      const out = await Carto.render(new Carto.CanvasPen(off.getContext("2d"), k), f, site(), k, {
        alive: () => my === gen,
        onTiles: (p) => { if (my === gen) status(`위성영상 받는 중 ${Math.round(p * 100)}%`); },
        osmWait: 2500,
        onLate: (ok) => { if (my !== gen) return; if (ok) renderPreview(); else status("늦게 오던 자료(이름·하천 또는 원본 경계)를 받지 못해 지금 그림대로 둡니다."); },
      });
      if (!out || my !== gen) return;
      const paper = $("#paper");
      paper.style.width = `${cssW}px`;
      paper.style.height = `${cssH}px`;
      cv.width = off.width;
      cv.height = off.height;
      cv.style.transform = "";
      cv.getContext("2d").drawImage(off, 0, 0);
      const over = $("#pv-over");
      over.width = off.width;
      over.height = off.height;
      S.last = { view: out.view, layout: Lo, cssW, cssH, k, fig: f };
      drawArrowTemp();
      renderLabelList(out.labels);
      // 1등급 이격거리 결과(생태·자연도, 켰을 때)
      const dt = $("#n-dist-text"), d = out.dist1;
      dt.hidden = !(f.kind === "nat" && f.nat.dist1);
      dt.textContent = !d ? "" : d.inside ? "사업지구가 1등급 권역과 겹칩니다." : d.none ? "도면에 보이는 범위 안에 1등급 권역이 없습니다." : `1등급 권역까지 ${d.m < 1 ? `${Math.round(d.m * 100)} cm` : `${fmt(Math.round(d.m))} m`}(도면에 보이는 범위 안, ${d.api ? "최신 DB·API" : "정기고시 원본 경계"})`;
      status(out.warn.length ? out.warn.join(" ") : `축척 1:${fmt(f.scale)} · ${f.paper} ${f.orient === "port" ? "세로" : "가로"}`);
    } catch (err) {
      console.error(err);
      if (my === gen) status(err.message || "도면을 그리지 못했습니다.");
    }
  };
  const rerender = debounce(renderPreview, 250);

  // 미리보기 화면 좌표 → 용지 mm
  const toPage = (e) => {
    const r = $("#paper").getBoundingClientRect();
    const Lo = S.last.layout;
    return [((e.clientX - r.left) / r.width) * Lo.W, ((e.clientY - r.top) / r.height) * Lo.H];
  };

  // 마우스 휠로 축척 한 단계씩 확대·축소. 커서 아래 지점이 제자리에 있게 가운데를 옮기고, 그리는 동안은 그림을 늘려 보여 줌
  const initWheel = () => {
    const over = $("#pv-over"), cv = $("#pv");
    let zoom = 1;
    const draw = debounce(() => { zoom = 1; renderPreview(); }, 280);
    over.addEventListener("wheel", (e) => {
      if (!S.last || A.mode) return;
      e.preventDefault();
      const f = fig(), list = Carto.scalesFor(f), cur = f.scale;
      let i = list.findIndex((v) => v >= cur);
      if (i < 0) i = list.length - 1;
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.deltaY > 0 ? 1 : -1)))];
      if (next === cur) return;
      const { view, layout: Lo } = S.last;
      const [px, py] = toPage(e);
      const F = Lo.frame, dx = px - (F.x + F.w / 2), dy = py - (F.y + F.h / 2);
      const k = 1 / 1000 / Math.cos((view.lat0 * Math.PI) / 180), dm = (cur - next) * k;   // 용지 1 mm의 메르카토르 m 차이
      f.offset = [f.offset[0] + dx * dm, f.offset[1] - dy * dm];
      f.scaleMode = "fixed";
      f.scale = next;
      zoom *= cur / next;
      const r = $("#paper").getBoundingClientRect();
      cv.style.transformOrigin = `${e.clientX - r.left}px ${e.clientY - r.top}px`;
      cv.style.transform = `scale(${zoom})`;
      status(`축척 1:${fmt(next)}`);
      draw();
    }, { passive: false });
  };

  // 끌어서 가운데 옮기기
  const initPan = () => {
    const cv = $("#pv-over");
    let drag = null;
    cv.addEventListener("pointerdown", (e) => {
      if (!S.last || A.mode) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      $("#pv").style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) { $("#pv").style.transform = ""; return; }
      const { view, layout: Lo, cssW } = S.last;
      const mmPerPx = Lo.W / cssW;
      const f = fig();
      f.offset = [f.offset[0] - (e.clientX - d.x) * mmPerPx * view.m, f.offset[1] + (e.clientY - d.y) * mmPerPx * view.m];
      renderPreview();
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    $("#recenter").addEventListener("click", () => { fig().offset = [0, 0]; renderPreview(); });
  };

  // ---------- 축 화살표 그리기(문헌조사 위치도의 지점·선·구역 찍기도 같이 씀: 모드 lit-point·lit-line·lit-area) ----------
  const A = { mode: null, pts: [] };
  const isLit = (m) => !!m && m.startsWith("lit-");
  const LIT_NAME = { "lit-point": "지점", "lit-line": "선", "lit-area": "구역" };
  const arrowName = (k) => LIT_NAME[k] || (k === "forest" ? "산림축" : "수계축");
  const needPts = (m) => (m === "lit-point" ? 1 : m === "lit-area" ? 3 : 2);
  const startArrow = (kind) => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    if (S.view !== "preview") setView("preview");
    A.mode = kind;
    A.pts = [];
    $("#pv-over").classList.add("drawing");
    $("#arrow-bar").hidden = false;
    $$("[data-arrow]").forEach((b) => b.classList.toggle("on", b.dataset.arrow === kind));
    $$("[data-lit]").forEach((b) => b.classList.toggle("on", b.dataset.lit === kind));
    arrowMsg();
    drawArrowTemp();
  };
  const stopArrow = () => {
    A.mode = null;
    A.pts = [];
    $("#pv-over").classList.remove("drawing");
    $("#arrow-bar").hidden = true;
    $$("[data-arrow], [data-lit]").forEach((b) => b.classList.remove("on"));
    drawArrowTemp();
  };
  const arrowMsg = () => {
    const n = needPts(A.mode);
    $("#arrow-msg").textContent = A.mode === "lit-point" ? "문헌 지점을 도면 위에서 누르세요"
      : `${arrowName(A.mode)} 점 ${A.pts.length}개${A.pts.length < n ? ` — ${n}개 이상 찍으세요${isLit(A.mode) ? "" : "(마지막 점이 화살 머리)"}` : ""}`;
  };
  const finishArrow = () => {
    const n = needPts(A.mode);
    if (A.pts.length < n) { toast(`점을 ${n}개 이상 찍으세요.`); return; }
    if (isLit(A.mode)) {
      const L = S.figs.lit.lit, k = ++L.seq, id = `man:${k}`;
      L.manual.push({ id, src: "man", cat: "기타", text: "기타 평가서(문헌 이름을 고치세요)", geo: { kind: A.mode.slice(4), parts: [A.pts.slice()] }, geoKey: id, color: MAN_COLORS[(k - 1) % MAN_COLORS.length] });
      stopArrow();
      renderPreview();
      return;
    }
    fig().arrows.push({ kind: A.mode, pts: A.pts.slice() });
    stopArrow();
    renderArrowList();
    renderPreview();
  };
  const drawArrowTemp = () => {
    const over = $("#pv-over");
    const c = over.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, over.width, over.height);
    if (!A.mode || !S.last || !A.pts.length) return;
    const { view, k } = S.last;
    const pp = A.pts.map(([lon, lat]) => view.fromLL(lon, lat));
    c.setTransform(k, 0, 0, k, 0, 0);
    if (isLit(A.mode)) {
      const col = MAN_COLORS[S.figs.lit.lit.seq % MAN_COLORS.length];
      c.beginPath();
      pp.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (A.mode === "lit-area") { c.closePath(); c.globalAlpha = 0.3; c.fillStyle = col; c.fill(); c.globalAlpha = 1; }
      c.lineWidth = 0.8;
      c.strokeStyle = col;
      c.stroke();
      pp.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.1, 0, 2 * Math.PI); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 0.5; c.strokeStyle = col; c.stroke(); });
      return;
    }
    const col = A.mode === "forest" ? Carto.COLOR.arrowForest : Carto.COLOR.arrowWater;
    const shape = pp.length >= 2 ? Carto.arrowShape(pp, A.mode === "forest" ? 6.5 : 5) : null;
    if (shape) {
      c.beginPath();
      shape.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.globalAlpha = 0.6;
      c.fillStyle = col;
      c.fill();
      c.globalAlpha = 1;
    }
    pp.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.1, 0, 2 * Math.PI); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 0.5; c.strokeStyle = col; c.stroke(); });
  };
  const initArrow = () => {
    const over = $("#pv-over");
    over.addEventListener("click", (e) => {
      if (!A.mode || !S.last) return;
      const [px, py] = toPage(e);
      const ll = S.last.view.toLL(px, py);
      const last = A.pts[A.pts.length - 1];
      if (last) {
        const q = S.last.view.fromLL(last[0], last[1]);
        if (Math.hypot(q[0] - px, q[1] - py) < 0.8) return;   // 두 번 누를 때 겹친 점
      }
      A.pts.push(ll);
      if (A.mode === "lit-point") { finishArrow(); return; }
      arrowMsg();
      drawArrowTemp();
    });
    over.addEventListener("dblclick", (e) => { if (A.mode && A.mode !== "lit-point") { e.preventDefault(); finishArrow(); } });
    $$("[data-arrow]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.arrow ? stopArrow() : startArrow(b.dataset.arrow))));
    $$("[data-lit]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.lit ? stopArrow() : startArrow(b.dataset.lit))));
    $("#arrow-done").addEventListener("click", finishArrow);
    $("#arrow-undo").addEventListener("click", () => { A.pts.pop(); arrowMsg(); drawArrowTemp(); });
    $("#arrow-cancel").addEventListener("click", stopArrow);
    $("#arrow-list").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-del]");
      if (!b) return;
      fig().arrows.splice(+b.dataset.del, 1);
      renderArrowList();
      renderPreview();
    });
  };
  const renderArrowList = () => {
    const list = fig().arrows;
    const n = { forest: 0, water: 0 };
    $("#arrow-list").innerHTML = list.map((a, i) => `<div class="arrow-row"><i class="sw sw-${a.kind}"></i>${arrowName(a.kind)} ${++n[a.kind]} <span class="muted small">점 ${a.pts.length}개</span><button class="link" data-del="${i}">지우기</button></div>`).join("");
  };

  // ---------- 문헌조사 위치도 ----------
  // 문헌 위치 색: 포털 자료는 구분별, 직접 찍은 것은 돌아가며
  const LIT_COLORS = { "겨울철 조류 동시 센서스": "#7b2cbf", "습지생물상조사": "#2b8a3e", "생물측정망": "#1c7ed6" };
  const MAN_COLORS = ["#e8590c", "#d6336c", "#0c8599", "#5f3dc4", "#c92a2a", "#5c940d", "#1864ab", "#862e9c"];
  // 포털 문헌 표기에 붙은 「7. 」 같은 번호는 떼고 도면에서 다시 매김
  const stripNo = (t) => String(t || "").replace(/^\s*\d+\.\s*/, "").trim();
  // 문헌 목록: 포털 공간자료의 문헌 목록이 있으면 그것(포털과 같은 번호 순서), 없으면 9격자 도엽의 전국자연환경조사(최근 차수 먼저, 도엽은 왼쪽 위부터)
  // + 포털 자료에서 문헌 목록에 없던 위치 + 직접 찍은 것
  const litItems = (L) => {
    const items = [];
    const imp = L.imported;
    if (imp && imp.items.length) items.push(...imp.items);
    else if (L.grid && S.lit) {
      const codes = [...new Set([...L.grid.cells].sort((a, b) => a.r - b.r || a.c - b.c).map((c) => c.code))];
      const all = codes.flatMap((code) => (S.lit.nes[code] || []).map((t) => ({ t, round: +((t.match(/제(\d+)차/) || [])[1] || 0) })));
      all.sort((a, b) => b.round - a.round).forEach(({ t }) => items.push({ id: `nes:${t}`, src: "nes", cat: "전국자연환경조사", text: t }));
    }
    if (imp) items.push(...imp.extra);
    items.push(...L.manual);
    return items;
  };
  // 사업지구 가운데가 든 칸으로 9격자를 잡고(경계가 바뀌면 다시), 도면에 넣을 문헌(번호 매김)을 f.litRows로
  const prepLit = async (f) => {
    const L = f.lit;
    try {
      S.lit = S.lit || await Carto.litData();
      const b = U.bboxOf(site().features), lon = (b[0] + b[2]) / 2, lat = (b[1] + b[3]) / 2, key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
      if (L.gridKey !== key) { L.grid = Carto.nineGrid(S.lit.sheets, lon, lat); L.gridKey = key; }
    } catch (err) {
      console.warn(err);
      toast("1:25,000 도엽 자료를 받지 못했습니다.");
    }
    f.litRows = litItems(L).filter((it) => !L.hide.has(it.id))
      .map((it, i) => ({ ...it, n: i + 1, text: L.text.has(it.id) ? L.text.get(it.id) : it.text, color: L.colors.get(it.id) || it.color }));
    renderLitList();
  };
  const renderLitList = () => {
    const L = S.figs.lit.lit, g = L.grid;
    $("#l-grid-text").textContent = !site() ? "사업지구를 넣으면 9격자(1:25,000 도엽을 3×3으로 나눈 E1~E9 칸)를 잡습니다."
      : !g ? "사업지구 가운데가 1:25,000 도엽 밖(바다 등)이라 9격자를 잡지 못했습니다."
      : `가운데 칸: ${g.center.name && g.center.name !== g.center.code ? `${g.center.name}(${g.center.code})` : g.center.code} ${g.center.id} · 도엽 ${new Set(g.cells.map((c) => c.code)).size}장${L.imported ? ` · 포털 자료 넣음(${L.imported.summary})` : ""}`;
    $("#l-clear").hidden = !L.imported;
    let n = 0;
    $("#lit-list").innerHTML = litItems(L).map((it) => {
      const on = !L.hide.has(it.id), col = L.colors.get(it.id) || it.color || "#7b2cbf";
      return `<div class="lit-row ${on ? "" : "off"}">
        <input type="checkbox" data-lshow="${esc(it.id)}" ${on ? "checked" : ""} title="도면에 넣기">
        <span class="tag">${on ? `문헌${++n}` : "뺌"}</span>
        <input class="input" data-ltext="${esc(it.id)}" value="${esc(L.text.has(it.id) ? L.text.get(it.id) : it.text)}" title="${esc(it.cat)}">
        ${it.geo ? `<input type="color" data-lcolor="${esc(it.id)}" value="${col}" title="기호 색">` : `<span class="muted small" title="도엽 단위 문헌(위치 기호 없음)">도엽</span>`}
        ${it.src === "man" ? `<button class="link" data-ldel="${esc(it.id)}">지우기</button>` : "<span></span>"}
      </div>`;
    }).join("") || `<p class="hint">${site() ? "9격자 안에 넣을 문헌이 없습니다. 위치를 직접 찍어 넣으세요." : ""}</p>`;
  };
  // GeoJSON 도형 → { kind: area·line·point, parts: [[[경도, 위도], …], …] } (면은 모든 고리를 짝홀 규칙으로 칠함)
  const toGeo = (g) => {
    if (!g || !g.coordinates) return null;
    const C = g.coordinates, xy = (p) => [p[0], p[1]];
    if (g.type === "Polygon") return { kind: "area", parts: C.map((r) => r.map(xy)) };
    if (g.type === "MultiPolygon") return { kind: "area", parts: C.flat(1).map((r) => r.map(xy)) };
    if (g.type === "LineString") return { kind: "line", parts: [C.map(xy)] };
    if (g.type === "MultiLineString") return { kind: "line", parts: C.map((l) => l.map(xy)) };
    if (g.type === "Point") return { kind: "point", parts: [[xy(C)]] };
    if (g.type === "MultiPoint") return { kind: "point", parts: [C.map(xy)] };
    return null;
  };
  // BioGrid EIA 포털의 spatial_layers.zip: 01 격자, 02 조류센서스 조사지역, 04 습지, 05 생물측정망, 06 보호종(문헌 목록이 들어 있음)
  const importLit = async (file) => {
    await loadScript(LIB.jszip, "JSZip");
    const z = await JSZip.loadAsync(file);
    const read = async (re) => {
      const ent = Object.values(z.files).find((x) => !x.dir && re.test(x.name));
      return ent ? JSON.parse(await ent.async("string")) : null;
    };
    const [grid, census, wet, bio, prot] = await Promise.all([/01_grid\.geojson$/i, /bird_census_area\.geojson$/i, /wetlands\.geojson$/i, /biomonitoring\.geojson$/i, /protected_species\.geojson$/i].map(read));
    if (!grid && !census && !wet && !bio && !prot) throw new Error("BioGrid EIA 공간자료(spatial_layers.zip)가 아닙니다.");
    // 같은 이름의 위치는 도형을 합침
    const layers = [["겨울철 조류 동시 센서스", census], ["습지생물상조사", wet], ["생물측정망", bio]].map(([cat, fc]) => {
      const byName = new Map();
      ((fc && fc.features) || []).forEach((ft) => {
        const p = ft.properties || {}, name = String(p.name || p.site_name || p["조사지역명"] || p["습지명"] || p["지점명"] || p.station_name || "").trim(), geo = toGeo(ft.geometry);
        if (!name || !geo || Math.abs(geo.parts[0][0][0]) > 180) return;
        const had = byName.get(name);
        if (had && had.kind === geo.kind) had.parts.push(...geo.parts); else if (!had) byName.set(name, geo);
      });
      return { cat, byName };
    });
    const lit = ((prot && prot.literature) || []).filter((r) => r && r["문헌"]);
    const used = new Set();
    const items = lit.map((r, i) => {
      const cat = String(r["구분"] || "").trim(), text = stripNo(r["문헌"]);
      const it = { id: `imp:${i}:${text}`, src: "imp", cat, text };
      const lay = layers.find((l) => l.cat === cat);
      if (lay) lay.byName.forEach((geo, name) => { if (!it.geo && text.includes(`(${name})`)) { it.geo = geo; it.geoKey = `${cat}|${name}`; it.color = LIT_COLORS[cat]; used.add(it.geoKey); } });
      return it;
    });
    // 문헌 목록에 없던 위치(보호종을 빼고 받은 경우 등)는 구분(이름)으로 넣음
    const extra = [];
    layers.forEach(({ cat, byName }) => byName.forEach((geo, name) => {
      const geoKey = `${cat}|${name}`;
      if (!used.has(geoKey)) extra.push({ id: `imp:x:${geoKey}`, src: "imp", cat, text: `${cat}(${name})`, geo, geoKey, color: LIT_COLORS[cat] });
    }));
    const cnt = layers.map(({ cat, byName }) => `${cat.replace("겨울철 조류 동시 센서스", "조류센서스").replace("습지생물상조사", "습지").replace("생물측정망", "측정망")} ${byName.size}곳`).join("·");
    // 포털에서 고른 9격자가 이 사업지구의 9격자와 같은지(다른 사업 자료를 넣는 실수 막기)
    const L = S.figs.lit.lit;
    const ids = (cells) => cells.map((c) => `${c.code}_${c.id}`).sort().join(",");
    const impCells = ((grid && grid.features) || []).map((ft) => ({ code: String((ft.properties || {}).sheet_number || ""), id: String((ft.properties || {}).grid_id || (ft.properties || {}).cell_id || "") }));
    const mismatch = impCells.length && L.grid && ids(impCells) !== ids(L.grid.cells);
    L.imported = { items, extra, summary: `${cnt}, 문헌 ${items.length}건` };
    L.hide.clear();
    return { cnt, n: items.length, mismatch };
  };
  const initLit = () => {
    $("#l-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
      try {
        if (!S.figs.lit.lit.grid) await prepLit(S.figs.lit);
        const r = await importLit(file);
        toast(`${r.cnt} 위치와 문헌 ${r.n}건을 넣었습니다.${r.mismatch ? " 넣은 자료의 9격자가 이 사업지구의 9격자와 다릅니다 — 포털에서 다른 위치로 받은 자료인지 확인하세요." : ""}`, r.mismatch ? 8000 : 4000);
        if (S.cur !== "lit") { S.cur = "lit"; syncControls(); }
        setView("preview");
      } catch (err) {
        console.error(err);
        toast(err.message || "공간자료를 읽지 못했습니다.");
      }
    });
    $("#l-clear").addEventListener("click", () => { const L = S.figs.lit.lit; L.imported = null; L.hide.clear(); renderPreview(); renderLitList(); });
    const box = $("#lit-list"), L = () => S.figs.lit.lit;
    box.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.lshow) { if (t.checked) L().hide.delete(t.dataset.lshow); else L().hide.add(t.dataset.lshow); renderPreview(); renderLitList(); }
      if (t.dataset.lcolor) { L().colors.set(t.dataset.lcolor, t.value); renderPreview(); }
    });
    box.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.ltext) { L().text.set(t.dataset.ltext, t.value); rerender(); }
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-ldel]");
      if (!b) return;
      const id = b.dataset.ldel;
      L().manual = L().manual.filter((m) => m.id !== id);
      renderPreview();
      renderLitList();
    });
  };

  // ---------- 이름표 고치기 ----------
  const renderLabelList = (labels) => {
    const box = $("#label-box");
    const f = fig();
    if (f.kind !== "eco" || !labels || !labels.length) { box.hidden = true; return; }
    box.hidden = false;
    const seen = new Set();
    const list = labels.filter((l) => !seen.has(l.id) && seen.add(l.id));
    $("#label-count").textContent = `(${list.filter((l) => l.shown).length}/${list.length})`;
    $("#label-list").innerHTML = list.map((l) => `
      <div class="label-row ${l.shown ? "" : "off"}">
        <input type="checkbox" data-lid="${esc(l.id)}" ${f.labelHide.has(l.id) ? "" : "checked"} title="보이기">
        <span class="tag">${esc(l.kind)}</span>
        <input class="input" data-lt="${esc(l.id)}" value="${esc(f.labelText.get(l.id) || l.text)}">
        ${!l.shown && !f.labelHide.has(l.id) ? `<span class="muted small" title="다른 글자·도면 요소와 겹쳐 빠졌습니다">겹침</span>` : ""}
      </div>`).join("");
    S.labelOrig = new Map(list.map((l) => [l.id, l.text]));
  };
  const initLabels = () => {
    $("#label-list").addEventListener("change", (e) => {
      const f = fig();
      const id = e.target.dataset.lid || e.target.dataset.lt;
      if (!id) return;
      if (e.target.dataset.lid) { if (e.target.checked) f.labelHide.delete(id); else f.labelHide.add(id); }
      else {
        const v = e.target.value.trim();
        if (!v || v === S.labelOrig.get(id)) f.labelText.delete(id); else f.labelText.set(id, v);
      }
      renderPreview();
    });
  };

  // ---------- 공공데이터포털 인증키(생태자연도 API) — 이 브라우저(localStorage)에만 둠 ----------
  const KEY_NAME = "figmaps.ecoApiKey";
  const ecoKey = () => { try { return localStorage.getItem(KEY_NAME) || ""; } catch (_) { return ""; } };
  const showKeyState = () => {
    const k = ecoKey();
    $("#n-key-state").textContent = k ? `저장된 키로 면적표·1등급 이격거리를 국립생태원 최신 DB(API)로 계산합니다(${k.length}자, 이 브라우저에만 저장). API가 안 되면 정기고시 원본으로 계산합니다.`
      : "키 없이도 2026년 정기고시 원본 경계로 계산합니다. 키를 저장하면 국립생태원 최신 DB(API)로 계산합니다(키는 이 브라우저에만 저장).";
  };
  const initEcoKey = () => {
    $("#n-key-save").addEventListener("click", () => {
      const v = $("#n-key").value.trim();
      if (!v) { toast("인증키를 붙여 넣으세요."); return; }
      try { localStorage.setItem(KEY_NAME, v); } catch (_) { toast("이 브라우저에 저장할 수 없습니다(사생활 보호 모드 등)."); return; }
      $("#n-key").value = "";
      showKeyState();
      toast("인증키를 이 브라우저에 저장했습니다.");
      renderPreview();
    });
    $("#n-key-clear").addEventListener("click", () => { try { localStorage.removeItem(KEY_NAME); } catch (_) { /* 없음 */ } showKeyState(); renderPreview(); });
    showKeyState();
  };

  // ---------- 생태·자연도 등급별 면적표(엑셀) ----------
  const natAreaExcel = async () => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    const btn = $("#n-area"), box = $("#n-area-text");
    btn.disabled = true;
    box.hidden = false;
    box.textContent = "면적을 계산하는 중…";
    try {
      let a, note = "";
      const key = ecoKey();
      if (key) {
        box.textContent = "국립생태원 API(최신 DB)에서 경계를 받는 중…(1~2분 걸릴 수 있음)";
        try { a = await Carto.natAreasApi(site(), key); } catch (err) { console.warn(err); note = `${err.message} 정기고시 원본 경계로 계산했습니다.`; }
      }
      if (!a) a = await Carto.natAreas(site());
      await loadScript(LIB.xlsx, "XLSX");
      const name = $("#site-name").value.trim(), label = siteText();
      const pct = (v) => (a.total ? Math.round((v / a.total) * 10000) / 100 : 0);
      const r1 = (v) => Math.round(v * 10) / 10;
      const rows = [
        ["생태·자연도 등급별 면적표"], [],
        ["사업명", name || "-"], ["경계", label], ["자료", a.source || "생태·자연도 정기고시"],
        ["계산", a.api ? "사업지구 경계와 국립생태원 최신 DB 등급 경계(API)를 겹쳐 EPSG:5186 평면 넓이로 계산" : "사업지구 경계와 2026년 정기고시 원본 등급 경계(1 cm 안에서 같음)를 겹쳐 EPSG:5186 평면 넓이로 계산"], [],
        ["구분", "면적(㎡)", "비율(%)"],
        ["1등급", r1(a.g1), pct(a.g1)], ["2등급", r1(a.g2), pct(a.g2)], ["3등급", r1(a.g3), pct(a.g3)], ["별도관리지역", r1(a.sep), pct(a.sep)],
        ["계", r1(a.total), a.total ? 100 : 0], [],
        ["주) 3등급은 ‘1·2등급과 별도관리지역 외의 지역’으로 보아 사업지구에서 1·2등급과 별도관리지역을 뺀 나머지 면적입니다."],
        ...(a.overlap >= 1 ? [[`주) 등급 면과 겹치는 별도관리지역 ${fmt(r1(a.overlap), 1)} ㎡는 별도관리지역으로 셈했습니다.`]] : []),
        ...(a.api ? [["주) 별도관리지역은 API에 없어 2026년 정기고시 원본 경계로 계산했습니다."]] : []),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      for (let r = 9; r <= 13; r++) {
        if (ws[`B${r}`] && typeof ws[`B${r}`].v === "number") ws[`B${r}`].z = "#,##0.0";
        if (ws[`C${r}`] && typeof ws[`C${r}`].v === "number") ws[`C${r}`].z = "0.00";
      }
      ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "생태자연도 면적");
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      saveBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName([name, label, "생태자연도_등급별면적"].filter(Boolean).join("_"))}.xlsx`);
      const f = (v) => fmt(r1(v), 1);
      box.innerHTML = `1등급 ${f(a.g1)} ㎡(${pct(a.g1)}%) · 2등급 ${f(a.g2)} ㎡(${pct(a.g2)}%) · 3등급 ${f(a.g3)} ㎡(${pct(a.g3)}%) · 별도관리지역 ${f(a.sep)} ㎡(${pct(a.sep)}%)<br>계 ${f(a.total)} ㎡<br>${a.api ? "최신 DB(API)로 계산" : "2026년 정기고시 원본 경계로 계산"}${note ? ` — ${esc(note)}` : ""}`;
    } catch (err) {
      console.error(err);
      box.textContent = err.message || "면적을 계산하지 못했습니다.";
    } finally {
      btn.disabled = false;
    }
  };

  // ---------- 받기 ----------
  // PNG에 해상도(pHYs) 정보를 넣어 문서에 넣을 때 실제 용지 크기로 들어가게 함
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const withDpi = async (blob, dpi) => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (new TextDecoder("latin1").decode(buf.subarray(0, 200)).includes("pHYs")) return blob;
    const ppm = Math.round(dpi / 0.0254);
    const ch = new Uint8Array(21), dv = new DataView(ch.buffer);
    dv.setUint32(0, 9);
    ch.set([0x70, 0x48, 0x59, 0x73], 4);
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    ch[16] = 1;
    dv.setUint32(17, crc32(ch.subarray(4, 17)));
    const out = new Uint8Array(buf.length + 21);
    out.set(buf.subarray(0, 33));   // 서명 8 + IHDR 25
    out.set(ch, 33);
    out.set(buf.subarray(33), 54);
    return new Blob([out], { type: "image/png" });
  };
  const progress = (p, msg) => {
    const el = $("#progress");
    if (p === null) { el.hidden = true; return; }
    el.hidden = false;
    $("i", el).style.width = `${Math.round(p * 100)}%`;
    $("span", el).textContent = msg;
  };
  const fileName = (f, ext) => {
    const name = $("#site-name").value.trim();
    return `${safeName([name, f.title || (f.kind === "sat" ? "위성사진현황도" : "생태축현황도")].filter(Boolean).join("_"))}_${f.paper}${f.orient === "port" ? "세로" : "가로"}_1-${f.scale}.${ext}`;
  };
  const exportFig = async (type) => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    if (S.busy) return;
    S.busy = true;
    $$("[data-dl]").forEach((b) => { b.disabled = true; });
    const f = fig();
    f.siteText = siteText();
    f.ecoKey = ecoKey();
    if (f.kind === "lit") await prepLit(f);
    resolveScale(f);
    const dpi = +$("#o-dpi").value;
    const k = dpi / 25.4;
    const Lo = Carto.layout(f);
    const ctl = { onTiles: (p) => progress(0.05 + p * 0.75, `위성영상 받는 중 ${Math.round(p * 100)}%`), osmWait: 60000 };
    try {
      progress(0.03, "자료 받는 중…");
      let blob, out;
      if (type === "svg") {
        const pen = new Carto.SvgPen(Lo.W, Lo.H);
        out = await Carto.render(pen, f, site(), Math.min(k, 300 / 25.4), ctl);
        progress(0.9, "파일 만드는 중…");
        blob = new Blob([pen.toString()], { type: "image/svg+xml" });
      } else {
        const cv = document.createElement("canvas");
        cv.width = Math.round(Lo.W * k);
        cv.height = Math.round(Lo.H * k);
        out = await Carto.render(new Carto.CanvasPen(cv.getContext("2d"), k), f, site(), k, ctl);
        progress(0.9, "파일 만드는 중…");
        if (type === "png") {
          blob = await withDpi(await new Promise((r) => cv.toBlob(r, "image/png")), dpi);
        } else {
          await loadScript(LIB.jspdf, "jspdf");
          const doc = new jspdf.jsPDF({ orientation: Lo.W > Lo.H ? "landscape" : "portrait", unit: "mm", format: f.paper.toLowerCase(), compress: true });
          doc.setProperties({ title: f.title || "도면", creator: "사업지 도면 만들기" });
          doc.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, Lo.W, Lo.H, undefined, "FAST");
          blob = doc.output("blob");
        }
      }
      if (out && out.warn.length) toast(out.warn.join(" "), 6000);
      saveBlob(blob, fileName(f, type));
      progress(1, `${type.toUpperCase()} 받기 완료 (${fmt(blob.size / 1048576, 1)} MB)`);
      setTimeout(() => progress(null), 2500);
    } catch (err) {
      console.error(err);
      toast(err.message || "파일을 만들지 못했습니다.", 5000);
      progress(null);
    } finally {
      S.busy = false;
      $$("[data-dl]").forEach((b) => { b.disabled = false; });
    }
  };

  // ---------- 시작 ----------
  Input.init();
  IN.onTab = (t) => { if (t === "draw" && S.view !== "map") setView("map"); };
  // 경계 이름(범례·글자): 직접 고치지 않았으면 모양에 맞춰(면 사업지구, 선 사업노선, 점 조사지점)
  const siteText = () => $("#site-text").value.trim() || "사업지구";
  const autoSiteText = (s) => {
    const el = $("#site-text");
    if (!s || el.dataset.edited) return;
    const kinds = new Set(s.features.map((f) => U.kindOf(f.geometry)));
    el.value = kinds.has("polygon") ? "사업지구" : kinds.has("line") ? "사업노선" : "조사지점";
  };
  IN.onChange = (s) => {
    autoSiteText(s);
    Object.values(S.figs).forEach((f) => { f.offset = [0, 0]; f.labelHide.clear(); f.labelText.clear(); });
    // 포털 공간자료는 그 사업지구로 받은 것이라 경계가 바뀌면 뺌(직접 찍은 위치는 둠)
    const L = S.figs.lit.lit;
    if (L.imported) { L.imported = null; L.hide.clear(); toast("경계가 바뀌어 넣었던 BioGrid EIA 공간자료를 뺐습니다. 새 경계로 받은 자료를 다시 넣어 주세요.", 5000); }
    L.gridKey = "";
    renderLitList();
    scaleOptions();
    if (s) setView("preview"); else renderPreview();
  };
  syncControls();
  $$("#fig-tabs button").forEach((b) => b.addEventListener("click", () => {
    stopArrow();
    S.cur = b.dataset.fig;
    syncControls();
    if (site()) setView("preview");
  }));
  $$("#view-tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $$(".side select, .side input[type=checkbox]").forEach((el) => {
    if (el.closest("[data-pane]") || el.id === "o-dpi" || el.closest("#label-list") || el.closest("#lit-list") || el.type === "file") return;
    el.addEventListener("change", () => { readControls(); if (el.id !== "o-scale") scaleOptions(); if (/^o-(basemap|gray|labels)$/.test(el.id)) syncMapBase(); renderPreview(); });
  });
  $("#site-text").addEventListener("input", (e) => { e.target.dataset.edited = e.target.value.trim() ? "1" : ""; rerender(); });
  ["o-title", "o-rings", "o-forest-name", "o-water-name"].forEach((id) => $(`#${id}`).addEventListener("input", () => { readControls(); rerender(); }));
  $$("[data-dl]").forEach((b) => b.addEventListener("click", () => exportFig(b.dataset.dl)));
  $("#n-area").addEventListener("click", natAreaExcel);
  initEcoKey();
  initPan();
  initWheel();
  initArrow();
  initLabels();
  initLit();
  renderLitList();
  window.addEventListener("resize", debounce(() => { if (S.view === "preview") renderPreview(); }, 300));
  document.addEventListener("keydown", (e) => {
    if (!A.mode) return;
    if (e.key === "Enter") finishArrow();
    if (e.key === "Escape") stopArrow();
  });
  window.App = { S, renderPreview, exportFig, ecoKey };
})();
