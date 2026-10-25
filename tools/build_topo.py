"""국토지리정보원 연속수치지형도의 실폭하천·호수/저수지 면을 0.1도 조각 이진 파일로 만듭니다(생태축 현황도 수생태계).

    python tools/build_topo.py work/raw/ngii data/topo

- 자료: 브이월드 데이터마켓 ‘실폭하천’(N3A_E0032111.zip, dsId=30207)·‘호수/저수지’(N3A_E0052114.zip, dsId=30256),
  국토지리정보원, CC BY(출처 표시). 로그인해서 받음. EPSG:5179 SHP.
- 브이월드 기본지도에 파랗게 칠해진 물 면의 원본이라, 하천구역·소하천구역·OSM에 없는 지정 안 된 하천·수로·작은 저수지가 들어 있음.
- 0.25 m로 줄이고(용지 1:1,000에서 0.25 mm) 경위도로 바꾼 뒤 조각 경계에서 자름. 실폭하천은 이어진 물길이 면 하나라
  (낙동강 줄기처럼 수백 조각에 걸침) 조각 경계를 따라 반씩 나눠 가며 자름.
- 파일 구조는 data/water와 같은 판 1: [1] [면 수] {면} … [0](묶음 없음). 면 = [고리 수] {[점 수] {dx, dy} …} …
필요한 패키지: pyogrio, shapely, pyproj, numpy
"""
import json
import math
import os
import sys
from collections import defaultdict
from datetime import date

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(__file__))
from build_water import TILE, Q, varint, polys_of, enc_poly  # noqa: E402

TOL_M = 0.25
LAYERS = [("N3A_E0032111", "실폭하천"), ("N3A_E0052114", "호수/저수지")]
from_m = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)


def reproject(geoms, tr):
    return shapely.transform(geoms, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))


def split_into(g, tx0, ty0, tx1, ty1, out):
    """g를 조각 [tx0, tx1] × [ty0, ty1] 범위 안에서 조각마다 나눠 out[(tx, ty)]에 담음(넓으면 조각 경계에서 반으로 나눠 되풀이)."""
    if g is None or g.is_empty:
        return
    if (tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 4:
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                part = shapely.clip_by_rect(g, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
                out[(tx, ty)] += [p for p in polys_of(part) if p.area > 0]
        return
    if tx1 - tx0 >= ty1 - ty0:
        m = (tx0 + tx1 + 1) // 2
        halves = [((tx0 * TILE, ty0 * TILE, m * TILE, (ty1 + 1) * TILE), (tx0, ty0, m - 1, ty1)),
                  ((m * TILE, ty0 * TILE, (tx1 + 1) * TILE, (ty1 + 1) * TILE), (m, ty0, tx1, ty1))]
    else:
        m = (ty0 + ty1 + 1) // 2
        halves = [((tx0 * TILE, ty0 * TILE, (tx1 + 1) * TILE, m * TILE), (tx0, ty0, tx1, m - 1)),
                  ((tx0 * TILE, m * TILE, (tx1 + 1) * TILE, (ty1 + 1) * TILE), (tx0, m, tx1, ty1))]
    for rect, rng in halves:
        split_into(shapely.clip_by_rect(g, *rect), *rng, out)


def main(src, out):
    sys.stdout.reconfigure(encoding="utf-8")
    tiles = defaultdict(list)
    counts = {}
    for code, name in LAYERS:
        p = os.path.join(src, f"{code}.zip")
        df = pyogrio.read_dataframe(f"/vsizip/{p}/{code}.shp", encoding="cp949", columns=[])
        if df.crs is None or df.crs.to_epsg() != 5179:
            raise SystemExit(f"{p}: 좌표계가 EPSG:5179가 아닙니다({df.crs}).")
        g = df.geometry.values
        bad = ~shapely.is_valid(g)
        g[bad] = shapely.make_valid(g[bad])
        g = reproject(shapely.simplify(g, TOL_M, preserve_topology=True), from_m)
        for i, geom in enumerate(g):
            if geom is None or geom.is_empty:
                continue
            b = geom.bounds
            split_into(geom, math.floor(b[0] / TILE), math.floor(b[1] / TILE), math.floor(b[2] / TILE), math.floor(b[3] / TILE), tiles)
            if (i + 1) % 20000 == 0:
                print(f"  {name} {i + 1:,}/{len(g):,}", flush=True)
        counts[name] = len(g)
        print(f"{name} {len(g):,}개(고친 도형 {int(bad.sum()):,}) → 조각 {len(tiles):,}개", flush=True)

    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".bin"):
            os.remove(os.path.join(out, f))
    keys = sorted(tiles)
    total = 0
    for tx, ty in keys:
        ox, oy = round(tx * TILE * Q), round(ty * TILE * Q)
        buf = bytearray([1])
        ps = tiles[(tx, ty)]
        varint(buf, len(ps))
        for poly in ps:
            enc_poly(buf, poly, ox, oy)
        varint(buf, 0)
        with open(os.path.join(out, f"{tx}_{ty}.bin"), "wb") as fh:
            fh.write(buf)
        total += len(buf)
    index = {
        "tile": TILE, "q": Q, "tiles": [f"{tx}_{ty}" for tx, ty in keys],
        "sources": {"topo": "국토지리정보원 연속수치지형도 실폭하천·호수/저수지(브이월드 데이터마켓, CC BY)"},
        "counts": counts,
        "built": date.today().isoformat(),
    }
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"조각 {len(keys):,}개 · {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
