"""시군구 경계(해안선을 따름)를 합쳐 육지 면을 만들고 0.1도 조각 이진 파일로 만듭니다. 도면에서는 틀 안 육지 밖을 바다로 칠합니다.

    python tools/build_land.py "../보호구역 종합포털/work/raw/admin-sigg.geojson" data/land

- 시군구 경계: 국토교통부 브이월드 LT_C_ADSIGG_INFO(보호구역 종합포털에서 받아 둔 것). 5 m로 줄여 합칩니다.
- 휴전선·북방한계선 북쪽은 바다로 칠하지 않도록 육지에 함께 넣습니다(대략 선).
- 파일 구조는 tools/build_water.py와 같고 하천 면 자리에 육지 면을 넣습니다(소하천 수는 0).
필요한 패키지: shapely, pyproj, numpy
"""
import json
import os
import sys
from datetime import date

import numpy as np
import shapely
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_water import TILE, Q, enc_poly, polys_of, tiles_of_bounds, varint  # noqa: E402

TOL_M = 5.0
# 휴전선(육상)·북방한계선(해상) 대략 선: 이 선 북쪽은 바다로 칠하지 않음
NORTH = [(124.0, 38.05), (124.95, 38.05), (125.7, 37.72), (126.1, 37.72), (126.6, 37.77), (126.68, 37.83), (127.0, 37.97),
         (127.7, 38.3), (128.35, 38.62), (130.0, 38.62), (130.0, 39.5), (124.0, 39.5)]

to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
from_m = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)


def reproject(g, tr):
    return shapely.transform(g, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))


def main(src, out):
    sys.stdout.reconfigure(encoding="utf-8")
    d = json.load(open(src, encoding="utf-8"))
    g = shapely.make_valid(shapely.from_geojson([json.dumps(f["geometry"]) for f in d["features"]]))
    g = reproject(shapely.simplify(reproject(g, to_m), TOL_M, preserve_topology=True), from_m)
    land = shapely.union_all(np.append(shapely.make_valid(g), shapely.Polygon(NORTH)))
    print(f"시군구 {len(d['features'])}개 → 육지 꼭짓점 {shapely.get_num_coordinates(land):,}", flush=True)
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".bin"):
            os.remove(os.path.join(out, f))
    keys, total = [], 0
    for tx, ty in tiles_of_bounds(land.bounds):
        part = shapely.clip_by_rect(land, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
        ps = [p for p in polys_of(part) if p.area > 0]
        if not ps:
            continue
        ox, oy = round(tx * TILE * Q), round(ty * TILE * Q)
        buf = bytearray([1])
        varint(buf, len(ps))
        for p in ps:
            enc_poly(buf, p, ox, oy)
        varint(buf, 0)
        with open(os.path.join(out, f"{tx}_{ty}.bin"), "wb") as fh:
            fh.write(buf)
        keys.append(f"{tx}_{ty}")
        total += len(buf)
    index = {"tile": TILE, "q": Q, "tiles": keys, "sources": {"land": "국토교통부 브이월드 시군구 경계(LT_C_ADSIGG_INFO)"}, "built": date.today().isoformat()}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"조각 {len(keys):,}개 · {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
