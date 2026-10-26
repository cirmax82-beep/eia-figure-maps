"""법정보호종 목록(현지조사시 법정보호종 출현위치도 — 종명으로 등급·분류군 붙이기)

BioGrid EIA의 legal_protected_species.xlsx(시트: 멸종위기 야생생물 I급·II급·천연기념물, 국명 한 열)를 읽어
data/legal_species.json = {"source": ..., "species": [[국명, 등급("I"·"II"·""), 천연기념물(0·1), 분류군], ...]} 로 씀.
목록은 분류군 차례로 적혀 있어, 분류군마다 첫 종 이름으로 나눔(천연기념물만 있는 종은 아래 NM_TAXON).

    python tools/build_legal.py "C:/Users/user/Desktop/웹서비스 개발"
"""
import json
import sys
from pathlib import Path

import openpyxl

# 시트별 분류군 첫 종(이 종부터 다음 첫 종 앞까지)
STARTS = {
    "I": [("늑대", "포유류"), ("검독수리", "조류"), ("비바리뱀", "양서·파충류"), ("감돌고기", "어류"), ("닻무늬길앞잡이", "곤충류"),
          ("귀이빨대칭이", "무척추동물"), ("광릉요강꽃", "식물"), ("그물공말", "해조류")],
    "II": [("담비", "포유류"), ("개리", "조류"), ("고리도롱뇽", "양서·파충류"), ("가는돌고기", "어류"), ("깊은산부전나비", "곤충류"),
           ("갯게", "무척추동물"), ("가는동자꽃", "식물"), ("그물공말", "해조류"), ("화경솔밭버섯", "고등균류")],
    "NM": [("크낙새", "조류"), ("사향노루", "포유류"), ("어름치", "어류"), ("장수하늘소", "곤충류"), ("남생이", "양서·파충류"),
           ("해송", "무척추동물"), ("한란", "식물")],
}


def names(ws):
    out = []
    for r in ws.iter_rows(values_only=True):
        v = str(r[0]).strip() if r and r[0] is not None else ""
        if v and v != "국명":
            out.append(v)
    return out


def split(lst, starts):
    tax, i, out = None, 0, []
    for n in lst:
        if i < len(starts) and n == starts[i][0]:
            tax = starts[i][1]
            i += 1
        if tax is None:
            raise SystemExit(f"분류군 시작 전 종: {n}")
        out.append((n, tax))
    if i != len(starts):
        raise SystemExit(f"분류군 첫 종을 다 찾지 못함: {starts[i:]}")
    return out


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\Desktop\웹서비스 개발")
    wb = openpyxl.load_workbook(root / "ngii_25k_index_tool" / "data" / "legal_protected_species.xlsx", read_only=True, data_only=True)
    s1, s2, nm = (names(ws) for ws in wb.worksheets[:3])
    sp = {}
    for grade, lst in (("I", s1), ("II", s2)):
        for n, tax in split(lst, STARTS[grade]):
            if n not in sp:   # 두 등급에 다 적힌 종(그물공말·삼나무말)은 앞(I급)
                sp[n] = [n, grade, 0, tax]
    for n, tax in split(nm, STARTS["NM"]):
        if n in sp:
            sp[n][2] = 1
        else:
            sp[n] = [n, "", 1, tax]
    # 같은 종 다른 표기: II급 「까막딱다구리」 = 천연기념물 「까막딱따구리」(표준 표기로 씀), I급 「물범」 = 천연기념물 「점박이물범」(고시 이름으로 씀)
    for keep, drop in (("까막딱따구리", "까막딱다구리"), ("물범", "점박이물범")):
        if keep in sp and drop in sp:
            sp[keep][1] = sp[keep][1] or sp[drop][1]
            sp[keep][2] = 1
            del sp[drop]
    out = {
        "source": "멸종위기 야생생물 종목록(2023 고시)·천연기념물 — BioGrid EIA 정리 목록",
        "alias": {"까막딱다구리": "까막딱따구리", "점박이물범": "물범"},
        "species": list(sp.values()),
    }
    dst = Path(__file__).resolve().parent.parent / "data" / "legal_species.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    g = {k: sum(1 for v in sp.values() if v[1] == k) for k in ("I", "II")}
    print(f"{len(sp)}종 (I급 {g['I']}, II급 {g['II']}, 천연기념물 {sum(v[2] for v in sp.values())}) → {dst}")


if __name__ == "__main__":
    main()
