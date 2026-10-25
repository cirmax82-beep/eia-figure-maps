"""문헌조사 위치도용 자료: 1:25,000 도엽 격자(E1~E9)와 도엽별 전국자연환경조사 문헌 목록을 만듭니다.

    python tools/build_lit.py "<웹서비스 개발 폴더>" data/lit

- 도엽 격자: BioGrid EIA 기준 도엽(ngii_25k_index_tool/data/INDEX_25000_5174_EGRID_GEODETIC_E1_E9_4326.geojson,
  사용자가 고친 INDEX_25000_5174를 경위도 2.5′ 칸으로 나눈 것)에서 도엽마다 번호·이름·경위도 범위만 뽑음.
  칸(E1~E9)은 도엽을 3×3으로 똑같이 나눈 것이라(왼쪽 위 E1 → 오른쪽 아래 E9) 화면에서 다시 나눔.
- 전국자연환경조사: 자료/전국자연환경조사/제5차·제6차 아래 분류군 폴더의 파일 이름
  「제6차 전국자연환경조사 가례(358094), 2025, 기후에너지환경부.xlsx」가 곧 문헌 표기라, 도엽번호별로 표기만 모음(내용은 읽지 않음).

출력: data/lit/sheets.json {"sheets": [[번호, 이름, 서, 남, 동, 북], …]}, data/lit/nes.json {"도엽번호": ["문헌 표기", …]}
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date

GRID = "ngii_25k_index_tool/data/INDEX_25000_5174_EGRID_GEODETIC_E1_E9_4326.geojson"
NES = re.compile(r"^(제(\d)차 전국자연환경조사 .+?\((\d{6})\), (20\d{2}), .+?)\.(xlsx|xls|csv)$")


def main(root, out):
    sys.stdout.reconfigure(encoding="utf-8")
    d = json.load(open(os.path.join(root, GRID), encoding="utf-8"))
    sheets = {}
    for f in d["features"]:
        p = f["properties"]
        code = str(p["MAPIDCD_NO"])
        s = sheets.setdefault(code, [code, (p.get("MAPID_NM") or "").strip(), 999.0, 999.0, -999.0, -999.0])
        s[2] = min(s[2], p["LON_MIN"]); s[3] = min(s[3], p["LAT_MIN"])
        s[4] = max(s[4], p["LON_MAX"]); s[5] = max(s[5], p["LAT_MAX"])
    rows = [[c, n] + [round(v, 6) for v in b] for c, n, *b in sorted(sheets.values())]
    print(f"도엽 {len(rows):,}장(칸 {len(d['features']):,}개)")

    nes = defaultdict(set)
    files = glob.glob(os.path.join(root, "자료", "전국자연환경조사", "제*차 전국자연환경조사", "*", "*"))
    for p in files:
        m = NES.match(os.path.basename(p))
        if m:
            nes[m.group(3)].add((int(m.group(2)), m.group(4), m.group(1)))
    # 차수 높은 것(최근) → 연도 → 표기 순
    nes_out = {code: [t for _, _, t in sorted(v, key=lambda x: (-x[0], x[1], x[2]))] for code, v in sorted(nes.items())}
    print(f"전국자연환경조사 도엽 {len(nes_out):,}장 · 문헌 {sum(len(v) for v in nes_out.values()):,}건(파일 {len(files):,}개)")

    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "sheets.json"), "w", encoding="utf-8") as fh:
        json.dump({"sheets": rows, "source": "BioGrid EIA 기준 1:25,000 도엽(국토지리정보원 INDEX_25000 수정본)", "built": date.today().isoformat()},
                  fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "nes.json"), "w", encoding="utf-8") as fh:
        json.dump(nes_out, fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
