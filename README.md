# 사업지 도면 만들기

사업지구 경계를 넣으면 **위성사진 현황도·생태축 현황도·생태·자연도·한국 식생기후대 분포도·한국 식물상 지역** 도면을 보고서에 바로 붙일 수 있는 PNG·PDF·SVG로 만듭니다.

- 주소: https://maps.biogrideia.com/
- 호스팅케이알 DNS의 CNAME 레코드(`maps` → `cirmax82-beep.github.io`)로 연결합니다. 처음 쓰던 map.biogrideia.com은 GitHub 인증서 발급이 실패 상태로 남아 maps로 옮겼습니다(새 하위 도메인은 DNS를 먼저 넣고 퍼진 뒤 GitHub에 연결).

## 쓰는 법

1. **경계 넣기**: SHP(zip 또는 .shp+.prj)·GeoJSON·KML·DXF 파일, 좌표 붙여넣기(경위도·TM, 성과표 순서 자동 판별), 지도에 그리기. 파일은 브라우저 안에서만 읽고 어디에도 보내지 않습니다.
2. **도면 고르기**
   - 위성사진 현황도: 위성영상 + 사업지구 + 주변 범위(기본 1·2 km)
   - 생태축 현황도: 위성영상 + 산림생태계(활엽·침엽·혼효림) + 수생태계(토지피복 하천·호소·습지, 하천구역, 소하천구역, 바다) + 산·저수지·하천 이름 + 하천 흐름 방향. 미리보기 위에 산림축(녹색)·수계축(청색) 화살표를 직접 그릴 수 있습니다.
   - 생태·자연도: 브이월드 백지도(선을 진하게 처리) + 1·2등급·별도관리지역(3등급은 흰색) + 사업지구. 선택하면 도면에 보이는 범위 안 1등급 권역까지 가장 가까운 거리를 치수선으로 표시(1 m 단위, 1 m 미만은 cm). ‘등급별 면적표 받기(엑셀)’로 사업지구 안 1·2·3등급·별도관리지역 면적을 받음(3등급은 나머지, EPSG:5186 평면 넓이). 공공데이터포털 키를 저장하면 국립생태원 최신 DB(API)로도 계산
   - 한국 식생기후대 분포도·한국 식물상 지역: 남한 전국 지도(위성 바탕) + 사업지 점·이름 + 사업지 확대 그림(선택)
3. **바탕지도**: 위성영상(Esri·브이월드), 브이월드 기본지도·백지도(흑백으로 진하게), 지형 음영(Esri), 흰 바탕 중에서 고르고, 밝기·흑백·지명 겹치기(브이월드)를 정합니다. 브이월드 바탕은 인증키가 있어야 합니다.
4. **경계 이름**: 사업지구·계획지구·사업노선·사업하천·계획하천·계획노선·조사대상지 등으로 고치면 범례와 도면 글자에 씁니다(선은 처음부터 사업노선).
5. **용지·축척**: A4·A3, 가로·세로, 축척 자동(범위에 맞춤) 또는 1:1,000~1:100,000. 미리보기를 끌면 가운데를 옮기고, 마우스 휠로 축척을 한 단계씩 바꿉니다.
6. **도면 요소**: 제목, 방위표, 축척 막대, 범례, 좌표 격자(경위도·TM 중부원점), 출처를 켜고 끕니다. 이름표는 숨기거나 고칠 수 있습니다.
7. **받기**: PNG(해상도 정보 포함 — 문서에 넣으면 용지 크기로 들어감), PDF, SVG(바탕 영상만 그림, 나머지는 벡터). 200·300·400 dpi.

## 자료

| 자료 | 출처 | 쓰는 방법 |
|---|---|---|
| 위성영상 | Esri World Imagery (Esri, Maxar, Earthstar Geographics) | 타일을 그때그때 받음, 도면에 출처 표기 |
| 토지피복 | 환경부 세분류 토지피복지도(2025) | [habitat.biogrideia.com](https://habitat.biogrideia.com/)에 공개한 10 m 묶음 그림(`data/lc10`)을 읽어 산림(활엽·침엽·혼효)·수계(하천·호소·내륙습지, 갯벌·염전은 선택)를 면으로 바꿈 |
| 하천구역(국가·지방하천) | 국토교통부 브이월드 하천망(LT_C_WKMSTRM) | `tools/fetch_rivers.py`로 받아 `tools/build_water.py`로 0.5 m로 줄여 `data/water` 조각에 담음 |
| 소하천구역 | 국토교통부 (연속주제)_소하천/소하천구역(브이월드 데이터마켓, 공공누리 제4유형: 출처표시·상업적 이용금지·변경금지) | 시도별 SHP를 모양 그대로(1 cm 안 겹친 꼭짓점만 뺌, 자르지 않음) `data/water` 조각에 담음 |
| 해안선(바다) | 국토교통부 브이월드 시군구 경계(LT_C_ADSIGG_INFO) | `tools/build_land.py`로 합쳐 5 m로 줄인 육지 면을 `data/land` 조각에 담고, 틀 안 육지 밖을 바다로 칠함(휴전선·북방한계선 북쪽 제외) |
| 생태·자연도 | 기후에너지환경부 2026년 생태·자연도 정기고시(제2026-128호) GDB | `tools/build_ecnat.py`로 1·2등급·별도관리지역을 0.1도 조각마다 합쳐 `data/ecnat`에 담음(환경영향평가용이라 단순화하지 않음 — 1 cm 안쪽 겹친 꼭짓점만 뺌, 약 490 MB) |
| 백지도 | 국토교통부 브이월드 WMTS(white) | 인증키는 저장소에 넣지 않고 배포할 때 비밀값 `VWORLD_KEY`로 `js/config.js`를 만듦 |
| 식생기후대 | CHELSA V2.1 월평균기온 1981–2010 | `tools/build_vegclim.py`로 온량지수(WI)·한랭지수(CI)를 계산해 구분(한국의 숲 Ⅵ, 국립수목원 2020 범례), 남한 육지만 `data/vegclim` |
| 식물상 지역 | Jung & Cho (2020) Ecology and Evolution 10(20), Dryad doi:10.5061/dryad.3tx95x6cr (CC0) | `tools/build_flora.py`로 격자 867칸을 `data/flora/zones.json`에 |
| 산·저수지·하천 이름, 하천 선 | © OpenStreetMap 기여자 (ODbL) | Geofabrik 한국 추출본에서 뽑아 둔 `data/osm` 조각. 하천 선의 점 순서가 흐르는 방향 |

토지피복 면은 10 m 화소를 살짝 흐리게 한 뒤 등치선으로 바꾼 것이라 폭 10 m보다 좁은 개천은 빠지므로, 하천구역·소하천구역 면을 함께 칠합니다. 두 자료에도 빠진 물길(지정 구간 밖 상류 등)은 ‘하천 선(빈 곳 잇기)’이 OSM 하천 선으로 이어 칠합니다. 수계는 출처가 겹치므로 불투명하게 칠합니다. 접경지역 등 토지피복 ‘분류 없음’ 지역은 산림·수계가 빠지며, 이때 미리보기에 알림이 뜹니다.

## 브이월드 인증키(생태·자연도 백지도)

`인증키 저장.bat`을 더블클릭해 maps.biogrideia.com으로 발급한 브이월드 인증키를 붙여 넣으면, 이 컴퓨터(`work/vworld_key.txt`, `js/config.js`, 모두 저장소 제외)와 GitHub 저장소 비밀값 `VWORLD_KEY`에 넣고 다시 배포합니다. 배포는 `.github/workflows/pages.yml`(GitHub Actions)이 합니다.

## 생태·자연도·식생기후대·식물상 지역 갱신

- 생태·자연도: 새 정기고시 GDB를 받아 `python tools/build_ecnat.py "<GDB 경로>" data/ecnat` (약 20분)
- 식생기후대: `python tools/build_vegclim.py "../보호구역 종합포털/work/raw/admin-sigg.geojson" data/vegclim` (CHELSA 한반도 범위만 원격으로 읽음)
- 식물상 지역: Dryad에서 `floristic_zones_and_ecoregions.zip`을 받아 `python tools/build_flora.py <zip> data/flora`

## 하천구역·소하천구역 갱신

1. 하천구역: 국내 컴퓨터에서 `VWORLD_KEY_FILE=인증키파일 python tools/fetch_rivers.py work/raw/vw_strm.geojson` (브이월드는 해외 IP를 막음, 키는 저장소에 넣지 않음)
2. 소하천구역: 브이월드 데이터마켓 ‘(연속주제)_소하천/소하천구역’(dsId=30369)에서 로그인 후 시도별 `LSMD_CONT_UJ301_<시도>.zip`(EPSG:5186판, `_5174_` 아닌 것)을 받아 `work/raw/small`에 둠
3. `python tools/build_water.py work/raw/vw_strm.geojson work/raw/small data/water`

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
- `tools/fetch_rivers.py`, `tools/build_water.py`: 하천구역·소하천구역 조각 만들기
- `tools/build_land.py`: 바다를 가를 육지(시군구 경계) 조각 만들기
- `tools/build_ecnat.py`, `tools/build_vegclim.py`, `tools/build_flora.py`: 생태·자연도·식생기후대·식물상 지역 자료
- `인증키 저장.bat`, `tools/save-key.ps1`: 브이월드 인증키 저장
- 필요할 때만 불러오는 도구: shpjs 4.0.4, JSZip 3.10.1, turf 7.1.0(주변 범위), jsPDF 2.5.1. 늘 쓰는 도구: Leaflet 1.9.4, proj4 2.9.0, d3 7.9.0
