"""전국자연환경조사 육수 표준유역의 찾기용 목록(이름으로 문헌 위치를 찾을 때 씀)을 만듭니다.

    python tools/build_basin_index.py "자료/공간정보/전국자연환경조사 육수/TMDL_41_layer_41.geojson" data/lit

- 입력: data/lit/basins/<코드>.json(tools/build_lit.py가 만든 표준유역 모양) + 같은 폴더의 TMDL 단위유역 GeoJSON
  (SW_CODE = 표준유역 코드, SW_NAME = 다른 이름(예: 보청천합류점), STR_NAME = 본류 하천 이름)
- 결과: data/lit/basin_index.json {코드: [다른 이름(같으면 ""), 본류 하천, [서, 남, 동, 북]]}
  — 문헌 「제4차 전국자연환경조사 임천」처럼 유역코드 없이 이름만 있을 때, 9격자에 걸치는 유역 가운데서 이름·하천으로 찾음
필요한 패키지: pyogrio
"""
import json
import os
import sys

import pyogrio


def main(tmdl, out):
    sys.stdout.reconfigure(encoding="utf-8")
    names = json.load(open(os.path.join(out, "basins.json"), encoding="utf-8"))
    df = pyogrio.read_dataframe(tmdl, read_geometry=False)
    alias = {str(c): (str(n or "").strip(), str(s or "").strip()) for c, n, s in zip(df["SW_CODE"], df["SW_NAME"], df["STR_NAME"])}
    index = {}
    for code, name in names.items():
        _, _, rings = json.load(open(os.path.join(out, "basins", f"{code}.json"), encoding="utf-8"))
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        alt, stream = alias.get(code, ("", ""))
        index[code] = [alt if alt != name else "", stream, [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]]
    with open(os.path.join(out, "basin_index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"유역 {len(index)}개(다른 이름 {sum(1 for v in index.values() if v[0])}, 하천 이름 {sum(1 for v in index.values() if v[1])}) · {os.path.getsize(os.path.join(out, 'basin_index.json')) / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
