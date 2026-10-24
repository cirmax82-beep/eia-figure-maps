"""생태·자연도 정기고시 파일(File GDB)에서 1·2등급과 별도관리지역을 0.1도 조각 이진 파일로 만듭니다.

    python tools/build_ecnat.py "…/2026년 생태자연도 정기고시(기후에너지환경부고시 제2026-128호).gdb" data/ecnat

- F_생태자연도_A의 ‘생태자연도’ 값 1·2(3등급은 흰색이라 담지 않음), F_별도관리지역_A를 씁니다(EPSG:5186).
- 조각마다 등급별로 합치고 조각 경계에서 자른 뒤, 1 cm 안쪽의 겹친 꼭짓점만 뺍니다(경계는 고시 원본과 1 cm 안에서 같음 —
  환경영향평가 도면·면적·이격거리에 쓰므로 단순화하지 않음. 전국 약 490 MB).
- 정기고시는 해마다 나오므로 새 GDB를 받으면 이 스크립트를 다시 돌립니다(약 20분).

파일 구조(조각 하나): [판 1바이트=2] [층 수] {[층 번호(1·2등급, 9 별도관리지역)] [면 수] {면} …} …
면 = [고리 수] {[점 수] {dx, dy} …} … (경위도 1e-7도 정수, 조각 왼쪽 아래 모서리 기준 zigzag varint 차이)
필요한 패키지: pyogrio, shapely, pyproj, numpy
"""
import json
import math
import os
import re
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from datetime import date

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_water import TILE, Q, enc_poly, polys_of, varint  # noqa: E402

TOL_M = 0.01
KOREA = (124.5, 33.0, 131.9, 38.7)
GRADE_LAYER, SEP_LAYER = "F_생태자연도_A", "F_별도관리지역_A"
warnings.filterwarnings("ignore")


def build_tile(args):
    src, tx, ty = args
    to5186 = Transformer.from_crs(4326, 5186, always_xy=True)
    to4326 = Transformer.from_crs(5186, 4326, always_xy=True)
    rep = lambda g, tr: shapely.transform(g, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))
    lo0, la0, lo1, la1 = tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE
    tile = rep(shapely.box(lo0, la0, lo1, la1).segmentize(0.005), to5186)
    bbox = tile.bounds
    layers = []
    df = pyogrio.read_dataframe(src, layer=GRADE_LAYER, bbox=bbox, columns=["생태자연도"])
    if len(df):
        g = shapely.make_valid(shapely.force_2d(df.geometry.values))
        grade = df["생태자연도"].values
        for code in (1, 2):
            sel = g[grade == code]
            if len(sel):
                layers.append((code, shapely.intersection(shapely.union_all(sel), tile)))
    sp = pyogrio.read_dataframe(src, layer=SEP_LAYER, bbox=bbox, columns=[])
    if len(sp):
        layers.append((9, shapely.intersection(shapely.union_all(shapely.make_valid(shapely.force_2d(sp.geometry.values))), tile)))
    out = []
    for code, geom in layers:
        ps = [p for p in polys_of(rep(shapely.simplify(geom, TOL_M, preserve_topology=True), to4326)) if p.area > 0]
        if ps:
            out.append((code, ps))
    if not out:
        return tx, ty, None
    ox, oy = round(lo0 * Q), round(la0 * Q)
    buf = bytearray([2])
    varint(buf, len(out))
    for code, ps in out:
        varint(buf, code)
        varint(buf, len(ps))
        for p in ps:
            enc_poly(buf, p, ox, oy)
    return tx, ty, bytes(buf)


def main(src, out):
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".bin"):
            os.remove(os.path.join(out, f))
    jobs = [(src, tx, ty) for tx in range(math.floor(KOREA[0] / TILE), math.floor(KOREA[2] / TILE) + 1)
            for ty in range(math.floor(KOREA[1] / TILE), math.floor(KOREA[3] / TILE) + 1)]
    keys, total = [], 0
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as ex:
        for i, (tx, ty, buf) in enumerate(ex.map(build_tile, jobs, chunksize=4), 1):
            if buf:
                with open(os.path.join(out, f"{tx}_{ty}.bin"), "wb") as fh:
                    fh.write(buf)
                keys.append(f"{tx}_{ty}")
                total += len(buf)
            if i % 200 == 0:
                print(f"  {i:,}/{len(jobs):,} 칸 · 조각 {len(keys):,}개 · {total / 1048576:.1f} MB", flush=True)
    notice = re.search(r"\(([^)]*고시[^)]*)\)", os.path.basename(src.rstrip("\\/")))
    index = {"tile": TILE, "q": Q, "tiles": sorted(keys), "layers": {"1": "1등급", "2": "2등급", "9": "별도관리지역"},
             "source": f"생태·자연도 {(re.search(r'(\d{4})년', os.path.basename(src)) or [None, ''])[1]}년 정기고시({notice.group(1) if notice else os.path.basename(src)})", "built": date.today().isoformat()}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"조각 {len(keys):,}개 · {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
