// 화면 — 도면 설정, 미리보기(끌어서 가운데 옮기기·축 화살표 그리기), 이름표 고치기, PNG·PDF·SVG 받기
(() => {
  const { $, $$, esc, fmt, debounce, toast, LIB, loadScript, saveBlob, safeName } = U;
  const { IN } = Input;

  const TITLES = { sat: "위성사진 현황도", eco: "생태축 현황도", nat: "생태·자연도", veg: "한국 식생기후대 분포도", flo: "한국 식물상 지역", lit: "문헌조사 위치도", sp: "문헌조사시 법정보호종 출현위치도", pa: "보호구역 위치도", field: "현지조사 위치도", fsp: "현지조사시 법정보호종 출현위치도", inv: "현지조사시 생태계교란생물 출현위치도" };
  // 보호구역 종합포털의 종류(tools/layers.py 순서). on: 동식물상 관련이라 처음부터 켬
  const PA_LAYERS = [
    ["nature", "자연·생태 보호구역", [["wildlife-special", "야생생물특별보호구역", 1], ["wildlife", "야생생물보호구역", 1], ["wetland-coast", "연안습지보호지역", 1], ["wetland", "습지보호지역", 1],
      ["eco-landscape", "생태·경관보전지역", 1], ["special-island", "특정도서", 1], ["park-national", "국립공원", 1], ["park-province", "도립공원", 1], ["park-county", "군립공원", 1],
      ["forest", "산림보호구역", 0], ["forest-genetic", "산림유전자원보호림", 1], ["baekdu", "백두대간보호지역", 1], ["kdpa-other", "기타 보전지역(자연휴양림·수목원 등)", 0]]],
    ["heritage", "국가유산", [["natural-heritage", "천연기념물", 1], ["scenic", "명승", 0], ["heritage", "국가유산 보호구역", 0], ["temple", "전통사찰보존구역", 0]]],
    ["marine", "해양·연안", [["marine-mpa", "해양보호구역", 1], ["coast-conserve", "보전연안해역", 0], ["env-sea", "환경보전해역", 0], ["fishery", "수산자원보호구역", 0]]],
    ["env", "물·환경 규제지역", [["water", "상수원보호구역", 0], ["riparian", "수변구역", 0], ["special-measure", "수질보전 특별대책지역", 0], ["natenv", "자연환경보전지역", 0],
      ["urbanpark", "도시자연공원구역", 0], ["protect-district", "보호지구", 0], ["landscape", "자연경관지구", 0], ["greenbelt", "개발제한구역", 0], ["air", "대기환경규제지역", 0]]],
  ];
  const PA_DEFAULT = PA_LAYERS.flatMap(([, , ls]) => ls.filter((l) => l[2]).map((l) => l[0]));
  // 기본 바탕지도(다른 바탕도 고를 수 있음): 브이월드 위성사진. 문헌조사·법정보호종(문헌조사)·보호구역 위치도는 브이월드 일반지도, 생태축은 지형 음영(+지명 겹치기).
  // 브이월드 인증키가 없으면 Esri 위성
  const BASE_OF = { lit: "vbase", sp: "vbase", pa: "vbase", eco: "hill" };
  const baseOf = (kind) => { const b = BASE_OF[kind] || "vsat"; return Carto.BASES[b].key && !Carto.hasVworld ? "sat" : b; };
  const newFig = (kind) => ({
    kind, paper: "A4", orient: Carto.NATIONAL.includes(kind) || ["lit", "sp", "pa"].includes(kind) ? "port" : "land", scaleMode: "auto", scale: 5000, offset: [0, 0],
    basemap: baseOf(kind), base: 0, gray: false, baseLabels: kind === "eco",
    title: TITLES[kind],
    el: { title: true, north: true, scalebar: true, legend: true, source: true, sitelabel: ["sat", "lit", "sp", "pa", "field", "fsp", "inv"].includes(kind), grid: "none", size: 1, lsize: 1, sbsize: 1, nsize: 1 },
    rings: [1, 2],
    eco: { forest: true, water: true, sea: true, tidal: false, rzone: true, szone: true, topo: true, peaks: true, wnames: true, flow: true, streams: true, rings: false, forestName: "산림생태계", waterName: "수생태계" },
    nat: { g1: true, g2: true, sep: true, rings: false, dist1: false },
    natl: { inset: true },
    // 문헌조사 위치도: 생태·자연도 1·2등급 겹치기(기본 켬), 9격자(grid), 포털 공간자료(imported), 직접 찍은 문헌(manual), 목록에서 뺀 것·고친 이름·색
    lit: { nat: true, table: "below", sheetName: true, grid: null, gridKey: "", imported: null, xls: null, sp: null, picked: new Map(), manual: [], seq: 0, hide: new Set(), text: new Map(), colors: new Map() },
    // 보호구역 위치도: 그릴 종류, 이름, 이격거리 치수선, 도엽 이름(9격자는 lit.grid를 같이 씀)
    pa: { layers: new Set(PA_DEFAULT), names: true, dist: false, sheetName: true },
    // 현지조사 위치도: 사업 종류(auto·area·line), 조사범위([{m, name, on}], null이면 사업 종류의 처음 값), 경로 파일, 겹친 길 합치기 거리(m), 차량 이동 빼기, 다듬기(m), 자를 먼 거리(m),
    // 분류군별 색, 고친 것(지우개·그린 길), 조사지점(St.·W.)
    field: { type: "auto", ranges: null, rangesEdited: false, tracks: [], tseq: 0, tol: 15, car: true, soft: 12, far: 2000, byGroup: false, edits: [], points: [], pseq: 0, stats: null },
    // 현지조사 출현위치도(법정보호종·생태계교란생물): 조사범위(m, 0이면 현지조사 위치도의 가장 큰 범위), 범위 밖 기록(all·m), 이름표, 조사경로 겹치기,
    // 출현 기록([{id, name, kind: point·line·area, pts, note}]), 종별 기호
    occ: { ring: 0, out: "all", label: "name", routes: false, recs: [], seq: 0, syms: {}, symSeq: 0 },
    arrows: [], labelHide: new Set(), labelText: new Map(),
  });
  const S = { cur: "sat", figs: Object.fromEntries(Object.keys(TITLES).map((k) => [k, newFig(k)])), view: "map", last: null, busy: false, page: 1 };
  // 법정보호종 출현위치도는 문헌조사 위치도의 문헌 목록·직접 찍은 위치·9격자를 같이 씀
  S.figs.sp.lit = S.figs.lit.lit;
  const fig = () => S.figs[S.cur];
  const site = () => IN.site;
  const resolveScale = (f) => { if (f.scaleMode === "auto") f.scale = Carto.autoScale(f, site()); return f.scale; };

  // ---------- 설정 칸 ↔ 도면 ----------
  const CHECKS = { "o-forest": ["eco", "forest"], "o-water": ["eco", "water"], "o-tidal": ["eco", "tidal"], "o-sea": ["eco", "sea"], "o-rzone": ["eco", "rzone"], "o-szone": ["eco", "szone"], "o-topo": ["eco", "topo"], "o-peaks": ["eco", "peaks"], "o-wnames": ["eco", "wnames"], "o-flow": ["eco", "flow"],
    "o-streams": ["eco", "streams"], "o-eco-rings": ["eco", "rings"], "e-title": ["el", "title"], "e-north": ["el", "north"], "e-scalebar": ["el", "scalebar"],
    "e-legend": ["el", "legend"], "e-source": ["el", "source"], "e-sitelabel": ["el", "sitelabel"],
    "o-gray": ["", "gray"], "o-labels": ["", "baseLabels"],
    "n-g1": ["nat", "g1"], "n-g2": ["nat", "g2"], "n-sep": ["nat", "sep"], "n-rings": ["nat", "rings"], "n-dist1": ["nat", "dist1"], "v-inset": ["natl", "inset"],
    "l-nat": ["lit", "nat"], "l-sheet": ["lit", "sheetName"], "p-names": ["pa", "names"], "p-dist": ["pa", "dist"], "p-sheet": ["pa", "sheetName"] };
  const scaleOptions = () => {
    const f = fig();
    if (f.kind === "field") prepField(f);
    if (OCC[f.kind]) prepOcc(f);
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
    $("#e-size").value = String(f.el.size || 1);
    $("#e-lsize").value = String(f.el.lsize || 1);
    $("#e-sbsize").value = String(f.el.sbsize || 1);
    $("#e-nsize").value = String(f.el.nsize || 1);
    $("#l-table").value = f.lit.table;
    syncPageTabs();
    scaleOptions();
    $$("[data-figpane]").forEach((p) => { p.hidden = !p.dataset.figpane.split(" ").includes(f.kind); });
    $$("#fig-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.fig === S.cur));
    renderArrowList();
    renderFieldPane();
    Object.keys(OCC).forEach(renderOccPane);
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
    f.el.size = +$("#e-size").value || 1;
    f.el.lsize = +$("#e-lsize").value || 1;
    f.el.sbsize = +$("#e-sbsize").value || 1;
    f.el.nsize = +$("#e-nsize").value || 1;
    f.lit.table = $("#l-table").value;
    syncPageTabs();
    const sv = $("#o-scale").value;
    if (sv === "auto") f.scaleMode = "auto"; else { f.scaleMode = "fixed"; f.scale = +sv; }
  };

  // 문헌조사 위치도에서 문헌자료 표를 둘째 쪽에 둘 때만 미리보기 쪽(1쪽 도면·2쪽 문헌자료)을 고름
  const twoPages = (f) => (f.kind === "lit" || f.kind === "sp") && f.lit.table === "page2";
  const syncPageTabs = () => {
    const show = twoPages(fig());
    if (!show) S.page = 1;
    $("#page-tabs").hidden = !show;
    $$("#page-tabs button").forEach((b) => b.classList.toggle("on", +b.dataset.page === S.page));
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
    // 그리는 차례 번호는 자료 받기 전에 매김: 문헌 자료를 받는 사이 다른 도면으로 바꾸면 늦게 끝난 앞 그림이 새 도면을 덮지 않게
    const my = ++gen;
    f.siteText = siteText();
    f.ecoKey = ecoKey();
    if (f.kind === "lit" || f.kind === "sp") await prepLit(f);
    if (f.kind === "sp") prepSp(f);
    if (f.kind === "pa") await prepGrid(f);
    if (f.kind === "field") prepField(f);
    if (OCC[f.kind]) { await occList(f.kind).catch(() => null); prepOcc(f); }
    if (my !== gen) return;
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
    if (!S.last) { $("#paper").style.width = `${cssW}px`; $("#paper").style.height = `${cssH}px`; }
    const off = document.createElement("canvas");
    off.width = Math.round(Lo.W * k);
    off.height = Math.round(Lo.H * k);
    status("도면을 그리는 중…");
    const page2 = twoPages(f) && S.page === 2;
    try {
      const pen = new Carto.CanvasPen(off.getContext("2d"), k);
      const out = page2 ? await Carto.renderLitPage(pen, f) : await Carto.render(pen, f, site(), k, {
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
      // 둘째 쪽(문헌자료)은 지도가 없어 끌기·휠·찍기를 하지 않음(view 없음)
      S.last = { view: page2 ? null : out.view, layout: Lo, cssW, cssH, k, fig: f };
      // 위치가 9격자 밖에만 있어 도면에 그리지 않은 문헌은 목록에 「격자 밖」
      if ((f.kind === "lit" || f.kind === "sp") && !page2) { S.litOut = new Set(out.litOut || []); renderLitList(); }
      if (f.kind === "sp" && !document.activeElement.matches("#sp-list textarea")) renderSpList();
      if (f.kind === "pa") paSummary(out.pa);
      if (f.kind === "field") fieldStats();
      if (OCC[f.kind] && !document.activeElement.closest(".q-list")) renderOccList(f.kind);
      drawArrowTemp();
      renderLabelList(out.labels);
      // 1등급 이격거리 결과(생태·자연도, 켰을 때)
      const dt = $("#n-dist-text"), d = out.dist1;
      dt.hidden = !(f.kind === "nat" && f.nat.dist1);
      dt.textContent = !d ? "" : d.inside ? "사업지구가 1등급 권역과 겹칩니다." : d.none ? "도면에 보이는 범위 안에 1등급 권역이 없습니다." : `1등급 권역까지 ${d.m < 1 ? `${Math.round(d.m * 100)} cm` : `${fmt(Math.round(d.m))} m`}(도면에 보이는 범위 안, ${d.api ? "최신 DB·API" : "정기고시 원본 경계"})`;
      status(page2 ? `2쪽 문헌자료 ${fmt((f.litRows || []).length)}건 · ${f.paper} ${f.orient === "port" ? "세로" : "가로"}`
        : out.warn.length ? out.warn.join(" ") : `축척 1:${fmt(f.scale)} · ${f.paper} ${f.orient === "port" ? "세로" : "가로"}`);
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
      if (!S.last || !S.last.view || A.mode) return;
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

  // 끌어서 가운데 옮기기, 두 손가락으로 확대·축소(모바일). 두 손가락 가운데가 제자리에 있게 축척 목록의 가장 가까운 단계로 바꾸고
  // 손가락이 옮긴 만큼 옮김. 그리는 동안은 그림을 늘려·옮겨 보여 줌
  const initPan = () => {
    const cv = $("#pv-over"), pvc = $("#pv");
    let drag = null, pinch = null;
    const pts = new Map();
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const finishPinch = (p) => {
      if (Math.abs(p.f - 1) < 0.05 && Math.hypot(p.tx, p.ty) < 4) { pvc.style.transform = ""; return; }
      const f = fig(), list = Carto.scalesFor(f), cur = f.scale, want = cur / p.f;
      const next = list.reduce((b, s) => (Math.abs(Math.log(s / want)) < Math.abs(Math.log(b / want)) ? s : b), list[0]);
      const { view, layout: Lo } = S.last, r = $("#paper").getBoundingClientRect(), mmPerPx = Lo.W / r.width;
      const F = Lo.frame, dx = (p.x0 - r.left) * mmPerPx - (F.x + F.w / 2), dy = (p.y0 - r.top) * mmPerPx - (F.y + F.h / 2);
      const dm = (cur - next) / 1000 / Math.cos((view.lat0 * Math.PI) / 180), mNew = (view.m * next) / cur;
      f.offset = [f.offset[0] + dx * dm - p.tx * mmPerPx * mNew, f.offset[1] - dy * dm + p.ty * mmPerPx * mNew];
      f.scaleMode = "fixed";
      f.scale = next;
      status(`축척 1:${fmt(next)}`);
      renderPreview();
    };
    cv.addEventListener("pointerdown", (e) => {
      if (!S.last || !S.last.view) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 이미 끝난 손가락 */ }
      if (pts.size === 2) { drag = null; const t = two(); pinch = { d0: t.d || 1, x0: t.x, y0: t.y, f: 1, tx: 0, ty: 0 }; return; }
      if (A.mode || pts.size > 2) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    cv.addEventListener("pointermove", (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const t = two(), r = $("#paper").getBoundingClientRect();
        pinch.f = t.d / pinch.d0; pinch.tx = t.x - pinch.x0; pinch.ty = t.y - pinch.y0;
        pvc.style.transformOrigin = `${pinch.x0 - r.left}px ${pinch.y0 - r.top}px`;
        pvc.style.transform = `translate(${pinch.tx}px, ${pinch.ty}px) scale(${pinch.f})`;
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      $("#pv").style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) { const p = pinch; pinch = null; drag = null; finishPinch(p); } return; }
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
  const LIT_NAME = { "lit-point": "지점", "lit-line": "선", "lit-area": "구역", "lit-sp": "법정보호종 지점", "lit-pick": "문헌 위치",
    "fld-line": "조사경로", "fld-erase": "지우개", "fld-veg": "식생 조사지점", "fld-water": "육수 조사지점", "fld-etc": "기타 조사지점",
    "occ-point": "출현 지점", "occ-line": "출현 선", "occ-area": "출현 구역" };
  const arrowName = (k) => LIT_NAME[k] || (k === "forest" ? "산림축" : "수계축");
  const ONE_PT = ["lit-point", "lit-sp", "lit-pick", "fld-veg", "fld-water", "fld-etc", "occ-point"];
  const needPts = (m) => (ONE_PT.includes(m) ? 1 : m === "lit-area" || m === "occ-area" ? 3 : 2);
  const startArrow = (kind) => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    if (S.page === 2) { S.page = 1; syncPageTabs(); renderPreview(); }
    if (S.view !== "preview") setView("preview");
    A.mode = kind;
    A.pts = [];
    $("#pv-over").classList.add("drawing");
    $("#arrow-bar").hidden = false;
    $$("[data-arrow]").forEach((b) => b.classList.toggle("on", b.dataset.arrow === kind));
    $$("[data-lit]").forEach((b) => b.classList.toggle("on", b.dataset.lit === kind));
    $$("[data-fld]").forEach((b) => b.classList.toggle("on", b.dataset.fld === kind));
    $$("[data-occ]").forEach((b) => b.classList.toggle("on", b.dataset.occ === kind));
    arrowMsg();
    drawArrowTemp();
  };
  const stopArrow = () => {
    A.mode = null;
    A.pts = [];
    $("#pv-over").classList.remove("drawing");
    $("#arrow-bar").hidden = true;
    $$("[data-arrow], [data-lit], [data-fld], [data-occ]").forEach((b) => b.classList.remove("on"));
    drawArrowTemp();
  };
  const arrowMsg = () => {
    if (A.mode === "fld-erase") { $("#arrow-msg").textContent = "지울 경로를 누르거나 문지르세요(빨간 원 크기만큼 지움)"; return; }
    if (FLD_PT[A.mode]) { $("#arrow-msg").textContent = `${LIT_NAME[A.mode]}: 누를 때마다 하나씩 찍습니다(다음 ${nextLabel(FLD_PT[A.mode])})`; return; }
    if (A.mode && A.mode.startsWith("occ-")) {
      const n = OF(S.cur).recs.filter((r) => r.name === A.target).length;
      const w = A.mode === "occ-point" ? "점: 누를 때마다 하나씩 찍습니다" : `${A.mode === "occ-line" ? "선" : "구역"}: 꼭짓점을 차례로 누르고 두 번 눌러 하나를 끝냅니다`;
      $("#arrow-msg").textContent = `「${A.target}」 ${w}(지금 ${n}건${A.pts.length ? ` · 점 ${A.pts.length}개` : ""})`;
      return;
    }
    const n = needPts(A.mode);
    const pickName = A.mode === "lit-pick" || (A.mode === "lit-sp" && A.target) ? ((litItems(S.figs.lit.lit).find((x) => x.id === A.target) || {}).text || "문헌").slice(0, 24) : "";
    $("#arrow-msg").textContent = A.mode === "lit-pick" ? `「${pickName}」 위치를 도면 위에서 누르세요` : A.mode === "lit-sp" ? `${pickName ? `「${pickName}」의 ` : ""}법정보호종 출현 지점을 도면 위에서 누르세요` : A.mode === "lit-point" ? "문헌 지점을 도면 위에서 누르세요"
      : `${arrowName(A.mode)} 점 ${A.pts.length}개${A.pts.length < n ? ` — ${n}개 이상 찍으세요${isLit(A.mode) || A.mode === "fld-line" ? "" : "(마지막 점이 화살 머리)"}` : ""}`;
  };
  const finishArrow = () => {
    // 현지조사 지점은 그만둘 때까지 누를 때마다 하나씩
    if (A.mode === "fld-erase") { stopArrow(); return; }
    // 출현 기록: 그만둘 때까지 점은 누를 때마다, 선·구역은 두 번 누를 때마다 하나씩
    if (A.mode && A.mode.startsWith("occ-")) {
      const kind = A.mode.slice(4), need = needPts(A.mode);
      if (!A.pts.length) { stopArrow(); return; }
      if (A.pts.length < need) { toast(`점을 ${need}개 이상 찍으세요.`); return; }
      addRec(S.cur, A.target, kind, A.pts);
      A.pts = [];
      arrowMsg();
      drawArrowTemp();
      renderOccList(S.cur);
      renderPreview();
      return;
    }
    if (FLD_PT[A.mode]) {
      if (!A.pts.length) { stopArrow(); return; }
      addPoint(FLD_PT[A.mode], A.pts[0]);
      A.pts = [];
      arrowMsg();
      renderFieldPane();
      renderPreview();
      return;
    }
    const n = needPts(A.mode);
    if (A.pts.length < n) { toast(`점을 ${n}개 이상 찍으세요.`); return; }
    if (A.mode === "fld-line") {
      FF().edits.push({ t: "add", g: $("#f-add-group").value || "etc", pts: A.pts.map(([lon, lat]) => [+lon.toFixed(7), +lat.toFixed(7)]), snap: Math.round(3 * fig().scale) / 1000 });
      stopArrow();
      fieldStats();
      renderPreview();
      return;
    }
    if (A.mode === "lit-pick") {
      const L = S.figs.lit.lit;
      L.picked.set(A.target, { geo: { kind: "point", parts: [[A.pts[0]]] }, color: MAN_COLORS[L.picked.size % MAN_COLORS.length] });
      stopArrow();
      renderPreview();
      renderLitList();
      return;
    }
    if (A.mode === "lit-sp") {
      const L = S.figs.lit.lit, pt = A.pts[0];
      if (!L.sp) L.sp = { entries: [], seq: 0 };
      const k = L.sp.entries.filter((x) => x.kind === "point").length + 1, lit = A.target, r = lit && spAll().find((x) => x.id === lit);
      stopArrow();
      spAdd({ kind: "point", point: pt, ...(lit ? { lit } : {}), where: `직접 찍은 지점 ${k}${r ? ` — 문헌${r.n}` : ""}` });
      return;
    }
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
    if (!A.mode || !S.last || !S.last.view || !A.pts.length) return;
    const { view, k } = S.last;
    const pp = A.pts.map(([lon, lat]) => view.fromLL(lon, lat));
    c.setTransform(k, 0, 0, k, 0, 0);
    const occDraw = A.mode === "occ-line" || A.mode === "occ-area";
    if (isLit(A.mode) || A.mode === "fld-line" || occDraw) {
      const col = A.mode === "fld-line" ? "#ff3fd2" : occDraw ? (OF(S.cur).syms[A.target] || {}).color || "#e8590c" : MAN_COLORS[S.figs.lit.lit.seq % MAN_COLORS.length];
      c.beginPath();
      pp.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (A.mode === "lit-area" || A.mode === "occ-area") { c.closePath(); c.globalAlpha = 0.3; c.fillStyle = col; c.fill(); c.globalAlpha = 1; }
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
      if (!A.mode || !S.last || !S.last.view || A.mode === "fld-erase") return;
      const [px, py] = toPage(e);
      const ll = S.last.view.toLL(px, py);
      const last = A.pts[A.pts.length - 1];
      if (last) {
        const q = S.last.view.fromLL(last[0], last[1]);
        if (Math.hypot(q[0] - px, q[1] - py) < 0.8) return;   // 두 번 누를 때 겹친 점
      }
      A.pts.push(ll);
      if (ONE_PT.includes(A.mode)) { finishArrow(); return; }
      arrowMsg();
      drawArrowTemp();
    });
    over.addEventListener("dblclick", (e) => { if (A.mode && !ONE_PT.includes(A.mode)) { e.preventDefault(); finishArrow(); } });
    $$("[data-arrow]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.arrow ? stopArrow() : startArrow(b.dataset.arrow))));
    $$("[data-lit]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.lit ? stopArrow() : startArrow(b.dataset.lit))));
    $("#arrow-done").addEventListener("click", finishArrow);
    $("#arrow-undo").addEventListener("click", () => {
      const F = FF();
      if (A.mode === "fld-erase") { const i = F.edits.map((x) => x.t).lastIndexOf("erase"); if (i >= 0) { F.edits.splice(i, 1); fieldStats(); renderPreview(); } return; }
      if (FLD_PT[A.mode]) { const i = F.points.map((x) => x.kind).lastIndexOf(FLD_PT[A.mode]); if (i >= 0) { F.points.splice(i, 1); arrowMsg(); renderFieldPane(); renderPreview(); } return; }
      // 출현 기록: 그리는 중이면 마지막 꼭짓점, 아니면 이 종·모양의 마지막 기록
      if (A.mode && A.mode.startsWith("occ-") && !A.pts.length) {
        const Q = OF(S.cur), i = Q.recs.map((x) => `${x.name}|${x.kind}`).lastIndexOf(`${A.target}|${A.mode.slice(4)}`);
        if (i >= 0) { Q.recs.splice(i, 1); arrowMsg(); renderOccList(S.cur); renderPreview(); }
        return;
      }
      A.pts.pop();
      arrowMsg();
      drawArrowTemp();
    });
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
  // 분류군 차례(모든 도면의 범례·목록·주석·엑셀): 식물 → 포유류 → 양서·파충류 → 조류 → 육상곤충류 → 저서성 대형무척추동물 → 어류, 나머지는 끝.
  // 자료마다 이름이 조금 달라(식물상·양서파충류·곤충류·무척추동물·갑각류·육수생물 등) 앞부분으로 맞춤
  const TAXON_RANK = [["식물", "식생"], ["포유"], ["양서", "파충"], ["조류"], ["곤충", "육상곤충"], ["저서", "무척추", "갑각", "육수"], ["어류"]];
  const taxonRank = (t) => { const s = String(t || "").replace(/[\s·]/g, ""), i = TAXON_RANK.findIndex((g) => g.some((n) => s.startsWith(n))); return i < 0 ? TAXON_RANK.length : i; };
  const byTaxon = (a, b) => taxonRank(a) - taxonRank(b);

  // ---------- 현지조사 위치도 ----------
  // 조사범위 처음 값(표 6.1.1-3 조사항목별 현지조사 범위): 면사업은 사업지구 경계에서, 선형사업은 중심선(식물)·경계(양서·파충류·곤충)에서.
  // 보호지역·생태·자연도 1등급이 가까우면 500 m까지 넓히기도 함(필수 아님 — 꺼 둔 줄). 거리·이름은 직접 고쳐 씀
  const FIELD_RANGES = {
    area: [[100, "식물상·식생, 양서·파충류·육상곤충", true], [300, "포유류·조류", true], [500, "보호지역 인접 확대", false]],
    line: [[150, "식물상·식생, 양서·파충류·육상곤충", true], [500, "포유류·조류", true]],
  };
  // 경로 분류군: [키, 이름, 색, 파일 이름으로 짐작] — 분류군 차례(TAXON_RANK)대로
  const ROUTE_GROUPS = [
    ["etc", "공통", "#ff3fd2", null],
    ["flora", "식물상·식생", "#ffffff", /식물|식생|plant|flora|veg/i],
    ["mammal", "포유류", "#ff922b", /포유|mammal/i],
    ["herp", "양서·파충류", "#cc5de8", /양서|파충|양파|herp|amphib|reptil/i],
    ["bird", "조류", "#4dabf7", /조류|bird/i],
    ["insect", "육상곤충", "#fcc419", /곤충|insect/i],
    ["water", "육수생물", "#22b8cf", /어류|저서|육수|fish|benth/i],
  ];
  const FIELD_PTS = { veg: ["식생", "St."], water: ["육수", "W."], etc: ["기타", "P."] };
  const FLD_PT = { "fld-veg": "veg", "fld-water": "water", "fld-etc": "etc" };
  const FF = () => S.figs.field.field;
  const fext = (n) => (n.split(".").pop() || "").toLowerCase();
  const siteKind = () => { const k = new Set((site() ? site().features : []).map((f) => U.kindOf(f.geometry))); return !k.has("polygon") && k.has("line") ? "line" : "area"; };
  const fieldType = (F) => (F.type === "auto" ? siteKind() : F.type);
  const fieldRanges = (F) => { if (!F.ranges) F.ranges = FIELD_RANGES[fieldType(F)].map(([m, name, on]) => ({ m, name, on })); return F.ranges; };
  const fieldOrigin = () => { const b = U.bboxOf(site().features); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
  let FR = { key: "", val: null };
  const prepField = (f) => {
    const F = f.field;
    // 같은 거리의 범위는 선 하나로(이름은 이어 씀)
    const by = new Map();
    fieldRanges(F).filter((r) => r.on && r.m > 0).forEach((r) => { if (!by.has(r.m)) by.set(r.m, []); if (r.name.trim()) by.get(r.m).push(r.name.trim()); });
    f.fieldRings = [...by].sort((a, b) => a[0] - b[0]).map(([m, ns]) => ({ m, label: `${ns.length ? `${ns.join(", ")} ` : ""}조사범위(${fmt(m)} m)` }));
    // 경로: 분류군별 색이 아니면 모두 한 묶음으로 합침(무거운 합치기는 같은 조건이면 다시 하지 않음)
    const on = F.tracks.filter((t) => t.on), gOf = (g) => (F.byGroup ? g : "all");
    const origin = site() ? fieldOrigin() : on.length ? on[0].lines[0][0].slice(0, 2) : [127, 37];
    const key = JSON.stringify([on.map((t) => [t.id, gOf(t.group)]), F.tol, F.car, F.soft, F.far, site() ? U.bboxOf(site().features) : origin]);
    if (FR.key !== key) {
      const sets = new Map();
      on.forEach((t) => { const g = gOf(t.group); if (!sets.has(g)) sets.set(g, []); sets.get(g).push(...t.lines); });
      FR = { key, val: Field.build([...sets].map(([g, lines]) => ({ g, lines })), { origin, tol: F.tol, car: F.car, soft: F.soft, site: site() && site().features, far: F.far }) };
    }
    F.stats = on.length ? FR.val.stats : null;
    f.extraPts = F.points.map((p) => p.pt);
    const sets = Field.applyEdits(FR.val.sets, F.edits.map((ed) => (ed.t === "add" ? { ...ed, g: gOf(ed.g) } : ed)), origin);
    const meta = new Map(ROUTE_GROUPS.map(([k, name, color], i) => [k, { name: `${name} 조사경로`, color, i }]));
    f.fieldRoutes = sets.filter((x) => x.lines.length)
      .map((x) => (x.g === "all" ? { name: "조사경로", color: ROUTE_GROUPS[0][2], i: 0, lines: x.lines } : { ...(meta.get(x.g) || meta.get("etc")), lines: x.lines }))
      .sort((a, b) => a.i - b.i);
  };
  const guessGroup = (name) => (ROUTE_GROUPS.find((g) => g[3] && g[3].test(name)) || ROUTE_GROUPS[0])[0];
  const guessPtKind = (t) => (/(^|\s)st\.?\s*\d|식생|veg/i.test(t) ? "veg" : /(^|\s)w\.?\s*\d|육수|어류|저서|water|fish/i.test(t) ? "water" : "etc");
  // 다음 번호: 같은 종류 이름 끝 숫자 중 가장 큰 것 + 1
  const nextLabel = (kind) => {
    const used = FF().points.filter((p) => p.kind === kind).map((p) => { const m = /(\d+)\s*$/.exec(p.label); return m ? +m[1] : 0; });
    return `${FIELD_PTS[kind][1]}${Math.max(0, ...used) + 1}`;
  };
  const addPoint = (kind, pt, label) => {
    const F = FF();
    F.points.push({ id: `p${++F.pseq}`, kind, label: label || nextLabel(kind), pt: [+pt[0].toFixed(7), +pt[1].toFixed(7)] });
  };
  // 조사원 경로 파일(여러 개, KMZ·zip은 풀어서). 경로 없이 지점만 든 파일(조사지점 KML 등)은 조사지점으로
  const importTracks = async (files) => {
    const F = FF(), items = [], bad = [];
    for (const file of files) {
      const x = fext(file.name);
      if (x === "kmz" || x === "zip") {
        await loadScript(LIB.jszip, "JSZip");
        const z = await JSZip.loadAsync(file);
        for (const en of Object.values(z.files)) {
          if (en.dir || !/\.(kml|gpx|geojson)$/i.test(en.name) || /(^|\/)__MACOSX\//.test(en.name)) continue;
          const inner = en.name.split("/").pop();
          items.push({ name: x === "kmz" && /^doc\.kml$/i.test(inner) ? file.name.replace(/\.kmz$/i, ".kml") : inner, text: await en.async("string") });
        }
      } else items.push({ name: file.name, text: await file.text() });
    }
    let nt = 0, np = 0;
    items.forEach(({ name, text }) => {
      let r;
      try { r = Field.parse(name, text); } catch (err) { bad.push(err.message); return; }
      const stem = name.replace(/\.[^.]+$/, "");
      if (r.lines.length) {
        const lines = r.lines.map((l) => l.map(([lon, lat, t]) => [+lon.toFixed(7), +lat.toFixed(7), t]));
        F.tracks.push({ id: `t${++F.tseq}`, name: stem, group: guessGroup(name), on: true, km: lines.reduce((a, l) => a + Field.lengthLL(l), 0) / 1000, lines });
        nt++;
      } else if (r.pts.length) {
        r.pts.forEach((p) => addPoint(guessPtKind(`${p.name} ${stem}`), [p.lon, p.lat], p.name.trim()));
        np += r.pts.length;
      } else bad.push(`${name}: 경로나 지점이 없습니다.`);
    });
    return { nt, np, bad };
  };
  const renderFieldPane = () => {
    const F = FF(), auto = siteKind() === "line" ? "선형사업" : "면사업";
    $("#f-type").options[0].textContent = `자동(${site() ? auto : "경계 모양"})`;
    $("#f-type").value = F.type;
    $("#f-tol").value = String(F.tol);
    $("#f-soft").value = String(F.soft);
    $("#f-far").value = String(F.far);
    $("#f-car").checked = F.car;
    $("#f-group").checked = F.byGroup;
    $("#f-ranges").innerHTML = fieldRanges(F).map((r, i) => `<div class="fr-row" data-i="${i}"><input type="checkbox" data-k="on" ${r.on ? "checked" : ""} title="도면에 그리기">`
      + `<input class="input" type="number" data-k="m" min="1" max="5000" step="10" value="${r.m}"><span class="muted small">m</span>`
      + `<input class="input" data-k="name" value="${esc(r.name)}" placeholder="조사 항목"><button class="link" data-del="${i}" title="이 범위 빼기">빼기</button></div>`).join("");
    const col = (t) => (F.byGroup ? (ROUTE_GROUPS.find((g) => g[0] === t.group) || ROUTE_GROUPS[0])[2] : ROUTE_GROUPS[0][2]);
    $("#f-tracks").innerHTML = F.tracks.map((t) => `<div class="lit-row f-track${t.on ? "" : " off"}" data-id="${t.id}"><input type="checkbox" data-k="on" ${t.on ? "checked" : ""}>`
      + `<i class="f-sw" style="background:${col(t)}"></i><span class="f-name" title="${esc(t.name)}">${esc(t.name)} <span class="muted small">${fmt(t.km, 1)} km</span></span>`
      + `<select class="input" data-k="group" title="분류군(분류군별 색일 때 색이 나뉨)">${ROUTE_GROUPS.map(([k, n]) => `<option value="${k}" ${k === t.group ? "selected" : ""}>${n}</option>`).join("")}</select>`
      + `<button class="link" data-del>빼기</button></div>`).join("");
    $("#f-add-group").innerHTML = ROUTE_GROUPS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");
    $("#f-add-group").hidden = !F.byGroup;
    $("#f-points").innerHTML = F.points.map((p) => `<div class="lit-row f-pt" data-id="${p.id}"><i class="f-sym f-sym-${p.kind}"></i>`
      + `<input class="input" data-k="label" value="${esc(p.label)}"><span class="muted small">${FIELD_PTS[p.kind][0]}</span><button class="link" data-del>지우기</button></div>`).join("");
    fieldStats();
  };
  const fieldStats = () => {
    const F = FF(), st = F.stats, er = F.edits.filter((x) => x.t === "erase").length, ad = F.edits.length - er;
    $("#f-stats").hidden = !st;
    if (st) $("#f-stats").textContent = `경로 ${F.tracks.filter((t) => t.on).length}개 · 기록 ${fmt(st.raw, 1)} km${st.car ? ` · 차량 이동 ${fmt(st.car, 1)} km 뺌` : ""}${st.far ? ` · ${fmt(F.far / 1000, 1)} km 밖 ${fmt(st.far, 1)} km 뺌` : ""} → 도면 ${fmt(st.out, 1)} km${F.tol ? "(겹친 길 합침)" : ""}`;
    $("#f-edit-text").textContent = F.edits.length ? `고친 것: 지운 곳 ${er} · 그린 길 ${ad}` : "";
    $("#f-undo").disabled = $("#f-reset").disabled = !F.edits.length;
  };
  // 지우개: 미리보기에서 누르거나 문지른 곳(용지 지름 5 mm)을 한 번의 고친 것으로
  const ERASE_MM = 2.5;
  const drawEraseTemp = (stroke, cur) => {
    const over = $("#pv-over"), c = over.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, over.width, over.height);
    if (!S.last || !S.last.view) return;
    c.setTransform(S.last.k, 0, 0, S.last.k, 0, 0);
    if (stroke) { c.fillStyle = "rgba(240, 62, 62, 0.35)"; stroke.forEach((p) => { c.beginPath(); c.arc(p.px, p.py, ERASE_MM, 0, 2 * Math.PI); c.fill(); }); }
    if (cur) { c.beginPath(); c.arc(cur.px, cur.py, ERASE_MM, 0, 2 * Math.PI); c.lineWidth = 0.3; c.strokeStyle = "#f03e3e"; c.stroke(); }
  };
  const initErase = () => {
    const over = $("#pv-over");
    let stroke = null;
    const at = (e) => { const [px, py] = toPage(e); return { px, py, ll: S.last.view.toLL(px, py) }; };
    const on = () => A.mode === "fld-erase" && S.last && S.last.view;
    over.addEventListener("pointerdown", (e) => { if (!on()) return; stroke = [at(e)]; over.setPointerCapture(e.pointerId); drawEraseTemp(stroke); });
    // 빨리 움직여도 지나간 길이 빈틈없이 지워지게 마지막 점과 사이를 반지름 절반 간격으로 채움
    const fill = (p) => {
      const l = stroke[stroke.length - 1], n = Math.floor(Math.hypot(p.px - l.px, p.py - l.py) / (ERASE_MM * 0.5));
      for (let i = 1; i <= n; i++) { const px = l.px + ((p.px - l.px) * i) / n, py = l.py + ((p.py - l.py) * i) / n; stroke.push({ px, py, ll: S.last.view.toLL(px, py) }); }
    };
    over.addEventListener("pointermove", (e) => {
      if (!on()) return;
      const p = at(e);
      if (stroke) fill(p);
      drawEraseTemp(stroke, p);
    });
    over.addEventListener("pointerleave", () => { if (on() && !stroke) drawEraseTemp(null); });
    const end = (e) => {
      if (!stroke) return;
      if (e.type === "pointerup") fill(at(e));
      const st = stroke;
      stroke = null;
      FF().edits.push({ t: "erase", c: st.map((q) => [+q.ll[0].toFixed(7), +q.ll[1].toFixed(7)]), r: Math.round(((ERASE_MM * S.last.fig.scale) / 1000) * 10) / 10 });
      fieldStats();
      renderPreview();
    };
    over.addEventListener("pointerup", end);
    over.addEventListener("pointercancel", end);
  };
  // 파일(.json): 조사범위·경로·고친 것·조사지점과 경계(불러올 때 경계가 없으면 씀)
  const FIELD_FILE = "eia-figure-maps/field";
  const saveField = () => {
    const F = FF();
    if (!F.tracks.length && !F.points.length && !F.edits.length) { toast("저장할 것이 없습니다. 경로를 넣거나 조사지점을 찍은 뒤 저장하세요."); return; }
    const name = $("#site-name").value.trim();
    const data = {
      type: FIELD_FILE, version: 1, saved: new Date().toISOString(), project: name, siteText: siteText(), site: site() ? site().features : null,
      options: { type: F.type, tol: F.tol, car: F.car, soft: F.soft, far: F.far, byGroup: F.byGroup }, ranges: F.ranges, tracks: F.tracks, edits: F.edits, points: F.points,
    };
    saveBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `${safeName([name, "현지조사위치도"].filter(Boolean).join("_"))}.json`);
    toast(`경로 ${F.tracks.length}개, 고친 것 ${F.edits.length}건, 조사지점 ${F.points.length}곳을 파일로 저장했습니다.`);
  };
  const loadField = async (file) => {
    let d;
    try { d = JSON.parse(await file.text()); } catch (_) { throw new Error("현지조사 위치도 파일(.json)을 읽지 못했습니다."); }
    if (!d || d.type !== FIELD_FILE) throw new Error("이 도구에서 저장한 현지조사 위치도 파일이 아닙니다.");
    let note = "";
    if (!site() && Array.isArray(d.site) && d.site.length && Input.setSite(d.site, "현지조사 위치도 파일의 경계")) note = " 파일에 있던 경계도 넣었습니다.";
    const F = FF(), arr = (a) => (Array.isArray(a) ? a : []), isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    const o = d.options || {};
    if (["auto", "area", "line"].includes(o.type)) F.type = o.type;
    if (Number.isFinite(o.tol)) F.tol = o.tol;
    if (Number.isFinite(o.soft)) F.soft = o.soft;
    if (Number.isFinite(o.far)) F.far = o.far;
    ["car", "byGroup"].forEach((k) => { if (typeof o[k] === "boolean") F[k] = o[k]; });
    const rs = arr(d.ranges).filter((r) => r && Number.isFinite(r.m)).map((r) => ({ m: r.m, name: String(r.name || ""), on: !!r.on }));
    F.ranges = rs.length ? rs : null;
    F.rangesEdited = !!rs.length;
    F.tracks = arr(d.tracks).filter((t) => t && typeof t.id === "string").map((t) => ({ id: t.id, name: String(t.name || ""), group: ROUTE_GROUPS.some((g) => g[0] === t.group) ? t.group : "etc", on: t.on !== false, km: +t.km || 0,
      lines: arr(t.lines).filter((l) => Array.isArray(l) && l.length >= 2 && l.every(isPt)) })).filter((t) => t.lines.length);
    F.edits = arr(d.edits).filter((ed) => ed && ((ed.t === "add" && arr(ed.pts).length >= 2 && ed.pts.every(isPt)) || (ed.t === "erase" && arr(ed.c).length && ed.c.every(isPt) && ed.r > 0)));
    F.points = arr(d.points).filter((p) => p && FIELD_PTS[p.kind] && isPt(p.pt)).map((p) => ({ id: String(p.id), kind: p.kind, label: String(p.label || ""), pt: p.pt }));
    F.tseq = Math.max(0, ...F.tracks.map((t) => +t.id.slice(1) || 0));
    F.pseq = Math.max(0, ...F.points.map((p) => +String(p.id).slice(1) || 0));
    if (typeof d.project === "string" && d.project && !$("#site-name").value.trim()) $("#site-name").value = d.project;
    const st = $("#site-text");
    if (typeof d.siteText === "string" && d.siteText && !st.dataset.edited) { st.value = d.siteText; st.dataset.edited = "1"; }
    FR.key = "";
    return { t: F.tracks.length, p: F.points.length, e: F.edits.length, note };
  };
  // 조사지점 좌표 엑셀(보고서 조사지점 표): 경위도(십진·도분초)와 EPSG:5186
  const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (a - d - m / 60) * 3600; return `${v < 0 ? neg : pos} ${d}°${String(m).padStart(2, "0")}′${s.toFixed(1).padStart(4, "0")}″`; };
  const fieldExcel = async () => {
    const F = FF();
    if (!F.points.length) { toast("찍은 조사지점이 없습니다."); return; }
    await loadScript(LIB.xlsx, "XLSX");
    const tm = proj4("WGS84", U.crsDef("5186")), name = $("#site-name").value.trim(), order = Object.keys(FIELD_PTS);
    const rows = [...F.points].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((p) => {
      const [x, y] = tm.forward(p.pt);
      return [FIELD_PTS[p.kind][0], p.label, dms(p.pt[1], "N", "S"), dms(p.pt[0], "E", "W"), +p.pt[1].toFixed(6), +p.pt[0].toFixed(6), Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const aoa = [["현지조사 지점 좌표"], [], ["사업명", name || "-"], [], ["구분", "지점", "위도", "경도", "위도(십진)", "경도(십진)", "동향 E(EPSG:5186, m)", "북향 N(EPSG:5186, m)"], ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 17 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "조사지점");
    saveBlob(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName([name, "현지조사지점_좌표"].filter(Boolean).join("_"))}.xlsx`);
  };
  // 정리한 경로·조사지점 KML(GIS·구글어스에서 다시 쓰기)
  const fieldKml = () => {
    const f = S.figs.field, F = f.field;
    prepField(f);
    const routes = f.fieldRoutes || [];
    if (!routes.length && !F.points.length) { toast("받을 경로·조사지점이 없습니다."); return; }
    const name = $("#site-name").value.trim(), c = (l) => l.map(([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`).join(" ");
    const pm = routes.flatMap((r) => r.lines.map((l, i) => `<Placemark><name>${esc(r.name)} ${i + 1}</name><LineString><tessellate>1</tessellate><coordinates>${c(l)}</coordinates></LineString></Placemark>`));
    const pp = F.points.map((p) => `<Placemark><name>${esc(p.label)}</name><description>${FIELD_PTS[p.kind][0]} 조사지점</description><Point><coordinates>${p.pt[0]},${p.pt[1]}</coordinates></Point></Placemark>`);
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name || "현지조사")}</name>${pm.join("")}${pp.join("")}</Document></kml>`;
    saveBlob(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }), `${safeName([name, "현지조사_정리경로"].filter(Boolean).join("_"))}.kml`);
  };
  const initField = () => {
    $("#f-type").addEventListener("change", (e) => { const F = FF(); F.type = e.target.value; F.ranges = null; F.rangesEdited = false; renderFieldPane(); scaleOptions(); renderPreview(); });
    const rb = $("#f-ranges");
    const upd = (e) => {
      const row = e.target.closest(".fr-row");
      if (!row) return false;
      const r = FF().ranges[+row.dataset.i], k = e.target.dataset.k;
      if (k === "on") r.on = e.target.checked;
      if (k === "m") r.m = Math.max(0, Math.min(5000, Math.round(+e.target.value || 0)));
      if (k === "name") r.name = e.target.value;
      FF().rangesEdited = true;
      return true;
    };
    rb.addEventListener("input", (e) => { if (e.target.dataset.k !== "on" && upd(e)) { scaleOptions(); rerender(); } });
    rb.addEventListener("change", (e) => { if (e.target.dataset.k === "on" && upd(e)) { scaleOptions(); renderPreview(); } });
    rb.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]");
      if (!b) return;
      FF().ranges.splice(+b.dataset.del, 1);
      FF().rangesEdited = true;
      renderFieldPane();
      scaleOptions();
      renderPreview();
    });
    $("#f-range-add").addEventListener("click", () => {
      const F = FF(), rs = fieldRanges(F);
      rs.push({ m: rs.some((r) => r.m === 500) ? 1000 : 500, name: "", on: true });
      F.rangesEdited = true;
      renderFieldPane();
      scaleOptions();
      renderPreview();
    });
    $("#f-file").addEventListener("change", async (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      if (!files.length) return;
      try {
        toast("경로 파일을 읽는 중…", 1500);
        const r = await importTracks(files);
        if (S.cur !== "field") { stopArrow(); S.cur = "field"; syncControls(); }
        renderFieldPane();
        if (site()) setView("preview");
        if (!r.nt && !r.np) { toast(r.bad.join(" / ") || "읽을 수 있는 경로가 없습니다.", 6000); return; }
        toast(`경로 ${r.nt}개${r.np ? `, 조사지점 ${r.np}곳` : ""}을 넣었습니다.${site() ? "" : " 사업지구 경계를 넣으면 도면에 그립니다."}${r.bad.length ? ` 못 읽은 파일: ${r.bad.join(" / ")}` : ""}`, r.bad.length ? 7000 : 3500);
      } catch (err) {
        console.error(err);
        toast(err.message || "경로 파일을 읽지 못했습니다.", 5000);
      }
    });
    const tb = $("#f-tracks");
    tb.addEventListener("change", (e) => {
      const row = e.target.closest("[data-id]"), t = row && FF().tracks.find((x) => x.id === row.dataset.id);
      if (!t) return;
      if (e.target.dataset.k === "on") t.on = e.target.checked;
      if (e.target.dataset.k === "group") t.group = e.target.value;
      renderFieldPane();
      renderPreview();
    });
    tb.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]"), row = b && b.closest("[data-id]");
      if (!row) return;
      const F = FF();
      F.tracks = F.tracks.filter((x) => x.id !== row.dataset.id);
      renderFieldPane();
      renderPreview();
    });
    $("#f-tol").addEventListener("change", (e) => { FF().tol = +e.target.value; renderPreview(); });
    $("#f-soft").addEventListener("change", (e) => { FF().soft = +e.target.value; renderPreview(); });
    $("#f-far").addEventListener("change", (e) => { FF().far = +e.target.value; renderPreview(); });
    $("#f-car").addEventListener("change", (e) => { FF().car = e.target.checked; renderPreview(); });
    $("#f-group").addEventListener("change", (e) => { FF().byGroup = e.target.checked; renderFieldPane(); renderPreview(); });
    $$("[data-fld]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.fld ? stopArrow() : startArrow(b.dataset.fld))));
    $("#f-undo").addEventListener("click", () => { FF().edits.pop(); fieldStats(); renderPreview(); });
    $("#f-reset").addEventListener("click", () => { const n = FF().edits.length; FF().edits = []; fieldStats(); renderPreview(); toast(`고친 것 ${n}건을 모두 취소했습니다.`); });
    const pb = $("#f-points");
    pb.addEventListener("input", (e) => {
      const row = e.target.closest("[data-id]"), p = row && FF().points.find((x) => x.id === row.dataset.id);
      if (!p || e.target.dataset.k !== "label") return;
      p.label = e.target.value;
      rerender();
    });
    pb.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]"), row = b && b.closest("[data-id]");
      if (!row) return;
      const F = FF();
      F.points = F.points.filter((x) => x.id !== row.dataset.id);
      renderFieldPane();
      renderPreview();
    });
    $("#f-save").addEventListener("click", saveField);
    $("#f-load").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const r = await loadField(file);
        stopArrow();
        S.cur = "field";
        syncControls();
        if (site()) setView("preview");
        toast(`경로 ${r.t}개, 고친 것 ${r.e}건, 조사지점 ${r.p}곳을 불러왔습니다.${r.note}`, 4000);
      } catch (err) {
        console.error(err);
        toast(err.message || "현지조사 위치도 파일을 읽지 못했습니다.");
      }
    });
    $("#f-xlsx").addEventListener("click", () => fieldExcel().catch((err) => { console.error(err); toast(err.message || "엑셀을 만들지 못했습니다."); }));
    $("#f-kml").addEventListener("click", () => { try { fieldKml(); } catch (err) { console.error(err); toast(err.message || "KML을 만들지 못했습니다."); } });
    initErase();
  };
  // ---------- 현지조사 출현위치도(법정보호종 fsp·생태계교란생물 inv) ----------
  // 조사범위는 분류군과 상관없이 가장 큰 거리 하나(비우면 현지조사 위치도에서 켠 범위 중 가장 큰 것). 출현 기록은 점·선·면(교란식물 대군락 등)이고
  // 종마다 다른 색·기호(범례), 범위를 조금 벗어난 기록도 넣을 수 있게 범위 밖 기록은 고른 거리까지 그림
  const GRADE = { I: "멸종위기 Ⅰ급", II: "멸종위기 Ⅱ급" };
  const OCC = {
    fsp: {
      pre: "q", what: "법정보호종", ex: ["수달", "배설물"], list: "data/legal_species.json", ver: 2, file: "eia-figure-maps/fsp", save: "현지조사_법정보호종", title: "현지조사시 법정보호종 출현 기록",
      read: (d) => d.species.map(([name, g, nm, taxon]) => ({ name, taxon, g, nm: !!nm })),
      status: (m) => (m ? [GRADE[m.g], m.nm && "천연기념물"].filter(Boolean).join(", ") : ""),
      col: "법적지위", src: (s) => `등급: ${s}`,
      hint: "법정보호종 목록(멸종위기 야생생물 2023 고시·천연기념물)에 있으면 등급·분류군이 붙습니다.",
    },
    inv: {
      pre: "w", what: "생태계교란생물", ex: ["가시박", "군락"], list: "data/invasive_species.json", ver: 1, file: "eia-figure-maps/inv", save: "현지조사_생태계교란생물", title: "현지조사시 생태계교란생물 출현 기록",
      read: (d) => d.species.map(([name, taxon, sci]) => ({ name, taxon, sci })),
      status: () => "",
      col: "학명", src: (s) => `종 목록: ${s}`,
      hint: "생태계교란 생물 목록(교란생물 종합관리 정리)에 있으면 분류군·학명이 붙습니다. 교란식물 대군락은 구역(면)으로 그리면 면적이 나옵니다.",
    },
  };
  const OK_KINDS = { point: "점", line: "선", area: "면" };
  const OF = (k) => S.figs[k].occ;
  const $o = (k, id) => $(`#${OCC[k].pre}-${id}`);
  // 종 목록(OCC[k].list, tools/build_legal.py·build_invasive.py): 띄어쓰기·딱다구리/딱따구리 표기는 같게 봄
  const OL = {}, OLP = {};
  const occNorm = (t) => String(t || "").replace(/\s+/g, "").replace(/딱다구리/g, "딱따구리");
  const occList = (k) => OLP[k] || (OLP[k] = fetch(`${OCC[k].list}?v=${OCC[k].ver}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    const map = new Map(), sp = OCC[k].read(d);
    sp.forEach((m) => map.set(occNorm(m.name), m));
    Object.entries(d.alias || {}).forEach(([a, b]) => { const m = map.get(occNorm(b)); if (m) map.set(occNorm(a), m); });
    return (OL[k] = { source: d.source, map, names: sp.map((m) => m.name) });
  }).catch((err) => { OLP[k] = null; throw err; }));
  const occOf = (k, name) => (OL[k] ? OL[k].map.get(occNorm(name)) || null : null);
  // 글에서 목록의 종 이름(가장 긴 것). 한 글자 이름(매·삵)은 앞이 한글이 아니고 뒤가 끝·숫자·흔적 말일 때만
  const EVID = /^(배설물|족적|발자국|흔적|울음|소리|목격|관찰|사체|둥지|굴|섭식|식흔|털|탈피|알|유충|개체|채집|포획|확인)/;
  const findName = (k, text) => {
    if (!OL[k] || !text) return null;
    const t = occNorm(text);
    let best = null;
    OL[k].map.forEach((m, key) => {
      const i = t.indexOf(key);
      if (i < 0 || (best && key.length <= best.key.length)) return;
      if (key.length === 1 && (/[가-힣]$/.test(t.slice(0, i)) || !(i + 1 === t.length || /^\d/.test(t.slice(i + 1)) || EVID.test(t.slice(i + 1))))) return;
      best = { key, m };
    });
    if (!best) return null;
    // 남은 글은 비고로(원문에서 띄어쓰기를 무시하고 이름을 뺌)
    const re = new RegExp(best.key.split("").map((c) => (c === "따" ? "[따다]" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\s*"));
    return { name: best.m.name, note: String(text).replace(re, "").replace(/^[\s\-_:;,.·()/]+|[\s\-_:;,.·()/]+$/g, "") };
  };
  const maxRange = () => Math.max(0, ...fieldRanges(FF()).filter((r) => r.on && r.m > 0).map((r) => r.m)) || 300;
  // 넓이(㎡)·길이(m): EPSG:5186 평면
  let TM5186 = null;
  const tm5186 = () => TM5186 || (TM5186 = proj4("WGS84", U.crsDef("5186")));
  const occSize = (r) => {
    if (r.kind === "point") return 0;
    const q = r.pts.map((p) => tm5186().forward(p));
    if (r.kind === "line") return q.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) : 0), 0);
    let a = 0;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) a += q[j][0] * q[i][1] - q[i][0] * q[j][1];
    return Math.abs(a / 2);
  };
  const sizeText = (r) => (r.kind === "area" ? `면 ${fmt(Math.round(occSize(r)))} ㎡` : r.kind === "line" ? `선 ${fmt(Math.round(occSize(r)))} m` : "점");
  // 대표 점: 점 그대로, 선은 길이 가운데 꼭짓점, 면은 무게중심(EPSG:5186)
  const occRep = (r) => {
    if (r.kind === "point") return r.pts[0];
    const T = tm5186(), q = r.pts.map((p) => T.forward(p));
    if (r.kind === "line") {
      let L = 0;
      const cum = q.map((p, i) => (L += i ? Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) : 0));
      return r.pts[Math.max(0, cum.findIndex((v) => v >= L / 2))];
    }
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const f = q[j][0] * q[i][1] - q[i][0] * q[j][1]; a += f; cx += (q[j][0] + q[i][0]) * f; cy += (q[j][1] + q[i][1]) * f; }
    return Math.abs(a) < 1e-9 ? r.pts[0] : T.inverse([cx / (3 * a), cy / (3 * a)]);
  };
  const prepOcc = (f) => {
    const k = f.kind, C = OCC[k], Q = f.occ;
    const auto = maxRange(), m = Q.ring > 0 ? Q.ring : auto;
    f.occAuto = auto;
    f.fieldRings = [{ m, label: `현지조사 범위(${fmt(m)} m)` }];
    if (Q.routes) { prepField(S.figs.field); f.fieldRoutes = S.figs.field.fieldRoutes; } else f.fieldRoutes = [];
    // 종마다 처음 본 차례로 기호를 정해 둠(종을 지워도 다른 종 기호는 그대로)
    Q.recs.forEach((r) => { if (!Q.syms[r.name]) Q.syms[r.name] = Carto.symOf(Q.symSeq++); });
    Object.values(Q.syms).forEach((sym) => { const c = Carto.SYM_RECOLOR[String(sym.color).toLowerCase()]; if (c) sym.color = c; });
    const d = site() ? Field.geoDist(site().features, Q.recs) : Q.recs.map(() => 0);
    Q.recs.forEach((r, i) => { r.d = d[i]; r.vis = Q.out === "all" || d[i] <= m + +Q.out; });
    const vis = Q.recs.filter((r) => r.vis);
    f.occRecs = vis.map((r) => ({ name: r.name, kind: r.kind, pts: r.pts, sym: Q.syms[r.name] }));
    f.occSpecies = occOrder(k, Q.recs).filter((n) => vis.some((r) => r.name === n)).map((n) => {
      const st = C.status(occOf(k, n));
      return { name: n, sym: Q.syms[n], kinds: [...new Set(vis.filter((r) => r.name === n).map((r) => r.kind))], label: st ? `${n}(${st})` : n };
    });
    f.extraPts = vis.flatMap((r) => r.pts);
    f.listSource = OL[k] ? C.src(OL[k].source) : "";
  };
  // 종 차례: 분류군(TAXON_RANK, 목록에 없는 종은 맨 끝) → 넣은 차례
  const occOrder = (k, recs) => {
    const names = [...new Set(recs.map((r) => r.name))], ti = (n) => { const m = occOf(k, n); return m ? taxonRank(m.taxon) : TAXON_RANK.length + 1; };
    return names.map((n, i) => [n, ti(n), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  };
  const addRec = (k, name, kind, pts, note = "") => { const Q = OF(k); Q.recs.push({ id: `r${++Q.seq}`, name, kind, pts: pts.map((p) => [+p[0].toFixed(7), +p[1].toFixed(7)]), note }); };
  // 좌표 글(십진 또는 도분초 35°22'11.2")
  const coordVal = (v) => {
    if (typeof v === "number") return v;
    const t = String(v || "").trim(), m = t.match(/(-?\d+(?:\.\d+)?)\s*[°도]\s*(?:(\d+(?:\.\d+)?)\s*['′분]\s*)?(?:(\d+(?:\.\d+)?)\s*["″초])?/);
    if (m) return +m[1] + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600;
    const n = parseFloat(t.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  // 엑셀·CSV(점): 머리글에서 종명·위도·경도(또는 X·Y — EPSG:5186, Y가 100만 넘으면 5179)·비고 열을 찾음
  const readTable = async (file) => {
    await loadScript(LIB.xlsx, "XLSX");
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(file.name)) {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (_) { text = new TextDecoder("euc-kr").decode(buf); }
      wb = XLSX.read(text, { type: "string" });
    } else wb = XLSX.read(buf, { type: "array" });
    const out = [];
    wb.SheetNames.forEach((sn) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
      for (let h = 0; h < Math.min(10, aoa.length); h++) {
        const head = aoa[h].map((c) => String(c).replace(/\s+/g, ""));
        const col = (re) => head.findIndex((c) => re.test(c));
        const cn = col(/종명|국명|^종$|출현종|species|^name$|이름/i), cla = col(/위도|^lat/i), clo = col(/경도|^lon|^lng/i), cx = col(/^x(좌표)?$|동향|easting/i), cy = col(/^y(좌표)?$|북향|northing/i), cnote = col(/비고|흔적|형태|유형|내용|note|확인방법/i);
        if (cn < 0 || !((cla >= 0 && clo >= 0) || (cx >= 0 && cy >= 0))) continue;
        aoa.slice(h + 1).forEach((r) => {
          const name = String(r[cn] || "").trim();
          if (!name) return;
          let ll = null;
          if (cla >= 0 && clo >= 0) {
            let la = coordVal(r[cla]), lo = coordVal(r[clo]);
            if (la > 90 && lo < 90) [la, lo] = [lo, la];
            if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) ll = [lo, la];
          } else {
            const x = coordVal(r[cx]), y = coordVal(r[cy]);
            if (Number.isFinite(x) && Number.isFinite(y)) ll = proj4(U.crsDef(y > 1e6 ? "5179" : "5186"), "WGS84", [x, y]);
          }
          if (ll) out.push({ name, desc: cnote >= 0 ? String(r[cnote] || "").trim() : "", kind: "point", pts: [ll] });
        });
        break;
      }
    });
    return out;
  };
  // 출현 기록 파일: GPX·KML·KMZ·GeoJSON·SHP(zip)의 점·선·면(이름·설명·속성), 엑셀·CSV 점. 목록의 종 이름이 든 것만 넣고 나머지 이름은 알려 줌
  const importRecs = async (k, files) => {
    await occList(k);
    const feats = [], bad = [];
    for (const file of files) {
      const x = fext(file.name);
      try {
        if (x === "xlsx" || x === "xls" || x === "csv") feats.push(...(await readTable(file)));
        else if (x === "kmz" || x === "zip") {
          await loadScript(LIB.jszip, "JSZip");
          const z = await JSZip.loadAsync(file), ents = Object.values(z.files).filter((en) => !en.dir && !/(^|\/)__MACOSX\//.test(en.name));
          if (ents.some((en) => /\.shp$/i.test(en.name))) {
            await loadScript(LIB.shp, "shp");
            feats.push(...Field.parseFeatures(await shp(await file.arrayBuffer())).feats);
          }
          for (const en of ents) if (/\.(kml|gpx|geojson)$/i.test(en.name)) feats.push(...Field.parse(en.name, await en.async("string")).feats);
        } else feats.push(...Field.parse(file.name, await file.text()).feats);
      } catch (err) { bad.push(err.message || file.name); }
    }
    let n = 0;
    const other = new Map();
    feats.forEach((p) => {
      const inName = findName(k, p.name), hit = inName || findName(k, p.desc);
      if (!hit) { const t = (p.name || "(이름 없음)").trim().slice(0, 30); other.set(t, (other.get(t) || 0) + 1); return; }
      addRec(k, hit.name, p.kind, p.pts, [hit.note, inName ? p.desc : ""].filter(Boolean).join(" ").slice(0, 60));
      n++;
    });
    return { n, other: [...other.keys()], bad };
  };
  const symSvg = (sym) => `<svg class="q-sym" viewBox="-1.5 -1.5 3 3"><polygon points="${Carto.symPts(sym.shape).map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ")}" fill="${sym.color}" stroke="#fff" stroke-width="0.15"/></svg>`;
  // 설정 칸(두 도면이 같은 꼴, 아이디 앞머리만 다름)
  const occPaneHtml = (k) => {
    const C = OCC[k], p = C.pre;
    return `<div class="grid2">
          <label title="분류군과 상관없이 가장 큰 조사범위 하나. 비우면 현지조사 위치도에서 켠 조사범위 중 가장 큰 거리">조사범위(m) <input id="${p}-ring" class="input" type="number" min="10" max="5000" step="10" placeholder="자동"></label>
          <label title="범위를 조금 벗어난 출현 기록도 넣을 때">범위 밖 기록 <select id="${p}-out" class="input">
            <option value="all">모두 그림</option><option value="500">범위 밖 500 m까지</option><option value="200">범위 밖 200 m까지</option><option value="100">범위 밖 100 m까지</option><option value="0">범위 안만</option>
          </select></label>
          <label>이름표 <select id="${p}-label" class="input"><option value="name">종명</option><option value="none">없음(범례로만)</option></select></label>
          <div class="checks"><label><input type="checkbox" id="${p}-routes"> 조사경로 함께</label></div>
        </div>
        <div class="drop">
          <input type="file" id="${p}-file" multiple accept=".gpx,.kml,.kmz,.geojson,.json,.csv,.xlsx,.xls,.zip">
          <b>출현 기록 넣기(GPX·KML·SHP·엑셀·CSV)</b>
          <span>점·선·면의 이름(또는 속성)에서 ${C.what} 이름을 찾아 넣습니다(「${C.ex.join(" ")}」 → ${C.ex[0]}, 비고 ${C.ex[1]}). SHP는 zip으로, 엑셀·CSV는 종명과 위도·경도(또는 X·Y, EPSG:5186) 열(점)</span>
        </div>
        <div class="axis-tool">
          <b>지도에 그리기</b>
          <input id="${p}-name" class="input" list="${p}-names" placeholder="종명(예: ${C.ex[0]})" autocomplete="off">
          <datalist id="${p}-names"></datalist>
          <div class="btns">
            <button class="btn ghost" data-occ="occ-point">점</button>
            <button class="btn ghost" data-occ="occ-line">선</button>
            <button class="btn ghost" data-occ="occ-area">구역(면)</button>
          </div>
          <p class="hint">종명을 적고 점·선·구역을 고른 뒤 미리보기 도면을 누릅니다. 점은 누를 때마다 하나씩, 선·구역은 꼭짓점을 차례로 누르고 두 번 눌러 하나를 끝냅니다(그만두기까지 계속). ${C.hint}</p>
        </div>
        <b class="small">출현 기록 <span class="muted">(종마다 다른 색·기호, 범례는 분류군 차례)</span></b>
        <div id="${p}-list" class="q-list"></div>
        <div class="btns">
          <button class="btn ghost" id="${p}-save">저장(파일)</button>
          <label class="btn ghost">불러오기<input type="file" id="${p}-load" accept=".json,application/json" hidden></label>
          <button class="btn ghost" id="${p}-xlsx" title="출현 기록(형태·면적·길이·좌표·사업지구와 거리·범위 안/밖)과 종별 요약">출현 기록 받기(엑셀)</button>
        </div>`;
  };
  const renderOccPane = (k) => {
    const Q = OF(k);
    $o(k, "ring").value = Q.ring > 0 ? String(Q.ring) : "";
    $o(k, "ring").placeholder = `자동(${fmt(maxRange())} m)`;
    $o(k, "out").value = Q.out;
    $o(k, "label").value = Q.label;
    $o(k, "routes").checked = Q.routes;
    renderOccList(k);
  };
  const renderOccList = (k) => {
    const C = OCC[k], Q = OF(k), m = (S.figs[k].fieldRings || [{ m: 0 }])[0].m;
    const tag = (r) => (r.d == null ? "" : r.d <= m ? "범위 안" : `범위 밖 ${fmt(Math.round(r.d - m))} m${r.vis ? "" : " · 도면에서 뺌"}`);
    $o(k, "list").innerHTML = occOrder(k, Q.recs).map((n) => {
      const rs = Q.recs.filter((r) => r.name === n), M = occOf(k, n), st = C.status(M);
      return `<div class="q-group" data-name="${esc(n)}"><div class="q-head">${symSvg(Q.syms[n] || Carto.symOf(0))}<input class="input" data-k="sp" value="${esc(n)}" title="종명 고치기(이 종 기록 모두)">`
        + `<span class="muted small">${esc([st || (OL[k] && !M ? `${C.what} 목록에 없음` : ""), M && M.taxon, `${rs.length}건`].filter(Boolean).join(" · "))}</span>`
        + `<button class="link" data-act="more">더 그리기</button><button class="link" data-act="del-sp">모두 지우기</button></div>`
        + rs.map((r) => `<div class="q-rec${r.vis === false ? " off" : ""}" data-id="${r.id}"><span class="small muted q-kind">${sizeText(r)}</span><input class="input" data-k="note" value="${esc(r.note || "")}" placeholder="비고(흔적·개체수·피도 등)"><span class="small tag">${tag(r)}</span><button class="link" data-act="del">지우기</button></div>`).join("")
        + `</div>`;
    }).join("") || `<p class="hint">아직 넣은 출현 기록이 없습니다.</p>`;
  };
  const saveOcc = (k) => {
    const C = OCC[k], Q = OF(k);
    if (!Q.recs.length) { toast("저장할 출현 기록이 없습니다."); return; }
    const name = $("#site-name").value.trim();
    const data = { type: C.file, version: 2, saved: new Date().toISOString(), project: name, siteText: siteText(), site: site() ? site().features : null,
      options: { ring: Q.ring, out: Q.out, label: Q.label, routes: Q.routes }, recs: Q.recs.map(({ id, name: n, kind, pts, note }) => ({ id, name: n, kind, pts, note })), syms: Q.syms, symSeq: Q.symSeq };
    saveBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `${safeName([name, C.save].filter(Boolean).join("_"))}.json`);
    toast(`출현 기록 ${Q.recs.length}건을 파일로 저장했습니다.`);
  };
  const loadOcc = async (k, file) => {
    const C = OCC[k];
    let d;
    try { d = JSON.parse(await file.text()); } catch (_) { throw new Error("출현 기록 파일(.json)을 읽지 못했습니다."); }
    if (!d || d.type !== C.file) throw new Error(`이 도구에서 저장한 ${C.title} 파일이 아닙니다.`);
    let note = "";
    if (!site() && Array.isArray(d.site) && d.site.length && Input.setSite(d.site, "출현 기록 파일의 경계")) note = " 파일에 있던 경계도 넣었습니다.";
    const Q = OF(k), o = d.options || {}, isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    if (Number.isFinite(o.ring)) Q.ring = o.ring;
    if (["all", "500", "200", "100", "0"].includes(o.out)) Q.out = o.out;
    if (["none", "name"].includes(o.label)) Q.label = o.label;
    if (typeof o.routes === "boolean") Q.routes = o.routes;
    // 판 1(점만, pt)도 읽음
    Q.recs = (Array.isArray(d.recs) ? d.recs : []).map((r) => (r && isPt(r.pt) ? { ...r, kind: "point", pts: [r.pt] } : r))
      .filter((r) => r && typeof r.name === "string" && r.name.trim() && OK_KINDS[r.kind] && Array.isArray(r.pts) && r.pts.length >= (r.kind === "area" ? 3 : r.kind === "line" ? 2 : 1) && r.pts.every(isPt))
      .map((r) => ({ id: String(r.id), name: r.name.trim(), kind: r.kind, pts: r.pts, note: String(r.note || "") }));
    Q.syms = d.syms && typeof d.syms === "object" ? d.syms : {};
    Q.symSeq = Number.isFinite(d.symSeq) ? d.symSeq : Object.keys(Q.syms).length;
    Q.seq = Math.max(0, ...Q.recs.map((r) => +r.id.slice(1) || 0));
    if (typeof d.project === "string" && d.project && !$("#site-name").value.trim()) $("#site-name").value = d.project;
    return { n: Q.recs.length, note };
  };
  const occExcel = async (k) => {
    const C = OCC[k], Q = OF(k), f = S.figs[k];
    if (!Q.recs.length) { toast("넣은 출현 기록이 없습니다."); return; }
    await occList(k).catch(() => null);
    prepOcc(f);
    await loadScript(LIB.xlsx, "XLSX");
    const T = tm5186(), name = $("#site-name").value.trim(), m = f.fieldRings[0].m, order = occOrder(k, Q.recs);
    const colVal = (M) => (C.col === "학명" ? (M && M.sci) || "" : C.status(M));
    const recs = order.flatMap((n) => Q.recs.filter((r) => r.name === n));
    const rows = recs.map((r, i) => {
      const M = occOf(k, r.name), p = occRep(r), [x, y] = T.forward(p), z = occSize(r);
      return [i + 1, M ? M.taxon : "", r.name, colVal(M), OK_KINDS[r.kind], r.kind === "area" ? Math.round(z) : "", r.kind === "line" ? Math.round(z) : "", r.note || "",
        dms(p[1], "N", "S"), dms(p[0], "E", "W"), +p[1].toFixed(6), +p[0].toFixed(6), Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(r.d || 0), r.d <= m ? "안" : "밖"];
    });
    const sum = order.map((n) => {
      const M = occOf(k, n), rs = Q.recs.filter((r) => r.name === n), by = (kind) => rs.filter((r) => r.kind === kind);
      return [M ? M.taxon : "", n, colVal(M), by("point").length, by("line").length, Math.round(by("line").reduce((s, r) => s + occSize(r), 0)), by("area").length, Math.round(by("area").reduce((s, r) => s + occSize(r), 0)), rs.filter((r) => r.d <= m).length];
    });
    const ws1 = XLSX.utils.aoa_to_sheet([[C.title], [], ["사업명", name || "-"], ["현지조사 범위", `사업지구 경계에서 ${fmt(m)} m`], [],
      ["연번", "분류군", "종명", C.col, "형태", "면적(㎡)", "길이(m)", "비고", "위도", "경도", "위도(십진)", "경도(십진)", "동향 E(EPSG:5186, m)", "북향 N(EPSG:5186, m)", "사업지구와 거리(m)", "조사범위"], ...rows,
      [], ["위치는 점 그대로, 선은 길이 가운데 꼭짓점, 면은 무게중심. 면적·길이는 EPSG:5186 평면"]]);
    ws1["!cols"] = [6, 10, 14, 24, 6, 10, 9, 20, 16, 17, 12, 12, 18, 18, 14, 9].map((wch) => ({ wch }));
    const ws2 = XLSX.utils.aoa_to_sheet([["분류군", "종명", C.col, "점(곳)", "선(개)", "선 길이 합(m)", "면(개)", "면적 합(㎡)", "범위 안 기록(건)"], ...sum]);
    ws2["!cols"] = [10, 14, 24, 8, 8, 12, 8, 12, 14].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "출현 기록");
    XLSX.utils.book_append_sheet(wb, ws2, "종별 요약");
    saveBlob(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName([name, `${C.save}_출현기록`].filter(Boolean).join("_"))}.xlsx`);
  };
  const occPick = (k, mode, name) => {
    name = (name || "").trim();
    if (!name) { toast("종명을 먼저 적으세요."); $o(k, "name").focus(); return; }
    const hit = findName(k, name);
    A.target = hit && !hit.note ? hit.name : name;
    startArrow(mode);
  };
  const initOcc = (k) => {
    const C = OCC[k], pane = $(`#${k}-pane`);
    occList(k).then((L) => { $o(k, "names").innerHTML = L.names.map((n) => `<option value="${esc(n)}">`).join(""); }).catch((err) => console.warn(err));
    $o(k, "ring").addEventListener("input", (e) => { OF(k).ring = Math.max(0, Math.min(5000, Math.round(+e.target.value || 0))); scaleOptions(); rerender(); });
    $o(k, "out").addEventListener("change", (e) => { OF(k).out = e.target.value; scaleOptions(); renderPreview(); });
    $o(k, "label").addEventListener("change", (e) => { OF(k).label = e.target.value; renderPreview(); });
    $o(k, "routes").addEventListener("change", (e) => { OF(k).routes = e.target.checked; renderPreview(); });
    $o(k, "file").addEventListener("change", async (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      if (!files.length) return;
      try {
        toast("출현 기록을 읽는 중…", 1500);
        const r = await importRecs(k, files);
        if (S.cur !== k) { stopArrow(); S.cur = k; syncControls(); }
        renderOccList(k);
        if (site()) setView("preview");
        const other = r.other.length ? ` ${C.what} 이름이 없어 뺀 기록 ${r.other.length}종류: ${r.other.slice(0, 8).join(", ")}${r.other.length > 8 ? " …" : ""}` : "";
        toast(`출현 기록 ${r.n}건을 넣었습니다.${other}${r.bad.length ? ` 못 읽은 파일: ${r.bad.join(" / ")}` : ""}`, other || r.bad.length ? 8000 : 3500);
      } catch (err) {
        console.error(err);
        toast(err.message || "출현 기록을 읽지 못했습니다.", 5000);
      }
    });
    pane.querySelectorAll("[data-occ]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.occ ? stopArrow() : occPick(k, b.dataset.occ, $o(k, "name").value))));
    $o(k, "name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); occPick(k, A.mode && A.mode.startsWith("occ-") ? A.mode : "occ-point", e.target.value); } });
    const box = $o(k, "list");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const Q = OF(k), g = b.closest(".q-group"), row = b.closest(".q-rec");
      if (b.dataset.act === "more") {
        const last = [...Q.recs].reverse().find((r) => r.name === g.dataset.name);
        $o(k, "name").value = g.dataset.name;
        occPick(k, `occ-${last ? last.kind : "point"}`, g.dataset.name);
        return;
      }
      if (b.dataset.act === "del-sp") Q.recs = Q.recs.filter((r) => r.name !== g.dataset.name);
      if (b.dataset.act === "del") Q.recs = Q.recs.filter((r) => r.id !== row.dataset.id);
      renderOccList(k);
      renderPreview();
    });
    box.addEventListener("input", (e) => {
      if (e.target.dataset.k !== "note") return;
      const r = OF(k).recs.find((x) => x.id === e.target.closest(".q-rec").dataset.id);
      if (r) r.note = e.target.value;
    });
    // 종명 고치기: 그 종 기록 모두(기호는 그대로 옮김)
    box.addEventListener("change", (e) => {
      if (e.target.dataset.k !== "sp") return;
      const Q = OF(k), old = e.target.closest(".q-group").dataset.name, hit = findName(k, e.target.value), nu = hit && !hit.note ? hit.name : e.target.value.trim();
      if (!nu || nu === old) { e.target.value = old; return; }
      Q.recs.forEach((r) => { if (r.name === old) r.name = nu; });
      if (!Q.syms[nu]) Q.syms[nu] = Q.syms[old];
      renderOccList(k);
      renderPreview();
    });
    $o(k, "save").addEventListener("click", () => saveOcc(k));
    $o(k, "load").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const r = await loadOcc(k, file);
        stopArrow();
        S.cur = k;
        syncControls();
        if (site()) setView("preview");
        toast(`출현 기록 ${r.n}건을 불러왔습니다.${r.note}`, 4000);
      } catch (err) {
        console.error(err);
        toast(err.message || "출현 기록 파일을 읽지 못했습니다.");
      }
    });
    $o(k, "xlsx").addEventListener("click", () => occExcel(k).catch((err) => { console.error(err); toast(err.message || "엑셀을 만들지 못했습니다."); }));
  };

  // ---------- 보호구역 위치도 ----------
  const renderPaLayers = () => {
    const on = S.figs.pa.pa.layers;
    $("#p-layers").innerHTML = PA_LAYERS.map(([g, gname, ls]) => `<div class="pa-group"><b class="small">${esc(gname)}</b><div class="checks">${ls.map(([id, name]) =>
      `<label><input type="checkbox" data-pa="${id}" ${on.has(id) ? "checked" : ""}> ${esc(name)}</label>`).join("")}</div></div>`).join("");
  };
  const paSummary = (areas) => {
    const g = S.figs.pa.lit.grid;
    $("#p-grid-text").textContent = !site() ? "사업지구를 넣으면 9격자(1:25,000 도엽을 3×3으로 나눈 E1~E9 칸) 안의 보호구역을 그립니다."
      : !g ? "사업지구 가운데가 1:25,000 도엽 밖(바다 등)이라 9격자를 잡지 못했습니다."
      : `가운데 칸: ${g.center.name && g.center.name !== g.center.code ? `${g.center.name}(${g.center.code})` : g.center.code} ${g.center.id}`
        + (areas ? ` · 9격자 안 보호구역 ${areas.length}곳${areas.some((a) => a.rel === "겹침") ? `(사업지구와 겹침 ${areas.filter((a) => a.rel === "겹침").length}곳)` : ""}` : "");
  };
  // 9격자 안 보호구역 목록 엑셀(가까운 순): 종류·이름·관계·이격거리(EPSG:5186 평면)·방향
  const paExcel = async () => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    const f = S.figs.pa;
    await prepGrid(f);
    if (!f.lit.grid) { toast("9격자를 잡지 못했습니다."); return; }
    $("#p-xlsx").disabled = true;
    try {
      const { areas } = await Carto.paLoad(f.lit.grid.bounds, [...f.pa.layers]);
      const list = Carto.paMeasure(site(), areas, f.lit.grid.bounds).sort((a, b) => a.dist - b.dist || a.order - b.order);
      await loadScript(LIB.xlsx, "XLSX");
      const name = $("#site-name").value.trim(), c = f.lit.grid.center;
      const aoa = [
        ["보호구역 위치도 — 9격자 안 보호구역"], [],
        ["사업명", name || "-"],
        ["9격자 가운데 칸", `${c.name && c.name !== c.code ? `${c.name}(${c.code})` : c.code} ${c.id}`],
        ["자료", "보호구역 종합포털(protect.biogrideia.com) — 국토교통부 브이월드·한국보호지역 통합DB(KDPA)"],
        ["계산", "이격거리는 사업지구 경계와 보호구역 경계 사이 최단 거리(EPSG:5186 평면), 방향은 사업지구 가운데에서 가장 가까운 지점을 본 8방위"], [],
        ["순번", "종류", "이름", "세부구분", "시도", "시군구", "고시", "면적(ha)", "관계", "이격거리(m)", "방향", "근거법령"],
        ...list.map((a, i) => [i + 1, a.layerName, a.name, a.sub, a.sido, a.sigg, a.notice, a.ha, a.rel, Number.isFinite(a.dist) ? Math.round(a.dist) : "", a.dir, a.law || ""]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 5 }, { wch: 18 }, { wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 6 }, { wch: 11 }, { wch: 6 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "보호구역");
      saveBlob(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName([name, "보호구역위치도_보호구역목록"].filter(Boolean).join("_"))}.xlsx`);
      toast(`9격자 안 보호구역 ${list.length}곳을 엑셀로 받았습니다.`);
    } catch (err) {
      console.error(err);
      toast(err.message || "보호구역 목록을 만들지 못했습니다.");
    } finally {
      $("#p-xlsx").disabled = false;
    }
  };
  const initPa = () => {
    renderPaLayers();
    $("#p-layers").addEventListener("change", (e) => {
      const id = e.target.dataset.pa;
      if (!id) return;
      const on = S.figs.pa.pa.layers;
      if (e.target.checked) on.add(id); else on.delete(id);
      renderPreview();
    });
    $("#p-reset").addEventListener("click", () => { S.figs.pa.pa.layers = new Set(PA_DEFAULT); renderPaLayers(); renderPreview(); });
    $("#p-xlsx").addEventListener("click", paExcel);
  };

  // ---------- 문헌조사시 법정보호종 출현위치도 ----------
  // 종 = { name, taxon, refs: [문헌 id] }. 위치 = { id, kind: cell(전국자연환경조사 칸)·geo(위치가 있는 문헌: 조류센서스·습지·측정망·유역·평가서)·
  // point(직접 찍음)·note(위치 미기재 → 주석), where, items }. 문헌은 문헌조사 위치도 목록과 같이 쓰고 번호는 지금 목록 순서로 다시 매김
  const SP_COLORS = { cell: "#c62828", point: "#a61e4d" };
  const spSplit = (t) => String(t || "").split(/,\s*(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);
  const spToken = (t) => { const m = String(t).match(/^(.*?)\s*\(([^()]*)\)\s*$/); return m ? { name: m[1].trim(), nums: (m[2].match(/\d+/g) || []).map(Number) } : { name: String(t).trim(), nums: [] }; };
  const spWhere = (it) => (it.geoKey && /^(census|wetland|station|basin)\|/.test(it.geoKey) ? it.geoKey.split("|")[1] + (it.geoKey.startsWith("basin|") ? " 유역" : "") : it.text);
  // 포털의 protected_species.geojson: 종마다 (문n) 번호 → 그 문헌에 위치가 있으면 그 위치, 전국자연환경조사 칸이면 그 칸, 아니면 위치 미기재
  const importSpecies = async (json) => {
    const L = S.figs.lit.lit;
    const feats = (json.features || []).filter((f) => f.properties && Array.isArray(f.properties.species));
    if (!feats.length) throw new Error("법정보호종 파일(protected_species.geojson)이 아닙니다.");
    const litList = (json.literature || (feats.find((f) => f.properties.literature) || { properties: {} }).properties.literature || []).filter((r) => r && r["문헌"]);
    if (!L.grid || !S.lit) await prepGrid(S.figs.lit);
    // 문헌 목록이 아직 없으면 이 파일의 문헌 목록으로(포털 번호 그대로, 위치는 문헌 이름으로 찾음)
    if (!L.xls && !(L.imported && L.imported.items.length) && litList.length) {
      const { items } = await resolveLit(litList.map((r) => ({ text: stripNo(r["문헌"]), cat: String(r["구분"] || "").trim() })), L.grid);
      L.xls = { items, summary: `법정보호종 파일의 문헌 ${items.length}건, 위치 ${items.filter((i) => i.geo).length}건` };
    }
    const byText = new Map(litItems(L).map((it) => [normName(it.text), it]));
    const numTo = new Map(litList.map((r) => [parseInt(String(r["문헌번호"]).replace(/\D/g, ""), 10), byText.get(normName(stripNo(r["문헌"])))]));
    const entries = new Map();
    let seq = 0, lost = 0;
    const put = (key, base, name, taxon, ref) => {
      if (!entries.has(key)) entries.set(key, { id: `sp:${++seq}`, ...base, items: [] });
      const en = entries.get(key), had = en.items.find((x) => x.name === name);
      if (had) { if (!had.refs.includes(ref)) had.refs.push(ref); } else en.items.push({ name, taxon, refs: [ref] });
    };
    feats.forEach((f) => {
      const p = f.properties;
      // 위치 미기재 묶음의 글자에서 「분류군: 종(문n), …」로 분류군을 알아냄
      const taxonOf = new Map();
      if (p.placement === "below_grid") String(p.label || "").split("\n").slice(1).forEach((line) => {
        const m = line.match(/^([^:：]+)[:：]\s*(.+)$/);
        if (m) spSplit(m[2]).forEach((t) => taxonOf.set(t, m[1].trim()));
      });
      p.species.forEach((tok) => {
        const { name, nums } = spToken(tok), taxon = taxonOf.get(String(tok).trim()) || "";
        (nums.length ? nums : [0]).forEach((n) => {
          const it = numTo.get(n);
          if (n && !it) lost++;
          const ref = it ? it.id : `raw:${n}`;
          if (it && it.geo) put(`geo|${it.geoKey}`, { kind: "geo", geoKey: it.geoKey, where: spWhere(it) }, name, taxon, ref);
          else if (p.placement === "grid" && p.sheet_number && p.grid_id) put(`cell|${p.sheet_number}_${p.grid_id}`, { kind: "cell", code: String(p.sheet_number), cell: String(p.grid_id), where: p.detail || `${p.sheet_number} ${p.grid_id}` }, name, taxon, ref);
          else put("note", { kind: "note", where: "위치 미기재(주석)" }, name, taxon, ref);
        });
      });
    });
    const order = { cell: 0, geo: 1, point: 2, note: 3 };
    L.sp = { entries: [...entries.values()].sort((a, b) => order[a.kind] - order[b.kind] || String(a.where).localeCompare(String(b.where), "ko")), seq };
    return { n: L.sp.entries.reduce((k, en) => k + en.items.length, 0), places: L.sp.entries.length, lost };
  };
  // 도면에 넣을 종 글자(f.spRows)와 위치 미기재 주석(f.spNote): 지금 보이는 문헌 번호로, 뺀 문헌만 가리키는 종은 뺌
  const spAll = () => S.figs.sp.litAll || S.figs.sp.litRows || [];
  const spNums = () => new Map(spAll().map((r) => [r.id, r.n]));
  const spItemsText = (items, num) => items.map((it) => {
    const ns = [...new Set(it.refs.map((id) => num.get(id)).filter(Boolean))].sort((a, b) => a - b);
    if (it.refs.length && !ns.length) return null;
    // 분류군이 없는 종(칸·문헌 위치)은 법정보호종 목록의 분류군으로(분류군 차례로 늘어놓게)
    return { taxon: it.taxon || (occOf("fsp", it.name) || {}).taxon || "기타", t: ns.length ? `${it.name}(${ns.map((n) => `문${n}`).join(",")})` : it.name };
  }).filter(Boolean).sort((a, b) => byTaxon(a.taxon, b.taxon));
  const prepSp = (f) => {
    const sp = f.lit.sp, all = f.litRows || [], num = new Map(all.map((r) => [r.id, r.n]));
    const geoOk = new Set(all.filter((r) => r.geo).map((r) => r.geoKey));
    const geoCol = new Map(all.filter((r) => r.geo).map((r) => [r.geoKey, r.color]));
    const litCol = new Map(all.map((r) => [r.id, r.color]));
    const used = new Set();
    const noteBy = new Map();
    const toNote = (toks) => toks.forEach((x) => { if (!noteBy.has(x.taxon)) noteBy.set(x.taxon, []); noteBy.get(x.taxon).push(x.t); });
    f.spRows = [];
    (sp ? sp.entries : []).forEach((en) => {
      const toks = spItemsText(en.items, num);
      if (!toks.length) return;
      en.items.forEach((it) => it.refs.forEach((id) => { if (num.has(id)) used.add(id); }));
      if (en.kind === "note" || (en.kind === "geo" && !geoOk.has(en.geoKey))) return toNote(toks);
      // 상자 색: 문헌 종류에 맞춤(문헌 위치는 그 문헌 기호 색, 전국자연환경조사 칸은 빨강, 직접 찍은 지점은 진분홍)
      const color = en.kind === "geo" ? (geoCol.get(en.geoKey) || SP_COLORS.cell) : en.kind === "point" && en.lit && litCol.get(en.lit) ? litCol.get(en.lit) : SP_COLORS[en.kind] || SP_COLORS.cell;
      f.spRows.push({ kind: en.kind, code: en.code, cell: en.cell, geoKey: en.geoKey, point: en.point, text: toks.map((x) => x.t).join(", "), color });
    });
    f.spNote = [...noteBy].sort((a, b) => byTaxon(a[0], b[0])).map(([k, ts]) => `${k}: ${ts.join(", ")}`);
    // 법정보호종이 없는 문헌은 이 도면의 기호·문헌자료 표에서 뺌(번호는 문헌조사 위치도 그대로라 빈 번호가 생김). 9격자는 늘 그림
    f.litAll = all;
    f.litRows = all.filter((r) => used.has(r.id));
  };
  // 목록의 글자(지금 번호) ↔ 종. 위치 미기재는 「분류군: 종(문n), …」 줄, 나머지는 「종(문n), …」. 번호 없는 종은 평가서처럼 직접 넣은
  // 문헌 위치면 그 문헌으로
  const spText = (en) => {
    const toks = spItemsText(en.items, spNums());
    if (en.kind !== "note") return toks.map((x) => x.t).join(", ");
    const by = new Map();
    toks.forEach((x) => { if (!by.has(x.taxon)) by.set(x.taxon, []); by.get(x.taxon).push(x.t); });
    return [...by].sort((a, b) => byTaxon(a[0], b[0])).map(([k, ts]) => `${k}: ${ts.join(", ")}`).join("\n");
  };
  const spParse = (en, text) => {
    const toId = new Map(spAll().map((r) => [r.n, r.id]));
    // 직접 넣은 문헌(man:)·지도에 위치를 찍은 문헌(pick:문헌 id) 자리면 번호 없는 종은 그 문헌으로
    const gk = en.kind === "geo" ? en.geoKey || "" : "", own = en.kind === "point" && en.lit ? en.lit : gk.startsWith("man:") ? gk : gk.startsWith("pick:") ? gk.slice(5) : null;
    // 지금 목록에서 빠져 있는 문헌을 가리키던 번호는 그대로 둠
    const hidden = (name) => { const had = en.items.find((x) => x.name === name); return had ? had.refs.filter((id) => !spAll().some((r) => r.id === id)) : []; };
    const items = [];
    String(text).split("\n").forEach((line) => {
      let taxon = "", body = line;
      const m = en.kind === "note" && line.match(/^([^:：(]+)[:：]\s*(.*)$/);
      if (m) { taxon = m[1].trim(); body = m[2]; }
      spSplit(body).forEach((tok) => {
        const { name, nums } = spToken(tok);
        if (!name) return;
        const refs = nums.map((n) => toId.get(n)).filter(Boolean);
        if (!refs.length && own) refs.push(own);
        items.push({ name, taxon, refs: [...new Set([...refs, ...hidden(name)])] });
      });
    });
    en.items = items;
  };
  const renderSpList = () => {
    const L = S.figs.lit.lit, f = S.figs.sp, g = L.grid;
    const box = $("#sp-list");
    if (!box) return;
    box.innerHTML = (L.sp && L.sp.entries.length ? L.sp.entries : []).map((en) => `<div class="sp-row">
        <div class="sp-head"><b class="small">${esc(en.where)}</b><span class="tag">${{ cell: "칸", geo: "문헌 위치", point: "지점", note: "주석" }[en.kind]}</span><button class="link" data-spdel="${esc(en.id)}">지우기</button></div>
        <textarea class="input" rows="${en.kind === "note" ? 3 : 2}" data-sptext="${esc(en.id)}" placeholder="${en.kind === "note" ? "조류: 원앙(문11), 큰고니(문11,문13)" : "삵(문3,문7), 수달(문7)"}">${esc(spText(en))}</textarea>
      </div>`).join("") || `<p class="hint">포털의 법정보호종 파일을 넣거나, 아래에서 위치를 골라 직접 넣으세요.</p>`;
    // 넣을 위치: 9격자 칸, 위치가 있는 문헌, 위치 미기재, 지도에 직접
    const opts = [];
    if (g) [...g.cells].sort((a, b) => a.r - b.r || a.c - b.c).forEach((c) => opts.push([`cell|${c.code}|${c.id}`, `칸: ${c.name && c.name !== c.code ? c.name : c.code} ${c.id}`]));
    spAll().filter((r) => r.geo).forEach((r) => { if (!opts.some((o) => o[0] === `geo|${r.geoKey}`)) opts.push([`geo|${r.geoKey}`, `문헌${r.n}: ${spWhere(r).slice(0, 30)}`]); });
    opts.push(["note", "위치 미기재(주석)"], ["point", "지도에 직접 찍기(번호는 직접)"]);
    spAll().forEach((r) => opts.push([`pointlit|${r.id}`, `지도에 찍기 — 문헌${r.n}: ${r.text.slice(0, 26)}`]));
    const sel = $("#s-where"), keep = sel.value;
    sel.innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
    if (keep && opts.some((o) => o[0] === keep)) sel.value = keep;
  };
  const spAdd = (base) => {
    const L = S.figs.lit.lit;
    if (!L.sp) L.sp = { entries: [], seq: 0 };
    const key = base.kind === "cell" ? `cell|${base.code}_${base.cell}` : base.kind === "geo" ? `geo|${base.geoKey}` : base.kind;
    let en = base.kind === "point" ? null : L.sp.entries.find((x) => (x.kind === "cell" ? `cell|${x.code}_${x.cell}` : x.kind === "geo" ? `geo|${x.geoKey}` : x.kind) === key);
    if (!en) { en = { id: `sp:${++L.sp.seq}`, ...base, items: [] }; L.sp.entries.push(en); }
    renderSpList();
    const ta = $(`[data-sptext="${CSS.escape(en.id)}"]`);
    if (ta) { ta.focus(); ta.scrollIntoView({ block: "nearest" }); }
  };
  const initSp = () => {
    $("#s-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
      try {
        let json;
        if (/\.zip$/i.test(file.name)) {
          await prepGrid(S.figs.lit);
          await importLit(file);
          await loadScript(LIB.jszip, "JSZip");
          const z = await JSZip.loadAsync(file), ent = Object.values(z.files).find((x) => !x.dir && /protected_species\.geojson$/i.test(x.name));
          if (!ent) throw new Error("zip 안에 법정보호종(06_protected_species.geojson)이 없습니다.");
          json = JSON.parse(await ent.async("string"));
        } else json = JSON.parse(await file.text());
        const r = await importSpecies(json);
        if (S.cur !== "sp") { S.cur = "sp"; syncControls(); }
        setView("preview");
        renderSpList();
        toast(`법정보호종 ${r.n}건(${r.places}곳)을 넣었습니다.${r.lost ? ` 지금 문헌 목록에 없는 문헌을 가리키는 번호 ${r.lost}개는 뺐습니다.` : ""}`, r.lost ? 7000 : 4000);
      } catch (err) {
        console.error(err);
        toast(err.message || "법정보호종 파일을 읽지 못했습니다.");
      }
    });
    $("#s-add").addEventListener("click", () => {
      if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
      const v = $("#s-where").value;
      if (v === "point" || v.startsWith("pointlit|")) { A.target = v === "point" ? null : v.slice(9); startArrow("lit-sp"); return; }
      if (v === "note") return spAdd({ kind: "note", where: "위치 미기재(주석)" });
      const [k, a, b] = v.split("|");
      if (k === "cell") {
        const c = S.figs.lit.lit.grid.cells.find((q) => q.code === a && q.id === b);
        return spAdd({ kind: "cell", code: a, cell: b, where: `${c && c.name && c.name !== c.code ? c.name : a} ${b}` });
      }
      const gk = v.slice(4), r = spAll().find((x) => x.geoKey === gk);
      spAdd({ kind: "geo", geoKey: gk, where: r ? spWhere(r) : gk });
    });
    const box = $("#sp-list");
    const redraw = debounce(() => renderPreview(), 400);
    box.addEventListener("input", (e) => {
      const id = e.target.dataset.sptext;
      if (!id) return;
      const en = S.figs.lit.lit.sp.entries.find((x) => x.id === id);
      if (en) { spParse(en, e.target.value); redraw(); }
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-spdel]");
      if (!b) return;
      const L = S.figs.lit.lit;
      L.sp.entries = L.sp.entries.filter((x) => x.id !== b.dataset.spdel);
      renderSpList();
      renderPreview();
    });
  };

  // ---------- 문헌조사 위치도 ----------
  // 문헌 위치 색: 포털 자료는 구분별, 직접 찍은 것은 돌아가며
  // 문헌 기호 색: 초록은 쓰지 않음(생태·자연도 1등급과 겹치면 구별이 안 됨)
  const LIT_COLORS = { "겨울철 조류 동시 센서스": "#7b2cbf", "습지생물상조사": "#c2255c", "생물측정망": "#1c7ed6" };
  const MAN_COLORS = ["#e8590c", "#d6336c", "#0c8599", "#5f3dc4", "#c92a2a", "#495057", "#1864ab", "#862e9c"];
  // 포털 문헌 표기에 붙은 「7. 」 같은 번호는 떼고 도면에서 다시 매김
  const stripNo = (t) => String(t || "").replace(/^\s*\d+\.\s*/, "").trim();
  // 문헌 목록: 포털 공간자료의 문헌 목록이 있으면 그것(포털과 같은 번호 순서), 없으면 9격자 도엽의 전국자연환경조사(최근 차수 먼저, 도엽은 왼쪽 위부터)
  // + 포털 자료에서 문헌 목록에 없던 위치 + 직접 찍은 것
  const litItems = (L) => {
    const items = [];
    const imp = L.imported;
    if (L.xls) items.push(...L.xls.items);
    else if (imp && imp.items.length) items.push(...imp.items);
    else if (L.grid && S.lit) {
      const codes = [...new Set([...L.grid.cells].sort((a, b) => a.r - b.r || a.c - b.c).map((c) => c.code))];
      const all = codes.flatMap((code) => (S.lit.nes[code] || []).map((t) => ({ t, round: +((t.match(/제(\d+)차/) || [])[1] || 0) })));
      all.sort((a, b) => b.round - a.round).forEach(({ t }) => items.push({ id: `nes:${t}`, src: "nes", cat: "전국자연환경조사", text: t }));
    }
    if (imp && !L.xls) items.push(...imp.extra);
    items.push(...L.manual);
    // 위치 정보가 없어 지도에 찍은 문헌(평가서 등)
    return items.map((it) => (!it.geo && L.picked.has(it.id) ? { ...it, ...L.picked.get(it.id), geoKey: `pick:${it.id}`, picked: true } : it));
  };
  // 사업지구 가운데가 든 칸으로 9격자를 잡고(경계가 바뀌면 다시), 도면에 넣을 문헌(번호 매김)을 f.litRows로
  const prepGrid = async (f) => {
    const L = f.lit;
    try {
      S.lit = S.lit || await Carto.litData();
      const b = U.bboxOf(site().features), lon = (b[0] + b[2]) / 2, lat = (b[1] + b[3]) / 2, key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
      if (L.gridKey !== key) { L.grid = Carto.nineGrid(S.lit.sheets, lon, lat); L.gridKey = key; }
    } catch (err) {
      console.warn(err);
      toast("1:25,000 도엽 자료를 받지 못했습니다.");
    }
  };
  const prepLit = async (f) => {
    const L = f.lit;
    await prepGrid(f);
    f.litRows = litItems(L).filter((it) => !L.hide.has(it.id))
      .map((it, i) => ({ ...it, n: i + 1, text: L.text.has(it.id) ? L.text.get(it.id) : it.text, color: L.colors.get(it.id) || it.color }));
    renderLitList();
  };
  const renderLitList = () => {
    // 문헌 이름을 고치는 중이면 다시 만들지 않음(입력 칸이 바뀌어 글자·한글 조합이 끊김) — 칸에서 나올 때 다시 만듦
    if (document.activeElement && document.activeElement.matches("#lit-list input[data-ltext]")) return;
    const L = S.figs.lit.lit, g = L.grid;
    $("#l-grid-text").textContent = !site() ? "사업지구를 넣으면 9격자(1:25,000 도엽을 3×3으로 나눈 E1~E9 칸)를 잡습니다."
      : !g ? "사업지구 가운데가 1:25,000 도엽 밖(바다 등)이라 9격자를 잡지 못했습니다."
      : `가운데 칸: ${g.center.name && g.center.name !== g.center.code ? `${g.center.name}(${g.center.code})` : g.center.code} ${g.center.id} · 도엽 ${new Set(g.cells.map((c) => c.code)).size}장${L.xls ? ` · ${L.xls.summary}` : ""}${L.imported ? ` · 포털 공간자료(${L.imported.summary})` : ""}`;
    $("#l-clear").hidden = !L.imported && !L.xls;
    let n = 0;
    $("#lit-list").innerHTML = litItems(L).map((it) => {
      const on = !L.hide.has(it.id), col = L.colors.get(it.id) || it.color || "#7b2cbf";
      return `<div class="lit-row ${on ? "" : "off"}">
        <input type="checkbox" data-lshow="${esc(it.id)}" ${on ? "checked" : ""} title="도면에 넣기">
        <span class="tag">${on ? `문헌${++n}` : "뺌"}${on && S.litOut && S.litOut.has(it.id) ? ` <b class="warn" title="위치가 9격자 밖이라 도면에 그리지 않았습니다(문헌자료 표에는 남음)">격자 밖</b>` : ""}</span>
        <input class="input" data-ltext="${esc(it.id)}" value="${esc(L.text.has(it.id) ? L.text.get(it.id) : it.text)}" title="${esc(it.cat)}">
        ${it.geo ? `<input type="color" data-lcolor="${esc(it.id)}" value="${col}" title="기호 색">`
          : it.cat === "전국자연환경조사" ? `<span class="muted small" title="도엽 단위 문헌(위치 기호 없음)">도엽</span>`
          : `<button class="link small" data-lpick="${esc(it.id)}" title="위치 정보가 없는 문헌 — 도면 위를 눌러 위치를 정함">위치 찍기</button>`}
        ${it.src === "man" ? `<button class="link" data-ldel="${esc(it.id)}">지우기</button>` : it.picked ? `<button class="link small" data-lunpick="${esc(it.id)}">위치 지우기</button>` : "<span></span>"}
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
  // ---------- 포털 문헌 엑셀(literature_by_taxon.xlsx의 ‘문헌목록’): 고른 문헌·번호를 그대로, 위치는 문헌 이름으로 찾음 ----------
  const XLS_COLORS = { census: "#7b2cbf", wetland: "#c2255c", station: "#1c7ed6", basin: "#0b7285" };
  // 「…(이름), 2026, 기관」에서 연도 바로 앞 괄호 안(괄호가 겹쳐도 바깥 짝까지: 낙동강(삼랑진-대동), 금산천(양산))
  const lastParen = (t) => {
    const m = String(t).match(/^(.*\)),\s*(?:19|20)\d{2}\b/);
    if (!m) return "";
    const p = m[1];
    for (let i = p.length - 1, d = 0; i >= 0; i--) {
      if (p[i] === ")") d++;
      else if (p[i] === "(" && --d === 0) return p.slice(i + 1, -1).trim();
    }
    return "";
  };
  const normName = (v) => String(v || "").replace(/[\s_()·ㆍ\-\[\]]+/g, "").toLowerCase();
  const readLitXlsx = async (file) => {
    await loadScript(LIB.xlsx, "XLSX");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const pick = wb.SheetNames.find((n) => /문헌/.test(n)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[pick], { header: 1, defval: "" });
    const head = (rows[0] || []).map((v) => String(v).trim());
    const iText = head.indexOf("문헌"), iCat = head.indexOf("구분");
    if (iText < 0) throw new Error("‘문헌’ 열이 있는 문헌 목록 시트를 찾지 못했습니다(BioGrid EIA 문헌 엑셀인지 확인하세요).");
    return rows.slice(1).map((r) => ({ text: stripNo(r[iText]), cat: iCat >= 0 ? String(r[iCat]).trim() : "" })).filter((r) => r.text);
  };
  // 문헌 이름으로 구분과 위치 찾기: 조류센서스 조사지역(이름)·내륙습지(습지명)·생물측정망(지점명, 같은 이름이면 9격자에 가까운 곳)·
  // 전국자연환경조사 하천조사(괄호 안 6자리가 도엽번호가 아니라 유역코드면 그 유역)
  const resolveLit = async (rows, grid) => {
    const sheetCodes = new Set((S.lit ? S.lit.sheets : []).map((x) => x[0]));
    const [cx, cy] = grid ? [(grid.bounds[0] + grid.bounds[2]) / 2, (grid.bounds[1] + grid.bounds[3]) / 2] : [127.5, 36];
    const has = (re) => rows.some((r) => re.test(r.text));
    const [census, wetlands, stations, basins] = await Promise.all([
      has(/조류 동시 센서스/) ? Carto.litPlace("census") : [], has(/습지생물상|내륙습지/) ? Carto.litPlace("wetlands") : [],
      has(/생물측정망/) ? Carto.litPlace("stations") : [], has(/전국자연환경조사/) ? Carto.litPlace("basins") : {}]);
    const wetBy = new Map(wetlands.map((w) => [normName(w[0]), w]));
    const area = (rings) => ({ kind: "area", parts: rings });
    const missing = [];
    const items = await Promise.all(rows.map(async (r, i) => {
      const t = r.text, name = lastParen(t), it = { id: `xls:${i}:${t}`, src: "xls", cat: r.cat, text: t };
      if (/조류 동시 센서스/.test(t)) {
        it.cat = it.cat || "겨울철 조류 동시 센서스";
        const c = census.find((x) => x[0] === name);
        if (c) Object.assign(it, { geo: area(c[1]), geoKey: `census|${name}`, color: XLS_COLORS.census });
      } else if (/습지생물상|내륙습지/.test(t)) {
        it.cat = it.cat || "습지생물상조사";
        const w = wetBy.get(normName(name));
        if (w) Object.assign(it, { geo: area(w[2]), geoKey: `wetland|${w[0]}`, color: XLS_COLORS.wetland });
      } else if (/생물측정망/.test(t)) {
        it.cat = it.cat || "생물측정망";
        const kind = (t.match(/생물측정망\s*(하천|하구)/) || [])[1];
        const st = stations.filter((x) => x[1] === name && (!kind || x[2] === kind)).sort((a, b) => Math.hypot(a[3] - cx, a[4] - cy) - Math.hypot(b[3] - cx, b[4] - cy))[0];
        if (st) Object.assign(it, { geo: { kind: "point", parts: [[[st[3], st[4]]]] }, geoKey: `station|${st[0]}`, color: XLS_COLORS.station });
      } else if (/전국자연환경조사/.test(t) && /^\d{6}$/.test(name) && !sheetCodes.has(name) && basins[name]) {
        it.cat = it.cat || "전국자연환경조사 하천조사";
        try { const b = await Carto.litBasin(name); Object.assign(it, { geo: area(b[2]), geoKey: `basin|${name}`, color: XLS_COLORS.basin, outline: true }); } catch (_) { /* 모양 없음 */ }
      } else if (/전국자연환경조사/.test(t)) it.cat = it.cat || "전국자연환경조사";
      if (!it.cat) it.cat = "기타";
      if (!it.geo && !["전국자연환경조사", "기타"].includes(it.cat)) missing.push(t);
      return it;
    }));
    return { items, missing };
  };
  const importLitXlsx = async (file) => {
    const rows = await readLitXlsx(file);
    if (!rows.length) throw new Error("문헌 목록이 비어 있습니다.");
    const L = S.figs.lit.lit;
    const { items, missing } = await resolveLit(rows, L.grid);
    const geo = items.filter((it) => it.geo).length;
    L.xls = { items, summary: `문헌 엑셀 ${items.length}건, 위치 ${geo}건` };
    L.hide.clear();
    return { n: items.length, geo, missing };
  };
  // 문헌 목록 파일(.json): 직접 찍은 위치·고친 이름·색·뺀 문헌·넣은 포털 자료·선택, 그리고 경계(불러올 때 경계가 없으면 씀)
  const LIT_FILE = "eia-figure-maps/lit";
  const centerId = (L) => (L.grid ? `${L.grid.center.code}_${L.grid.center.id}` : "");
  const saveLit = () => {
    const L = S.figs.lit.lit;
    if (!L.manual.length && !L.text.size && !L.colors.size && !L.hide.size && !L.imported && !L.xls && !L.sp && !L.picked.size) { toast("저장할 것이 없습니다. 위치를 찍거나 문헌 이름을 고친 뒤 저장하세요."); return; }
    const name = $("#site-name").value.trim();
    const data = {
      type: LIT_FILE, version: 1, saved: new Date().toISOString(),
      project: name, siteText: siteText(), site: site() ? site().features : null, center: centerId(L),
      options: { nat: L.nat, table: L.table, sheetName: L.sheetName },
      manual: L.manual, text: [...L.text], colors: [...L.colors], hide: [...L.hide], imported: L.imported, xls: L.xls, sp: L.sp, picked: [...L.picked],
    };
    saveBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `${safeName([name, "문헌조사위치도_목록"].filter(Boolean).join("_"))}.json`);
    toast(`직접 찍은 위치 ${L.manual.length}곳, 고친 이름 ${L.text.size}건을 파일로 저장했습니다.`);
  };
  const loadLit = async (file) => {
    let d;
    try { d = JSON.parse(await file.text()); } catch (_) { throw new Error("문헌 목록 파일(.json)을 읽지 못했습니다."); }
    if (!d || d.type !== LIT_FILE) throw new Error("이 도구에서 저장한 문헌 목록 파일이 아닙니다.");
    let note = "";
    if (!site() && Array.isArray(d.site) && d.site.length && Input.setSite(d.site, "문헌 목록 파일의 경계")) note = " 파일에 있던 경계도 넣었습니다.";
    if (!site()) throw new Error("먼저 사업지구 경계를 넣으세요.");
    const f = S.figs.lit, L = f.lit, str = (v) => typeof v === "string";
    const pairs = (a) => (Array.isArray(a) ? a.filter((p) => Array.isArray(p) && str(p[0]) && str(p[1])) : []);
    L.manual = (Array.isArray(d.manual) ? d.manual : []).filter((m) => m && str(m.id) && m.geo && Array.isArray(m.geo.parts) && ["point", "line", "area"].includes(m.geo.kind));
    L.seq = Math.max(0, ...L.manual.map((m) => +m.id.split(":")[1] || 0));
    L.text = new Map(pairs(d.text));
    L.colors = new Map(pairs(d.colors));
    L.hide = new Set((Array.isArray(d.hide) ? d.hide : []).filter(str));
    L.imported = d.imported && Array.isArray(d.imported.items) && Array.isArray(d.imported.extra) ? d.imported : null;
    L.xls = d.xls && Array.isArray(d.xls.items) ? d.xls : null;
    L.sp = d.sp && Array.isArray(d.sp.entries) ? d.sp : null;
    L.picked = new Map((Array.isArray(d.picked) ? d.picked : []).filter((p) => Array.isArray(p) && str(p[0]) && p[1] && p[1].geo && Array.isArray(p[1].geo.parts)));
    const o = d.options || {};
    ["nat", "sheetName"].forEach((k) => { if (typeof o[k] === "boolean") L[k] = o[k]; });
    if (typeof o.table === "boolean") L.table = o.table ? "below" : "none";
    else if (["below", "page2", "none"].includes(o.table)) L.table = o.table;
    if (str(d.project) && d.project && !$("#site-name").value.trim()) $("#site-name").value = d.project;
    const st = $("#site-text");
    if (str(d.siteText) && d.siteText && !st.dataset.edited) { st.value = d.siteText; st.dataset.edited = "1"; }
    await prepLit(f);
    const differ = d.center && centerId(L) && d.center !== centerId(L);
    return { n: L.manual.length, t: L.text.size, x: L.xls ? L.xls.items.length : 0, note, differ };
  };
  // 문헌 목록 엑셀(도면과 같은 번호): 문헌이 많아 표를 도면 밖에 따로 둘 때
  const litExcel = async () => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    const f = S.figs.lit;
    await prepLit(f);
    const rows = f.litRows || [];
    if (!rows.length) { toast("도면에 넣은 문헌이 없습니다."); return; }
    await loadScript(LIB.xlsx, "XLSX");
    const name = $("#site-name").value.trim(), c = f.lit.grid && f.lit.grid.center;
    const KIND = { point: "지점", line: "선", area: "구역" };
    const aoa = [
      ["문헌조사 위치도 문헌 목록"], [],
      ["사업명", name || "-"],
      ["9격자 가운데 칸", c ? `${c.name && c.name !== c.code ? `${c.name}(${c.code})` : c.code} ${c.id}` : "-"], [],
      ["번호", "구분", "문헌", "도면 표시"],
      ...rows.map((r) => [`문헌${r.n}`, r.cat || "", r.text, r.geo ? KIND[r.geo.kind] || "" : "도엽"]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 80 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "문헌 목록");
    saveBlob(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName([name, "문헌조사위치도_문헌목록"].filter(Boolean).join("_"))}.xlsx`);
  };
  const initLit = () => {
    $("#l-save").addEventListener("click", saveLit);
    $("#l-xlsx").addEventListener("click", () => litExcel().catch((err) => { console.error(err); toast(err.message || "엑셀을 만들지 못했습니다."); }));
    $("#l-load").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const r = await loadLit(file);
        if (S.cur !== "lit" && S.cur !== "sp") S.cur = "lit";
        syncControls();
        setView("preview");
        toast(`${r.x ? `문헌 엑셀 ${r.x}건, ` : ""}직접 찍은 위치 ${r.n}곳, 고친 이름 ${r.t}건을 불러왔습니다.${r.note}${r.differ ? " 저장할 때와 9격자 가운데 칸이 다릅니다 — 경계가 바뀌었는지 확인하세요." : ""}`, r.differ ? 8000 : 4000);
      } catch (err) {
        console.error(err);
        toast(err.message || "문헌 목록 파일을 읽지 못했습니다.");
      }
    });
    $("#l-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
      try {
        if (!S.figs.lit.lit.grid || !S.lit) await prepLit(S.figs.lit);
        if (/\.xlsx?$/i.test(file.name)) {
          const r = await importLitXlsx(file);
          toast(`문헌 엑셀에서 문헌 ${r.n}건(위치 ${r.geo}건)을 넣었습니다.${r.missing.length ? ` 위치를 찾지 못한 문헌 ${r.missing.length}건: ${r.missing.slice(0, 3).join(" / ")}${r.missing.length > 3 ? " …" : ""}` : ""}`, r.missing.length ? 9000 : 4000);
        } else {
          const r = await importLit(file);
          toast(`${r.cnt} 위치와 문헌 ${r.n}건을 넣었습니다.${r.mismatch ? " 넣은 자료의 9격자가 이 사업지구의 9격자와 다릅니다 — 포털에서 다른 위치로 받은 자료인지 확인하세요." : ""}`, r.mismatch ? 8000 : 4000);
        }
        // 법정보호종 출현위치도에서 넣었으면 그 탭에 그대로
        if (S.cur !== "lit" && S.cur !== "sp") { S.cur = "lit"; syncControls(); }
        setView("preview");
      } catch (err) {
        console.error(err);
        toast(err.message || "공간자료를 읽지 못했습니다.");
      }
    });
    $("#l-clear").addEventListener("click", () => { const L = S.figs.lit.lit; L.imported = null; L.xls = null; L.hide.clear(); renderPreview(); renderLitList(); });
    const box = $("#lit-list"), L = () => S.figs.lit.lit;
    box.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.lshow) { if (t.checked) L().hide.delete(t.dataset.lshow); else L().hide.add(t.dataset.lshow); renderPreview(); renderLitList(); }
      if (t.dataset.lcolor) { L().colors.set(t.dataset.lcolor, t.value); renderPreview(); }
      if (t.dataset.ltext) setTimeout(() => { if (!document.activeElement.closest("#lit-list input[data-ltext]")) renderLitList(); }, 0);
    });
    box.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.ltext) { L().text.set(t.dataset.ltext, t.value); rerender(); }
    });
    box.addEventListener("click", (e) => {
      const pk = e.target.closest("button[data-lpick]"), up = e.target.closest("button[data-lunpick]");
      if (pk) { A.target = pk.dataset.lpick; startArrow("lit-pick"); return; }
      if (up) { L().picked.delete(up.dataset.lunpick); renderPreview(); renderLitList(); return; }
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
  const fileName = (f, ext, tail = "") => {
    const name = $("#site-name").value.trim();
    return `${safeName([name, f.title || (f.kind === "sat" ? "위성사진현황도" : "생태축현황도")].filter(Boolean).join("_"))}_${f.paper}${f.orient === "port" ? "세로" : "가로"}_1-${f.scale}${tail}.${ext}`;
  };
  const exportFig = async (type) => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    if (S.busy) return;
    S.busy = true;
    $$("[data-dl]").forEach((b) => { b.disabled = true; });
    const f = fig();
    f.siteText = siteText();
    f.ecoKey = ecoKey();
    if (f.kind === "lit" || f.kind === "sp") await prepLit(f);
    if (f.kind === "sp") prepSp(f);
    if (f.kind === "pa") await prepGrid(f);
    if (f.kind === "field") prepField(f);
    if (OCC[f.kind]) { await occList(f.kind).catch(() => null); prepOcc(f); }
    resolveScale(f);
    const dpi = +$("#o-dpi").value;
    const k = dpi / 25.4;
    const Lo = Carto.layout(f);
    const ctl = { onTiles: (p) => progress(0.05 + p * 0.75, `위성영상 받는 중 ${Math.round(p * 100)}%`), osmWait: 60000 };
    try {
      progress(0.03, "자료 받는 중…");
      // 문헌자료 표를 둘째 쪽에 두면: PDF는 두 쪽 한 파일, PNG·SVG는 도면과 문헌자료 두 파일
      const two = twoPages(f);
      let blob, blob2 = null, out;
      if (type === "svg") {
        const pen = new Carto.SvgPen(Lo.W, Lo.H);
        out = await Carto.render(pen, f, site(), Math.min(k, 300 / 25.4), ctl);
        progress(0.9, "파일 만드는 중…");
        blob = new Blob([pen.toString()], { type: "image/svg+xml" });
        if (two) {
          const pen2 = new Carto.SvgPen(Lo.W, Lo.H);
          await Carto.renderLitPage(pen2, f);
          blob2 = new Blob([pen2.toString()], { type: "image/svg+xml" });
        }
      } else {
        const page = () => { const c = document.createElement("canvas"); c.width = Math.round(Lo.W * k); c.height = Math.round(Lo.H * k); return c; };
        const cv = page();
        out = await Carto.render(new Carto.CanvasPen(cv.getContext("2d"), k), f, site(), k, ctl);
        let cv2 = null;
        if (two) { cv2 = page(); await Carto.renderLitPage(new Carto.CanvasPen(cv2.getContext("2d"), k), f); }
        progress(0.9, "파일 만드는 중…");
        if (type === "png") {
          blob = await withDpi(await new Promise((r) => cv.toBlob(r, "image/png")), dpi);
          if (cv2) blob2 = await withDpi(await new Promise((r) => cv2.toBlob(r, "image/png")), dpi);
        } else {
          await loadScript(LIB.jspdf, "jspdf");
          const orient = Lo.W > Lo.H ? "landscape" : "portrait";
          const doc = new jspdf.jsPDF({ orientation: orient, unit: "mm", format: f.paper.toLowerCase(), compress: true });
          doc.setProperties({ title: f.title || "도면", creator: "사업지 도면 만들기" });
          doc.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, Lo.W, Lo.H, undefined, "FAST");
          if (cv2) {
            doc.addPage(f.paper.toLowerCase(), orient);
            doc.addImage(cv2.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, Lo.W, Lo.H, undefined, "FAST");
          }
          blob = doc.output("blob");
        }
      }
      if (out && out.warn.length) toast(out.warn.join(" "), 6000);
      saveBlob(blob, fileName(f, type, blob2 ? "_1쪽도면" : ""));
      // 브라우저가 연달아 받기를 막지 않게 조금 띄움
      if (blob2) setTimeout(() => saveBlob(blob2, fileName(f, type, "_2쪽문헌자료")), 700);
      progress(1, `${type.toUpperCase()} 받기 완료 (${fmt((blob.size + (blob2 ? blob2.size : 0)) / 1048576, 1)} MB${blob2 ? ", 2개 파일" : two ? ", 2쪽" : ""})`);
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
  // 이 도구에는 로그인 칸이 없음: 브라우저가 글자 칸을 아이디 칸으로 보고 저장된 계정·주소를 띄우지 않게 자동 채우기를 끔
  // (나중에 그리는 목록 칸도 누를 때 끔)
  const noFill = (el) => { if (el.matches && el.matches("input:not([type=checkbox]):not([type=file]):not([type=radio])")) { el.setAttribute("autocomplete", "off"); el.setAttribute("data-lpignore", "true"); el.setAttribute("data-form-type", "other"); } };
  $$("input").forEach(noFill);
  document.addEventListener("focusin", (e) => noFill(e.target), true);
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
    if (L.imported || L.xls || L.sp) { L.imported = null; L.xls = null; L.sp = null; L.hide.clear(); toast("경계가 바뀌어 넣었던 BioGrid EIA 자료(문헌 엑셀·공간자료·법정보호종)를 뺐습니다. 새 경계로 받은 자료를 다시 넣어 주세요.", 5000); }
    L.gridKey = "";
    const FD = S.figs.field.field;
    if (!FD.rangesEdited) FD.ranges = null;
    renderFieldPane();
    renderLitList();
    scaleOptions();
    if (s) setView("preview"); else renderPreview();
  };
  // 출현위치도 설정 칸은 같은 꼴이라 여기서 만듦(syncControls 전에)
  Object.keys(OCC).forEach((k) => { $(`#${k}-pane`).innerHTML = occPaneHtml(k); });
  syncControls();
  $$("#fig-tabs button").forEach((b) => b.addEventListener("click", () => {
    stopArrow();
    S.cur = b.dataset.fig;
    syncControls();
    if (site()) setView("preview");
  }));
  $$("#view-tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $$(".side select, .side input[type=checkbox]").forEach((el) => {
    if (el.closest("[data-pane]") || el.id === "o-dpi" || el.id === "s-where" || el.closest("#label-list") || el.closest("#lit-list") || el.closest("#field-pane") || el.closest(".occ-pane") || el.type === "file") return;
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
  initPa();
  paSummary(null);
  initSp();
  renderSpList();
  initField();
  Object.keys(OCC).forEach(initOcc);
  $$("#page-tabs button").forEach((b) => b.addEventListener("click", () => {
    S.page = +b.dataset.page;
    syncPageTabs();
    if (S.view !== "preview") setView("preview"); else renderPreview();
  }));
  window.addEventListener("resize", debounce(() => { if (S.view === "preview") renderPreview(); }, 300));
  document.addEventListener("keydown", (e) => {
    if (!A.mode) return;
    if (e.key === "Enter") finishArrow();
    if (e.key === "Escape") stopArrow();
  });
  window.App = { S, renderPreview, exportFig, ecoKey };
})();
