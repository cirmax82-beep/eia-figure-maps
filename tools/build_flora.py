"""국립수목원 「한국 식물상 지역 (KNA 2020)」 원본 SHP를 도면용 경위도 자료로 바꿉니다(구분·칸 모양 그대로).

    python tools/build_flora.py "한국 식물상 지역 (KNA 2020) (utf-8).shp" data/flora

- 원본: 국립수목원(2020) 한국의 숲 Ⅵ 한국의 식물상 지역과 식생 기후 — GIS 파일(EPSG:5186, 칸 868개,
  floristics = Zone I~IV, 식물상 = 한글 이름). 칸 나누기는 Jung & Cho(2020) Ecology and Evolution 10(20):11549–11564.
- 이름은 원본 속성(식물상), 색은 원본 그림 범례 색.
- 결과: data/flora/zones.json {zones: [{v, name, color}], cells: [[v, [[경도, 위도], …]], …]}
필요한 패키지: pyogrio, pyproj
"""
import json
import os
import sys

import pyogrio
from pyproj import Transformer

ZONES = [
    {"v": 1, "key": "Zone I", "color": "#95c180"},     # 한랭온대 식물상 지역
    {"v": 2, "key": "Zone II", "color": "#dcf193"},    # 상량온대 식물상 지역
    {"v": 3, "key": "Zone III", "color": "#ffd0bc"},   # 온난온대 식물상 지역
    {"v": 4, "key": "Zone IV", "color": "#9ea2ff"},    # 해양성 온난온대 식물상 지역
]


def main(src, out):
    sys.stdout.reconfigure(encoding="utf-8")
    df = pyogrio.read_dataframe(src, encoding="utf-8")
    tr = Transformer.from_crs(df.crs, 4326, always_xy=True)
    by = {z["key"]: z for z in ZONES}
    cells, skipped = [], 0
    for zone, name, geom in zip(df["floristics"], df["식물상"], df.geometry):
        z = by.get(zone)
        if z is None or geom is None or geom.is_empty:
            skipped += 1
            continue
        z.setdefault("name", name)
        for part in getattr(geom, "geoms", [geom]):
            xs, ys = tr.transform(*part.exterior.xy)
            cells.append([z["v"], [[round(x, 5), round(y, 5)] for x, y in zip(xs, ys)]])
    os.makedirs(out, exist_ok=True)
    data = {"zones": [{"v": z["v"], "name": z.get("name", z["key"]), "color": z["color"]} for z in ZONES], "cells": cells,
            "source": "국립수목원(2020) 한국의 숲 Ⅵ 한국 식물상 지역(KNA 2020)"}
    with open(os.path.join(out, "zones.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"칸 {len(cells)}개(건너뜀 {skipped}) · {os.path.getsize(os.path.join(out, 'zones.json')) / 1024:.0f} KB", [(z["v"], z.get("name")) for z in ZONES])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
