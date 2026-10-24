"""하천구역(브이월드 하천망)과 소하천구역(국토교통부 연속주제도)을 0.1도 조각 이진 파일로 만듭니다.

    python tools/build_water.py work/raw/vw_strm.geojson work/raw/small data/water

- 하천구역: tools/fetch_rivers.py로 받은 국가·지방하천 면(EPSG:4326). 0.5 m로 줄이고 조각 경계에서 자릅니다.
- 소하천구역: 브이월드 데이터마켓 ‘(연속주제)_소하천/소하천구역’ 시도별 zip(LSMD_CONT_UJ301_*.zip, EPSG:5186, 로그인해서 받음).
  공공누리 제4유형(출처표시·상업적 이용금지·변경금지)이므로 모양은 바꾸지 않고, 1 cm 안쪽의 겹친 꼭짓점만 빼며,
  조각 경계에서 자르지 않고 도형을 통째로 그 조각들에 넣습니다(같은 도형은 번호로 한 번만 그림).
- 좌표: 경위도 1e-7도(약 1 cm) 정수, 조각 왼쪽 아래 모서리 기준 차이를 zigzag varint로 적음.

파일 구조(조각 하나): [판 1바이트=1] [하천 면 수] {면} … [소하천 도형 수] {번호, 면 수, {면} …} …
면 = [고리 수] {[점 수] {dx, dy} …} … (고리의 마지막 닫는 점은 뺌)
필요한 패키지: pyogrio, shapely, pyproj, numpy
"""
import glob
import json
import math
import os
import sys
import zipfile
from collections import defaultdict
from datetime import date

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

TILE = 0.1
Q = 10_000_000
RIVER_TOL_M = 0.5
SMALL_TOL_M = 0.01

to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
from_m = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)
from_5186 = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)


def reproject(geoms, tr):
    return shapely.transform(geoms, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))


def varint(out, u):
    while u >= 0x80:
        out.append((u & 0x7F) | 0x80)
        u >>= 7
    out.append(u)


def zz(v):
    return v << 1 if v >= 0 else ((-v) << 1) - 1


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"):
        return [p for q in g.geoms for p in polys_of(q)]
    return []


def enc_poly(out, poly, ox, oy):
    rings = [poly.exterior, *poly.interiors]
    rings = [r for r in rings if len(r.coords) >= 4]
    varint(out, len(rings))
    for r in rings:
        c = np.round(np.asarray(r.coords)[:-1] * Q).astype(np.int64)
        varint(out, len(c))
        px, py = ox, oy
        for x, y in c.tolist():
            varint(out, zz(x - px))
            varint(out, zz(y - py))
            px, py = x, y


def tiles_of_bounds(b):
    for tx in range(math.floor(b[0] / TILE), math.floor(b[2] / TILE) + 1):
        for ty in range(math.floor(b[1] / TILE), math.floor(b[3] / TILE) + 1):
            yield tx, ty


def main(strm_path, small_dir, out):
    sys.stdout.reconfigure(encoding="utf-8")
    river = defaultdict(list)   # (tx, ty) → [Polygon]
    small = defaultdict(list)   # (tx, ty) → [(id, [Polygon])]

    # 하천구역(하천망): 미터 좌표에서 줄인 뒤 조각마다 잘라 담음
    d = json.load(open(strm_path, encoding="utf-8"))
    g = shapely.from_geojson([json.dumps(f["geometry"]) for f in d["features"]])
    g = reproject(shapely.simplify(reproject(g, to_m), RIVER_TOL_M, preserve_topology=True), from_m)
    for geom in g:
        if geom is None or geom.is_empty:
            continue
        for tx, ty in tiles_of_bounds(geom.bounds):
            part = shapely.clip_by_rect(geom, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
            river[(tx, ty)] += [p for p in polys_of(part) if p.area > 0]
    print(f"하천구역 {len(g):,}개 → 조각 {len(river):,}개", flush=True)

    # 소하천구역: 모양 그대로(1 cm 안 겹친 점만 뺌), 도형을 통째로 걸치는 조각마다
    nid = 0
    for p in sorted(glob.glob(os.path.join(small_dir, "*.zip"))):
        z = zipfile.ZipFile(p)
        shp = [n for n in z.namelist() if n.lower().endswith(".shp")][0]
        df = pyogrio.read_dataframe(f"/vsizip/{p}/{shp}", encoding="cp949", columns=["MNUM"])
        if df.crs is None or df.crs.to_epsg() != 5186:
            raise SystemExit(f"{p}: 좌표계가 EPSG:5186이 아닙니다({df.crs}).")
        geoms = reproject(shapely.simplify(df.geometry.values, SMALL_TOL_M, preserve_topology=True), from_5186)
        for geom in geoms:
            ps = polys_of(geom)
            if not ps:
                continue
            nid += 1
            for key in tiles_of_bounds(geom.bounds):
                small[key].append((nid, ps))
        print(f"  {os.path.basename(p)}: {len(df):,}개", flush=True)
    print(f"소하천구역 {nid:,}개 → 조각 {len(small):,}개", flush=True)

    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".bin"):
            os.remove(os.path.join(out, f))
    keys = sorted(set(river) | set(small))
    total = 0
    for tx, ty in keys:
        ox, oy = round(tx * TILE * Q), round(ty * TILE * Q)
        buf = bytearray([1])
        rs = river.get((tx, ty), [])
        varint(buf, len(rs))
        for poly in rs:
            enc_poly(buf, poly, ox, oy)
        ss = small.get((tx, ty), [])
        varint(buf, len(ss))
        for i, ps in ss:
            varint(buf, i)
            varint(buf, len(ps))
            for poly in ps:
                enc_poly(buf, poly, ox, oy)
        with open(os.path.join(out, f"{tx}_{ty}.bin"), "wb") as fh:
            fh.write(buf)
        total += len(buf)
    index = {
        "tile": TILE, "q": Q, "tiles": [f"{tx}_{ty}" for tx, ty in keys],
        "sources": {
            "river": "국토교통부 브이월드 하천망(국가·지방하천, LT_C_WKMSTRM)",
            "small": "국토교통부 (연속주제)_소하천/소하천구역(LSMD_CONT_UJ301), 공공누리 제4유형",
        },
        "built": date.today().isoformat(),
    }
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"조각 {len(keys):,}개 · {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
