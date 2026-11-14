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
  const BANKS = [["xlow", "아주 낮게"], ["low", "낮게"], ["mid", "보통"], ["high", "높게"], ["xhigh", "아주 높게"]];
  const SLOPES = [["gentle", "완만하게"], ["mid", "보통"], ["steep", "급하게"], ["vsteep", "아주 급하게"]];
  const BERMS = [["none", "없음"], ["narrow", "좁게"], ["wide", "넓게"]];
  // 둔치 높이: 수위(수심)에 맞춰 잠기게·안 잠기게. 「수위보다 조금 위」는 고른 수심의 물높이 바로 위(제방 끝 가까이 물이면 그래도 잠김)
  const BERMHS = [["water", "수면과 거의 같게"], ["water2", "수면보다 약간 높게"], ["low", "낮게(물에 잘 잠김)"], ["mid", "보통(수면 조금 위)"], ["wl", "수위보다 조금 위(안 잠기게)"], ["high", "높게(제방 높이 절반쯤)"], ["xhigh", "더 높게(제방 높이 2/3쯤)"]];
  // 물가: 소하천은 물가가 거의 없거나 좁고 낮아 수폭이 하폭과 거의 같음
  const EDGES = [["natural", "자연(흙·모래)"], ["low", "좁고 낮게"], ["none", "없음(물이 호안까지)"], ["riprap", "사석·자갈"], ["wall", "직각 콘크리트(옹벽)"]];
  const WIDTHS = [["xnarrow", "아주 좁게"], ["narrow", "좁게"], ["mid", "보통"], ["wide", "넓게"]];
  // 하폭(양쪽 둑마루 안쪽 끝 사이) : 제방 높이(하상~둑마루). 자동은 고른 수폭·사면·둔치대로 틀 폭을 채움
  const RATIOS = [["auto", "자동(고른 값대로)"], ["0.5", "1 : 2"], ["0.75", "1 : 1.5"], ["1", "1 : 1"], ["1.5", "1.5 : 1"], ["2", "2 : 1"], ["3", "3 : 1"], ["5", "5 : 1"], ["8", "8 : 1"], ["12", "12 : 1"], ["20", "20 : 1"]];
  const DEPTHS = [["xxshallow", "가장 얕게(물이 조금)"], ["xshallow", "아주 얕게"], ["shallow", "얕게"], ["mid", "보통"], ["deep", "깊게"], ["high", "더 깊게(제방 높이 2/3쯤)"], ["full", "제방 끝 가까이"], ["dry", "건천(물 없음)"]];
  // 하천 유형 빠른 설정: 하폭:제방 높이·하도·물가·사면·둔치만 바꿈(호안 종류·제내지 이용·폭·식생은 그대로)
  const PRESETS = [["small", "소하천(좁은 하도·높은 둑)"], ["local", "지방하천"], ["large", "넓은 하천(둔치 있음)"]];
  const PRESET = {
    small: { water: { w: "wide", d: "xshallow", bed: "flat", bar: "none", ratio: "2" }, side: { slope: "vsteep", berm: "none", edge: "none", bank: "mid" }, treeRef: "1.3",
      real: { B: 7, W: 4.5, D: 0.3, cw: 2, HL: 2.5, HR: 2.5, nL: "0.5", nR: "0.5", bL: 0, bR: 0, hbL: 0.3, hbR: 0.3 } },
    local: { water: { w: "narrow", d: "shallow", bed: "u", ratio: "3" }, side: { slope: "mid", berm: "narrow", edge: "low", bank: "mid" }, treeRef: "1",
      real: { B: 36, W: 10, D: 0.5, cw: 3, HL: 4, HR: 4, nL: "2", nR: "2", bL: 5, bR: 7, hbL: 0.6, hbR: 0.6 } },
    large: { water: { w: "wide", d: "mid", bed: "u", ratio: "auto" }, side: { slope: "gentle", berm: "wide", edge: "natural", bank: "mid" }, treeRef: "auto",
      real: { B: 150, W: 70, D: 1.5, cw: 5, HL: 6, HR: 6, nL: "2", nR: "2", bL: 25, bR: 35, hbL: 1.2, hbR: 1.2 } },
  };
  const applyPreset = (st, k) => {
    const p = PRESET[k];
    if (!p) return;
    Object.assign(st.water, p.water);
    ["L", "R"].forEach((sd) => Object.assign(st[sd], p.side));
    if (p.treeRef) st.treeRef = p.treeRef;
    // 실측 방식: 하폭·수폭·수심·제방 높이·사면·둔치(m)
    if (p.real) st.real = { ...REALDEF, ...(st.real || {}), ...p.real };
  };
  const MATS = [["none", "모래·흙"], ["gravel", "자갈"], ["cobble", "호박돌"], ["boulder", "거석"], ["mix", "호박돌 + 거석"], ["rock", "암반"]];
  const LANDWS = [["narrow", "좁게"], ["mid", "보통"], ["wide", "넓게"]];
  const BEDS = [["u", "둥글게"], ["flat", "평평하게"]];
  const BARS = [["none", "없음"], ["left", "좌안 쪽"], ["center", "가운데"], ["right", "우안 쪽"]];
  // 하중도·사주 높이·폭(물길 2개는 하중도를 둔치 높이쯤·넓게 해 물길을 둘로 나눔)
  const BARHS = [["low", "낮게(수면 바로 위)"], ["mid", "보통"], ["high", "높게(둔치 높이쯤)"], ["wl", "수위보다 조금 위(안 잠기게)"], ["xhigh", "아주 높게(제방 절반쯤)"]];
  const BARWS = [["narrow", "좁게"], ["mid", "보통"], ["wide", "넓게"], ["xwide", "아주 넓게"]];
  const NCHS = [["1", "1개"], ["2", "2개(가운데 하중도·둔치)"]];
  // 물길 위치: 한쪽으로 치우치면 반대쪽 둔치가 넓어지고, 한쪽 끝에 붙으면 붙은 쪽은 둔치·물가 없이 물이 호안까지(반대쪽 둔치가 아주 넓게)
  const POSS = [["center", "가운데"], ["left", "좌안 쪽으로 치우침"], ["right", "우안 쪽으로 치우침"], ["attL", "좌안 끝에 붙음"], ["attR", "우안 끝에 붙음"]];
  // 식물 크기(전체·식생 줄마다 — 둘을 곱함)
  const PSIZES = [["xs", "아주 작게"], ["s", "작게"], ["m", "보통"], ["l", "크게"], ["xl", "아주 크게"]];
  const PSZ = { xs: 0.5, s: 0.75, m: 1, l: 1.3, xl: 1.6 };
  // 제내지 그림(집·건물·도로·농경지·산림 등) 크기
  const ICONSZS = [["s", "작게"], ["m", "보통"], ["l", "크게"], ["xl", "아주 크게"]];
  const ICONSZ = { s: 0.7, m: 1, l: 1.4, xl: 1.8 };
  // 제내지 표현: 바닥 색 띠 + 글자(기본) / 그림(집·건물·자전거 등). 띠 색은 이용별
  const LANDSTYLES = [["band", "바닥 색 + 글자"], ["icon", "그림(아이콘)"]];
  const LANDPOSS = [["out", "제방 밖(제내지)"], ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => [String(n), `끝에서 ${n}%`]), ["100", "끝에서 100%(둑마루 하천 쪽 끝까지)"]];
  const LANDCOL = { farm: "#9c7a4c", house: "#b5523b", building: "#7d828a", road: "#55585e", bike: "#b0705a", forest: "#4e7a2e", mountain: "#4e7a2e", park: "#6aa84f" };
  // 나무 높이(제방 대비): 자동은 지형 세로 배율에 맞춘 크기, 배수를 고르면 교목 높이 = 제방 높이 × 배수(다른 생활형은 같은 비율) — 소하천은 나무가 제방보다 높은 일이 많음
  const TREEREFS = [["auto", "자동(지형 배율)"], ["0.6", "제방 높이의 0.6배"], ["0.8", "제방 높이의 0.8배"], ["1", "제방과 비슷하게"], ["1.3", "제방보다 조금 높게(1.3배)"], ["1.6", "제방보다 높게(1.6배)"], ["2", "제방의 2배"]];
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
  const side = (o) => ({ land: "none", landW: "narrow", landText: "", bank: "mid", rev: "natural", slope: "mid", berm: "none", bermH: "mid", edge: "natural", ...o });
  const veg = (name, zone, amt = "mid") => ({ name, form: formOf(name) || "forb", zone, amt, auto: true });
  let seq = 0;
  const newStation = (n, example) => ({
    id: `s${Date.now().toString(36)}${(seq++).toString(36)}`, name: `St.${n}`, river: "", loc: "",
    water: { w: "mid", d: "mid", bed: "u", bar: "none", mat: "none", ratio: "auto", wText: "", hText: "" },
    L: side(example ? { land: "house", rev: "riprap", berm: "narrow" } : {}),
    R: side(example ? { land: "bike", berm: "wide", slope: "gentle" } : {}),
    veg: example ? [veg("쑥", "L-crest"), veg("환삼덩굴", "L-slope"), veg("고마리", "L-berm"), veg("달뿌리풀", "L-edge"), veg("줄", "L-water"),
      veg("갈대", "R-water"), veg("갯버들", "R-edge", "few"), veg("버드나무", "R-berm", "few"), veg("개망초", "R-slope"), veg("칡", "R-slope")] : [],
    note: "", treeRef: "auto", mode: "real", real: { ...REALDEF },
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
  // 제방 높이(하상 0에서). 세로 배율은 VREF 기준으로 고정해 낮은 제방은 낮게, 높은 제방은 높게 보이게(VREF보다 높으면 틀에 맞춰 줄임)
  const BANK = { xlow: 1.0, low: 1.5, mid: 2.1, high: 2.7, xhigh: 3.3 }, VREF = 2.4, VS_STD = (80 * 0.5) / 2.4, SLOPE = { gentle: 9, mid: 5.5, steep: 3, vsteep: 1.5 }, BERM = { none: 0, narrow: 5, wide: 11 };
  const WIDTH = { xnarrow: 4, narrow: 9, mid: 15, wide: 24 }, DEPTH = { xxshallow: 0.07, xshallow: 0.16, shallow: 0.3, mid: 0.48, deep: 0.75 }, VERT = new Set(["stonewall", "wall"]);
  const LANDW = { narrow: 3.5, mid: 8, wide: 13 }, CRESTW = 2.6;
  // 한쪽 기슭(바깥 끝 0에서 물 쪽으로 [거리, 높이]): 제내지 → 둑마루 → 제방 사면(호안) → 둔치 → 물가 → 물속 기슭
  const half = (P, wl, bedU, wlTop = wl) => {
    // 물가 높이(수면 위)·폭: 자연 0.38·3.2, 좁고 낮게 0.15·1.3, 없음 0.04·0.15(물속 기슭도 가파르게), 사석 0.38·2
    // 직각 콘크리트(옹벽): 물가에서 하상까지 거의 수직(둔치가 있으면 둔치 끝에서 바로)
    const wallE = P.edge === "wall", edgeUp = { low: 0.15, none: 0.04, wall: 0.3 }[P.edge] ?? 0.38;
    const crest = BANK[P.bank] || BANK.mid, low = wl + edgeUp, berm = (BERM[P.berm] || 0) + (P.bermExtra || 0);
    // 둔치 높이(수면 위 물가보다): 보통 0.2, 낮게 0.05, 수위보다 조금 위 = 그린 물높이 + 0.18, 높게·더 높게 = 제방 높이의 0.5·0.68. 둑마루보다는 낮게
    const hb = P.bermH, bermY = Math.min(crest - 0.3, hb === "water" ? Math.max(wl + 0.02, wlTop + 0.04) : hb === "water2" ? Math.max(wl + 0.1, wlTop + 0.14) : hb === "low" ? low + 0.05 : hb === "wl" ? Math.max(low + 0.2, wlTop + 0.18)
      : hb === "high" ? Math.max(low + 0.2, crest * 0.5) : hb === "xhigh" ? Math.max(low + 0.2, crest * 0.68) : low + 0.2), foot = berm ? bermY : low;
    const run = VERT.has(P.rev) ? 0.12 : Math.max(0.4, (crest - foot) * (SLOPE[P.slope] || SLOPE.mid));
    const edgeRun = { riprap: 2, low: 1.3, none: 0.15, wall: 0.12 }[P.edge] ?? 3.2, uw = wallE ? 0.15 : P.edge === "none" ? (bedU ? 0.9 : 0.35) : bedU ? 2.6 : 1.4, pts = [], z = {};
    let d = LANDW[P.landW] || LANDW.mid;
    // 산림(산지 경사): 둑마루에서 바깥으로 산처럼 오르는 비탈
    const hill = P.land === "mountain" ? 0.85 : 0;
    if (hill) pts.push([0, crest + hill], [d * 0.25, crest + hill * 0.93], [d * 0.55, crest + hill * 0.56], [d * 0.82, crest + hill * 0.16], [d, crest]);
    else pts.push([0, crest], [d, crest]);
    z.land = [0, d];
    z.crest = [d, d + CRESTW]; d += CRESTW; pts.push([d, crest]);
    z.slope = [d, d + run]; d += run; pts.push([d, foot]);
    // 둔치가 물가보다 낮으면(수면과 거의 같게) 물가는 둔치 높이에서 수면으로 이어짐
    if (berm) {
      const eTop = Math.min(low, bermY);
      z.berm = [d, d + berm]; d += berm; pts.push([d, bermY]);
      if (!wallE) { d += Math.max(0.7, (bermY - eTop) * 2); pts.push([d, eTop]); }
    }
    const w0 = d, wTop = berm ? bermY : foot;
    z.edge = [d, d + edgeRun]; d += edgeRun; pts.push([d, wl]);
    const we = d;
    if (bedU && !wallE) pts.push([d + uw * 0.35, wl * 0.45], [d + uw * 0.7, wl * 0.1]);
    d += uw;
    pts.push([d, 0]);
    return { pts, z, we, end: d, crest, top: crest + hill, sy: [crest, foot], wall: wallE ? { x0: w0, y0: wTop, x1: d } : null };
  };
  // 제방 사면(호안 자리)의 [꼭대기, 발치] 용지 mm — 호안은 이 두 점을 잇는 사면 위에만 그림(발치 뒤 물가 턱·물속으로 내려가지 않게)
  const slopeEnds = (zones, L, Rt, X, Y) => {
    const [la, lb] = zones["L-slope"], [ra, rb] = zones["R-slope"];
    return { L: [[X(la), Y(L.sy[0])], [X(lb), Y(L.sy[1])]], R: [[X(rb), Y(Rt.sy[0])], [X(ra), Y(Rt.sy[1])]] };
  };
  const geomConcept = (st, F, needBar) => {
    // 건천은 물을 그리지 않고 지형만 얕은 물 높이로 잡음
    // 더 깊게·제방 끝 가까이는 지형(물가·둔치)은 보통 수심으로 잡고 물만 높이 채움(둔치·물가·사면 아래가 잠김)
    const W = st.water, dry = W.d === "dry", over = W.d === "high" || W.d === "full", wl = dry ? 0.3 : over ? DEPTH.mid : DEPTH[W.d] || DEPTH.mid, bedU = W.bed !== "flat";
    // 그리는 물높이(더 깊게·제방 끝 가까이는 지형 물높이보다 높음) — 둔치·하중도 높이 「수위보다 조금 위」에 씀
    const minCrest = Math.min(BANK[st.L.bank] || BANK.mid, BANK[st.R.bank] || BANK.mid), wlDraw = W.d === "full" ? minCrest - 0.14 : W.d === "high" ? Math.max(wl + 0.3, minCrest * 0.68) : wl;
    // 사주·하중도: 높이(하상에서)·폭은 고른 대로(물이 깊을수록 넓게), 옆 비탈은 높을수록 길게
    const barOn = W.bar !== "none" || needBar, bh = W.barH || "mid";
    const barTop = Math.min(minCrest - 0.3, bh === "low" ? wl + 0.12 : bh === "high" ? wl + 0.58 : bh === "wl" ? Math.max(wl + 0.3, wlDraw + 0.18) : bh === "xhigh" ? Math.max(wl + 0.3, minCrest * 0.5) : wl + 0.3);
    const bw = ({ narrow: 4 + wl * 5, wide: 13 + wl * 8, xwide: 22 + wl * 8 }[W.barW] || 7 + wl * 8), bs = Math.min(1.2 + barTop * 3.5, bw / 2 - 0.8);
    const wW = WIDTH[W.w] || WIDTH.mid, WW = wW + (barOn ? bw + 3 : 0);
    // 물길 위치: 반대쪽 둔치를 넓힘(붙음이면 붙은 쪽 둔치·물가 없앰)
    const pos = W.pos || "center", far = { left: "R", attL: "R", right: "L", attR: "L" }[pos];
    const side = { L: { ...st.L }, R: { ...st.R } };
    if (far) {
      side[far].bermExtra = /^att/.test(pos) ? 1.6 * wW + 8 : 0.8 * wW + 4;
      if (/^att/.test(pos)) Object.assign(side[far === "R" ? "L" : "R"], { berm: "none", edge: "none" });
    }
    const L = half(side.L, wl, bedU, wlDraw), Rt = half(side.R, wl, bedU, wlDraw);
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
      up.push([bc - bw / 2, 0], [bc - bw / 2 + bs, barTop], [bc + bw / 2 - bs, barTop], [bc + bw / 2, 0]);
      zones.bar = [bc - bw / 2 + bs, bc + bw / 2 - bs];
      zones.barBase = [bc - bw / 2, bc + bw / 2];
    }
    up.push(...Rt.pts.map(([d, y]) => [total - d, y]).reverse());
    // 단위 → 용지 mm. 기준 높이 refH(쪽 배치가 위를 자르기 전 틀 높이)로 하상(아래에서 14%)과 세로 배율(높이 VREF가 refH 절반)을 정함 —
    // 위를 잘라 틀 높이가 줄어도 그림은 그대로 위로 올라감. 낮은 제방은 낮게, 높은 제방은 높게(VREF보다 높으면 틀에 맞춰 줄임)
    const refH = F.refH || F.h, maxY = Math.max(L.top, Rt.top), vs0 = (refH * 0.5) / Math.max(maxY, VREF);
    let hs = F.w / total, vs = vs0, rx = (u) => u, needH = null;
    // 하폭 : 제방 높이를 고르면 그 비율로: 단면(제내지 빼고)이 그림 폭을 채우게 키우고 제내지는 고른 폭(mm) 그대로.
    // 세로가 틀에 안 들어가면 쪽 배치에 필요한 틀 높이(needH)를 알려 늘리게 하고, 그래도 넘치면 줄이고 남는 폭은 제내지로
    const ratio = +W.ratio;
    if (ratio > 0) {
      // 제내지 폭: 좁게 10·보통 22·넓게 36 mm(틀 높이 80 mm 기준)
      const lwL = L.z.land[1], lwR = Rt.z.land[1], inner = total - lwL - lwR, kk = refH / 80, LMM = { narrow: 10, mid: 22, wide: 36 };
      const mL = (LMM[st.L.landW] || LMM.mid) * kk, mR = (LMM[st.R.landW] || LMM.mid) * kk;
      const hap = zones["R-slope"][1] - zones["L-slope"][0], bankH = Math.max(L.crest, Rt.crest);
      hs = Math.max(0.05, (F.w - mL - mR) / inner);
      vs = (hs * hap) / (ratio * bankH);
      // 지형이 들어갈 세로: 틀에서 아래 14%(하상 밑)·위 22%(식물·이름표)를 뺀 만큼
      const vsMax = (F.h - 0.36 * refH) / maxY;
      if (vs > vsMax) { needH = (maxY * vs) / 0.64; vs = vsMax; hs = (vs * ratio * bankH) / hap; }
      // 남는 폭은 양쪽 제내지가 고른 폭의 비율대로 나눠 가짐
      const spare = F.w - hs * inner, landL = (spare * mL) / (mL + mR) / hs, landR = (spare * mR) / (mL + mR) / hs;
      rx = (u) => (u <= lwL ? (u * landL) / lwL : u >= total - lwR ? landL + inner + ((u - (total - lwR)) * landR) / lwR : u - lwL + landL);
    }
    const y0 = F.y + F.h - 0.14 * refH;
    const X = (u) => F.x + rx(u) * hs, Y = (v) => y0 - v * vs;
    const pts = up.map(([u, v]) => [X(u), Y(v)]);
    const zmm = Object.fromEntries(Object.entries(zones).map(([k, [a, b]]) => [k, [X(a), X(b)]]));
    const wlY = Y(wlDraw);
    // 물가 콘크리트 옹벽 면(위·아래, 용지 mm)
    const walls = {};
    if (L.wall) walls.L = [[X(L.wall.x0), Y(L.wall.y0)], [X(L.wall.x1), Y(0)]];
    if (Rt.wall) walls.R = [[X(total - Rt.wall.x0), Y(Rt.wall.y0)], [X(total - Rt.wall.x1), Y(0)]];
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
    // 제방 높이(mm, 높은 쪽) — 「나무 높이(제방 대비)」에 씀
    return { pts, zones: zmm, wlY, runs, wide, dry, needH, vs, bankMM: Math.max(L.crest, Rt.crest) * vs, side, walls, slopes: slopeEnds(zones, L, Rt, X, Y), slopeL: [X(zones["L-slope"][0]), X(zones["L-slope"][1])], slopeR: [X(zones["R-slope"][0]), X(zones["R-slope"][1])] };
  };
  // ---------- 실측 방식(m 입력) ----------
  // 하폭 B(좌우 둑마루 안쪽 끝 사이)·수폭·수심(가장 깊은 곳)·둑마루 폭·좌우 제방 높이(하상 → 둑마루)·사면 경사 1:n·
  // 둔치 길이(호안 끝 = 사면 발치에서)·둔치 높이(수면 위)·하중도 폭·높이(수면 위)를 m로 받아 그 비율대로 그림.
  // 물가 폭은 하폭에서 사면·둔치·수폭(·하중도)을 뺀 나머지(물가가 있는 쪽에 나눔). 가로는 그림 폭을 채우고 세로는 고른 배수(자동은 보기 좋게)만큼 과장
  // treeH: 「교목 키」 기본 5 m(키를 적지 않은 교목·침엽수 모두. 칸을 비우면 종 기본)
  const REALDEF = { B: 40, W: 10, D: 0.6, cw: 3, vx: "auto", HL: 4, HR: 4, nL: "2", nR: "2", bL: 6, bR: 8, hbL: 0.8, hbR: 0.8, barW: 4, barH: 0.3, dry: false, treeH: 5 };
  const MODES = [["real", "실측 값으로(하폭·수폭·수심·제방 높이 m)"], ["concept", "개념도(단계 고르기)"]];
  const VXS = [["auto", "자동(보기 좋게)"], ["1", "실제 비율(1배)"], ["2", "2배"], ["3", "3배"], ["5", "5배"], ["10", "10배"], ["20", "20배"]];
  const NS = [["0", "1 : 0(직립·직각)"], ["0.3", "1 : 0.3(거의 직립)"], ["0.5", "1 : 0.5"], ["1", "1 : 1"], ["1.5", "1 : 1.5"], ["2", "1 : 2"], ["3", "1 : 3"], ["4", "1 : 4"], ["5", "1 : 5"]];
  const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
  const num = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
  const fmt1 = (x) => String(Math.round(x * 10) / 10);
  const realOf = (st) => ({ ...REALDEF, ...(st.real || {}) });
  // 식물 실제 키(m): 줄에 적은 키 → 종 → 생활형
  // 사용자 기본(2026-11): 부들류 1·고랭이류 0.5·낮은 벼과 0.3·키 큰 풀 0.5·꽃 피는 풀 0.4·낮은 풀 0.1·교목 5 m — 이 생활형은 종별 키를 따로 두지 않고 생활형 키로
  const REALH = { tallgrass: 2.2, emergent: 1.5, cattail: 1.0, sedge: 0.5, grass: 0.3, forb: 0.5, flower: 0.4, lowherb: 0.1, shrub: 2.0, tree: 5, conifer: 5, floating: 0.05, vine: 0.6 };
  // 종별 키: 달뿌리풀 1·갈대 1.5·갯버들 1.5·줄 0.9 m(사용자 기본). 교목은 「교목 키」를 비웠을 때만
  const SPH = { 버드나무: 9, 왕버들: 10, 선버들: 6, 능수버들: 10, 수양버들: 10, 아까시나무: 12, 느티나무: 15, 오리나무: 12, 물오리나무: 10, 팽나무: 12, 가중나무: 12, 신나무: 7,
    갯버들: 1.5, 키버들: 2.5, 찔레꽃: 1.5, 찔레: 1.5, 국수나무: 1.5, 족제비싸리: 3, 갈대: 1.5, 달뿌리풀: 1, 억새: 1.8, 물억새: 1.8, 갈풀: 1.5, 줄: 0.9, 창포: 0.8,
    소나무: 12, 곰솔: 12, 리기다소나무: 12, 잣나무: 15, 낙엽송: 18, 메타세쿼이아: 20 };
  // tH: 「교목 키(m)」(실측 방식) — 키를 따로 적지 않은 교목·침엽수에
  const realH = (v, tH = 0) => {
    const h = parseFloat(v.hm);
    if (h > 0) return h;
    if ((v.form === "tree" || v.form === "conifer") && tH > 0) return tH;
    return SPH[String(v.name || "").replace(/\s/g, "")] ?? REALH[v.form] ?? 1;
  };
  const geomReal = (st, F, needBar) => {
    const R = realOf(st), Wt = st.water, warn = [], bedU = Wt.bed !== "flat", dry = !!R.dry;
    const D = Math.max(0.02, num(R.D, 0.6)), Wd = Math.max(0.2, num(R.W, 10)), cw = Math.max(0.3, num(R.cw, 3));
    const barOn = Wt.bar !== "none" || needBar, barW = barOn ? Math.max(0.3, num(R.barW, 4)) : 0, barH = Math.max(0.02, num(R.barH, 0.3));
    const side = { L: { ...st.L }, R: { ...st.R } }, P = {};
    ["L", "R"].forEach((sd) => {
      const H = Math.max(D + 0.2, num(R[`H${sd}`], 4)), edge = side[sd].edge || "natural";
      P[sd] = { H, edge, vert: VERT.has(side[sd].rev), Lb: Math.max(0, num(R[`b${sd}`], 0)), hb: Math.min(Math.max(0.02, num(R[`hb${sd}`], 0.8)), H - D - 0.1),
        hE: Math.min({ low: 0.1, none: 0.02, wall: 0.3 }[edge] ?? 0.3, H - D - 0.05), n: Math.max(0, num(R[`n${sd}`], 2)) };
    });
    const foot = (p) => D + (p.Lb > 0 ? p.hb : p.hE);
    // 사면 가로 길이: 직립 호안(돌쌓기·옹벽)은 수직(0), 나머지는 높이 × n
    const run = (p) => (p.vert ? 0 : (p.H - foot(p)) * p.n);
    // 수직 기슭(직립 호안·물가 옹벽·맞춤으로 사면이 수직이 된 쪽)은 물속도 수직으로 내려감(네모난 단면)
    const sheer = (p) => p.vert || p.edge === "wall" || p.n < 0.02;
    // 하폭·수폭이 먼저: 하폭 − 수폭(− 하중도) 안에 사면·둔치가 들지 않으면 ① 둔치를 줄이고(0까지) ② 사면을 가파르게(1:n의 n을 줄여 직립 가까이)
    // ③ 그래도 안 되면(수폭이 하폭과 같거나 넓음 등) 하폭을 늘려 그림. 실제로 그린 값은 applied로 알림
    const B = Math.max(1, num(R.B, 30)), n0 = { L: P.L.n, R: P.R.n };
    let rem = B - run(P.L) - run(P.R) - P.L.Lb - P.R.Lb - Wd - barW;
    if (rem < -1e-6) {
      const lb = P.L.Lb + P.R.Lb, cut = Math.min(lb, -rem);
      if (cut > 0) { const k = (lb - cut) / lb; P.L.Lb *= k; P.R.Lb *= k; rem += cut; }
      if (rem < -1e-6) {
        // 둔치가 없어지면 사면 발치가 물가 높이로 내려가 사면이 길어지므로 다시 셈. 사면은 수직(1:0)까지
        rem = B - run(P.L) - run(P.R) - P.L.Lb - P.R.Lb - Wd - barW;
        const S = run(P.L) + run(P.R), k = S > 0 ? Math.max(0, (S + rem) / S) : 0;
        ["L", "R"].forEach((sd) => { if (!P[sd].vert) P[sd].n = Math.max(0, P[sd].n * k); });
        rem = B - run(P.L) - run(P.R) - P.L.Lb - P.R.Lb - Wd - barW;
      }
      if (rem < -1e-6) { warn.push(`수폭이 하폭에 비해 넓어 사면을 거의 직립으로 해도 ${fmt1(-rem)} m 모자라, 하폭을 늘려 그렸습니다.`); rem = 0; }
    }
    // 물가 폭: 남는 폭을 물가가 있는 쪽(없음·옹벽 빼고)에 나눔. 양쪽 다 없으면 둔치에
    const wt = (p) => (p.edge === "none" || p.edge === "wall" ? 0 : 1), ws = wt(P.L) + wt(P.R);
    if (ws) { P.L.e = (rem * wt(P.L)) / ws; P.R.e = (rem * wt(P.R)) / ws; } else { P.L.e = P.R.e = 0; P.L.Lb += rem / 2; P.R.Lb += rem / 2; }
    // 둔치 없이 물가 폭이 거의 없으면(1:0.5보다 가파른 턱) 사면 발치~수면 사이 수직 턱을 없애고 사면을 수면까지 곧게 이음(같은 가로 폭 안에서) —
    // 호안이 사면을 따라 물가까지 덮음. 직립 호안은 수면까지 세우고 남은 물가 폭은 수면 높이 평지로
    ["L", "R"].forEach((sd) => {
      const p = P[sd];
      if (p.Lb > 1e-6 || p.edge === "wall" || p.hE < 0.05 || p.e >= p.hE * 0.5) return;
      // 직립(직립 호안·사면 1:0)은 수직 그대로 수면까지 세우고 물가 폭은 남김
      const upright = p.vert || p.n < 0.02, span = run(p) + (upright ? 0 : p.e);
      p.hE = 0;
      if (!upright) { p.n = span / (p.H - D); p.e = 0; }
    });
    // 물속 기슭: 둥근 바닥은 수심의 3배·평평하면 1.5배(수폭의 30%까지), 옹벽은 수직
    const uw = (p) => (sheer(p) ? 0.02 : Math.min(Wd * 0.3, D * (bedU ? 3 : 1.5)));
    const hill = (sd) => (side[sd].land === "mountain" ? Math.max(0.5, P[sd].H * 0.35) : 0);
    // 한쪽 꺾은선(바깥 0 → 하상): 제내지(가상 폭 1 — 그릴 때 고른 mm로) → 둑마루 → 사면 → 둔치 → 물가 → 물속 기슭
    const build = (sd) => {
      const p = P[sd], pts = [], z = {}, h = hill(sd), f = foot(p), r = run(p);
      if (h) pts.push([0, p.H + h], [0.25, p.H + h * 0.93], [0.55, p.H + h * 0.56], [0.82, p.H + h * 0.16], [1, p.H]); else pts.push([0, p.H], [1, p.H]);
      let d = 1;
      z.land = [0, 1];
      z.crest = [d, d + cw]; d += cw; pts.push([d, p.H]);
      z.slope = [d, d + r]; d += r; pts.push([d, f]);
      if (p.Lb > 0) { z.berm = [d, d + p.Lb]; d += p.Lb; pts.push([d, f]); }
      const w0 = d, e = Math.max(wt(p) ? 0 : 0.02, p.e);
      z.edge = [d, d + e]; d += e; pts.push([d, D]);
      const we = d, u = uw(p);
      if (bedU && !sheer(p)) pts.push([d + u * 0.35, D * 0.45], [d + u * 0.7, D * 0.1]);
      d += u;
      pts.push([d, 0]);
      return { pts, z, we, end: d, top: p.H + h, sy: [p.H, f], wall: p.edge === "wall" ? { x0: w0, y0: f, x1: d } : null };
    };
    const L = build("L"), Rt = build("R");
    const bed = Math.max(0.1, Wd + barW - (L.end - L.we) - (Rt.end - Rt.we)), total = L.end + bed + Rt.end;
    const zones = {};
    Object.entries(L.z).forEach(([k, v]) => { zones[`L-${k}`] = v; });
    Object.entries(Rt.z).forEach(([k, v]) => { zones[`R-${k}`] = [total - v[1], total - v[0]]; });
    const reach = (L.end - L.we) + Math.min(Wd * 0.2, bed * 0.25);
    zones["L-water"] = [L.we, L.we + reach];
    zones["R-water"] = [total - Rt.we - reach, total - Rt.we];
    const up = [...L.pts];
    if (barOn) {
      const fp = { left: 0.3, center: 0.5, right: 0.7 }[Wt.bar] || 0.5, bw = barW, top = D + barH, bs = Math.min(bw * 0.3, top * 2);
      const bc = Math.max(L.end + bw / 2, Math.min(L.end + bed - bw / 2, L.end + bed * fp));
      up.push([bc - bw / 2, 0], [bc - bw / 2 + bs, top], [bc + bw / 2 - bs, top], [bc + bw / 2, 0]);
      zones.bar = [bc - bw / 2 + bs, bc + bw / 2 - bs];
      zones.barBase = [bc - bw / 2, bc + bw / 2];
    }
    up.push(...Rt.pts.map(([d, y]) => [total - d, y]).reverse());
    // 가로: 단면(제내지 빼고)이 그림 폭을 채움(제내지는 고른 mm). 세로: 가로와 같은 배율(실제 비율) — 식물까지 틀에 안 들면 그림 높이를 늘리고, 그래도 넘치면 줄이고 남는 폭은 제내지로
    const refH = F.refH || F.h, maxY = Math.max(L.top, Rt.top), inner = total - 2, kk = refH / 80, LMM = { narrow: 10, mid: 22, wide: 36 };
    const mL = (LMM[st.L.landW] || LMM.mid) * kk, mR = (LMM[st.R.landW] || LMM.mid) * kk;
    // 가로·세로는 늘 같은 비율(실제 비율, 세로 과장 없음). 단면은 지형(둑마루)에만 맞춰 그림 폭을 채움 — 높은 나무는 틀 위에서 잘림
    let hs = Math.max(0.01, (F.w - mL - mR) / inner);
    const vx = 1;
    // 지형이 들어갈 세로: 틀에서 아래 14%(하상 밑)·위 22%(풀·이름표)를 뺀 만큼. 모자라면 쪽 배치에 높이를 늘리게 하고, 그래도 넘치면 줄이고 남는 폭은 제내지로
    const avail = (fh) => fh - 0.36 * refH;
    let vs = hs * vx, needH = null;
    if (vs * maxY > avail(F.h)) { needH = (vs * maxY) / 0.64; vs = avail(F.h) / maxY; hs = vs / vx; }
    const spare = F.w - hs * inner, landL = (spare * mL) / (mL + mR) / hs, landR = (spare * mR) / (mL + mR) / hs;
    const rx = (u) => (u <= 1 ? u * landL : u >= total - 1 ? landL + inner + (u - (total - 1)) * landR : u - 1 + landL);
    const y0 = F.y + F.h - 0.14 * refH, X = (u) => F.x + rx(u) * hs, Y = (v) => y0 - v * vs;
    const pts = up.map(([u, v]) => [X(u), Y(v)]);
    const zmm = Object.fromEntries(Object.entries(zones).map(([k, [a, b]]) => [k, [X(a), X(b)]]));
    const wlY = Y(D);
    const walls = {};
    if (L.wall) walls.L = [[X(L.wall.x0), Y(L.wall.y0)], [X(L.wall.x1), Y(0)]];
    if (Rt.wall) walls.R = [[X(total - Rt.wall.x0), Y(Rt.wall.y0)], [X(total - Rt.wall.x1), Y(0)]];
    const runs = [];
    let rn = null;
    pts.forEach((p, i) => {
      const under = p[1] > wlY + 1e-6;
      if (i) {
        const q = pts[i - 1], qu = q[1] > wlY + 1e-6;
        if (under !== qu) {
          const t = (wlY - q[1]) / (p[1] - q[1]), c = [q[0] + (p[0] - q[0]) * t, wlY];
          if (under) rn = [c]; else if (rn) { rn.push(c); runs.push(rn); rn = null; }
        }
      }
      if (under && rn) rn.push(p);
    });
    if (dry) runs.length = 0;
    const wide = runs.reduce((b, r) => (!b || r[r.length - 1][0] - r[0][0] > b[b.length - 1][0] - b[0][0] ? r : b), null);
    if (wide) { const a = wide[0][0], b = wide[wide.length - 1][0]; zmm.surface = [a + (b - a) * 0.28, b - (b - a) * 0.28]; }
    const Beff = zones["R-slope"][1] - zones["L-slope"][0];
    // 그린 값(입력과 다르게 맞춘 것 표시): 사면 경사·둔치 길이·물가 폭
    const nTxt = (sd) => `${P[sd].n < 0.02 ? "직립" : `1:${fmt1(P[sd].n)}`}${Math.abs(P[sd].n - n0[sd]) > 0.01 ? "(맞춤)" : ""}`;
    const applied = `그린 값 — 사면 좌 ${P.L.vert ? "직립" : nTxt("L")}·우 ${P.R.vert ? "직립" : nTxt("R")}, 둔치 좌 ${fmt1(P.L.Lb)} m·우 ${fmt1(P.R.Lb)} m, 물가 좌 ${fmt1(P.L.e)} m·우 ${fmt1(P.R.e)} m${Math.abs(Beff - B) > 0.05 ? `, 하폭 ${fmt1(Beff)} m` : ""}`;
    return { pts, zones: zmm, wlY, runs, wide, dry, needH, vs, hs, bankMM: Math.max(P.L.H, P.R.H) * vs, side, walls, warn, applied,
      real: { B: Beff, W: Wd, D, HL: P.L.H, HR: P.R.H, vx }, slopes: slopeEnds(zones, L, Rt, X, Y),
      slopeL: [X(zones["L-slope"][0]), X(zones["L-slope"][1])], slopeR: [X(zones["R-slope"][0]), X(zones["R-slope"][1])] };
  };
  const geom = (st, F, needBar) => (st.mode === "real" ? geomReal : geomConcept)(st, F, needBar);
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
  // 직접 찍은 자리: 식생 줄의 pos = [{ z: 위치 구간, t: 구간 안 비율(0 왼쪽 끝 ~ 1 오른쪽 끝) }]. 수폭·경사·비율을 바꿔도 같은 지형(사면·물가 등)에 남음.
  // 찍은 자리가 있으면 고른 위치·양 대신 찍은 자리마다 하나씩 그림
  const PIN_ZONES = ["L-land", "L-crest", "L-slope", "L-berm", "L-edge", "L-water", "bar", "R-water", "R-edge", "R-berm", "R-slope", "R-crest", "R-land"];
  const pinsOf = (v) => (v && Array.isArray(v.pos) ? v.pos.filter((p) => p && PIN_ZONES.includes(p.z) && Number.isFinite(p.t)) : []);
  const order = (v) => { const ps = pinsOf(v); return ps.length ? Math.min(...ps.map((p) => zoneIdx[p.z] + Math.max(0, Math.min(0.98, p.t)))) : zoneIdx[v.zone] + 0.5; };
  // 하중도·사주가 없어도 식생을 그곳에 두면(고른 위치·찍은 자리) 그림
  const needBar = (items) => items.some((v) => (pinsOf(v).length ? pinsOf(v).some((p) => p.z === "bar") : v.zone === "bar"));
  // 찍은 자리 → x(mm). 그 구간이 없어졌으면 둔치는 물가로, 하중도는 물 가운데로
  const pinX = (g, p) => {
    let r = g.zones[p.z];
    if (!r && p.z.endsWith("-berm")) r = g.zones[p.z.replace("-berm", "-edge")];
    if (!r && p.z === "bar") { const a = g.zones["L-water"][1], b = g.zones["R-water"][0]; r = a < b ? [a, b] : [(a + b) / 2, (a + b) / 2]; }
    return r ? r[0] + (r[1] - r[0]) * p.t : null;
  };
  // x(mm) → 찍은 자리. 하중도 위가 먼저, 구간 사이 틈(둔치 끝 비탈·물 가운데)은 가장 가까운 구간
  const pinOf = (g, x) => {
    const list = PIN_ZONES.filter((k) => g.zones[k]), inside = (k) => x >= g.zones[k][0] - 1e-6 && x <= g.zones[k][1] + 1e-6;
    let z = g.zones.bar && inside("bar") ? "bar" : list.find(inside);
    if (!z) z = list.reduce((b, k) => { const [a, c] = g.zones[k], d = x < a ? a - x : x - c; return !b || d < b[1] ? [k, d] : b; }, null)[0];
    const [a, b] = g.zones[z], t = b - a > 1e-6 ? (x - a) / (b - a) : 0.5;
    return { z, t: Math.round(Math.max(-1, Math.min(2, t)) * 1000) / 1000 };
  };
  // 쓰는 식생(이름이나 생활형이 있는 것) — 번호 차례: 왼쪽 위치부터, 같은 위치는 적은 차례
  const usedVeg = (st) => st.veg.map((v, i) => ({ ...v, i })).filter((v) => v.name.trim() && FORMS.some(([f]) => f === v.form) && zoneIdx[v.zone] !== undefined)
    .sort((a, b) => order(a) - order(b) || a.i - b.i);
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
  // 쪽 틀: 폭은 고른 크기 그대로(가로형). fh = 틀 높이(없으면 고른 크기대로), refH = 그림 기준 높이(위를 잘라도 그대로)
  const baseLayout = (fig, fh, refH) => {
    const S = fig.sec, st = cur(S), [W, H0] = SIZE_MM[S.size] || SIZE_MM["180x100"];
    const e0 = S.size === "a4" ? 1.4 : 1, e = e0 * ((fig.el && fig.el.size) || 1), m = (S.size === "a4" ? 10 : 2.5) * e0;
    const info = S.info && (st.river || st.loc) ? 7 * e : 0;
    const title = fig.el.title && fig.title ? 8.5 * e : 0;
    const legend = S.label === "num" ? legendRows(st, 7.2 * e, e, W - 2 * m - 6 * e) : [];
    const legendH = legend.length ? legend.length * 4.6 * e + 3 * e : 0;
    // 실측 방식: 아래 설명 맨 앞에 제원 줄(「제원 줄」을 끄면 뺌)
    const RV = realOf(st), hh = (k) => fmt1(num(RV[k], 0));
    const spec = st.mode === "real" && S.spec !== false ? `하폭 ${hh("B")} m · 수폭 ${hh("W")} m · 수심 ${hh("D")} m · 제방 높이 ${hh("HL") === hh("HR") ? `${hh("HL")} m` : `좌안 ${hh("HL")} m, 우안 ${hh("HR")} m`}${RV.dry ? " · 건천" : ""}
` : "";
    const notes = wrap(spec + (st.note || ""), 7.4 * e, W - 2 * m - 4 * e), notesH = notes.length ? notes.length * 3.9 * e + 2.5 * e : 0;
    const top = m + info + title, h = fh ?? H0 - top - m - legendH - notesH;
    return { W, H: top + h + m + legendH + notesH, e, e0, m, info, title, legend, legendH, notes, notesH, frame: { x: m, y: top, w: W - 2 * m, h, refH: refH ?? h, psize: PSZ[S.psize] || 1 } };
  };
  // 쪽 배치(가로형): 하폭 : 제방 높이를 고른 단면이 높으면 그림 높이를 늘리고(가로의 3/4까지), 미리 그려 본 뒤 위쪽이 비면(낮은 제방 등) 그만큼 자름
  let LC = { key: "", val: null };
  const layout = (fig) => {
    const key = JSON.stringify([fig.sec, fig.title, fig.el && fig.el.title, fig.el && fig.el.size]);
    if (LC.key === key) return LC.val;
    const st = cur(fig.sec);
    let Lo = baseLayout(fig);
    const g0 = geom(st, Lo.frame, needBar(usedVeg(st)));
    // 그림 높이 한도: 가로의 0.6배(가로형) — 넘치면 단면을 줄이고 남는 폭은 제내지로
    const capFh = (L0) => Math.max(L0.frame.h, L0.W * 0.6 - (L0.H - L0.frame.h));
    if (g0.needH && g0.needH > Lo.frame.h + 0.5) { const fh = Math.min(g0.needH, capFh(Lo)); Lo = baseLayout(fig, fh, fh); }
    // 그린 것 가운데 가장 위(좌안·우안 글자·하폭 치수 빼고)에서 여유만 남기고 자르고(틀은 30 mm보다 낮게 하지 않음),
    // 식물·이름표가 틀 위로 넘치면 그만큼 늘림(한도까지)
    const top = paint(new Carto.NullPen(), fig, Lo).top;
    const pad = ((fig.sec.sides ? 8.5 : 3.5) + ((st.water.hText || "").trim() ? 6 : 0)) * Lo.e;
    const F = Lo.frame, cut = Number.isFinite(top) ? Math.min(top - F.y - pad, F.h - 30 * Lo.e0) : 0;
    if (cut > 1) Lo = baseLayout(fig, F.h - cut, F.refH);
    else if (cut < -1 && st.mode !== "real") Lo = baseLayout(fig, Math.min(F.h - cut, capFh(Lo)), F.refH);
    LC = { key, val: Lo };
    return Lo;
  };

  // ---------- 그리기 ----------
  const paint = (pen, fig, Lo = layout(fig)) => {
    const { W, H, e, m, frame: F } = Lo, S = fig.sec, st = cur(S), mono = S.style === "mono";
    // 그린 것 가운데 가장 위(쪽 배치가 위쪽 빈 곳을 자를 때 씀)
    let topY = Infinity;
    const upTop = (y) => { if (Number.isFinite(y) && y < topY) topY = y; };
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
    const g = geom(st, F, needBar(items));
    upTop(Math.min(...g.pts.map((q) => q[1])));
    // 식물 크기: 지형 세로 배율에 맞춤(단면을 키우면 같이 커짐). 「나무 높이(제방 대비)」를 고르면 교목 높이 = 제방 높이 × 그 배수(다른 생활형은 같은 비율로)
    // 실측 방식: 식물마다 실제 키(m) × 세로 배율(덩굴·부엽·제내지 그림은 키 1 m 풀 기준). 개념도: 지형 배율, 「나무 높이(제방 대비)」는 교목·침엽수에만
    const real = st.mode === "real", tr = +st.treeRef;
    const s = real ? (1.0 * g.vs) / SIZE.forb : (g.vs / VS_STD) * ((fig.el && fig.el.size) || 1), sTree = !real && tr > 0 ? (tr * g.bankMM) / SIZE.tree : s;
    const sf = (form) => (form === "tree" || form === "conifer" ? sTree : s);
    // 개념도: 같은 생활형이라도 낮게 자라는 종은 작게(쑥은 둑마루·둔치에 낮게 깔림)
    const SPF = { 쑥: 0.55 }, spf = (v) => SPF[String(v.name || "").replace(/\s/g, "")] || 1;
    const tH = num(realOf(st).treeH, 0), sfv = (v) => (real ? (realH(v, tH) * g.vs) / SIZE[v.form] : sf(v.form) * spf(v));
    const GROUND = { soil: { fill: "#d9bb8f", line: "#6b4f2a" }, line: { fill: "#ffffff", line: ink }, hatch: { fill: "#ffffff", line: ink, hatch: true } }[S.ground] || { fill: "#d9bb8f", line: "#6b4f2a" };
    const occupied = [];
    const hit = (b) => occupied.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

    // 식생 자리: 같은 위치의 것끼리 위치 구간을 나눠 가짐. 제내지에 건물·도로 등이 있으면 둑 쪽 절반만
    const zoneOf = (z) => (z.endsWith("-berm") && !g.zones[z] ? z.replace("-berm", "-edge") : z);
    const byZone = new Map();
    items.forEach((v) => { const z = zoneOf(v.zone); if (g.zones[z] && !pinsOf(v).length) (byZone.get(z) || byZone.set(z, []).get(z)).push(v); });
    const plants = [];   // { v, form, x, y, h, kind: "one" | "vine" | "float", pts }
    // 식물 크기: 전체(모양) × 식생 줄마다
    const fz = (v) => (PSZ[S.psize] || 1) * (PSZ[v.size] || 1);
    byZone.forEach((list, z) => {
      let [a, b] = g.zones[z];
      const sd = z[0], land = z.endsWith("-land") ? st[sd].land : "none";
      if (land !== "none") { const cut = a + (b - a) * 0.5; if (sd === "L") a = cut; else b = a + (b - a) * 0.5; }
      const pad = Math.min(1.2, (b - a) * 0.08);
      a += pad; b -= pad;
      list.forEach((v, k) => {
        const a1 = a + ((b - a) * k) / list.length, b1 = a + ((b - a) * (k + 1)) / list.length, R = rng(hash(`${st.id}|${v.i}|${v.name}`));
        if (v.form === "vine") {
          // 제방 사면의 덩굴은 사면 선(꼭대기~발치)을 나눠 따라감 — 직립(1:0) 사면도 벽을 타고 내려옴
          const sl = z.endsWith("-slope") && g.slopes && g.slopes[sd];
          if (sl) {
            const [p0, p1] = sd === "L" ? sl : [sl[1], sl[0]], at = (t) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
            plants.push({ v, form: "vine", pts: [at(0.04 + (0.92 * k) / list.length), at(0.04 + (0.92 * (k + 1)) / list.length)], R });
          } else plants.push({ v, form: "vine", pts: slice(g.pts, a1, b1), R });
          return;
        }
        const w = WIDE[v.form] * sfv(v) * fz(v), n0 = ["tree", "conifer", "shrub"].includes(v.form) ? { few: 1, mid: 2, many: 3 }[v.amt] || 2 : COUNT[v.amt] || 3;
        const n = Math.max(1, Math.min(n0, Math.floor((b1 - a1) / (w * 0.5))));
        const narrow = z.endsWith("-slope") && b1 - a1 < 3;   // 직립 호안: 위(둑 가장자리)와 발치에 번갈아
        for (let i = 0; i < n; i++) {
          let x = n === 1 ? (a1 + b1) / 2 : a1 + ((i + 0.5) * (b1 - a1)) / n + (R() - 0.5) * ((b1 - a1) / n) * 0.3;
          if (narrow) x = (i % 2 === 0) === (sd === "L") ? a1 - 1.6 * s : b1 + 1.6 * s;
          if (v.form === "floating") { if (!g.dry) plants.push({ v, form: "floating", x, y: g.wlY, R }); continue; }
          const y = groundY(g.pts, x), sub = g.dry ? 0 : Math.max(0, y - g.wlY), h0 = SIZE[v.form] * sfv(v) * fz(v) * (0.88 + R() * 0.24);
          // 물속 자리(하도에 뿌리)는 수면 위로 나오게 키우되(보통 키의 2.2배까지), 잠긴 둔치·물가·사면의 식생은 그대로(물에 잠김)
          const grow = sub > 0 && z.endsWith("-water");
          plants.push({ v, form: v.form, x, y, h: grow ? Math.max(h0, Math.min(sub + h0 * 0.55, h0 * 2.2)) : h0, R, wet: sub > 0 });
        }
      });
    });
    // 직접 찍은 자리: 자리마다 하나씩. 가까이 모인 것끼리 이름표 하나(양쪽 기슭에 찍으면 이름표도 따로)
    items.forEach((v) => {
      const xs = pinsOf(v).map((p) => [pinX(g, p), p]).filter(([x]) => x !== null).sort((a, b) => a[0] - b[0]);
      let gi = 0;
      xs.forEach(([x0, p], k) => {
        if (k && x0 - xs[k - 1][0] > 16 * s) gi += 1;
        const x = Math.max(F.x + 0.3, Math.min(F.x + F.w - 0.3, x0)), R = rng(hash(`${st.id}|${v.i}|${v.name}|pin${k}`)), gk = `${v.i}:${gi}`;
        if (v.form === "vine") { plants.push({ v, gk, form: "vine", pts: slice(g.pts, Math.max(F.x, x - 3.5 * s * fz(v)), Math.min(F.x + F.w, x + 3.5 * s * fz(v))), R }); return; }
        if (v.form === "floating") { if (!g.dry) plants.push({ v, gk, form: "floating", x, y: Math.min(g.wlY, groundY(g.pts, x)), R }); return; }
        const y = groundY(g.pts, x), sub = g.dry ? 0 : Math.max(0, y - g.wlY), h0 = SIZE[v.form] * sfv(v) * fz(v) * (0.88 + R() * 0.24);
        const grow = sub > 0 && p.z.endsWith("-water");
        plants.push({ v, gk, form: v.form, x, y, h: grow ? Math.max(h0, Math.min(sub + h0 * 0.55, h0 * 2.2)) : h0, R, wet: sub > 0 });
      });
    });
    const groups = new Map();   // 적은 식생 하나(찍은 자리는 모인 자리마다) → 기호들의 범위(이름표 자리)
    const drawPlant = (p) => {
      const C = colors(p.form, p.v.name, mono);
      const r = p.form === "vine" ? vine(pen, p.pts, s * fz(p.v), p.R, C, p.v.name) : p.form === "floating" ? floating(pen, p.x, p.y, s * fz(p.v), p.R, C) : G[p.form](pen, p.x, p.y, p.h, p.R, C, p.v.name);
      const x0 = p.form === "vine" ? p.pts[0][0] : p.x - r.half, x1 = p.form === "vine" ? p.pts[p.pts.length - 1][0] : p.x + r.half;
      const key = p.gk ?? p.v.i, gr = groups.get(key) || { v: p.v, x0: Infinity, x1: -Infinity, top: Infinity, xs: [] };
      gr.x0 = Math.min(gr.x0, x0); gr.x1 = Math.max(gr.x1, x1); gr.top = Math.min(gr.top, r.top); gr.xs.push(p.form === "vine" ? (x0 + x1) / 2 : p.x);
      groups.set(key, gr);
      upTop(r.top);
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
    // 실측 방식은 넓은 하천에서 축척이 작아져도 호안이 보이게 최소 두께(mm)를 둠
    const sR = real ? Math.max(s, 0.45 * e) : s;
    const rev = (sd) => {
      const s = sR, P = g.side[sd], [top, foot] = g.slopes[sd];
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
      // 물가 콘크리트 옹벽: 거의 수직인 면에서 땅 쪽으로 두께만큼 회색 빗금 블록
      if (P.edge === "wall" && g.walls[sd]) {
        const [tp, bt] = g.walls[sd], t = 1.3 * s, k = sd === "L" ? -1 : 1;
        pen.path([[tp, bt, [bt[0] + k * t, bt[1]], [tp[0] + k * t, tp[1]]]], mono ? { closed: true, fill: "#ffffff", stroke: ink, width: 0.25, hatch: { color: "#777777", angle: 45, gap: 0.9 * s, width: 0.12 } }
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
      // 제내지 이용 자리: 둑마루까지면 하천 쪽 둑마루 끝 바로 옆까지(제방 위 자전거도로, 제방에 붙은 주거지 등)
      let [a, b] = g.zones[`${sd}-land`];
      // 비율(끝에서 10~100%): 바깥 끝에서 둑마루 하천 쪽 끝(사면 꼭대기)까지를 100%로 보고 그 비율만큼(예전 「둑마루까지」 = 100%)
      const pct = P.landPos === "crest" ? 1 : Math.min(1, (parseFloat(P.landPos) || 0) / 100), onCrest = pct > 0 && g.zones[`${sd}-crest`];
      if (onCrest) { const c = g.zones[`${sd}-crest`]; if (sd === "L") b = a + (c[1] - a) * pct; else a = b - (b - c[0]) * pct; }
      const full = onCrest || P.landW === "narrow" || P.land === "mountain", x0 = sd === "L" || full ? a : a + (b - a) * 0.5, x1 = sd === "L" && !full ? a + (b - a) * 0.5 : b, y = groundY(g.pts, (x0 + x1) / 2);
      let cx = (x0 + x1) / 2;
      // 좁은 제내지는 그림을 줄이고(실측은 집 높이 약 7 m 기준), 「제내지 그림 크기」를 곱함
      const IZ = ICONSZ[S.iconSize] || 1, ks = Math.min(real ? (7 * g.vs) / 8.6 : s, (x1 - x0) / 9.5) * IZ;
      const fillOr = (c) => (mono ? "#ffffff" : c);
      let top = y - 3 * ks;
      if ((S.landStyle || "band") === "band") {
        // 바닥 색 + 글자: 제내지 땅 표면을 따라 이용별 색 띠(높이로 그리지 않음), 이름은 그 위 가운데
        const ba = Math.max(F.x, a), bb = Math.min(F.x + F.w, b), t = 1.5 * e;
        const surf = slice(g.pts, ba, bb), col = mono ? "#6b6b6b" : LANDCOL[P.land] || "#8d6748";
        pen.path([[...surf, ...surf.map(([x, yy]) => [x, yy + t]).reverse()]], { closed: true, fill: col, stroke: mono ? ink : col, width: 0.15 * e });
        if (P.land === "road" || P.land === "bike") pen.path([surf.map(([x, yy]) => [x, yy + t / 2])], { stroke: "#ffffff", width: 0.18 * e, dash: [0.9 * e, 0.7 * e] });
        cx = (ba + bb) / 2;
        top = groundY(g.pts, cx) - 0.8 * e;
      } else if (P.land === "house") {
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
        const th = (real ? 9 * g.vs : 13 * s) * IZ, pad = th * 0.3, a0 = sd === "L" ? x0 + pad : x0 + (x1 - x0) * 0.14, a1 = sd === "L" ? x1 - (x1 - x0) * 0.14 : x1 - pad;
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
      upTop(ty - fs * PT);
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
    // 실측 방식은 비워 두면 입력 값으로(「치수」를 끄면 안 그림)
    const autoDim = real && S.dims !== false;
    const hT = (st.water.hText || "").trim() || (autoDim ? `하폭 ${fmt1(g.real.B)} m` : ""), wT = (st.water.wText || "").trim() || (autoDim && !g.dry ? `수폭 ${fmt1(g.real.W)} m` : "");
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

    // 실측 방식: 축척 막대(가로 m, 왼쪽 아래 흰 상자 — 모양의 「축척 막대」로 켜고 끔) — 이름표가 피함
    if (real && S.sbar !== false && g.hs) {
      const L0 = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].filter((n) => n * g.hs <= F.w * 0.2).pop() || 1, bw = L0 * g.hs, fs2 = 5.8 * e;
      const tw = bw + textW(`${fmt1(L0)} m`, fs2) + 0.8 * e;
      const bx = F.x + 1.5 * e, bh = 6.4 * e, by = F.y + F.h - 1.5 * e - bh;
      pen.path([[[bx, by], [bx + tw + 2.4 * e, by], [bx + tw + 2.4 * e, by + bh], [bx, by + bh]]], { closed: true, fill: "#ffffff", fillOpacity: 0.9, stroke: "#868e96", width: 0.15 * e });
      const x0 = bx + 1.2 * e, yb = by + 3.8 * e, hb = 0.9 * e;
      [0, 1].forEach((k) => pen.path([[[x0 + (k * bw) / 2, yb], [x0 + ((k + 1) * bw) / 2, yb], [x0 + ((k + 1) * bw) / 2, yb + hb], [x0 + (k * bw) / 2, yb + hb]]], { closed: true, fill: k ? "#ffffff" : ink, stroke: ink, width: 0.15 * e }));
      [[0, "0"], [0.5, fmt1(L0 / 2)], [1, `${fmt1(L0)} m`]].forEach(([t, lab]) => pen.text(lab, x0 + bw * t, yb - 0.5 * e, { size: fs2, align: t === 1 ? "left" : "center", base: "bottom", color: "#111" }));
      occupied.push([bx - 0.5, by - 0.5, bx + tw + 2.4 * e + 0.5, by + bh + 0.5]);
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
      upTop(pick[1]);
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
    return { warn: g.warn || [], applied: g.applied || "", layout: Lo, top: topY };
  };
  // 글자를 먼저 모아 글꼴을 받은 뒤 그림(캔버스는 글꼴이 늦으면 다른 글꼴로 그려짐)
  const render = async (pen, fig) => {
    const np = new Carto.NullPen();
    paint(np, fig);
    await Carto.ensureFonts(np.strings);
    return paint(pen, fig);
  };

  // 미리보기에서 누른 자리(용지 mm) → 찍은 자리(그림 틀 밖이면 null)
  const pinGeom = (fig) => { const F = layout(fig).frame, st = cur(fig.sec); return { F, st, g: geom(st, F, needBar(usedVeg(st))) }; };
  const pinAt = (fig, px, py) => {
    const { F, g } = pinGeom(fig);
    return px < F.x || px > F.x + F.w || py < F.y || py > F.y + F.h ? null : pinOf(g, px);
  };
  // 찍은 자리들의 땅 위치 [x, y, 차례](용지 mm) — 찍는 동안 표시·지우기
  const pinPoints = (fig, vi) => {
    const { st, g } = pinGeom(fig);
    return pinsOf(st.veg[vi]).map((p, i) => { const x = pinX(g, p); return x === null ? null : [x, groundY(g.pts, x), i]; }).filter(Boolean);
  };
  // x(mm)의 땅 높이(그림 틀 밖이면 null)
  const groundAt = (fig, px) => { const { F, g } = pinGeom(fig); return px < F.x || px > F.x + F.w ? null : groundY(g.pts, px); };

  window.Section = { pinsOf, pinAt, pinPoints, groundAt, RATIOS, PRESETS, applyPreset, FORMS, ZONES, AMT, LAND, LANDWS, MATS, REV, BANKS, SLOPES, BERMS, BERMHS, EDGES, BARHS, BARWS, NCHS, POSS, PSIZES, TREEREFS, ICONSZS, LANDSTYLES, LANDPOSS, MODES, VXS, NS, REALDEF, realH, realOf, WIDTHS, DEPTHS, BEDS, BARS, SIZES, LABELS, STYLES, GROUNDS, WATERS, SPECIES,
    formOf, newSec, newStation, cur, layout, render };
})();
