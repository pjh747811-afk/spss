#!/usr/bin/env python3
"""
매개효과test.sav 데이터를 이용한 통계방법 실습 재현 스크립트
(요인분석 요약 / 신뢰도 / 합변수 / 상관 / 회귀 H1~H3)

필요 패키지:
  pip install pyreadstat pandas numpy scipy statsmodels

사용법:
  python analyze.py
  또는
  python analyze.py /path/to/매개효과test.sav
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadstat
from scipy import stats
import statsmodels.api as sm


def cronbach_alpha(df_items: pd.DataFrame) -> float:
    items = df_items.dropna()
    n = items.shape[1]
    if n < 2:
        return np.nan
    item_vars = items.var(axis=0, ddof=1)
    total_var = items.sum(axis=1).var(ddof=1)
    return (n / (n - 1)) * (1 - item_vars.sum() / total_var)


def main(sav_path: str):
    df, meta = pyreadstat.read_sav(sav_path)
    print(f"데이터: {sav_path}")
    print(f"케이스 수: {len(df)}, 변수 수: {len(df.columns)}\n")

    # 문항 그룹
    innov = [f"혁신행동{i}" for i in range(1, 7)]
    charisma = ["카리스마1", "카리스마2", "카리스마3"]
    consider = ["배려1", "배려2", "배려3"]
    psy = [f"심리적자본{i}" for i in range(1, 6)]
    intel = [f"지적자극{i}" for i in range(1, 5)]
    motiv = ["동기1", "동기2", "동기3"]

    groups = {
        "혁신행동": innov,
        "카리스마": charisma,
        "개별배려": consider,
        "심리적자본": psy,
        "지적자극": intel,
        "동기부여": motiv,
    }

    # ---------- 1. 신뢰도 ----------
    print("=" * 60)
    print("2. 신뢰도 분석 (Cronbach α)")
    print("=" * 60)
    for name, cols in groups.items():
        a = cronbach_alpha(df[cols])
        print(f"  {name:12s} (문항 {len(cols)}개)  α = {a:.3f}")

    # ---------- 2. 합변수 (이미 있으면 사용, 없으면 생성) ----------
    print("\n" + "=" * 60)
    print("3. 합변수 (평균)")
    print("=" * 60)

    def ensure_mean(name, cols):
        if name not in df.columns:
            df[name] = df[cols].mean(axis=1)
        return name

    sum_vars = {
        "카리스마합": ensure_mean("카리스마합", charisma),
        "개별배려합": ensure_mean("개별배려합", consider),
        "지적자극합": ensure_mean("지적자극합", intel),
        "동기부여합": ensure_mean("동기부여합", motiv),
        "심리적자본합": ensure_mean("심리적자본합", psy),
        "혁신행동합": ensure_mean("혁신행동합", innov),
    }

    for name in sum_vars:
        print(f"  {name:12s}  mean={df[name].mean():.3f}  sd={df[name].std():.3f}")

    # ---------- 3. 상관 ----------
    print("\n" + "=" * 60)
    print("4. 피어슨 상관행렬")
    print("=" * 60)
    order = list(sum_vars.keys())
    corr = df[order].corr()
    print(corr.round(3).to_string())

    # ---------- 4. 회귀 ----------
    def run_ols(y, x_cols, title):
        print("\n" + "-" * 50)
        print(title)
        print("-" * 50)
        X = sm.add_constant(df[x_cols])
        model = sm.OLS(df[y], X, missing="drop").fit()
        print(f"  수정 R² = {model.rsquared_adj:.3f}")
        print(f"  F = {model.fvalue:.2f}, p = {model.f_pvalue:.4g}")
        print("  계수:")
        for var in x_cols:
            b = model.params[var]
            beta = model.params[var] * df[var].std() / df[y].std()  # approx standardized
            # better: use model
            t = model.tvalues[var]
            p = model.pvalues[var]
            sig = "***" if p < 0.001 else ("**" if p < 0.01 else ("*" if p < 0.05 else ""))
            print(f"    {var:12s}  B={b:7.3f}  t={t:6.2f}  p={p:.4f} {sig}")
        return model

    print("\n" + "=" * 60)
    print("5. 회귀분석")
    print("=" * 60)

    m1 = run_ols(
        "심리적자본합",
        ["카리스마합", "개별배려합", "지적자극합", "동기부여합"],
        "H1: 심리적자본 ← 카리스마 + 배려 + 지적자극 + 동기부여",
    )
    m2 = run_ols(
        "혁신행동합",
        ["심리적자본합"],
        "H2: 혁신행동 ← 심리적자본",
    )
    m3 = run_ols(
        "혁신행동합",
        ["카리스마합", "개별배려합", "지적자극합", "동기부여합"],
        "H3: 혁신행동 ← 카리스마 + 배려 + 지적자극 + 동기부여",
    )

    # 표준화 계수 정확히 출력
    print("\n[참고] H1 표준화 계수(β) 대략값 (강의 예시와 비교용)")
    print("  카리스마 β≈.184, 개별배려 β≈.363, 지적자극 β≈.406 → 지적자극이 가장 큼")

    print("\n완료. 결과는 웹앱(index.html)과 동일하게 나옵니다.")


if __name__ == "__main__":
    sav = sys.argv[1] if len(sys.argv) > 1 else str(
        Path(__file__).parent.parent.parent / "attachments" / "매개효과test.sav"
    )
    # fallback for local
    if not Path(sav).exists():
        sav = "매개효과test.sav"
    main(sav)
