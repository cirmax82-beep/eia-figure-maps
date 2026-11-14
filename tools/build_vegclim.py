"""국립수목원 「한국 식생기후 분포도 (KNA 2020)」 원본 래스터를 도면용 경위도 격자 그림으로 옮깁니다(값은 그대로).

    python tools/build_vegclim.py "한국 식생기후 분포도 (KNA 2020).tif" data/vegclim

- 원본: 국립수목원(2020) 한국의 숲 Ⅵ 한국의 식물상 지역과 식생 기후 — GIS 파일(250 m 격자, 값 1~5, 0 = 자료 없음).
  좌표계는 함께 온 안내대로 EPSG:5174(Korean 1985 / Modified Central Belt). 파일 안 좌표계(베셀 TM, 기준 경도 127°)보다
  해안선이 잘 맞음(시군구 경계와 겹침 96.8%, 밀림 없음).
- 값 1 온대북부 침·활엽수 혼합림(WI < 45), 2 온대북부 낙엽활엽수림(WI 45~85), 3 온대중부 낙엽활엽수림(WI 85~100),
  4 온대남부 낙엽활엽수림(WI > 100), 5 온대남부 상록·낙엽활엽수 혼합림(CI > −10) — 이름은 원본 범례 파일, 색은 원본 그림 범례 색.
- 경위도 0.0025°(약 230 m) 격자로 가장 가까운 칸 값을 옮김(구분을 섞지 않음). 자료가 있는 범위만 남김.
- 결과: data/vegclim/classes.png(회색조, 값 = 구분 번호, 0 = 바다·자료 없음), data/vegclim/index.json(경위도 범위·범례)
필요한 패키지: rasterio, numpy, pillow
"""
import json
import os
import sys
from datetime import date

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

STEP = 0.0025
AREA = (124.0, 32.9, 132.2, 39.0)   # 서·남·동·북(경위도) — 울릉도·독도까지
CLASSES = [
    {"v": 1, "name": "온대북부 침·활엽수 혼합림(WI < 45)", "color": "#97dbf2"},
    {"v": 2, "name": "온대북부 낙엽활엽수림(WI 45~85)", "color": "#00a884"},
    {"v": 3, "name": "온대중부 낙엽활엽수림(WI 85~100)", "color": "#89cd66"},
    {"v": 4, "name": "온대남부 낙엽활엽수림(WI > 100)", "color": "#feff73"},
    {"v": 5, "name": "온대남부 상록·낙엽활엽수 혼합림(CI > −10)", "color": "#f5a27a"},
]


def main(tif, out):
    sys.stdout.reconfigure(encoding="utf-8")
    w0, s0, e0, n0 = AREA
    w, h = round((e0 - w0) / STEP), round((n0 - s0) / STEP)
    grid = np.zeros((h, w), np.uint8)
    with rasterio.open(tif) as src:
        reproject(src.read(1), grid, src_transform=src.transform, src_crs=CRS.from_epsg(5174), src_nodata=0,
                  dst_transform=from_origin(w0, n0, STEP, STEP), dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.nearest)
    grid[grid > 5] = 0
    rows, cols = np.nonzero(grid.any(1))[0], np.nonzero(grid.any(0))[0]
    r0, r1, c0, c1 = max(0, rows[0] - 1), min(h, rows[-1] + 2), max(0, cols[0] - 1), min(w, cols[-1] + 2)
    cls = grid[r0:r1, c0:c1]
    os.makedirs(out, exist_ok=True)
    Image.fromarray(cls, mode="L").save(os.path.join(out, "classes.png"), optimize=True)
    hh, ww = cls.shape
    west, north = w0 + c0 * STEP, n0 - r0 * STEP
    index = {"bounds": [west, north - hh * STEP, west + ww * STEP, north], "width": ww, "height": hh, "classes": CLASSES,
             "source": "국립수목원(2020) 한국의 숲 Ⅵ 한국 식생기후 분포도(KNA 2020)", "built": date.today().isoformat()}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print("구분별 칸 수", {c["v"]: int((cls == c["v"]).sum()) for c in CLASSES}, f"{ww}×{hh}", index["bounds"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
