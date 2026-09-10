from fastapi import APIRouter, HTTPException

from database import db
from dependencies import CurrentUser
from models.module_color import ModuleColorUpdate, ModulePaletteUpdate
from module_colors import (
    MODULE_COLOR_PALETTES,
    _extended_palette,
    ensure_discovered_module_colors,
    normalize_module_code,
    public_palettes,
)

router = APIRouter(prefix="/module-colors", tags=["module-colors"])


async def build_module_color_payload(user_id: int):
    await ensure_discovered_module_colors(user_id)
    active_palette = await db.fetch_val(
        "SELECT palette_name FROM module_color_settings WHERE user_id = :user_id",
        values={"user_id": user_id},
    ) or "balanced"
    rows = await db.fetch_all(
        """
            SELECT module_code, module_name, color
            FROM module_colors
            WHERE user_id = :user_id
            ORDER BY module_code ASC
        """,
        values={"user_id": user_id},
    )
    return {
        "active_palette": active_palette,
        "palettes": public_palettes(),
        "modules": [dict(row) for row in rows],
    }


@router.get("")
async def list_module_colors(current_user: CurrentUser):
    return await build_module_color_payload(current_user.id)


@router.put("/palette")
async def apply_module_palette(payload: ModulePaletteUpdate, current_user: CurrentUser):
    if payload.palette not in MODULE_COLOR_PALETTES:
        raise HTTPException(status_code=400, detail="Unknown module colour palette.")
    await ensure_discovered_module_colors(current_user.id)
    rows = await db.fetch_all(
        """
            SELECT module_code
            FROM module_colors
            WHERE user_id = :user_id
            ORDER BY module_code ASC
        """,
        values={"user_id": current_user.id},
    )
    colors = _extended_palette(payload.palette, len(rows))
    async with db.transaction():
        reserved = {color.upper() for color in colors}
        temporary_colors = []
        candidate = 1
        while len(temporary_colors) < len(rows):
            temporary = f"#{candidate:06X}"
            candidate += 1
            if temporary not in reserved:
                temporary_colors.append(temporary)
                reserved.add(temporary)

        for row, temporary in zip(rows, temporary_colors, strict=False):
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={
                    "user_id": current_user.id,
                    "module_code": row["module_code"],
                    "color": temporary,
                },
            )
        for row, color in zip(rows, colors, strict=False):
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={
                    "user_id": current_user.id,
                    "module_code": row["module_code"],
                    "color": color,
                },
            )
        await db.execute(
            """
                INSERT INTO module_color_settings (user_id, palette_name)
                VALUES (:user_id, :palette_name)
                ON CONFLICT (user_id) DO UPDATE SET palette_name = EXCLUDED.palette_name
            """,
            values={"user_id": current_user.id, "palette_name": payload.palette},
        )
    return await build_module_color_payload(current_user.id)


@router.patch("/{module_code}")
async def update_module_color(
    module_code: str,
    payload: ModuleColorUpdate,
    current_user: CurrentUser,
):
    code = normalize_module_code(module_code)
    await ensure_discovered_module_colors(current_user.id)
    target = await db.fetch_one(
        """
            SELECT module_code, color
            FROM module_colors
            WHERE user_id = :user_id AND module_code = :module_code
        """,
        values={"user_id": current_user.id, "module_code": code},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Module not found.")

    conflict = await db.fetch_one(
        """
            SELECT module_code
            FROM module_colors
            WHERE user_id = :user_id AND UPPER(color) = :color
              AND module_code <> :module_code
        """,
        values={
            "user_id": current_user.id,
            "module_code": code,
            "color": payload.color,
        },
    )
    async with db.transaction():
        if conflict:
            used = {
                str(row["color"]).upper()
                for row in await db.fetch_all(
                    "SELECT color FROM module_colors WHERE user_id = :user_id",
                    values={"user_id": current_user.id},
                )
            }
            temporary = next(
                f"#{value:06X}" for value in range(1, 0xFFFFFF)
                if f"#{value:06X}" not in used
            )
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={"user_id": current_user.id, "module_code": code, "color": temporary},
            )
            await db.execute(
                """
                    UPDATE module_colors
                    SET color = :color, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id AND module_code = :module_code
                """,
                values={
                    "user_id": current_user.id,
                    "module_code": conflict["module_code"],
                    "color": target["color"],
                },
            )
        await db.execute(
            """
                UPDATE module_colors
                SET color = :color, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id AND module_code = :module_code
            """,
            values={"user_id": current_user.id, "module_code": code, "color": payload.color},
        )
        await db.execute(
            """
                INSERT INTO module_color_settings (user_id, palette_name)
                VALUES (:user_id, 'custom')
                ON CONFLICT (user_id) DO UPDATE SET palette_name = 'custom'
            """,
            values={"user_id": current_user.id},
        )
    return await build_module_color_payload(current_user.id)
