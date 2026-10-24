"""CHELSA V2.1 월평균기온(1981–2010)으로 온량지수(WI)·한랭지수(CI)를 계산해 한국 식생기후대 분류 그림을 만듭니다.

    python tools/build_vegclim.py "../보호구역 종합포털/work/raw/admin-sigg.geojson" data/vegclim

- 월평균기온 12장(30초, 약 1 km)에서 한반도 범위만 원격으로 읽습니다(파일 전체를 받지 않음).
- WI = Σ(월평균기온 − 5, 5℃ 넘는 달), CI = −Σ(5 − 월평균기온, 5℃ 밑도는 달)
- 식생기후대(한국의 숲 Ⅵ, 국립수목원 2020 범례):
    1 온대북부 침·활엽수 혼효림(WI < 45), 2 온대북부 낙엽활엽수림(WI 45~85), 3 온대중부 낙엽활엽수림(WI 85~100),
    4 온대남부 낙엽활엽수림(WI > 100), 5 온대남부 상록·낙엽활엽수 혼효림(CI > −10, 앞의 구분보다 먼저)
- CHELSA는 바다에도 값이 있어 시군구 경계(남한 육지) 밖은 0으로 지웁니다.
- 결과: data/vegclim/classes.png(회색조, 값 = 구분 번호, 0 = 바다·자료 없음), data/vegclim/index.json(경위도 범위·범례)
필요한 패키지: rasterio, numpy, pillow
"""
import json
import os
import sys
from datetime import date

import numpy as np
import rasterio
from rasterio.features import rasterize
from PIL import Image
from rasterio.windows import from_bounds

URL = "/vsicurl/https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/tas/CHELSA_tas_{m:02d}_1981-2010_V.2.1.tif"
BOUNDS = (124.0, 33.0, 132.0, 39.0)   # 서·남·동·북(경위도)
CLASSES = [
    {"v": 1, "name": "온대북부 침·활엽수 혼효림(WI < 45)", "color": "#9fd3e6"},
    {"v": 2, "name": "온대북부 낙엽활엽수림(WI 45~85)", "color": "#1f9e74"},
    {"v": 3, "name": "온대중부 낙엽활엽수림(WI 85~100)", "color": "#7cc653"},
    {"v": 4, "name": "온대남부 낙엽활엽수림(WI > 100)", "color": "#eef07a"},
    {"v": 5, "name": "온대남부 상록·낙엽활엽수 혼효림(CI > −10)", "color": "#f4a582"},
]


def main(admin, out):
    sys.stdout.reconfigure(encoding="utf-8")
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    temps = []
    for m in range(1, 13):
        with rasterio.open(URL.format(m=m)) as src:
            win = from_bounds(*BOUNDS, transform=src.transform).round_offsets().round_lengths()
            a = src.read(1, window=win, masked=True).astype("float32")
            scale, offset = (src.scales[0] or 1), (src.offsets[0] or 0)
            # CHELSA V2.1 tas: 값 × 0.1 − 273.15 = ℃ (파일 척도가 비어 있으면 직접 적용)
            t = a * scale + offset if (scale != 1 or offset != 0) else a * 0.1 - 273.15
            temps.append(t)
            tr = src.window_transform(win)
        print(f"  {m}월: {t.min():.1f} ~ {t.max():.1f} ℃", flush=True)
    T = np.ma.stack(temps)
    wi = np.where(T > 5, T - 5, 0).sum(axis=0)
    ci = -np.where(T < 5, 5 - T, 0).sum(axis=0)
    cls = np.zeros(wi.shape, dtype=np.uint8)
    cls[wi < 45] = 1
    cls[(wi >= 45) & (wi < 85)] = 2
    cls[(wi >= 85) & (wi < 100)] = 3
    cls[wi >= 100] = 4
    cls[ci > -10] = 5
    cls[np.ma.getmaskarray(T).any(axis=0)] = 0
    with open(admin, encoding="utf-8") as fh:
        shapes = [f["geometry"] for f in json.load(fh)["features"]]
    land = rasterize(((g, 1) for g in shapes), out_shape=cls.shape, transform=tr, fill=0, all_touched=True, dtype="uint8")
    cls[land == 0] = 0
    os.makedirs(out, exist_ok=True)
    Image.fromarray(cls, mode="L").save(os.path.join(out, "classes.png"), optimize=True)
    h, w = cls.shape
    west, north = tr.c, tr.f
    index = {"bounds": [west, north + tr.e * h, west + tr.a * w, north], "width": w, "height": h, "classes": CLASSES,
             "source": "CHELSA V2.1 월평균기온 1981–2010으로 계산한 온량·한랭지수", "built": date.today().isoformat()}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print("구분별 칸 수", {c["v"]: int((cls == c["v"]).sum()) for c in CLASSES}, f"{w}×{h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
