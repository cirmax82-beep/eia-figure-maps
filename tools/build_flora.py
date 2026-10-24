"""Jung & Cho(2020) 한국 식물상 지역 격자를 도면용 경위도 자료로 바꿉니다.

    python tools/build_flora.py work/raw/flora/floristic_zones_and_ecoregions.zip data/flora

- 자료: Dryad doi:10.5061/dryad.3tx95x6cr ‘floristic_zones_and_ecoregions.zip’(CC0) 안의
  Korea_floristic_zones_(Jung_and_Cho_2020).shp(EPSG:5186, 칸 868개, floristics = Zone I~IV)
- 결과: data/flora/zones.json {zones: [{v, name, color}], cells: [[v, [[경도, 위도], …]], …]}
필요한 패키지: pyogrio, pyproj
"""
import json
import os
import sys

import pyogrio
from pyproj import Transformer

NAME = "Korea_floristic_zones_(Jung_and_Cho_2020).shp"
ZONES = [
    {"v": 1, "key": "Zone I", "name": "한랭온대 식물상지역", "color": "#16a36a"},
    {"v": 2, "key": "Zone II", "name": "상냉온대 식물상지역", "color": "#a5dc8f"},
    {"v": 3, "key": "Zone III", "name": "온난온대 식물상지역", "color": "#f6b49b"},
    {"v": 4, "key": "Zone IV", "name": "해양성 온난온대 식물상지역", "color": "#9d9ef2"},
]


def main(src, out):
    sys.stdout.reconfigure(encoding="utf-8")
    df = pyogrio.read_dataframe(f"/vsizip/{src}/{NAME}")
    tr = Transformer.from_crs(df.crs, 4326, always_xy=True)
    by = {z["key"]: z["v"] for z in ZONES}
    cells = []
    for zone, geom in zip(df["floristics"], df.geometry):
        if zone not in by or geom is None:
            continue
        xs, ys = tr.transform(*geom.exterior.xy)
        cells.append([by[zone], [[round(x, 5), round(y, 5)] for x, y in zip(xs, ys)]])
    os.makedirs(out, exist_ok=True)
    data = {"zones": [{k: z[k] for k in ("v", "name", "color")} for z in ZONES], "cells": cells,
            "source": "Jung & Cho (2020) Ecology and Evolution 10(20):11549–11564, Dryad doi:10.5061/dryad.3tx95x6cr (CC0)"}
    with open(os.path.join(out, "zones.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"칸 {len(cells)}개 · {os.path.getsize(os.path.join(out, 'zones.json')) / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
