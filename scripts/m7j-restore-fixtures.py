#!/usr/bin/env python3
"""Restore small historical derived research fixtures for inherited tests.

These are not source Cricsheet match data or authoritative gameplay models.
Run after checking out Git bundle to verify inherited M7H/M7I Python gates.
"""
from pathlib import Path
import shutil
BASE=Path(__file__).resolve().parents[1]
SOURCE=BASE/'docs/verification-m7j'
FILES={
 SOURCE/'LC_M7I_INPUT_REGISTER.json':BASE/'reference/m7i/LC_M7I_RARE_DELIVERY_REGISTER.json',
 SOURCE/'inherited/LC_M7I_CHASE_TAIL_DIAGNOSTIC.json':BASE/'reference/m7i/LC_M7I_CHASE_TAIL_DIAGNOSTIC.json',
 SOURCE/'inherited/LC_M7I_PLAYER_GENERALISATION.json':BASE/'reference/m7i/LC_M7I_PLAYER_GENERALISATION.json',
 SOURCE/'inherited/LC_M7H_PLAYER_PREDICTIVE_EVALUATION.json':BASE/'reference/m7h/LC_M7H_PLAYER_PREDICTIVE_EVALUATION.json',
}
for src,dst in FILES.items():
 if not src.is_file():raise FileNotFoundError(src)
 dst.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(src,dst)
 print(dst.relative_to(BASE))
