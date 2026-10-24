// 화면 — 도면 설정, 미리보기(끌어서 가운데 옮기기·축 화살표 그리기), 이름표 고치기, PNG·PDF·SVG 받기
(() => {
  const { $, $$, esc, fmt, debounce, toast, LIB, loadScript, saveBlob, safeName } = U;
  const { IN } = Input;

  const TITLES = { sat: "위성사진 현황도", eco: "생태축 현황도", nat: "생태·자연도", veg: "한국 식생기후대 분포도", flo: "한국 식물상 지역" };
  const newFig = (kind) => ({
    kind, paper: "A4", orient: Carto.NATIONAL.includes(kind) ? "port" : "land", scaleMode: "auto", scale: 5000, offset: [0, 0],
    basemap: kind === "nat" ? "vwhite" : "sat", base: 0, gray: false, baseLabels: false,
    title: TITLES[kind],
    el: { title: true, north: true, scalebar: true, legend: true, source: true, sitelabel: kind === "sat", grid: "none" },
    rings: [1, 2],
    eco: { forest: true, water: true, sea: true, tidal: false, rzone: true, szone: true, peaks: true, wnames: true, flow: true, streams: true, rings: false, forestName: "산림생태계", waterName: "수생태계" },
    nat: { g1: true, g2: true, sep: true, rings: false },
    natl: { inset: true },
    arrows: [], labelHide: new Set(), labelText: new Map(),
  });
  const S = { cur: "sat", figs: Object.fromEntries(Object.keys(TITLES).map((k) => [k, newFig(k)])), view: "map", last: null, busy: false };
  const fig = () => S.figs[S.cur];
  const site = () => IN.site;
  const resolveScale = (f) => { if (f.scaleMode === "auto") f.scale = Carto.autoScale(f, site()); return f.scale; };

  // ---------- 설정 칸 ↔ 도면 ----------
  const CHECKS = { "o-forest": ["eco", "forest"], "o-water": ["eco", "water"], "o-tidal": ["eco", "tidal"], "o-sea": ["eco", "sea"], "o-rzone": ["eco", "rzone"], "o-szone": ["eco", "szone"],"o-peaks": ["eco", "peaks"], "o-wnames": ["eco", "wnames"], "o-flow": ["eco", "flow"],
    "o-streams": ["eco", "streams"], "o-eco-rings": ["eco", "rings"], "e-title": ["el", "title"], "e-north": ["el", "north"], "e-scalebar": ["el", "scalebar"],
    "e-legend": ["el", "legend"], "e-source": ["el", "source"], "e-sitelabel": ["el", "sitelabel"],
    "o-gray": ["", "gray"], "o-labels": ["", "baseLabels"],
    "n-g1": ["nat", "g1"], "n-g2": ["nat", "g2"], "n-sep": ["nat", "sep"], "n-rings": ["nat", "rings"], "v-inset": ["natl", "inset"] };
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
        onLate: (ok) => { if (my !== gen) return; if (ok) renderPreview(); else status("이름·하천 자료를 받지 못해 이름표 없이 그렸습니다."); },
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

  // ---------- 축 화살표 그리기 ----------
  const A = { mode: null, pts: [] };
  const arrowName = (k) => (k === "forest" ? "산림축" : "수계축");
  const startArrow = (kind) => {
    if (!site()) { toast("먼저 사업지구 경계를 넣으세요."); return; }
    if (S.view !== "preview") setView("preview");
    A.mode = kind;
    A.pts = [];
    $("#pv-over").classList.add("drawing");
    $("#arrow-bar").hidden = false;
    $$("[data-arrow]").forEach((b) => b.classList.toggle("on", b.dataset.arrow === kind));
    arrowMsg();
    drawArrowTemp();
  };
  const stopArrow = () => {
    A.mode = null;
    A.pts = [];
    $("#pv-over").classList.remove("drawing");
    $("#arrow-bar").hidden = true;
    $$("[data-arrow]").forEach((b) => b.classList.remove("on"));
    drawArrowTemp();
  };
  const arrowMsg = () => { $("#arrow-msg").textContent = `${arrowName(A.mode)} 점 ${A.pts.length}개${A.pts.length < 2 ? " — 2개 이상 찍으세요(마지막 점이 화살 머리)" : ""}`; };
  const finishArrow = () => {
    if (A.pts.length < 2) { toast("점을 2개 이상 찍으세요."); return; }
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
      arrowMsg();
      drawArrowTemp();
    });
    over.addEventListener("dblclick", (e) => { if (A.mode) { e.preventDefault(); finishArrow(); } });
    $$("[data-arrow]").forEach((b) => b.addEventListener("click", () => (A.mode === b.dataset.arrow ? stopArrow() : startArrow(b.dataset.arrow))));
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
    if (el.closest("[data-pane]") || el.id === "o-dpi" || el.closest("#label-list")) return;
    el.addEventListener("change", () => { readControls(); if (el.id !== "o-scale") scaleOptions(); renderPreview(); });
  });
  $("#site-text").addEventListener("input", (e) => { e.target.dataset.edited = e.target.value.trim() ? "1" : ""; rerender(); });
  ["o-title", "o-rings", "o-forest-name", "o-water-name"].forEach((id) => $(`#${id}`).addEventListener("input", () => { readControls(); rerender(); }));
  $$("[data-dl]").forEach((b) => b.addEventListener("click", () => exportFig(b.dataset.dl)));
  initPan();
  initWheel();
  initArrow();
  initLabels();
  window.addEventListener("resize", debounce(() => { if (S.view === "preview") renderPreview(); }, 300));
  document.addEventListener("keydown", (e) => {
    if (!A.mode) return;
    if (e.key === "Enter") finishArrow();
    if (e.key === "Escape") stopArrow();
  });
  window.App = { S, renderPreview, exportFig };
})();
