#!/usr/bin/env python3
"""OFFLINE ONLY: frozen fictional-eight-01 generator. Never run during a match.

Uses the pinned SHA256_COUNTER_V1 six-position positional address, specifically
WORLD_GENERATION, and explicitly allocated stages. Python hashlib is an
independent offline implementation of the production TypeScript address service.
Output is an authored synthetic fixture, not an empirical cricket dataset.
"""
import argparse
import hashlib
import json
from pathlib import Path

VERSION = "LC_FICTIONAL_WORLD_GENERATOR_V1"
SEED = "lcxxvi-fictional-eight-v1-20260927"
PACK_ID = "fictional-eight-01"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "packages/data/worlds"
TEAMS = (
    ("Aster Harbour", "#254B69", "#E6C97D", "Aster Quay"),
    ("Copper Vale", "#9B4A32", "#EEE5D1", "Copperfield"),
    ("Northlight Ridge", "#254A3D", "#D1DBDC", "Northlight Park"),
    ("Westmere Isles", "#433E79", "#E7CBE5", "Westmere Oval"),
    ("Ember Plains", "#A43D38", "#27282E", "Ember Meadow"),
    ("Silver Fen", "#5F7480", "#F3E6CA", "Silverfen"),
    ("Larchwood", "#395431", "#F3B76D", "Larchwood Ground"),
    ("Moonstone Bay", "#2A5B69", "#D9DDEA", "Moonstone Fields"),
)
GIVEN = ("Arven", "Belan", "Caro", "Deren", "Elio", "Fenn", "Galen", "Halen", "Isen", "Jora", "Kaelen", "Leron", "Miran", "Nerin", "Oren", "Pavan", "Quill", "Rilan", "Saren", "Tavin", "Ulen", "Vero", "Walen", "Yoran", "Zerin", "Nalo", "Eren", "Nave", "Borin", "Sela", "Ari", "Talor")
FAMILY_A = ("Ash", "Briar", "Cor", "Dun", "Elm", "Falk", "Glen", "Har", "Iver", "Jor", "Kel", "Lorn", "Moss", "Nor", "Orin", "Pell", "Quen", "Rook", "Sable", "Tern", "Vale", "Wren", "Yew", "Zorn")
FAMILY_B = ("ford", "mere", "brook", "den", "wick", "fell", "thorne", "croft", "stone", "field", "stead", "well", "combe", "bridge", "holt", "ridge")
SKILLS = ("defence", "timing", "power", "rotation", "vsPace", "vsSpin", "control", "movement", "variation", "stamina", "catching", "groundFielding", "throwing", "keeping")
BATTING = {"defence", "timing", "power", "rotation", "vsPace", "vsSpin"}
BOWLING = {"control", "movement", "variation", "stamina"}
FORMATS = ("T20", "ODI", "RED_BALL")
ROLES = ("KEEPER", "KEEPER", "BOWLER", "BOWLER", "BOWLER", "BOWLER", "BOWLER", "BOWLER", "ALLROUNDER", "ALLROUNDER", "ALLROUNDER", "BATTER", "BATTER", "BATTER", "BATTER", "BATTER", "BATTER", "BATTER", "BATTER", "BATTER")
STYLES = ("FAST", "MEDIUM", "OFF_SPIN", "LEG_SPIN", "SLOW_LEFT_ARM", "LEFT_ARM_WRIST")


def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def canonical_bytes(value):
    # All published values and keys are ASCII; Python sorted keys match UTF-16 key order.
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def uint32(entity_id, ordinal, stage, draw_index=0):
    address = [SEED, "WORLD_GENERATION", entity_id, ordinal, stage, draw_index]
    digest = hashlib.sha256(json.dumps(address, ensure_ascii=True, separators=(",", ":")).encode("utf8")).digest()
    return int.from_bytes(digest[:4], "big")


def draw(entity_id, ordinal, stage, ceiling):
    """Rejection sampling eliminates modulo bias; each retry has its own drawIndex."""
    if ceiling < 1:
        raise ValueError("positive ceiling required")
    limit = (2 ** 32 // ceiling) * ceiling
    for draw_index in range(256):
        number = uint32(entity_id, ordinal, stage, draw_index)
        if number < limit:
            return number % ceiling
    raise ValueError("rejection bound exceeded")


def synthetic_skill(role, style, name, format_index):
    if name in BATTING:
        centre = {"KEEPER": 49, "BOWLER": 34, "ALLROUNDER": 53, "BATTER": 65}[role]
    elif name in BOWLING:
        centre = {"KEEPER": 27, "BOWLER": 65, "ALLROUNDER": 52, "BATTER": 29}[role]
    elif name == "keeping":
        centre = 71 if role == "KEEPER" else 26
    else:
        centre = {"KEEPER": 56, "BOWLER": 54, "ALLROUNDER": 57, "BATTER": 52}[role]
    if format_index == 0 and name == "power": centre += 4
    if format_index == 2 and name == "defence": centre += 5
    if format_index == 2 and name == "power": centre -= 3
    if style and name == "vsSpin" and style.endswith("SPIN"): centre += 2
    return centre


def build():
    source_hash = hash_bytes(Path(__file__).read_bytes())
    source_id = {"generatorVersion": VERSION, "seed": SEED, "generatorSourceSha256": source_hash}
    provenance_hash = hash_bytes(canonical_bytes(source_id))
    players, teams, grounds = [], [], []
    used_names = set()
    for t in range(8):
        team_id = f"team-{t+1:02}"
        ground_id = f"ground-{t+1:02}"
        name, primary, secondary, ground_name = TEAMS[t]
        squad = []
        for i, role in enumerate(ROLES):
            player_number = t * 20 + i + 1
            player_id = f"p{player_number:03}"
            first = GIVEN[draw(player_id, 0, "GIVEN_NAME", len(GIVEN))]
            family = FAMILY_A[draw(player_id, 0, "FAMILY_A", len(FAMILY_A))] + FAMILY_B[draw(player_id, 0, "FAMILY_B", len(FAMILY_B))]
            full_name = f"{first} {family}"
            if full_name in used_names:
                full_name = f"{first} {family} {i + 1}"
            used_names.add(full_name)
            style = None
            if role in ("BOWLER", "ALLROUNDER"):
                # Every squad includes four pace/seam and a spin variety.
                style = STYLES[(i - 2) % len(STYLES)] if role == "BOWLER" else STYLES[(i + t) % len(STYLES)]
            bat_hand = "L" if i % 5 in (0, 3) else "R"
            bowl_hand = "L" if i % 4 == 0 else "R"
            skills = {}
            for format_index, fmt in enumerate(FORMATS):
                traits = {}
                for skill in SKILLS:
                    centre = synthetic_skill(role, style, skill, format_index)
                    jitter = draw(player_id, format_index, "SKILL_" + skill.upper(), 31) - 15
                    traits[skill] = max(10, min(90, centre + jitter))
                skills[fmt] = traits
            shot_weights = [200 + draw(player_id, sector, "SECTOR_WEIGHT", 801) for sector in range(8)]
            players.append({
                "playerId": player_id,
                "name": full_name,
                "birthDate": f"{1987 + draw(player_id, 0, 'BIRTH_YEAR', 21):04}-{1 + draw(player_id, 0, 'BIRTH_MONTH', 12):02}-{1 + draw(player_id, 0, 'BIRTH_DAY', 28):02}",
                "batHand": bat_hand,
                "bowlHand": bowl_hand,
                "bowlingStyle": style,
                "role": role,
                "skills": skills,
                "variations": ["stock"],
                "shotSectorWeights": shot_weights,
                "exposureBalls": {"T20": 0, "ODI": 0, "RED_BALL": 0},
                "provenance": {"kind": "FICTIONAL", "sourceId": PACK_ID, "sourceHash": provenance_hash, "confidenceBp": 3000},
            })
            squad.append(player_id)
        teams.append({"teamId": team_id, "name": name, "squadIds": squad, "colours": [primary, secondary]})
        pitch = {
            "seamBp": 3500 + draw(ground_id, 0, "SEAM", 4001),
            "turnBp": 3500 + draw(ground_id, 0, "TURN", 4001),
            "variabilityBp": 3500 + draw(ground_id, 0, "VARIABILITY", 3001),
            "moistureBp": 3500 + draw(ground_id, 0, "MOISTURE", 3001),
            "wearPoints": 0,
        }
        grounds.append({
            "groundId": ground_id,
            "name": ground_name,
            "pitchPrior": pitch,
            "sectorRadiiCm": [6700 + draw(ground_id, sector, "BOUNDARY_RADIUS", 1701) for sector in range(8)],
            "outfieldSpeedBp": 4000 + draw(ground_id, 0, "OUTFIELD", 2001),
        })
    world = {"packId": PACK_ID, "schemaVersion": "1.0.0", "players": players, "teams": teams, "grounds": grounds,
             "rulesIds": ["LC_T20_01", "LC_ODI_01", "LC_RED5_01"],
             "provenance": "FICTIONAL: One-time offline SHA256_COUNTER_V1 WORLD_GENERATION seed; provisional SYNTHETIC_ALPHA skills, not empirical cricket."}
    world_bytes = json_bytes(world)
    manifest = {
        "worldPackId": PACK_ID,
        "schemaVersion": "1.0.0",
        "worldGeneratorVersion": VERSION,
        "worldSeed": SEED,
        "generatorSourceSha256": source_hash,
        "provenanceSourceSha256": provenance_hash,
        "worldFileSha256": hash_bytes(world_bytes),
        "worldCanonicalSha256": hash_bytes(canonical_bytes(world)),
        "worldByteLength": len(world_bytes),
        "rulesIds": world["rulesIds"],
        "modelId": "synthetic-alpha-01",
        "modelHash": "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
        "stagePackId": "synthetic-alpha-01-delivery-v1",
        "stagePackHash": "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
        "randomId": "SHA256_COUNTER_V1",
        "variationIds": ["stock"],
        "provenance": "FICTIONAL",
        "modelStatus": "SYNTHETIC_ALPHA",
        "teamIds": [t["teamId"] for t in teams],
        "groundIds": [g["groundId"] for g in grounds],
        "homeGroundIds": {t["teamId"]: grounds[index]["groundId"] for index, t in enumerate(teams)},
    }
    vectors = {"randomVersion": "SHA256_COUNTER_V1", "generatorVersion": VERSION, "seed": SEED, "vectors": []}
    for player in ("p001", "p016", "p081", "p160"):
        for stage, ordinal in (("GIVEN_NAME", 0), ("SKILL_DEFENCE", 0), ("SKILL_KEEPING", 2)):
            address = {"seed": SEED, "domain": "WORLD_GENERATION", "entityId": player,
                       "eventOrdinal": ordinal, "stageName": stage, "drawIndex": 0}
            vectors["vectors"].append({"address": address, "expectedUint32": uint32(player, ordinal, stage)})
    return world_bytes, json_bytes(manifest), json_bytes(vectors)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--write", action="store_true", help="author new frozen output; explicit only")
    p.add_argument("--check", action="store_true", help="regenerate in memory and compare bytes")
    p.add_argument("--out", type=Path, default=OUT, help="write files to a separate test directory")
    args = p.parse_args()
    if args.write == args.check:
        p.error("select exactly one of --write or --check")
    world, manifest, vectors = build()
    files = {"fictional-eight-01.json": world, "fictional-eight-01.manifest.json": manifest,
             "world-generation-vectors.json": vectors}
    if args.check:
        for name, data in files.items():
            target = args.out / name
            if target.read_bytes() != data:
                raise SystemExit(f"FAILED deterministic regeneration: {target}")
        print("PASS: three frozen world assets regenerated byte-identically")
    else:
        args.out.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (args.out / name).write_bytes(data)
        print("WROTE: frozen world, manifest and independent address reference vectors")
    print("WORLD FILE SHA256", json.loads(manifest)["worldFileSha256"])
    print("WORLD CANONICAL SHA256", json.loads(manifest)["worldCanonicalSha256"])


if __name__ == "__main__":
    main()
