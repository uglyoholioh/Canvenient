from __future__ import annotations

import colorsys
import re
from collections.abc import Iterable

from database import db


LEGACY_BALANCED_COLORS = [
    "#4F7CFF", "#19A974", "#DE7548", "#A66DD4",
    "#E05D7B", "#159CA4", "#C58B2A", "#66768C",
    "#8D6748", "#4D8C65", "#B15D9B", "#6C73CC",
]

MODULE_COLOR_PALETTES = {
    "balanced": {
        "name": "Timetable",
        "colors": [
            "#F0757C", "#6A9DCF", "#F4C55D", "#65C6C8",
            "#99CA9B", "#F28C5A", "#9A82D4", "#D978A8",
            "#5BB2D6", "#A7C65A", "#7C89C8", "#C98562",
        ],
    },
    "coastal": {
        "name": "Coastal",
        "colors": [
            "#167D9A", "#2C6EAD", "#3C8D7C", "#5597C4",
            "#2F9EAA", "#617CC4", "#4F8175", "#3287B4",
            "#6B8E9A", "#4074A8", "#3E9A91", "#637FA8",
        ],
    },
    "earth": {
        "name": "Earth",
        "colors": [
            "#A35D3B", "#647A45", "#B07B32", "#7E6751",
            "#477A67", "#9B5F62", "#7D7140", "#6F5E83",
            "#4F7E85", "#8C6941", "#5D755D", "#9A684F",
        ],
    },
    "vivid": {
        "name": "Vivid",
        "colors": [
            "#246BFD", "#E04474", "#0A9E7A", "#9A55D1",
            "#E36B24", "#008FA8", "#C58A00", "#5965D8",
            "#C43D62", "#16865A", "#7D4BC4", "#D04E2E",
        ],
    },
}


def normalize_module_code(value: str) -> str:
    normalized = " ".join(str(value or "").strip().upper().split())
    nus_module = re.search(r"\b[A-Z]{1,6}\d{4}[A-Z]*\b", normalized)
    return nus_module.group(0) if nus_module else normalized


def _extended_palette(palette_name: str, count: int) -> list[str]:
    palette = MODULE_COLOR_PALETTES.get(palette_name, MODULE_COLOR_PALETTES["balanced"])
    colors = list(palette["colors"])
    used = set(colors)
    index = 0
    while len(colors) < count:
        hue = ((index * 137.508) + 18) % 360 / 360
        saturation = 0.56 + (index % 3) * 0.06
        lightness = 0.48 + (index % 2) * 0.08
        red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
        candidate = f"#{round(red * 255):02X}{round(green * 255):02X}{round(blue * 255):02X}"
        index += 1
        if candidate not in used:
            colors.append(candidate)
            used.add(candidate)
    return colors


async def get_active_palette(user_id: int) -> str:
    palette = await db.fetch_val(
        "SELECT palette_name FROM module_color_settings WHERE user_id = :user_id",
        values={"user_id": user_id},
    )
    return palette if palette in MODULE_COLOR_PALETTES else "balanced"


async def migrate_legacy_balanced_colors(user_id: int, active_palette: str) -> None:
    if active_palette != "balanced":
        return
    rows = await db.fetch_all(
        "SELECT module_code, color FROM module_colors WHERE user_id = :user_id",
        values={"user_id": user_id},
    )
    legacy = {color.upper() for color in LEGACY_BALANCED_COLORS}
    if not rows or any(str(row["color"]).upper() not in legacy for row in rows):
        return

    replacements = dict(zip(LEGACY_BALANCED_COLORS, MODULE_COLOR_PALETTES["balanced"]["colors"]))
    async with db.transaction():
        for index, row in enumerate(rows, start=1):
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={"user_id": user_id, "module_code": row["module_code"], "color": f"#{index:06X}"},
            )
        for row in rows:
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={
                    "user_id": user_id,
                    "module_code": row["module_code"],
                    "color": replacements[str(row["color"]).upper()],
                },
            )


async def ensure_module_colors(
    user_id: int,
    modules: Iterable[tuple[str, str | None]],
) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for module_code, module_name in modules:
        code = normalize_module_code(module_code)
        if code:
            normalized[code] = str(module_name or code).strip() or code
    if not normalized:
        return {}

    active_palette = await get_active_palette(user_id)
    await migrate_legacy_balanced_colors(user_id, active_palette)
    existing_rows = await db.fetch_all(
        """
            SELECT module_code, module_name, color
            FROM module_colors
            WHERE user_id = :user_id
        """,
        values={"user_id": user_id},
    )
    existing = {row["module_code"]: row for row in existing_rows}
    used_colors = {str(row["color"]).upper() for row in existing_rows}
    candidates = _extended_palette(active_palette, len(existing) + len(normalized) + 8)

    for code in sorted(normalized):
        name = normalized[code]
        if code in existing:
            if name != code and name != existing[code]["module_name"]:
                await db.execute(
                    """
                        UPDATE module_colors
                        SET module_name = :module_name, updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = :user_id AND module_code = :module_code
                    """,
                    values={"user_id": user_id, "module_code": code, "module_name": name},
                )
            continue

        color = next(candidate for candidate in candidates if candidate.upper() not in used_colors)
        await db.execute(
            """
                INSERT INTO module_colors (user_id, module_code, module_name, color)
                VALUES (:user_id, :module_code, :module_name, :color)
                ON CONFLICT (user_id, module_code) DO NOTHING
            """,
            values={
                "user_id": user_id,
                "module_code": code,
                "module_name": name,
                "color": color,
            },
        )
        used_colors.add(color.upper())

    rows = await db.fetch_all(
        """
            SELECT module_code, color
            FROM module_colors
            WHERE user_id = :user_id
        """,
        values={"user_id": user_id},
    )
    return {
        row["module_code"]: row["color"]
        for row in rows
        if row["module_code"] in normalized
    }


async def ensure_discovered_module_colors(user_id: int) -> dict[str, str]:
    rows = await db.fetch_all(
        """
            SELECT module_code, name AS module_name
            FROM academic_modules
            WHERE user_id = :user_id
            UNION ALL
            SELECT module_code, module_name
            FROM classes
            WHERE user_id = :user_id
            UNION ALL
            SELECT module_code, module_name
            FROM exams
            WHERE user_id = :user_id
            UNION ALL
            SELECT module_code, module_code AS module_name
            FROM events
            WHERE user_id = :user_id AND module_code IS NOT NULL
        """,
        values={"user_id": user_id},
    )
    return await ensure_module_colors(
        user_id,
        ((row["module_code"], row["module_name"]) for row in rows),
    )


def public_palettes() -> list[dict[str, object]]:
    return [
        {"id": key, "name": value["name"], "colors": value["colors"]}
        for key, value in MODULE_COLOR_PALETTES.items()
    ]
