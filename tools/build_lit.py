"""문헌조사 위치도용 자료: 1:25,000 도엽 격자(E1~E9)와 도엽별 전국자연환경조사 문헌 목록을 만듭니다.

    python tools/build_lit.py "<웹서비스 개발 폴더>" data/lit

- 도엽 격자: BioGrid EIA 기준 도엽(ngii_25k_index_tool/data/INDEX_25000_5174_EGRID_GEODETIC_E1_E9_4326.geojson,
  사용자가 고친 INDEX_25000_5174를 경위도 2.5′ 칸으로 나눈 것)에서 도엽마다 번호·이름·경위도 범위만 뽑음.
  칸(E1~E9)은 도엽을 3×3으로 똑같이 나눈 것이라(왼쪽 위 E1 → 오른쪽 아래 E9) 화면에서 다시 나눔.
- 전국자연환경조사: 자료/전국자연환경조사/제5차·제6차 아래 분류군 폴더의 파일 이름
  「제6차 전국자연환경조사 가례(358094), 2025, 기후에너지환경부.xlsx」가 곧 문헌 표기라, 도엽번호별로 표기만 모음(내용은 읽지 않음).

- 문헌 위치(포털 문헌 엑셀의 문헌 이름으로 찾음): 같은 원자료 폴더의
  겨울철 조류 동시 센서스 조사지역(200곳, Name)·국립생태원 내륙습지(2,704곳, NAME)·생물측정망 지점(3,722곳, spot_nm)·
  전국자연환경조사 육수 표준유역(850곳, stdbsncd). 조사지역·습지는 2 m, 유역은 15 m로 줄이고 경위도 5자리(약 1 m).

출력: data/lit/sheets.json {"sheets": [[번호, 이름, 서, 남, 동, 북], …]}, data/lit/nes.json {"도엽번호": ["문헌 표기", …]},
      data/lit/census.json [[이름, 고리들]], wetlands.json [[이름, 코드, 고리들]], stations.json [[코드, 이름, 하천·하구, 경도, 위도]],
      유역은 커서 코드별로 data/lit/basins/<코드>.json [코드, 이름, 고리들] + basins.json {코드: 이름}
      (고리들 = 면 여럿의 모든 고리, 짝홀 규칙으로 칠함)
필요한 패키지: pyogrio, shapely, pyproj, numpy
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date

import numpy as np
import pyogrio
import shapely
from pyproj import Transformer

GRID = "ngii_25k_index_tool/data/INDEX_25000_5174_EGRID_GEODETIC_E1_E9_4326.geojson"
NES = re.compile(r"^(제(\d)차 전국자연환경조사 .+?\((\d{6})\), (20\d{2}), .+?)\.(xlsx|xls|csv)$")
CENSUS = "자료/2025_2026_동시센서스_조사지역_200개소/2025_2026_동시센서스_조사지역_200개소/2025_2026_동시센서스_조사지역_200개소.shp"
WETLAND = "자료/공간정보/국립생태원_내륙습지 공간데이터 및 속성정보_20220720/Wetlands_Inventory_2,704_EPSG5186.shp"
BASIN = "자료/공간정보/전국자연환경조사 육수/mgnl_sbsn_bsn.shp"
STATION = "자료/공간정보/생물측정망(하천, 하구)/water_bio_monitoring_stations_wgs84.geojson"


def rings_ll(geoms, crs, tol_m):
    """도형을 EPSG:5186에서 tol_m로 줄인 뒤 경위도 5자리 고리 목록으로(면 여럿이면 모든 고리를 한 목록에)."""
    to_m = Transformer.from_crs(crs, "EPSG:5186", always_xy=True)
    to_ll = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)
    tr = lambda g, t: shapely.transform(g, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))
    g = shapely.force_2d(geoms)
    bad = ~shapely.is_valid(g)
    g[bad] = shapely.make_valid(g[bad])
    g = tr(shapely.simplify(tr(g, to_m), tol_m, preserve_topology=True), to_ll)
    out = []
    for geom in g:
        polys = [geom] if geom.geom_type == "Polygon" else [p for p in getattr(geom, "geoms", []) if p.geom_type == "Polygon"]
        rings = []
        for p in polys:
            for r in [p.exterior, *p.interiors]:
                c = np.round(np.asarray(r.coords)[:-1], 5)
                if len(c) >= 3:
                    rings.append(c.tolist())
        out.append(rings)
    return out


def places(root, out):
    p = lambda rel: os.path.join(root, rel)
    df = pyogrio.read_dataframe(p(CENSUS))
    census = [[str(n).strip(), r] for n, r in zip(df["Name"], rings_ll(df.geometry.values, df.crs, 2)) if r]
    df = pyogrio.read_dataframe(p(WETLAND))
    wetlands = [[str(n).strip(), str(c or ""), r] for n, c, r in zip(df["NAME"], df["CODE"], rings_ll(df.geometry.values, df.crs, 2)) if r]
    df = pyogrio.read_dataframe(p(BASIN))
    basins = [[str(c), str(n).strip(), r] for c, n, r in zip(df["stdbsncd"], df["stdbsnnm"], rings_ll(df.geometry.values, df.crs, 15)) if r]
    df = pyogrio.read_dataframe(p(STATION), read_geometry=False)
    stations = [[str(c), str(n).strip(), str(g), round(float(x), 6), round(float(y), 6)] for c, n, g, x, y in zip(df["spot_cd"], df["spot_nm"], df["gubun"], df["x"], df["y"])]
    bdir = os.path.join(out, "basins")
    os.makedirs(bdir, exist_ok=True)
    for f in os.listdir(bdir):
        os.remove(os.path.join(bdir, f))
    for b in basins:
        with open(os.path.join(bdir, f"{b[0]}.json"), "w", encoding="utf-8") as fh:
            json.dump(b, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"basins: {len(basins):,}개 · {sum(os.path.getsize(os.path.join(bdir, f)) for f in os.listdir(bdir)) / 1048576:.2f} MB(코드별 파일)")
    for name, data in [("census", census), ("wetlands", wetlands), ("basins", {b[0]: b[1] for b in basins}), ("stations", stations)]:
        path = os.path.join(out, f"{name}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"{name}: {len(data):,}개 · {os.path.getsize(path) / 1048576:.2f} MB")


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
    places(root, out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
