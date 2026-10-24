"""오픈스트리트맵 한국 파일(Geofabrik .osm.pbf)에서 도면 이름표·흐름 방향 자료를 뽑아 0.1도 조각 파일로 만듭니다.

- 산봉우리: natural=peak 중 이름 있는 것 → [경도, 위도, 이름, 높이]
- 저수지·호수: natural=water(하천 면 제외)·landuse=reservoir 중 이름 있는 것 → [경도, 위도, 이름, 넓이(㎡)]
  (경도·위도는 면 안에서 가장자리와 가장 먼 점)
- 하천 선: waterway=river·stream(땅속·터널 제외) → {i: id, n: 이름, k: r(강)/s(개천), c: [[경도, 위도], ...]}
  OSM 하천 선은 흐르는 방향으로 그리므로 점 순서가 곧 흐름 방향입니다.

쓰는 법(국내·국외 어디서나 됨):
    python tools/build_osm.py work/raw/south-korea.osm.pbf data/osm
필요한 패키지: osmium(pyosmium), shapely, pyproj
"""
import json
import math
import os
import sys
from collections import defaultdict
from datetime import date

import osmium
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import LineString
from shapely.ops import polylabel, transform

TILE = 0.1          # 조각 크기(도)
NDIGITS = 5         # 좌표 자리수(약 1 m)
SIMPLIFY_M = 4.0    # 하천 선 줄이기(m)
MIN_STREAM_M = 150  # 이름 없는 개천은 이보다 짧으면 뺌
SKIP_WATER = {"river", "stream", "canal", "ditch", "drain", "wastewater", "moat"}

to_m = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
to_g = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True).transform


def name_of(tags):
    return (tags.get("name:ko") or tags.get("name") or "").strip()


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.wkb = osmium.geom.WKBFactory()
        self.peaks, self.waters, self.ways = [], [], []

    def node(self, n):
        if n.tags.get("natural") == "peak":
            nm = name_of(n.tags)
            if nm:
                try:
                    ele = float((n.tags.get("ele") or "0").replace("m", "").strip() or 0)
                except ValueError:
                    ele = 0
                self.peaks.append([round(n.location.lon, NDIGITS), round(n.location.lat, NDIGITS), nm, round(ele)])

    def way(self, w):
        t = w.tags
        k = t.get("waterway")
        if k not in ("river", "stream"):
            return
        if t.get("tunnel") or t.get("location") == "underground":
            return
        try:
            if int(t.get("layer", "0")) < 0:
                return
        except ValueError:
            pass
        try:
            pts = [(nd.location.lon, nd.location.lat) for nd in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(pts) < 2:
            return
        nm = name_of(t)
        line_m = transform(to_m, LineString(pts))
        if not nm and k == "stream" and line_m.length < MIN_STREAM_M:
            return
        simp = transform(to_g, line_m.simplify(SIMPLIFY_M, preserve_topology=False))
        coords = [[round(x, NDIGITS), round(y, NDIGITS)] for x, y in simp.coords]
        self.ways.append({"i": w.id, "n": nm, "k": "r" if k == "river" else "s", "c": coords})

    def area(self, a):
        t = a.tags
        if not (t.get("natural") == "water" or t.get("landuse") == "reservoir"):
            return
        if t.get("water") in SKIP_WATER:
            return
        nm = name_of(t)
        if not nm:
            return
        try:
            g = wkb.loads(self.wkb.create_multipolygon(a), hex=True)
        except Exception:
            return
        gm = transform(to_m, g)
        if gm.is_empty:
            return
        big = max(gm.geoms, key=lambda p: p.area) if gm.geom_type == "MultiPolygon" else gm
        try:
            lp = polylabel(big, tolerance=2.0)
        except Exception:
            lp = big.representative_point()
        lon, lat = to_g(lp.x, lp.y)
        self.waters.append([round(lon, NDIGITS), round(lat, NDIGITS), nm, round(gm.area)])


def tile_of(lon, lat):
    return f"{math.floor(lon / TILE)}_{math.floor(lat / TILE)}"


def main(src, out):
    h = Handler()
    h.apply_file(src, locations=True)
    print(f"산 {len(h.peaks):,} · 저수지·호수 {len(h.waters):,} · 하천 선 {len(h.ways):,}")
    tiles = defaultdict(lambda: {"p": [], "w": [], "l": []})
    for p in h.peaks:
        tiles[tile_of(p[0], p[1])]["p"].append(p)
    for w in h.waters:
        tiles[tile_of(w[0], w[1])]["w"].append(w)
    for l in h.ways:
        xs = [c[0] for c in l["c"]]
        ys = [c[1] for c in l["c"]]
        for tx in range(math.floor(min(xs) / TILE), math.floor(max(xs) / TILE) + 1):
            for ty in range(math.floor(min(ys) / TILE), math.floor(max(ys) / TILE) + 1):
                tiles[f"{tx}_{ty}"]["l"].append(l)
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".json"):
            os.remove(os.path.join(out, f))
    total = 0
    for key, d in tiles.items():
        s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
        total += len(s.encode("utf-8"))
        with open(os.path.join(out, f"{key}.json"), "w", encoding="utf-8") as fh:
            fh.write(s)
    index = {
        "tile": TILE,
        "tiles": sorted(tiles.keys()),
        "source": "© OpenStreetMap 기여자 (ODbL), Geofabrik 한국 추출본",
        "file": os.path.basename(src),
        "built": date.today().isoformat(),
    }
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"조각 {len(tiles):,}개 · {total / 1048576:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
