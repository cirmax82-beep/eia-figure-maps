"""브이월드 2D 데이터 API에서 하천망(국가·지방하천 면, LT_C_WKMSTRM)을 전국 단위로 받습니다.

    VWORLD_KEY_FILE=인증키파일 python tools/fetch_rivers.py work/raw/vw_strm.geojson

- 인증키는 환경 변수 VWORLD_KEY 또는 VWORLD_KEY_FILE(키를 적은 파일 경로)에서 읽습니다. 저장소에는 넣지 않습니다.
- 브이월드는 해외 IP 접속을 막으므로 국내 컴퓨터에서 실행합니다.
- 인증키 발급 때 넣은 서비스 URL을 VWORLD_DOMAIN으로 함께 보냅니다(기본 https://protect.biogrideia.com).
- 도형이 커서 한 번에 100건씩 받고, 1도 상자로 나눠 받은 뒤 id로 중복을 없앱니다.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.vworld.kr/req/data"
DATA = "LT_C_WKMSTRM"
SIZE = 100


def call(key, domain, box, page):
    params = {
        "service": "data", "version": "2.0", "request": "GetFeature", "key": key, "domain": domain,
        "format": "json", "errorFormat": "json", "size": SIZE, "page": page, "data": DATA,
        "geomFilter": "BOX({},{},{},{})".format(*box), "geometry": "true", "attribute": "true", "crs": "EPSG:4326",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Referer": domain}), timeout=180) as r:
                return json.load(r)["response"]
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            if attempt == 5:
                raise RuntimeError(f"{box} p{page}: {e}") from e
            time.sleep(3 * (attempt + 1))


def main(out):
    sys.stdout.reconfigure(encoding="utf-8")
    key = os.environ.get("VWORLD_KEY")
    if not key and os.environ.get("VWORLD_KEY_FILE"):
        key = open(os.environ["VWORLD_KEY_FILE"], encoding="utf-8").read().strip()
    if not key:
        raise SystemExit("브이월드 인증키가 없습니다. VWORLD_KEY 또는 VWORLD_KEY_FILE을 지정하세요.")
    domain = os.environ.get("VWORLD_DOMAIN", "https://protect.biogrideia.com")
    feats = {}
    boxes = [(x, y, x + 1, y + 1) for x in range(124, 132) for y in range(33, 39)]
    for i, box in enumerate(boxes, 1):
        first = call(key, domain, box, 1)
        if first.get("status") == "NOT_FOUND":
            continue
        if first.get("status") != "OK":
            raise RuntimeError(f"{box}: {first.get('error')}")
        got = list(first["result"]["featureCollection"]["features"])
        for p in range(2, int(first["page"]["total"]) + 1):
            r = call(key, domain, box, p)
            if r.get("status") == "OK":
                got += r["result"]["featureCollection"]["features"]
            time.sleep(0.2)
        for f in got:
            feats[f.get("id") or json.dumps(f["properties"], sort_keys=True, ensure_ascii=False)] = f
        print(f"  {i}/{len(boxes)} {box}: {len(got):,}개 (누계 {len(feats):,})", flush=True)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": list(feats.values())}, fh, ensure_ascii=False)
    print(f"하천망 {len(feats):,}개 → {out} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main(sys.argv[1])
