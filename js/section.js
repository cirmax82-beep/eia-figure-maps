// 하천식생단면도 — 지형 특징을 나타내는 개념도(거리·높이는 비례하지 않음). 좌안·우안은 하류 방향을 보고 왼쪽·오른쪽.
// 지형은 단위 좌표(가로, 높이 — 하상 0)로 꺾은선을 만든 뒤 그림 틀에 맞춰 늘리고, 그 위에 호안·제내지·생활형별 식생 기호를 그림.
// 펜은 지도 도면과 같음(Carto.CanvasPen·SvgPen, 용지 mm)
(() => {
  const { textW, PT } = Carto;

  // ---------- 고를 것 ----------
  const FORMS = [
    ["tallgrass", "키 큰 벼과(갈대·달뿌리풀·억새)"], ["emergent", "정수식물(줄·창포)"], ["cattail", "부들류"], ["sedge", "고랭이·사초·골풀"],
    ["grass", "낮은 벼과(강아지풀·바랭이)"], ["forb", "키 큰 풀(쑥·개망초·소리쟁이)"], ["flower", "꽃 피는 풀(코스모스·금계국)"], ["lowherb", "낮은 풀(고마리·여뀌)"],
    ["vine", "덩굴(환삼덩굴·칡)"], ["shrub", "관목(갯버들·찔레)"], ["tree", "활엽수 교목(버드나무·아까시나무)"], ["conifer", "침엽수 교목(소나무·잣나무·낙엽송)"], ["floating", "부엽·부유(마름·개구리밥)"],
  ];
  // 위치는 왼쪽(좌안)에서 오른쪽(우안) 차례 — 번호 매기는 차례도 이것
  const ZONES = [
    ["L-land", "좌안 제내지(둑 밖)"], ["L-crest", "좌안 둑마루"], ["L-slope", "좌안 제방 사면"], ["L-berm", "좌안 둔치"], ["L-edge", "좌안 물가"], ["L-water", "좌안 쪽 물속"],
    ["bar", "하중도·사주"], ["surface", "물 위(가운데)"],
    ["R-water", "우안 쪽 물속"], ["R-edge", "우안 물가"], ["R-berm", "우안 둔치"], ["R-slope", "우안 제방 사면"], ["R-crest", "우안 둑마루"], ["R-land", "우안 제내지(둑 밖)"],
  ];
  const AMT = [["few", "적게"], ["mid", "보통"], ["many", "많이"]];
  const LAND = [["none", "없음(평지)"], ["farm", "농경지"], ["house", "주거지"], ["building", "건물"], ["road", "도로"], ["bike", "자전거도로"], ["forest", "산림(평지)"], ["mountain", "산림(산지 경사)"], ["park", "공원·산책로"]];
  const LAND_NAME = { farm: "농경지", house: "주거지", building: "건물", road: "도로", bike: "자전거도로", forest: "산림", mountain: "산림", park: "공원" };
  const REV = [["natural", "자연 사면(흙)"], ["riprap", "사석·돌붙임(경사)"], ["block", "블록·콘크리트(경사)"], ["stonewall", "돌쌓기(직립)"], ["wall", "콘크리트 옹벽(직립)"]];
  const BANKS = [["low", "낮게"], ["mid", "보통"], ["high", "높게"]];
  const SLOPES = [["gentle", "완만하게"], ["mid", "보통"], ["steep", "급하게"], ["vsteep", "아주 급하게"]];
  const BERMS = [["none", "없음"], ["narrow", "좁게"], ["wide", "넓게"]];
  // 물가: 소하천은 물가가 거의 없거나 좁고 낮아 수폭이 하폭과 거의 같음
  const EDGES = [["natural", "자연(흙·모래)"], ["low", "좁고 낮게"], ["none", "없음(물이 호안까지)"], ["riprap", "사석·자갈"]];
  const WIDTHS = [["xnarrow", "아주 좁게"], ["narrow", "좁게"], ["mid", "보통"], ["wide", "넓게"]];
  const DEPTHS = [["xshallow", "아주 얕게"], ["shallow", "얕게"], ["mid", "보통"], ["deep", "깊게"], ["dry", "건천(물 없음)"]];
  // 하천 유형 빠른 설정: 하도·물가·사면·둔치·제내지 폭만 바꿈(호안 종류·제내지 이용·식생은 그대로)
  const PRESETS = [["small", "소하천(좁은 하도·높은 둑)"], ["local", "지방하천"], ["large", "넓은 하천(둔치 있음)"]];
  const PRESET = {
    small: { water: { w: "xnarrow", d: "xshallow", bed: "flat", bar: "none" }, side: { slope: "steep", berm: "none", edge: "none", landW: "wide", bank: "mid" } },
    local: { water: { w: "narrow", d: "shallow", bed: "u" }, side: { slope: "mid", berm: "narrow", edge: "low", landW: "mid", bank: "mid" } },
    large: { water: { w: "wide", d: "mid", bed: "u" }, side: { slope: "gentle", berm: "wide", edge: "natural", landW: "mid", bank: "mid" } },
  };
  const applyPreset = (st, k) => {
    const p = PRESET[k];
    if (!p) return;
    Object.assign(st.water, p.water);
    ["L", "R"].forEach((sd) => Object.assign(st[sd], p.side));
  };
  const MATS = [["none", "모래·흙"], ["gravel", "자갈"], ["cobble", "호박돌"], ["boulder", "거석"], ["mix", "호박돌 + 거석"], ["rock", "암반"]];
  const LANDWS = [["narrow", "좁게"], ["mid", "보통"], ["wide", "넓게"]];
  const BEDS = [["u", "둥글게"], ["flat", "평평하게"]];
  const BARS = [["none", "없음"], ["left", "좌안 쪽"], ["center", "가운데"], ["right", "우안 쪽"]];
  const SIZES = [["180x80", "가로 180×80 mm"], ["180x100", "가로 180×100 mm"], ["160x120", "가로 160×120 mm"], ["a4", "A4 가로(297×210 mm)"]];
  const SIZE_MM = { "180x80": [180, 80], "180x100": [180, 100], "160x120": [160, 120], a4: [297, 210] };
  const LABELS = [["name", "식물 이름"], ["num", "번호 + 아래 목록"]];
  const STYLES = [["color", "컬러"], ["mono", "흑백 선화"]];
  const GROUNDS = [["soil", "흙색"], ["line", "흰 바탕 선"], ["hatch", "회색 빗금"]];
  const WATERS = [["fill", "파란 물"], ["wl", "파란 물 + W.L"], ["line", "수위선만"]];

  // 자주 나오는 하천 식물 → 생활형(이름을 적으면 생활형을 맞춰 줌, 고칠 수 있음)
  const SPECIES = {};
  const put = (form, names) => names.split(" ").forEach((n) => { SPECIES[n] = form; });
  put("tallgrass", "갈대 달뿌리풀 억새 물억새 갈풀 큰기름새");
  put("emergent", "줄 창포 미나리 택사 보풀 물옥잠 고랭이줄");
  put("cattail", "부들 애기부들 큰부들");
  put("sedge", "큰고랭이 세모고랭이 송이고랭이 골풀 매자기 방동사니 참방동사니 사초 괭이사초 왕골");
  put("grass", "강아지풀 금강아지풀 바랭이 왕바랭이 개밀 털빕새귀리 쇠뜨기 뚝새풀 개기장 돌피 피 수크령 띠");
  put("forb", "쑥 개망초 망초 큰망초 소리쟁이 참소리쟁이 미국가막사리 가막사리 돼지풀 단풍잎돼지풀 익모초 명아주 흰명아주 도꼬마리 미국쑥부쟁이 쑥부쟁이 개쑥갓 비짜루국화");
  put("flower", "코스모스 금계국 큰금계국 달맞이꽃 노랑꽃창포 뚱딴지 원추천인국 개양귀비 붓꽃");
  put("lowherb", "고마리 여뀌 흰여뀌 명아자여뀌 이삭여뀌 개여뀌 바보여뀌 토끼풀 냉이 닭의장풀 쇠비름 별꽃 물냉이 돌미나리 애기똥풀");
  put("vine", "환삼덩굴 칡 사위질빵 가시박 며느리배꼽 며느리밑씻개 새삼 돌콩 덩굴");
  put("shrub", "갯버들 키버들 찔레꽃 찔레 국수나무 싸리 족제비싸리 산딸기 조팝나무");
  put("tree", "버드나무 왕버들 선버들 능수버들 수양버들 아까시나무 느티나무 오리나무 물오리나무 팽나무 가중나무 신나무 은행나무 벚나무");
  put("conifer", "소나무 곰솔 해송 리기다소나무 잣나무 낙엽송 일본잎갈나무 메타세쿼이아 삼나무 편백 전나무 측백나무 향나무 가문비나무 스트로브잣나무");
  put("floating", "마름 개구리밥 좀개구리밥 노랑어리연꽃 자라풀 가래 생이가래 물달개비");
  const formOf = (name) => {
    const n = String(name || "").replace(/\s/g, "");
    if (SPECIES[n]) return SPECIES[n];
    const hit = Object.keys(SPECIES).sort((a, b) => b.length - a.length).find((k) => k.length >= 2 && n.includes(k));
    return hit ? SPECIES[hit] : null;
  };
  // 꽃·이삭 색(컬러일 때)
  const ACCENT = { 코스모스: "#e64980", 개양귀비: "#e03131", 금계국: "#f59f00", 큰금계국: "#f59f00", 달맞이꽃: "#fcc419", 노랑꽃창포: "#fab005", 뚱딴지: "#fab005", 원추천인국: "#f59f00",
    붓꽃: "#7048e8", 고마리: "#f06595", 여뀌: "#e599a7", 흰여뀌: "#f1f3f5", 명아자여뀌: "#e599a7", 이삭여뀌: "#c2255c", 개여뀌: "#d6336c", 토끼풀: "#f8f9fa", 닭의장풀: "#4dabf7",
    애기똥풀: "#fcc419", 노랑어리연꽃: "#fcc419", 미국쑥부쟁이: "#f8f9fa", 쑥부쟁이: "#b197fc", 억새: "#e3d9c4", 물억새: "#ece6d6" };
  const DOCK = /소리쟁이/;      // 갈색 열매 이삭

  // ---------- 새 지점 ----------
  const side = (o) => ({ land: "none", landW: "mid", landText: "", bank: "mid", rev: "natural", slope: "mid", berm: "none", edge: "natural", ...o });
  const veg = (name, zone, amt = "mid") => ({ name, form: formOf(name) || "forb", zone, amt, auto: true });
  let seq = 0;
  const newStation = (n, example) => ({
    id: `s${Date.now().toString(36)}${(seq++).toString(36)}`, name: `St.${n}`, river: "", loc: "",
    water: { w: "mid", d: "mid", bed: "u", bar: "none", mat: "none", wText: "", hText: "" },
    L: side(example ? { land: "house", rev: "riprap", berm: "narrow" } : {}),
    R: side(example ? { land: "bike", berm: "wide", slope: "gentle" } : {}),
    veg: example ? [veg("쑥", "L-crest"), veg("환삼덩굴", "L-slope"), veg("고마리", "L-berm"), veg("달뿌리풀", "L-edge"), veg("줄", "L-water"),
      veg("갈대", "R-water"), veg("갯버들", "R-edge", "few"), veg("버드나무", "R-berm", "few"), veg("개망초", "R-slope"), veg("칡", "R-slope")] : [],
    note: "",
  });
  const newSec = () => ({ list: [newStation(1, true)], cur: 0, size: "180x100", label: "name", style: "color", ground: "soil", water: "wl", sides: true, info: true, frame: true });
  const cur = (S) => S.list[Math.max(0, Math.min(S.list.length - 1, S.cur | 0))];

  // ---------- 도움 ----------
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  // 굽은 줄기: (x, y)에서 ang(도 — 위 0, 오른쪽 +) 방향으로 len, 끝으로 갈수록 bend(도)만큼 휨
  const curve = (x, y, ang, len, bend, n = 8) => {
    const p = [[x, y]];
    for (let i = 1; i <= n; i++) { const t = i / n, a = ((ang + bend * t * t) * Math.PI) / 180, q = p[i - 1]; p.push([q[0] + (Math.sin(a) * len) / n, q[1] - (Math.cos(a) * len) / n]); }
    return p;
  };
  // 잎·이삭: 가운데 선을 따라 폭 w(peak 자리가 가장 넓음, fat이 작을수록 끝까지 두꺼움)
  const lens = (c, w, peak = 0.5, fat = 1) => {
    const a = Math.log(0.5) / Math.log(peak), L = [], R = [];
    c.forEach((q, i) => {
      const j = Math.min(c.length - 1, i + 1), k = Math.max(0, i - 1), dx = c[j][0] - c[k][0], dy = c[j][1] - c[k][1], d = Math.hypot(dx, dy) || 1;
      const ww = (w / 2) * Math.sin(Math.PI * (i / (c.length - 1)) ** a) ** fat;
      L.push([q[0] - (dy / d) * ww, q[1] + (dx / d) * ww]);
      R.push([q[0] + (dy / d) * ww, q[1] - (dx / d) * ww]);
    });
    return [...L, ...R.reverse()];
  };
  const ellipse = (x, y, rx, ry, rot = 0, n = 18) => {
    const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
    return Array.from({ length: n }, (_, k) => { const t = (k / n) * 2 * Math.PI, u = rx * Math.cos(t), v = ry * Math.sin(t); return [x + u * c - v * s, y + u * s + v * c]; });
  };
  const circle = (x, y, r, n = 18) => ellipse(x, y, r, r, 0, n);
  const shape = (fill, line, w) => ({ closed: true, fill, stroke: line, width: w, join: "round" });
  const at = (pts, i) => pts[Math.max(0, Math.min(pts.length - 1, Math.round(i)))];

  // ---------- 색 ----------
  const colors = (form, name, mono) => {
    const n = String(name || "").replace(/\s/g, ""), acc = ACCENT[n];
    if (mono) return { stem: "#222222", leaf: "#ffffff", line: "#222222", plume: "#e2e2e2", plumeLine: "#222222", spike: "#555555", spikeLine: "#222222",
      accent: "#ffffff", accentLine: "#222222", core: "#222222", crown: "#ffffff", trunk: "#ffffff", lw: 0.14 };
    const C = { stem: "#5c8a35", leaf: "#6f9d41", line: "#46702a", plume: "#a8835a", plumeLine: "#7a5a36", spike: "#8c6b3c", spikeLine: "#5e4626",
      accent: acc || "#ffffff", accentLine: "#868e96", core: "#f2c230", crown: "#6fa244", trunk: "#7a5a3a", lw: 0.12 };
    if (form === "tallgrass") Object.assign(C, { stem: "#6f8f3a", leaf: "#7fa043", line: "#55702c" }, acc ? { plume: acc, plumeLine: "#9c917a" } : {});
    if (form === "emergent") Object.assign(C, { leaf: "#5a9a3e", line: "#3e7228" });
    if (form === "cattail") Object.assign(C, { leaf: "#669e3f", line: "#45732a", spike: "#7b4a23", spikeLine: "#4f2e14" });
    if (form === "sedge") Object.assign(C, { stem: "#5e8a3c" });
    if (form === "grass") Object.assign(C, { leaf: "#86ad45", line: "#5d8130", spike: "#b5a46a", spikeLine: "#857646" });
    if (form === "forb" && DOCK.test(n)) Object.assign(C, { accent: "#8b4a1f", accentLine: "#5c2f12" });
    if (form === "flower") Object.assign(C, { leaf: "#64983c", accent: acc || "#e64980", accentLine: "#ffffff", core: /^#f[5-9a-c]/i.test(acc || "") ? "#8a5a00" : "#ffd43b" });
    if (form === "lowherb") Object.assign(C, { leaf: "#77b255", line: "#4d8233", accent: acc || "#f06595", accentLine: "#ffffff" });
    if (form === "vine") Object.assign(C, { leaf: /칡/.test(n) ? "#4f8f2f" : "#63a33a", line: "#3d7222", stem: "#4c7a2a" });
    if (form === "shrub") Object.assign(C, { crown: "#7aa84a", line: "#4e7a2e", stem: "#6b5136" });
    if (form === "tree") Object.assign(C, { crown: "#4f8f3a", line: "#2f6122", trunk: "#7a5a3a", leaf: "#5d9a3e" });
    if (form === "conifer") Object.assign(C, { crown: "#3d7340", line: "#23502a", trunk: "#7a5a3a" });
    if (form === "floating") Object.assign(C, { leaf: "#4f9a4a", line: "#2f6b2e", accent: acc || null });
    return C;
  };

  // ---------- 식생 기호(밑동 x, y — 높이 h, mm). 돌려주는 값: 꼭대기 y와 반폭 ----------
  const G = {
    tallgrass(pen, x, y, h, R, C) {
      for (let i = 0; i < 5; i++) {
        const lean = (i - 2) * 6 + (R() - 0.5) * 8, st = curve(x + (i - 2) * 0.22, y, lean, h * (0.75 + R() * 0.25), lean * 0.5);
        pen.path([st], { stroke: C.stem, width: 0.26 });
        [0.3, 0.55].forEach((t, k) => {
          const q = at(st, (st.length - 1) * t), sd = (i + k) % 2 ? 1 : -1;
          pen.path([lens(curve(q[0], q[1], lean + sd * 45, h * 0.26, sd * 45, 6), h * 0.04)], shape(C.leaf, C.line, C.lw));
        });
        const top = st[st.length - 1], sd = lean >= 0 ? 1 : -1;
        pen.path([lens(curve(top[0], top[1], lean + sd * 10, h * 0.22, sd * 100, 7), h * 0.085, 0.65)], shape(C.plume, C.plumeLine, C.lw));
      }
      return { top: y - h * 1.02, half: h * 0.32 };
    },
    emergent(pen, x, y, h, R, C) {
      for (let i = 0; i < 9; i++) {
        const a = -32 + i * 8 + (R() - 0.5) * 6;
        pen.path([lens(curve(x + (R() - 0.5) * 0.6, y, a, h * (0.6 + R() * 0.4), a * 0.9), h * 0.05)], shape(C.leaf, C.line, C.lw));
      }
      return { top: y - h * 0.95, half: h * 0.35 };
    },
    cattail(pen, x, y, h, R, C) {
      for (let i = 0; i < 7; i++) {
        const a = -21 + i * 7 + (R() - 0.5) * 5;
        pen.path([lens(curve(x + (R() - 0.5) * 0.5, y, a, h * (0.55 + R() * 0.35), a * 0.5), h * 0.045)], shape(C.leaf, C.line, C.lw));
      }
      [-1, 1].forEach((sd) => {
        const st = curve(x + sd * 0.3, y, sd * 3 + (R() - 0.5) * 3, h * (0.88 + R() * 0.12), 0, 10);
        pen.path([st], { stroke: C.line, width: 0.22 });
        pen.path([lens(st.slice(7, 10), h * 0.075, 0.5, 0.25)], shape(C.spike, C.spikeLine, C.lw));
      });
      return { top: y - h, half: h * 0.25 };
    },
    sedge(pen, x, y, h, R, C) {
      for (let i = 0; i < 8; i++) {
        const a = -14 + i * 4 + (R() - 0.5) * 4, st = curve(x + (i - 3.5) * 0.15, y, a, h * (0.7 + R() * 0.3), a * 0.3, 5);
        pen.path([st], { stroke: C.stem, width: 0.2 });
        if (i % 2 === 0) { const t = st[st.length - 1]; for (let k = 0; k < 3; k++) pen.path([ellipse(t[0] + (k - 1) * 0.45, t[1] + 0.3 + Math.abs(k - 1) * 0.4, 0.3, 0.6, (k - 1) * 25, 10)], shape(C.spike, C.spikeLine, C.lw)); }
      }
      return { top: y - h, half: h * 0.15 };
    },
    grass(pen, x, y, h, R, C) {
      for (let i = 0; i < 9; i++) { const a = -50 + i * 12 + (R() - 0.5) * 8; pen.path([lens(curve(x, y, a, h * (0.45 + R() * 0.45), a * 0.8, 6), h * 0.06)], shape(C.leaf, C.line, C.lw)); }
      [-1, 0.3, 1].forEach((sd) => {
        const st = curve(x + sd * 0.3, y, sd * 10, h * (0.95 + R() * 0.2), sd * 12, 6);
        pen.path([st], { stroke: C.line, width: 0.16 });
        const t = st[st.length - 1];
        pen.path([lens(curve(t[0], t[1], sd * 14, h * 0.35, sd * 40, 6), h * 0.1, 0.5, 0.5)], shape(C.spike, C.spikeLine, C.lw));
      });
      return { top: y - h * 1.3, half: h * 0.5 };
    },
    forb(pen, x, y, h, R, C, nm) {
      const st = curve(x, y, (R() - 0.5) * 6, h, (R() - 0.5) * 10, 10);
      pen.path([st], { stroke: C.stem, width: 0.3 });
      for (let k = 1; k <= 5; k++) { const q = at(st, k * 1.4), sd = k % 2 ? 1 : -1; pen.path([lens(curve(q[0], q[1], sd * 55, h * 0.2 * (1.2 - k * 0.1), sd * 30, 6), h * 0.08)], shape(C.leaf, C.line, C.lw)); }
      const q = at(st, 7), dock = DOCK.test(nm || "");
      [-35, 0, 35].forEach((a) => {
        const b = a ? curve(q[0], q[1], a, h * 0.26, -a * 0.4, 5) : st.slice(7);
        pen.path([b], { stroke: C.stem, width: 0.2 });
        if (dock) b.slice(1).forEach((p) => pen.path([ellipse(p[0], p[1], 0.35, 0.5, 0, 10)], shape(C.accent, C.accentLine, C.lw)));
        else { const t = b[b.length - 1]; pen.path([circle(t[0], t[1], h * 0.04, 12)], shape(C.accent, C.accentLine, 0.1)); pen.path([circle(b[2][0], b[2][1], h * 0.03, 10)], shape(C.accent, C.accentLine, 0.1)); }
      });
      return { top: y - h * 1.05, half: h * 0.3 };
    },
    flower(pen, x, y, h, R, C) {
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 14 + (R() - 0.5) * 6, st = curve(x + (i - 1) * 0.4, y, a, h * (0.75 + R() * 0.25), -a * 0.3, 8);
        pen.path([st], { stroke: C.stem, width: 0.24 });
        [2, 4].forEach((k, j) => { const q = st[k], sd = (i + j) % 2 ? 1 : -1; pen.path([lens(curve(q[0], q[1], sd * 50, h * 0.22, sd * 20, 5), h * 0.05)], shape(C.leaf, C.line, C.lw)); });
        const t = st[st.length - 1], r = h * 0.045;
        for (let p = 0; p < 6; p++) { const ang = (p / 6) * 2 * Math.PI; pen.path([circle(t[0] + Math.cos(ang) * r * 1.15, t[1] + Math.sin(ang) * r * 1.15, r, 10)], shape(C.accent, C.accentLine, 0.08)); }
        pen.path([circle(t[0], t[1], r * 0.8, 10)], shape(C.core, C.accentLine, 0.06));
      }
      return { top: y - h * 1.08, half: h * 0.3 };
    },
    lowherb(pen, x, y, h, R, C) {
      for (let i = 0; i < 6; i++) { const a = -75 + i * 30 + (R() - 0.5) * 10; pen.path([lens(curve(x, y, a, h * (0.55 + R() * 0.2), a * 0.3, 6), h * 0.32)], shape(C.leaf, C.line, C.lw)); }
      [-22, 0, 22].forEach((a) => {
        const st = curve(x, y, a + (R() - 0.5) * 8, h * (0.85 + R() * 0.25), 0, 5), t = st[st.length - 1];
        pen.path([st], { stroke: C.line, width: 0.16 });
        for (let k = 0; k < 4; k++) pen.path([circle(t[0] + (k % 2 ? 0.35 : -0.35) * h * 0.25, t[1] - k * h * 0.07, h * 0.075, 10)], shape(C.accent, C.accentLine, 0.06));
      });
      return { top: y - h * 1.3, half: h * 0.6 };
    },
    shrub(pen, x, y, h, R, C) {
      [-0.3, -0.1, 0.1, 0.3].forEach((k) => pen.path([curve(x + k * h * 0.15, y, k * 70, h * 0.5, k * 20, 4)], { stroke: C.stem, width: 0.3 }));
      const cx = x, cy = y - h * 0.62, rs = [];
      for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI; rs.push([cx + Math.cos(a) * h * 0.36 * (0.7 + R() * 0.3), cy + Math.sin(a) * h * 0.22 * (0.4 + R() * 0.6) + h * 0.08, h * (0.19 + R() * 0.08)]); }
      rs.push([cx, cy - h * 0.05, h * 0.26]);
      rs.sort((a, b) => b[1] - a[1]).forEach(([px, py, r]) => pen.path([circle(px, py, r)], shape(C.crown, C.line, 0.16)));
      return { top: y - h * 1.0, half: h * 0.6 };
    },
    tree(pen, x, y, h, R, C) {
      const tw = h * 0.045;
      pen.path([[[x - tw, y], [x - tw * 0.45, y - h * 0.55], [x + tw * 0.45, y - h * 0.55], [x + tw, y]]], shape(C.trunk, C.line, 0.18));
      [-1, 1].forEach((sd) => pen.path([curve(x, y - h * 0.4, sd * 40, h * 0.18, sd * 10, 4)], { stroke: C.trunk === "#ffffff" ? C.line : C.trunk, width: 0.35 }));
      const cx = x, cy = y - h * 0.7, rs = [];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 2 * Math.PI + R() * 0.4; rs.push([cx + Math.cos(a) * h * 0.2, cy + Math.sin(a) * h * 0.13, h * (0.12 + R() * 0.05)]); }
      rs.push([cx, cy, h * 0.16]);
      rs.sort((a, b) => b[1] - a[1]).forEach(([px, py, r]) => pen.path([circle(px, py, r)], shape(C.crown, C.line, 0.16)));
      return { top: y - h * 0.92, half: h * 0.36 };
    },
    // 교목은 활엽수(위 tree — 둥근 수관)와 침엽수(원뿔꼴로 층층이) 두 모양
    conifer(pen, x, y, h, R, C) {
      const tw = h * 0.04;
      pen.path([[[x - tw, y], [x - tw * 0.6, y - h * 0.3], [x + tw * 0.6, y - h * 0.3], [x + tw, y]]], shape(C.trunk, C.line, 0.18));
      for (let i = 0; i < 4; i++) {
        const yb = y - h * (0.16 + i * 0.19), yt = yb - h * (0.36 - i * 0.02), hw = h * (0.24 - i * 0.045) * (0.93 + R() * 0.14);
        pen.path([[[x - hw, yb], [x - hw * 0.15, yt + (yb - yt) * 0.12], [x, yt], [x + hw * 0.15, yt + (yb - yt) * 0.12], [x + hw, yb], [x + hw * 0.35, yb - h * 0.035], [x, yb - h * 0.015], [x - hw * 0.35, yb - h * 0.035]]], shape(C.crown, C.line, 0.16));
      }
      return { top: y - h * 1.02, half: h * 0.25 };
    },
  };
  // 덩굴: 땅 꺾은선(pts)을 따라 잎을 깔아 감음. 잎은 공기 쪽(꺾은선 진행 방향의 왼쪽 법선)으로
  const vine = (pen, pts, s, R, C, nm) => {
    const kudzu = /칡/.test(nm || ""), sp = 1.9 * s, out = [];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0);
      if (!L) continue;
      const tx = (x1 - x0) / L, ty = (y1 - y0) / L;
      for (let d = carry; d <= L; d += sp) out.push([x0 + tx * d, y0 + ty * d, ty, -tx]);
      carry = (carry + Math.ceil((L - carry) / sp) * sp) - L;
    }
    if (!out.length) return { top: Math.min(...pts.map((p) => p[1])), half: 2 };
    const stem = out.map(([x, y, nx, ny], i) => [x + nx * (0.5 + (i % 2) * 0.5) * s, y + ny * (0.5 + (i % 2) * 0.5) * s]);
    pen.path([stem], { stroke: C.stem, width: 0.22 });
    let top = Infinity;
    out.forEach(([x, y, nx, ny], i) => {
      const r = (kudzu ? 1.45 : 1.15) * s * (0.85 + R() * 0.3), off = (0.9 + (i % 2) * 0.7) * s, cx = x + nx * off, cy = y + ny * off;
      const base = (Math.atan2(nx, -ny) * 180) / Math.PI;   // 법선 방향(위 0)
      const lobes = kudzu ? [-55, 0, 55] : [-70, -35, 0, 35, 70];
      lobes.forEach((a) => pen.path([lens(curve(cx, cy, base + a + (R() - 0.5) * 20, r * (a ? 0.85 : 1.05), 0, 4), r * (kudzu ? 0.75 : 0.42))], shape(C.leaf, C.line, C.lw)));
      top = Math.min(top, cy - r);
    });
    return { top, half: 2 };
  };
  const floating = (pen, x, y, s, R, C) => {
    for (let i = 0; i < 4; i++) pen.path([ellipse(x + (i - 1.5) * 1.6 * s, y - 0.08 * s, (0.75 + R() * 0.3) * s, 0.28 * s, (R() - 0.5) * 8, 14)], shape(C.leaf, C.line, C.lw));
    if (C.accent && C.accent !== "#ffffff") pen.path([circle(x + 0.4 * s, y - 0.55 * s, 0.4 * s, 10)], shape(C.accent, C.accentLine, 0.06));
    return { top: y - 1.2 * s, half: 3.2 * s };
  };
  // 생활형별 크기(mm, 배율 1)·차지하는 폭·그리는 차례(뒤 → 앞)
  const SIZE = { tallgrass: 15, emergent: 10.5, cattail: 12.5, sedge: 9.5, grass: 4.5, forb: 9.5, flower: 8.5, lowherb: 4.2, shrub: 9, tree: 21, conifer: 22, floating: 1, vine: 1 };
  const WIDE = { tallgrass: 6, emergent: 6, cattail: 5, sedge: 3.4, grass: 4.4, forb: 4.6, flower: 4.4, lowherb: 4.2, shrub: 9.5, tree: 13, conifer: 10, floating: 6, vine: 2 };
  const ORDER = ["tree", "conifer", "shrub", "tallgrass", "cattail", "emergent", "sedge", "forb", "flower", "grass", "lowherb", "vine", "floating"];
  const COUNT = { few: 2, mid: 3, many: 5 };

  // ---------- 지형 ----------
  // 세로를 6배쯤 과장해 그리므로 사면 가로 길이(높이 1에 대한)도 그만큼 늘려 잡음
  const BANK = { low: 1.5, mid: 2.1, high: 2.7 }, SLOPE = { gentle: 9, mid: 5.5, steep: 3, vsteep: 1.5 }, BERM = { none: 0, narrow: 5, wide: 11 };
  const WIDTH = { xnarrow: 4, narrow: 9, mid: 15, wide: 24 }, DEPTH = { xshallow: 0.16, shallow: 0.3, mid: 0.48, deep: 0.75 }, VERT = new Set(["stonewall", "wall"]);
  const LANDW = { narrow: 3.5, mid: 8, wide: 13 }, CRESTW = 2.6;
  // 한쪽 기슭(바깥 끝 0에서 물 쪽으로 [거리, 높이]): 제내지 → 둑마루 → 제방 사면(호안) → 둔치 → 물가 → 물속 기슭
  const half = (P, wl, bedU) => {
    // 물가 높이(수면 위)·폭: 자연 0.38·3.2, 좁고 낮게 0.15·1.3, 없음 0.04·0.15(물속 기슭도 가파르게), 사석 0.38·2
    const edgeUp = { low: 0.15, none: 0.04 }[P.edge] ?? 0.38;
    const crest = BANK[P.bank] || BANK.mid, low = wl + edgeUp, berm = BERM[P.berm] || 0, bermY = low + 0.2, foot = berm ? bermY : low;
    const run = VERT.has(P.rev) ? 0.12 : Math.max(0.4, (crest - foot) * (SLOPE[P.slope] || SLOPE.mid));
    const edgeRun = { riprap: 2, low: 1.3, none: 0.15 }[P.edge] ?? 3.2, uw = P.edge === "none" ? (bedU ? 0.9 : 0.35) : bedU ? 2.6 : 1.4, pts = [], z = {};
    let d = LANDW[P.landW] || LANDW.mid;
    // 산림(산지 경사): 둑마루에서 바깥으로 산처럼 오르는 비탈
    const hill = P.land === "mountain" ? 0.85 : 0;
    if (hill) pts.push([0, crest + hill], [d * 0.25, crest + hill * 0.93], [d * 0.55, crest + hill * 0.56], [d * 0.82, crest + hill * 0.16], [d, crest]);
    else pts.push([0, crest], [d, crest]);
    z.land = [0, d];
    z.crest = [d, d + CRESTW]; d += CRESTW; pts.push([d, crest]);
    z.slope = [d, d + run]; d += run; pts.push([d, foot]);
    if (berm) { z.berm = [d, d + berm]; d += berm; pts.push([d, bermY]); d += 0.7; pts.push([d, low]); }
    z.edge = [d, d + edgeRun]; d += edgeRun; pts.push([d, wl]);
    const we = d;
    if (bedU) pts.push([d + uw * 0.35, wl * 0.45], [d + uw * 0.7, wl * 0.1]);
    d += uw;
    pts.push([d, 0]);
    return { pts, z, we, end: d, crest, top: crest + hill };
  };
  const geom = (st, F, needBar) => {
    // 건천은 물을 그리지 않고 지형만 얕은 물 높이로 잡음
    const W = st.water, dry = W.d === "dry", wl = dry ? 0.3 : DEPTH[W.d] || DEPTH.mid, bedU = W.bed !== "flat";
    // 사주·하중도: 물이 깊을수록 넓고 완만하게
    const barOn = W.bar !== "none" || needBar, bw = 7 + wl * 8, bs = 1.5 + wl * 4, WW = (WIDTH[W.w] || WIDTH.mid) + (barOn ? bw + 3 : 0);
    const L = half(st.L, wl, bedU), Rt = half(st.R, wl, bedU);
    const bed = Math.max(1.5, WW - (L.end - L.we) - (Rt.end - Rt.we)), total = L.end + bed + Rt.end;
    const up = [...L.pts];
    const zones = {};
    Object.entries(L.z).forEach(([k, v]) => { zones[`L-${k}`] = v; });
    Object.entries(Rt.z).forEach(([k, v]) => { zones[`R-${k}`] = [total - v[1], total - v[0]]; });
    const reach = (L.end - L.we) + Math.min(2.5, bed * 0.25);
    zones["L-water"] = [L.we, L.we + reach];
    zones["R-water"] = [total - Rt.we - reach, total - Rt.we];
    if (barOn) {
      const f = { left: 0.3, center: 0.5, right: 0.7 }[W.bar] || 0.5;
      const bc = Math.max(L.end + bw / 2 + 0.5, Math.min(L.end + bed - bw / 2 - 0.5, L.end + bed * f));
      up.push([bc - bw / 2, 0], [bc - bw / 2 + bs, wl + 0.3], [bc + bw / 2 - bs, wl + 0.3], [bc + bw / 2, 0]);
      zones.bar = [bc - bw / 2 + bs, bc + bw / 2 - bs];
      zones.barBase = [bc - bw / 2, bc + bw / 2];
    }
    up.push(...Rt.pts.map(([d, y]) => [total - d, y]).reverse());
    // 단위 → 용지 mm: 둑마루가 틀 위에서 36%, 하상이 86%(세로는 과장)
    const maxY = Math.max(L.top, Rt.top), hs = F.w / total, vs = (F.h * 0.5) / maxY, y0 = F.y + F.h * 0.86;
    const X = (u) => F.x + u * hs, Y = (v) => y0 - v * vs;
    const pts = up.map(([u, v]) => [X(u), Y(v)]);
    const zmm = Object.fromEntries(Object.entries(zones).map(([k, [a, b]]) => [k, [X(a), X(b)]]));
    const wlY = Y(wl);
    // 물에 잠긴 구간(수면 아래 땅)
    const runs = [];
    let run = null;
    pts.forEach((p, i) => {
      const under = p[1] > wlY + 1e-6;
      if (i) {
        const q = pts[i - 1], qu = q[1] > wlY + 1e-6;
        if (under !== qu) {
          const t = (wlY - q[1]) / (p[1] - q[1]), c = [q[0] + (p[0] - q[0]) * t, wlY];
          if (under) run = [c]; else if (run) { run.push(c); runs.push(run); run = null; }
        }
      }
      if (under && run) run.push(p);
    });
    if (dry) runs.length = 0;
    const wide = runs.reduce((b, r) => (!b || r[r.length - 1][0] - r[0][0] > b[b.length - 1][0] - b[0][0] ? r : b), null);
    if (wide) { const a = wide[0][0], b = wide[wide.length - 1][0]; zmm.surface = [a + (b - a) * 0.28, b - (b - a) * 0.28]; }
    return { pts, zones: zmm, wlY, runs, wide, dry, slopeL: [X(zones["L-slope"][0]), X(zones["L-slope"][1])], slopeR: [X(zones["R-slope"][0]), X(zones["R-slope"][1])] };
  };
  // x(mm)에서 땅 높이(y mm). 직립 호안처럼 같은 x가 둘이면 위쪽
  const groundY = (pts, x) => {
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x < Math.min(x0, x1) - 1e-9 || x > Math.max(x0, x1) + 1e-9) continue;
      const y = x1 === x0 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      if (best === null || y < best) best = y;
    }
    return best ?? pts[pts.length - 1][1];
  };
  // 꺾은선의 x 구간 [a, b]
  const slice = (pts, a, b) => {
    const out = [[a, groundY(pts, a)]];
    pts.forEach((p) => { if (p[0] > a && p[0] < b) out.push(p); });
    out.push([b, groundY(pts, b)]);
    return out;
  };

  // ---------- 쪽 배치 ----------
  const zoneIdx = Object.fromEntries(ZONES.map(([k], i) => [k, i]));
  // 쓰는 식생(이름이나 생활형이 있는 것) — 번호 차례: 왼쪽 위치부터, 같은 위치는 적은 차례
  const usedVeg = (st) => st.veg.map((v, i) => ({ ...v, i })).filter((v) => v.name.trim() && FORMS.some(([f]) => f === v.form) && zoneIdx[v.zone] !== undefined)
    .sort((a, b) => zoneIdx[a.zone] - zoneIdx[b.zone] || a.i - b.i);
  const numbering = (st) => { const m = new Map(); usedVeg(st).forEach((v) => { const n = v.name.trim(); if (!m.has(n)) m.set(n, m.size + 1); }); return m; };
  // 아래 글(설명): 줄마다 앞에 ◦(이미 기호가 있으면 그대로), 폭에 맞춰 줄 나눔
  const wrap = (text, fs, maxW) => {
    const out = [];
    String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const s = /^[◦○•·\-※①-⑳0-9]/.test(l) ? l : `◦ ${l}`;
      let line = "";
      [...s].forEach((ch) => { if (textW(line + ch, fs) > maxW && line) { out.push(line); line = `  ${ch}`; } else line += ch; });
      if (line) out.push(line);
    });
    return out;
  };
  const legendRows = (st, fs, e, maxW) => {
    const rows = [[]];
    let w = 0;
    [...numbering(st)].forEach(([name, n]) => {
      const iw = 3.4 * e + textW(name, fs) + 4 * e;
      if (w + iw > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
      rows[rows.length - 1].push({ name, n, iw });
      w += iw;
    });
    return rows[0].length ? rows : [];
  };
  const layout = (fig) => {
    const S = fig.sec, st = cur(S), [W, H] = SIZE_MM[S.size] || SIZE_MM["180x100"];
    const e0 = S.size === "a4" ? 1.4 : 1, e = e0 * ((fig.el && fig.el.size) || 1), m = (S.size === "a4" ? 10 : 2.5) * e0;
    const info = S.info && (st.river || st.loc) ? 7 * e : 0;
    const title = fig.el.title && fig.title ? 8.5 * e : 0;
    const legend = S.label === "num" ? legendRows(st, 7.2 * e, e, W - 2 * m - 6 * e) : [];
    const legendH = legend.length ? legend.length * 4.6 * e + 3 * e : 0;
    const notes = wrap(st.note, 7.4 * e, W - 2 * m - 4 * e), notesH = notes.length ? notes.length * 3.9 * e + 2.5 * e : 0;
    const top = m + info + title;
    return { W, H, e, m, info, title, legend, legendH, notes, notesH, frame: { x: m, y: top, w: W - 2 * m, h: H - top - m - legendH - notesH } };
  };

  // ---------- 그리기 ----------
  const paint = (pen, fig) => {
    const Lo = layout(fig), { W, H, e, m, frame: F } = Lo, S = fig.sec, st = cur(S), mono = S.style === "mono";
    const s = (F.w / 175) * ((fig.el && fig.el.size) || 1) * (S.size === "a4" ? 0.95 : 1);
    const ink = "#1f1f1f";
    pen.path([[[0, 0], [W, 0], [W, H], [0, H]]], { closed: true, fill: "#ffffff" });
    // 조사지점·하천명·위치 줄
    if (Lo.info) {
      const y = m, h = Lo.info, fs = 8 * e, lw = 15 * e, nw = 19 * e, rest = W - 2 * m - 3 * lw - nw;
      const cells = [["조사지점", lw, true], [st.name, nw], ["하천명", lw, true], [st.river, rest * 0.42], ["위치", lw, true], [st.loc, rest * 0.58]];
      let x = m;
      cells.forEach(([t, w, head]) => {
        pen.path([[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], { closed: true, fill: head ? "#f1f3f5" : "#ffffff", stroke: ink, width: 0.25 * e, join: "miter" });
        if (t) pen.text(t, x + w / 2, y + h / 2, { size: fs, weight: head ? 700 : 400, align: "center", base: "middle", color: "#111" });
        x += w;
      });
    }
    if (Lo.title) pen.text(fig.title, W / 2, m + Lo.info + Lo.title / 2 + 0.3 * e, { size: 10.5 * e, weight: 700, align: "center", base: "middle", color: "#111" });

    const items = usedVeg(st);
    const g = geom(st, F, items.some((v) => v.zone === "bar"));
    const GROUND = { soil: { fill: "#d9bb8f", line: "#6b4f2a" }, line: { fill: "#ffffff", line: ink }, hatch: { fill: "#ffffff", line: ink, hatch: true } }[S.ground] || { fill: "#d9bb8f", line: "#6b4f2a" };
    const occupied = [];
    const hit = (b) => occupied.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

    // 식생 자리: 같은 위치의 것끼리 위치 구간을 나눠 가짐. 제내지에 건물·도로 등이 있으면 둑 쪽 절반만
    const zoneOf = (z) => (z.endsWith("-berm") && !g.zones[z] ? z.replace("-berm", "-edge") : z);
    const byZone = new Map();
    items.forEach((v) => { const z = zoneOf(v.zone); if (g.zones[z]) (byZone.get(z) || byZone.set(z, []).get(z)).push(v); });
    const plants = [];   // { v, form, x, y, h, kind: "one" | "vine" | "float", pts }
    byZone.forEach((list, z) => {
      let [a, b] = g.zones[z];
      const sd = z[0], land = z.endsWith("-land") ? st[sd].land : "none";
      if (land !== "none") { const cut = a + (b - a) * 0.5; if (sd === "L") a = cut; else b = a + (b - a) * 0.5; }
      const pad = Math.min(1.2, (b - a) * 0.08);
      a += pad; b -= pad;
      list.forEach((v, k) => {
        const a1 = a + ((b - a) * k) / list.length, b1 = a + ((b - a) * (k + 1)) / list.length, R = rng(hash(`${st.id}|${v.i}|${v.name}`));
        if (v.form === "vine") { plants.push({ v, form: "vine", pts: slice(g.pts, a1, b1), R }); return; }
        const w = WIDE[v.form] * s, n0 = ["tree", "conifer", "shrub"].includes(v.form) ? { few: 1, mid: 2, many: 3 }[v.amt] || 2 : COUNT[v.amt] || 3;
        const n = Math.max(1, Math.min(n0, Math.floor((b1 - a1) / (w * 0.5))));
        const narrow = z.endsWith("-slope") && b1 - a1 < 3;   // 직립 호안: 위(둑 가장자리)와 발치에 번갈아
        for (let i = 0; i < n; i++) {
          let x = n === 1 ? (a1 + b1) / 2 : a1 + ((i + 0.5) * (b1 - a1)) / n + (R() - 0.5) * ((b1 - a1) / n) * 0.3;
          if (narrow) x = (i % 2 === 0) === (sd === "L") ? a1 - 1.6 * s : b1 + 1.6 * s;
          if (v.form === "floating") { if (!g.dry) plants.push({ v, form: "floating", x, y: g.wlY, R }); continue; }
          const y = groundY(g.pts, x), sub = g.dry ? 0 : Math.max(0, y - g.wlY), h0 = SIZE[v.form] * s * (0.88 + R() * 0.24);
          plants.push({ v, form: v.form, x, y, h: sub > 0 ? Math.max(h0, sub + h0 * 0.55) : h0, R, wet: sub > 0 });
        }
      });
    });
    const groups = new Map();   // 적은 식생 하나 → 기호들의 범위(이름표 자리)
    const drawPlant = (p) => {
      const C = colors(p.form, p.v.name, mono);
      const r = p.form === "vine" ? vine(pen, p.pts, s, p.R, C, p.v.name) : p.form === "floating" ? floating(pen, p.x, p.y, s, p.R, C) : G[p.form](pen, p.x, p.y, p.h, p.R, C, p.v.name);
      const x0 = p.form === "vine" ? p.pts[0][0] : p.x - r.half, x1 = p.form === "vine" ? p.pts[p.pts.length - 1][0] : p.x + r.half;
      const gr = groups.get(p.v.i) || { v: p.v, x0: Infinity, x1: -Infinity, top: Infinity, xs: [] };
      gr.x0 = Math.min(gr.x0, x0); gr.x1 = Math.max(gr.x1, x1); gr.top = Math.min(gr.top, r.top); gr.xs.push(p.form === "vine" ? (x0 + x1) / 2 : p.x);
      groups.set(p.v.i, gr);
    };
    const byOrder = (a, b) => ORDER.indexOf(a.form) - ORDER.indexOf(b.form);

    pen.clip(F.x, F.y, F.w, F.h);
    // 땅
    const groundPoly = [...g.pts, [F.x + F.w + 1, F.y + F.h + 2], [F.x - 1, F.y + F.h + 2]];
    pen.path([groundPoly], GROUND.hatch ? { closed: true, fill: GROUND.fill, hatch: { color: "#9a9a9a", angle: 45, gap: 1.3 * e, width: 0.15 * e } } : { closed: true, fill: GROUND.fill });
    // 물속에 뿌리 둔 식생은 물보다 먼저(잠긴 아랫부분이 물빛 아래로)
    // 하상 재료(자갈·호박돌·거석·암반): 양쪽 물가 끝 사이 바닥
    const mat = st.water.mat || "none";
    if (mat !== "none") {
      const xa = g.zones["L-water"][0], xb = g.zones["R-water"][1], R = rng(hash(`${st.id}bed`)), bedPts = slice(g.pts, xa, xb);
      const stoneCol = { gravel: "#b8b2a6", cobble: "#a9a39a", boulder: "#9a958c" };
      const rock = (x, r, kind) => {
        const bb = g.zones.barBase;   // 하중도·사주 위는 비움
        if (bb && x > bb[0] - r && x < bb[1] + r) return;
        const y = groundY(g.pts, x), n = 9, rot = R() * Math.PI, sink = kind === "gravel" ? 0.1 : kind === "cobble" ? 0.35 : 0.3;
        const ptsR = Array.from({ length: n }, (_, i) => { const t = rot + (i / n) * 2 * Math.PI, rr = r * (0.82 + R() * 0.3); return [x + Math.cos(t) * rr * 1.15, y - r * (1 - sink) + Math.sin(t) * rr * 0.8]; });
        pen.path([ptsR], mono ? shape("#ffffff", ink, 0.16) : shape(stoneCol[kind], "#57534e", 0.16));
        if (!mono && kind !== "gravel") pen.path([[[x - r * 0.5, y - r * (1 - sink) - r * 0.35], [x + r * 0.1, y - r * (1 - sink) - r * 0.55]]], { stroke: "#d6d1c8", width: 0.18 * r });
      };
      if (mat === "rock") {
        const t = 1.4 * s, band = [...bedPts, ...bedPts.map(([x, y]) => [x, y + t]).reverse()];
        pen.path([band], mono ? shape("#ffffff", ink, 0.2) : shape("#a8a29a", "#57534e", 0.2));
        for (let x = xa + 2 * s; x < xb - 1 * s; x += (2.2 + R() * 2) * s) { const y = groundY(g.pts, x); pen.path([[[x, y + 0.1], [x + (R() - 0.5) * s, y + t * 0.55], [x + (R() - 0.3) * s, y + t]]], { stroke: mono ? ink : "#57534e", width: 0.14 }); }
      } else {
        if (mat === "gravel") for (let x = xa + 0.4 * s; x < xb; x += (0.65 + R() * 0.4) * s) rock(x, (0.3 + R() * 0.12) * s, "gravel");
        if (mat === "boulder" || mat === "mix") for (let x = xa + 2.6 * s; x < xb - 2 * s; x += (6.5 + R() * 4) * s) rock(x, (2.3 + R() * 0.9) * s, "boulder");
        if (mat === "cobble" || mat === "mix") for (let x = xa + 0.9 * s; x < xb; x += (1.7 + R() * 1.4) * s) rock(x, (0.75 + R() * 0.3) * s, "cobble");
      }
    }
    plants.filter((p) => p.wet).sort(byOrder).forEach(drawPlant);
    if (S.water !== "line") g.runs.forEach((r) => pen.path([r], { closed: true, fill: "#74c0fc", fillOpacity: 0.72 }));
    pen.path([g.pts], { stroke: GROUND.line, width: 0.5 * e, join: "round" });

    // 호안(제방 사면)·물가 사석
    const stoneSt = mono ? shape("#ffffff", ink, 0.18) : shape("#b9b6ae", "#555555", 0.18);
    const rev = (sd) => {
      const P = st[sd], [a, b] = g.zones[`${sd}-slope`], top = [sd === "L" ? a : b, groundY(g.pts, sd === "L" ? a : b)], foot = sd === "L" ? [b, groundY(g.pts, b + 0.01)] : [a, groundY(g.pts, a - 0.01)];
      const len = Math.hypot(foot[0] - top[0], foot[1] - top[1]) || 1, tx = (foot[0] - top[0]) / len, ty = (foot[1] - top[1]) / len;
      // 공기 쪽 법선(물 쪽 위), 땅 쪽은 반대
      const nx = sd === "L" ? ty : -ty, ny = sd === "L" ? -tx : tx, inx = -nx, iny = -ny;
      const ang = (Math.atan2(ty, tx) * 180) / Math.PI;
      if (P.rev === "riprap") {
        const r = 1.15 * s, n = Math.max(2, Math.round(len / (r * 1.7))), R = rng(hash(`${st.id}${sd}rev`));
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, cx = top[0] + tx * len * t + inx * r * 0.25, cy = top[1] + ty * len * t + iny * r * 0.25; pen.path([ellipse(cx, cy, r * (0.95 + R() * 0.25), r * 0.68, ang + (R() - 0.5) * 20, 16)], stoneSt); }
      } else if (P.rev === "block") {
        const t = 1.1 * s, n = Math.max(2, Math.round(len / (2.4 * s)));
        pen.path([[top, foot, [foot[0] + inx * t, foot[1] + iny * t], [top[0] + inx * t, top[1] + iny * t]]], mono ? shape("#ffffff", ink, 0.2) : shape("#cfcfcf", "#555555", 0.2));
        for (let i = 1; i < n; i++) { const q = [top[0] + tx * (len * i) / n, top[1] + ty * (len * i) / n]; pen.path([[q, [q[0] + inx * t, q[1] + iny * t]]], { stroke: mono ? ink : "#666666", width: 0.15 }); }
      } else if (P.rev === "stonewall") {
        const rx = 1.45 * s, ry = 0.82 * s, n = Math.max(2, Math.round(len / (ry * 1.9)));
        for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
          const t = (i + 0.5) / n, off = rx * (0.95 + c * 1.75) + (i % 2) * rx * 0.5;
          pen.path([ellipse(top[0] + tx * len * t + inx * off, top[1] + ty * len * t + iny * off, rx, ry, ang + 90, 16)], stoneSt);
        }
      } else if (P.rev === "wall") {
        const t = 1.6 * s;
        pen.path([[top, foot, [foot[0] + inx * t, foot[1] + iny * t + 0.6 * s], [top[0] + inx * t, top[1] + iny * t]]], mono ? { closed: true, fill: "#ffffff", stroke: ink, width: 0.25, hatch: { color: "#777777", angle: 45, gap: 0.9 * s, width: 0.12 } }
          : { closed: true, fill: "#d3d3d3", stroke: "#444444", width: 0.25, hatch: { color: "#9a9a9a", angle: 45, gap: 0.9 * s, width: 0.12 } });
      }
      if (P.edge === "riprap") {
        const [ea, eb] = g.zones[`${sd}-edge`], [wa, wb] = g.zones[`${sd}-water`], x0 = sd === "L" ? ea : wa + (wb - wa) * 0.55, x1 = sd === "L" ? wa + (wb - wa) * 0.45 : eb;
        const r = 0.95 * s, n = Math.max(2, Math.round((x1 - x0) / (r * 1.6))), R = rng(hash(`${st.id}${sd}edge`));
        for (let i = 0; i < n; i++) { const x = x0 + ((i + 0.5) * (x1 - x0)) / n; pen.path([ellipse(x, groundY(g.pts, x) - r * 0.35, r * (0.9 + R() * 0.3), r * 0.62, (R() - 0.5) * 30, 14)], stoneSt); }
      }
    };
    rev("L");
    rev("R");

    // 제내지(둑 밖) 이용: 바깥쪽 절반에 그림과 이름
    const landIcon = (sd) => {
      const P = st[sd];
      if (P.land === "none") return;
      const [a, b] = g.zones[`${sd}-land`], full = P.landW === "narrow" || P.land === "mountain", x0 = sd === "L" || full ? a : a + (b - a) * 0.5, x1 = sd === "L" && !full ? a + (b - a) * 0.5 : b, y = groundY(g.pts, (x0 + x1) / 2);
      let cx = (x0 + x1) / 2;
      const ks = Math.min(s, (x1 - x0) / 9.5);   // 좁은 제내지는 그림을 줄임
      const fillOr = (c) => (mono ? "#ffffff" : c);
      let top = y - 3 * ks;
      if (P.land === "house") {
        const w = 8 * ks, h = 5 * ks;
        pen.path([[[cx - w / 2, y], [cx - w / 2, y - h], [cx + w / 2, y - h], [cx + w / 2, y]]], shape(fillOr("#efe2cf"), ink, 0.22));
        pen.path([[[cx - w * 0.62, y - h], [cx, y - h - 3.6 * ks], [cx + w * 0.62, y - h]]], shape(fillOr("#b5523b"), ink, 0.22));
        pen.path([[[cx - w * 0.3, y - h * 0.75], [cx - w * 0.05, y - h * 0.75], [cx - w * 0.05, y - h * 0.4], [cx - w * 0.3, y - h * 0.4]]], shape(fillOr("#ffe8a3"), ink, 0.15));
        pen.path([[[cx + w * 0.12, y], [cx + w * 0.12, y - h * 0.65], [cx + w * 0.32, y - h * 0.65], [cx + w * 0.32, y]]], shape(fillOr("#8d6748"), ink, 0.15));
        top = y - h - 3.6 * ks;
      } else if (P.land === "building") {
        const w = 7 * ks, h = 9 * ks;
        pen.path([[[cx - w / 2, y], [cx - w / 2, y - h], [cx + w / 2, y - h], [cx + w / 2, y]]], shape(fillOr("#d6d3cc"), ink, 0.22));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const wx = cx - w * 0.3 + c * w * 0.38, wy = y - h + 1.2 * ks + r * 2.5 * ks; pen.path([[[wx, wy], [wx + w * 0.22, wy], [wx + w * 0.22, wy + 1.3 * ks], [wx, wy + 1.3 * ks]]], shape(fillOr("#a5c8e4"), ink, 0.12)); }
        top = y - h;
      } else if (P.land === "road" || P.land === "bike") {
        const t = 0.9 * ks;
        pen.path([[[x0 + 0.5, y], [x1 - 0.5, y], [x1 - 0.5, y - t], [x0 + 0.5, y - t]]], shape(mono ? "#ffffff" : P.land === "road" ? "#5c5f66" : "#b0705a", ink, 0.18));
        pen.path([[[x0 + 1, y - t / 2], [x1 - 1, y - t / 2]]], { stroke: mono ? ink : "#ffffff", width: 0.18, dash: [0.9, 0.7] });
        if (P.land === "bike") {
          const r = 1.5 * ks, bx = cx, by = y - t - r - 0.3;
          [-1, 1].forEach((k) => pen.path([circle(bx + k * 2 * ks, by, r, 16)], { closed: true, stroke: ink, width: 0.25 }));
          pen.path([[[bx - 2 * ks, by], [bx - 0.4 * ks, by - 1.8 * ks], [bx + 1.2 * ks, by - 1.8 * ks], [bx + 2 * ks, by], [bx + 0.1 * ks, by], [bx - 0.4 * ks, by - 1.8 * ks]]], { stroke: ink, width: 0.25 });
          pen.path([[[bx + 1.2 * ks, by - 1.8 * ks], [bx + 1.4 * ks, by - 2.6 * ks]], [[bx - 0.6 * ks, by - 2.3 * ks], [bx + 0.2 * ks, by - 2.3 * ks]]], { stroke: ink, width: 0.25 });
          top = by - 2.8 * ks;
        } else top = y - 3 * ks;
      } else if (P.land === "farm") {
        const n = Math.max(3, Math.round((x1 - x0) / (2.2 * ks)));
        for (let i = 0; i < n; i++) {
          const fx = x0 + ((i + 0.5) * (x1 - x0)) / n;
          pen.path([[[fx - 0.9 * ks, y], [fx, y - 0.7 * ks], [fx + 0.9 * ks, y]]], shape(fillOr("#a8865a"), mono ? ink : "#6b4f2a", 0.15));
          [-1, 1].forEach((k) => pen.path([lens(curve(fx, y - 0.7 * ks, k * 30, 1.8 * ks, k * 25, 4), 0.45 * ks)], shape(fillOr("#7cb342"), mono ? ink : "#4e7a2e", 0.1)));
        }
        top = y - 3 * ks;
      } else if (P.land === "mountain") {
        // 비탈을 따라 침엽수·활엽수를 번갈아(둑 쪽 끝은 조금 비움)
        const th = 13 * s, pad = th * 0.3, a0 = sd === "L" ? x0 + pad : x0 + (x1 - x0) * 0.14, a1 = sd === "L" ? x1 - (x1 - x0) * 0.14 : x1 - pad;
        const n = Math.max(2, Math.round((a1 - a0) / (4.6 * s))), R = rng(hash(`${st.id}${sd}land`));
        top = Infinity;
        for (let i = 0; i < n; i++) {
          const tx = n === 1 ? (a0 + a1) / 2 : a0 + (i * (a1 - a0)) / (n - 1) + (R() - 0.5) * s, f = i % 2 ? "tree" : "conifer";
          const r = G[f](pen, tx, groundY(g.pts, tx) + 0.3, th * (0.8 + R() * 0.35), R, colors(f, "", mono));
          if (Math.abs(tx - cx) < (a1 - a0) / 2) top = Math.min(top, r.top);
        }
      } else if (P.land === "forest" || P.land === "park") {
        const n = P.land === "forest" ? 3 : 1, C = colors("tree", "", mono), R = rng(hash(`${st.id}${sd}land`));
        const th = 15 * ks, a0 = x0 + th * 0.4, a1 = x1 - th * 0.4;
        for (let i = 0; i < n; i++) { const r = G.tree(pen, n === 1 ? (a0 + a1) / 2 : a0 + (i * (a1 - a0)) / (n - 1), y, th * (0.85 + R() * 0.3), R, C, ""); top = Math.min(top, r.top); }
        if (P.land === "park") { const bx = cx + 3 * ks; pen.path([[[bx - 1.6 * ks, y - 1.2 * ks], [bx + 1.6 * ks, y - 1.2 * ks]], [[bx - 1.3 * ks, y - 1.2 * ks], [bx - 1.3 * ks, y]], [[bx + 1.3 * ks, y - 1.2 * ks], [bx + 1.3 * ks, y]]], { stroke: ink, width: 0.3 }); }
      }
      const t = (P.landText || "").trim() || LAND_NAME[P.land], fs = 7.2 * e, tw = textW(t, fs, 700), ty = top - 1.2 * e;
      cx = Math.max(F.x + tw / 2 + 1, Math.min(F.x + F.w - tw / 2 - 1, cx));
      landLabels.push(() => pen.text(t, cx, ty, { size: fs, weight: 700, align: "center", base: "bottom", color: "#111", halo: "#ffffff", haloWidth: 0.5 * e }));
      occupied.push([cx - tw / 2 - 0.5, ty - fs * PT - 0.5, cx + tw / 2 + 0.5, ty + 0.5]);
    };
    const landLabels = [];   // 제내지 이름은 식생을 그린 뒤 위에
    landIcon("L");
    landIcon("R");

    // 물 밖 식생(뒤 → 앞)
    plants.filter((p) => !p.wet && p.form !== "floating").sort(byOrder).forEach(drawPlant);
    plants.filter((p) => p.form === "floating").forEach(drawPlant);
    landLabels.forEach((f) => f());
    // 수면·W.L
    const wlCol = mono ? ink : "#1971c2";
    g.runs.forEach((r) => pen.path([[r[0], r[r.length - 1]]], { stroke: wlCol, width: (S.water === "line" ? 0.75 : 0.4) * e }));
    if ((S.water === "wl" || S.water === "line") && g.wide) {
      // 물속·물 위 식생에서 가장 먼 자리
      const a = g.wide[0][0], b = g.wide[g.wide.length - 1][0], xs = plants.filter((p) => p.wet || p.form === "floating").map((p) => p.x), y = g.wlY, k = e;
      const x = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75].map((t) => a + (b - a) * t).reduce((best, c) => { const d = Math.min(Infinity, ...xs.map((q) => Math.abs(q - c))); return d > best[1] + 2 ? [c, d] : best; }, [a + (b - a) * 0.5, Math.min(Infinity, ...xs.map((q) => Math.abs(q - (a + b) / 2)))])[0];
      pen.path([[[x, y], [x - 0.95 * k, y - 1.5 * k], [x + 0.95 * k, y - 1.5 * k]]], { closed: true, fill: ink });
      pen.path([[[x - 1 * k, y + 0.6 * k], [x + 1 * k, y + 0.6 * k]], [[x - 0.55 * k, y + 1.1 * k], [x + 0.55 * k, y + 1.1 * k]]], { stroke: ink, width: 0.2 * k });
      pen.text("W.L", x, y - 1.8 * k, { size: 6 * e, weight: 700, align: "center", base: "bottom", color: ink, halo: "#ffffff", haloWidth: 0.4 * e });
      occupied.push([x - 2.5 * k, y - 4.5 * k, x + 2.5 * k, y + 1.4 * k]);
    }

    // 좌안·우안
    if (S.sides) {
      const fs = 9 * e, y = F.y + 1.6 * e;
      pen.text("좌안", F.x + 2 * e, y, { size: fs, weight: 700, align: "left", base: "top", color: "#111", halo: "#ffffff", haloWidth: 0.5 * e });
      pen.text("우안", F.x + F.w - 2 * e, y, { size: fs, weight: 700, align: "right", base: "top", color: "#111", halo: "#ffffff", haloWidth: 0.5 * e });
      const tw = textW("좌안", fs, 700) + 1, th = fs * PT + 1;
      occupied.push([F.x + 1.5 * e, y - 0.5, F.x + 2 * e + tw, y + th], [F.x + F.w - 2 * e - tw, y - 0.5, F.x + F.w - 1.5 * e, y + th]);
    }
    // 하폭·수폭(적었을 때): 양쪽 화살 치수선과 글자
    const dim = (x0, x1, y, t, col) => {
      const k = e, fs = 6.8 * e;
      pen.path([[[x0, y], [x1, y]]], { stroke: col, width: 0.22 * k });
      [[x0, 1], [x1, -1]].forEach(([x, d]) => pen.path([[[x, y], [x + d * 1.3 * k, y - 0.55 * k], [x + d * 1.3 * k, y + 0.55 * k]]], { closed: true, fill: col }));
      const tw = textW(t, fs);
      pen.text(t, (x0 + x1) / 2, y - 0.6 * k, { size: fs, align: "center", base: "bottom", color: col, halo: "#ffffff", haloWidth: 0.45 * e });
      occupied.push([(x0 + x1) / 2 - tw / 2 - 0.5, y - 0.6 * k - fs * PT - 0.5, (x0 + x1) / 2 + tw / 2 + 0.5, y + 0.6]);
    };
    const hT = (st.water.hText || "").trim(), wT = (st.water.wText || "").trim();
    if (hT) {
      const x0 = g.slopeL[0], x1 = g.slopeR[1], y = F.y + (S.sides ? 9.5 : 5) * e;
      [x0, x1].forEach((x) => pen.path([[[x, y - 1 * e], [x, groundY(g.pts, x)]]], { stroke: "#868e96", width: 0.15 * e, dash: [0.8 * e, 0.6 * e] }));
      dim(x0, x1, y, /하폭/.test(hT) ? hT : `하폭 ${hT}`, "#333333");
    }
    // 수폭은 물 아래(하상 밑)에 — 수면 위 식생·W.L과 겹치지 않게
    if (wT && g.runs.length) {
      const x0 = g.runs[0][0][0], x1 = g.runs[g.runs.length - 1].slice(-1)[0][0], y = Math.max(...g.runs.flat().map((p) => p[1])) + 3.2 * e, col = mono ? ink : "#1864ab";
      [x0, x1].forEach((x) => pen.path([[[x, g.wlY], [x, y + 1 * e]]], { stroke: "#868e96", width: 0.15 * e, dash: [0.8 * e, 0.6 * e] }));
      const t = /수폭/.test(wT) ? wT : `수폭 ${wT}`, fs = 6.8 * e, tw = textW(t, fs);
      pen.path([[[x0, y], [x1, y]]], { stroke: col, width: 0.22 * e });
      [[x0, 1], [x1, -1]].forEach(([x, d]) => pen.path([[[x, y], [x + d * 1.3 * e, y - 0.55 * e], [x + d * 1.3 * e, y + 0.55 * e]]], { closed: true, fill: col }));
      pen.text(t, (x0 + x1) / 2, y + 0.7 * e, { size: fs, align: "center", base: "top", color: col, halo: "#ffffff", haloWidth: 0.45 * e });
      occupied.push([(x0 + x1) / 2 - tw / 2 - 0.5, y - 0.6, (x0 + x1) / 2 + tw / 2 + 0.5, y + 0.7 * e + fs * PT + 0.5]);
    }

    // 식생 이름표(이름) 또는 번호: 기호 위 가운데, 겹치면 위로 올리거나 옆으로
    const nums = numbering(st), fs = 7 * e;
    [...groups.values()].sort((a, b) => a.top - b.top).forEach((gr) => {
      const name = gr.v.name.trim(), num = S.label === "num";
      const cx = Math.max(F.x + 1, Math.min(F.x + F.w - 1, gr.xs.reduce((t, x) => t + x, 0) / gr.xs.length));
      const w = num ? 3.4 * e : textW(name, fs) + 1, h = num ? 3.4 * e : fs * PT + 0.8;
      const cands = [];
      for (let k = 0; k < 7; k++) cands.push([cx, gr.top - 0.8 * e - k * (h + 0.4)]);
      [1, -1].forEach((d) => [0, 1, 2].forEach((k) => cands.push([cx + d * (w / 2 + (gr.x1 - gr.x0) / 2 + 0.5), gr.top - 0.8 * e - k * (h + 0.4)])));
      const box = ([x, yb]) => { const xx = Math.max(F.x + 0.5, Math.min(F.x + F.w - w - 0.5, x - w / 2)), yy = Math.max(F.y + 0.5, yb - h); return [xx, yy, xx + w, yy + h]; };
      const pick = cands.map(box).find((b) => !hit(b)) || box(cands[0]);
      occupied.push(pick);
      const lx = (pick[0] + pick[2]) / 2, ly = pick[3];
      if (Math.hypot(lx - cx, ly - gr.top) > 3 * e) pen.path([[[lx, ly], [cx, gr.top + 0.3]]], { stroke: "#868e96", width: 0.15 * e });
      if (num) {
        const r = 1.6 * e, c = [lx, (pick[1] + pick[3]) / 2];
        pen.path([circle(c[0], c[1], r, 20)], { closed: true, fill: "#ffffff", stroke: ink, width: 0.22 * e });
        pen.text(String(nums.get(name)), c[0], c[1], { size: 6.2 * e, weight: 700, align: "center", base: "middle", color: "#111" });
      } else pen.text(name, lx, (pick[1] + pick[3]) / 2, { size: fs, align: "center", base: "middle", color: "#111", halo: "#ffffff", haloWidth: 0.5 * e });
    });
    pen.unclip();
    if (S.frame) pen.path([[[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]]], { closed: true, stroke: ink, width: 0.3 * e, join: "miter" });

    // 번호 목록(번호로 표기할 때)
    if (Lo.legend.length) {
      const y0 = F.y + F.h + 1.5 * e, h = Lo.legendH - 1.5 * e, lfs = 7.2 * e;
      pen.path([[[F.x, y0], [F.x + F.w, y0], [F.x + F.w, y0 + h], [F.x, y0 + h]]], { closed: true, fill: mono ? "#ffffff" : "#eef0f2", stroke: mono ? ink : null, width: 0.2 * e });
      Lo.legend.forEach((row, i) => {
        const rw = row.reduce((t, it) => t + it.iw, 0) - 1.5 * e, cy = y0 + 0.75 * e + (i + 0.5) * 4.6 * e;
        let x = F.x + (F.w - rw) / 2;
        row.forEach((it) => {
          pen.path([circle(x + 1.5 * e, cy, 1.5 * e, 20)], { closed: true, fill: "#ffffff", stroke: ink, width: 0.2 * e });
          pen.text(String(it.n), x + 1.5 * e, cy, { size: 5.8 * e, weight: 700, align: "center", base: "middle", color: "#111" });
          pen.text(it.name, x + 3.6 * e, cy, { size: lfs, align: "left", base: "middle", color: "#111" });
          x += it.iw;
        });
      });
    }
    // 설명
    if (Lo.notes.length) {
      const y0 = H - m - Lo.notesH + 2 * e;
      Lo.notes.forEach((t, i) => pen.text(t, F.x + 1 * e, y0 + i * 3.9 * e, { size: 7.4 * e, align: "left", base: "top", color: "#222" }));
    }
    return { warn: [], layout: Lo };
  };
  // 글자를 먼저 모아 글꼴을 받은 뒤 그림(캔버스는 글꼴이 늦으면 다른 글꼴로 그려짐)
  const render = async (pen, fig) => {
    const np = new Carto.NullPen();
    paint(np, fig);
    await Carto.ensureFonts(np.strings);
    return paint(pen, fig);
  };

  window.Section = { PRESETS, applyPreset, FORMS, ZONES, AMT, LAND, LANDWS, MATS, REV, BANKS, SLOPES, BERMS, EDGES, WIDTHS, DEPTHS, BEDS, BARS, SIZES, LABELS, STYLES, GROUNDS, WATERS, SPECIES,
    formOf, newSec, newStation, cur, layout, render };
})();
