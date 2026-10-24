# 사업지 도면 만들기

사업지구 경계를 넣으면 **위성사진 현황도**와 **생태축 현황도**를 보고서에 바로 붙일 수 있는 PNG·PDF·SVG로 만듭니다.

- 주소: https://map.biogrideia.com/
- 호스팅케이알 DNS의 CNAME 레코드(`map` → `cirmax82-beep.github.io`)로 연결합니다.

## 쓰는 법

1. **경계 넣기**: SHP(zip 또는 .shp+.prj)·GeoJSON·KML·DXF 파일, 좌표 붙여넣기(경위도·TM, 성과표 순서 자동 판별), 지도에 그리기. 파일은 브라우저 안에서만 읽고 어디에도 보내지 않습니다.
2. **도면 고르기**
   - 위성사진 현황도: 위성영상 + 사업지구 + 주변 범위(기본 1·2 km)
   - 생태축 현황도: 위성영상 + 산림생태계(활엽·침엽·혼효림) + 수생태계(하천·호소) + 산·저수지·하천 이름 + 하천 흐름 방향. 미리보기 위에 산림축(녹색)·수계축(청색) 화살표를 직접 그릴 수 있습니다.
3. **용지·축척**: A4·A3, 가로·세로, 축척 자동(범위에 맞춤) 또는 1:1,000~1:100,000. 미리보기를 끌면 가운데를 옮깁니다.
4. **도면 요소**: 제목, 방위표, 축척 막대, 범례, 좌표 격자(경위도·TM 중부원점), 출처를 켜고 끕니다. 이름표는 숨기거나 고칠 수 있습니다.
5. **받기**: PNG(해상도 정보 포함 — 문서에 넣으면 용지 크기로 들어감), PDF, SVG(바탕 영상만 그림, 나머지는 벡터). 200·300·400 dpi.

## 자료

| 자료 | 출처 | 쓰는 방법 |
|---|---|---|
| 위성영상 | Esri World Imagery (Esri, Maxar, Earthstar Geographics) | 타일을 그때그때 받음, 도면에 출처 표기 |
| 토지피복 | 환경부 세분류 토지피복지도(2025) | [habitat.biogrideia.com](https://habitat.biogrideia.com/)에 공개한 10 m 묶음 그림(`data/lc10`)을 읽어 산림(활엽·침엽·혼효)·수계(하천·호소)를 면으로 바꿈 |
| 산·저수지·하천 이름, 하천 선 | © OpenStreetMap 기여자 (ODbL) | Geofabrik 한국 추출본에서 뽑아 둔 `data/osm` 조각. 하천 선의 점 순서가 흐르는 방향 |

토지피복 면은 10 m 화소를 살짝 흐리게 한 뒤 등치선으로 바꾼 것이라, 폭 10 m보다 좁은 개천은 끊기거나 빠질 수 있습니다(‘작은 하천 선’을 켜면 OSM 하천 선을 함께 그림).

## 이름·하천 자료 갱신

```bash
curl -L -o work/raw/south-korea.osm.pbf https://download.geofabrik.de/asia/south-korea-latest.osm.pbf
python tools/build_osm.py work/raw/south-korea.osm.pbf data/osm
```

필요한 파이썬 패키지: osmium(pyosmium), shapely, pyproj. 0.1도 조각(약 1,300개, 24 MB)과 `data/osm/index.json`을 다시 만듭니다.

## 파일

- `index.html`, `css/style.css`
- `js/input.js`: 경계 입력(보호구역 종합포털 사업지 분석 입력 코드를 옮김)
- `js/render.js`: 도면 그리기 — 용지 mm 좌표 펜(캔버스·SVG), 위성 타일, 토지피복 면, 이름표, 도면 요소
- `js/app.js`: 화면, 미리보기, 축 화살표, 받기
- `tools/build_osm.py`: OSM 이름·하천 조각 만들기
- 필요할 때만 불러오는 도구: shpjs 4.0.4, JSZip 3.10.1, turf 7.1.0(주변 범위), jsPDF 2.5.1. 늘 쓰는 도구: Leaflet 1.9.4, proj4 2.9.0, d3 7.9.0
