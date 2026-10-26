"""생태계교란 생물 목록(현지조사시 생태계교란생물 출현위치도 — 종명으로 분류군·학명 붙이기)

교란생물 종합관리(invasive.biogrideia.com) 저장소의 js/data-species.js(SPECIES_CATALOG)에서 국명·학명·분류군만 읽어
data/invasive_species.json = {"source": ..., "species": [[국명, 분류군, 학명], ...], "alias": {다른 이름: 국명}} 로 씀.
「파랑볼우럭(블루길)」처럼 괄호 안 이름과 「붉은귀거북속 전종」의 「붉은귀거북(속)」은 다른 이름으로 둠.

    python tools/build_invasive.py "C:/Users/user/교란생물 종합관리"
"""
import json
import re
import sys
from pathlib import Path

GROUP = {"mammal": "포유류", "herp": "양서·파충류", "fish": "어류", "crustacean": "갑각류", "insect": "곤충류", "plant": "식물"}


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\교란생물 종합관리")
    src = (root / "js" / "data-species.js").read_text(encoding="utf-8")
    rows = re.findall(r'\{\s*id:\s*"[^"]+",\s*name:\s*"([^"]+)",\s*sci:\s*"([^"]+)",\s*group:\s*"([^"]+)"', src)
    if not rows:
        raise SystemExit("SPECIES_CATALOG를 찾지 못함")
    species, alias = [], {}
    for name, sci, group in rows:
        m = re.match(r"^(.+?)\((.+)\)$", name)
        if m:
            name = m.group(1).strip()
            alias[m.group(2).strip()] = name
        if name.endswith("속 전종"):
            base = name[: -len(" 전종")]
            alias[base] = name        # 붉은귀거북속 → 붉은귀거북속 전종
            alias[base[:-1]] = name   # 붉은귀거북 → 붉은귀거북속 전종
        species.append([name, GROUP.get(group, group), sci])
    out = {
        "source": "생태계교란 생물 목록 — 교란생물 종합관리(invasive.biogrideia.com) 정리, 지정 고시로 확인",
        "alias": alias,
        "species": species,
    }
    dst = Path(__file__).resolve().parent.parent / "data" / "invasive_species.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(species)}종, 다른 이름 {alias} → {dst}")


if __name__ == "__main__":
    main()
