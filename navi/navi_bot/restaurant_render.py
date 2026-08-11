from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path
import re
import time
import uuid
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFilter
except ModuleNotFoundError:  # 렌더 실패가 명령 실패로 번지지 않게 한다.
    Image = None
    ImageDraw = None
    ImageFilter = None


PROJECT_ROOT = Path(__file__).resolve().parent
ASSET_ROOT = PROJECT_ROOT / "assets" / "restaurant"
DATA_ROOT = PROJECT_ROOT / "data" / "restaurant_tycoon"
PROPERTY_MANIFEST_PATH = DATA_ROOT / "restaurant_property_manifest.json"
CUSTOMER_MANIFEST_PATH = DATA_ROOT / "customer_manifest_from_previous_pack.json"
PREVIEW_DIR = PROJECT_ROOT / "tmp" / "restaurant_previews"
DEFAULT_PROPERTY_ID = "backalley_shop"
PREVIEW_FILE_NAME = "restaurant_preview.png"

CUSTOMER_RENDER_CONFIG: dict[str, dict[str, float]] = {
    "default": {
        "height_ratio": 0.60,
        "x_ratio": 0.50,
        "bottom_ratio": 0.675,
        "max_width_ratio": 0.62,
        "foreground_top_ratio": 0.675,
    },
    "food_court": {
        "height_ratio": 0.58,
        "x_ratio": 0.50,
        "bottom_ratio": 0.68,
        "max_width_ratio": 0.60,
        "foreground_top_ratio": 0.68,
    },
}


@dataclass(frozen=True)
class RestaurantSceneRenderResult:
    output_path: Path
    property_id: str
    customer_id: str | None
    background_path: Path | None
    customer_path: Path | None
    missing_assets: tuple[str, ...] = ()
    rendered: bool = False


def load_property_manifest(path: Path | str = PROPERTY_MANIFEST_PATH) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_customer_manifest(path: Path | str = CUSTOMER_MANIFEST_PATH) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _property_asset_map() -> dict[str, dict[str, Any]]:
    try:
        manifest = load_property_manifest()
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        str(item.get("propertyId")): dict(item)
        for item in manifest.get("properties", [])
        if item.get("propertyId")
    }


@lru_cache(maxsize=1)
def _customer_asset_map() -> dict[str, dict[str, Any]]:
    try:
        manifest = load_customer_manifest()
    except (OSError, json.JSONDecodeError):
        return {}
    customers: dict[str, dict[str, Any]] = {}
    for item in manifest.get("customers", []):
        record = dict(item)
        for key in ("customerId", "imageKey"):
            value = record.get(key)
            if value:
                customers[str(value)] = record
    return customers


def _resolve_asset_path(asset_file_name: object, *, base: Path) -> Path | None:
    if not asset_file_name:
        return None
    raw_path = Path(str(asset_file_name).replace("\\", "/"))
    candidates = []
    if raw_path.is_absolute():
        candidates.append(raw_path)
    else:
        candidates.extend([PROJECT_ROOT / raw_path, ASSET_ROOT / raw_path, base / raw_path.name])
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0] if candidates else None


def get_property_background_path(property_id: str | None) -> Path | None:
    properties = _property_asset_map()
    requested_id = str(property_id or DEFAULT_PROPERTY_ID)
    record = properties.get(requested_id) or properties.get(DEFAULT_PROPERTY_ID)
    if not record:
        return None
    path = _resolve_asset_path(record.get("assetFileName"), base=ASSET_ROOT / "properties")
    return path if path and path.exists() else None


def get_customer_sprite_path(customer_id: str | None) -> Path | None:
    if not customer_id:
        return None
    record = _customer_asset_map().get(str(customer_id))
    if not record:
        return None
    path = _resolve_asset_path(record.get("assetFileName"), base=ASSET_ROOT / "customers")
    return path if path and path.exists() else None


def make_preview_output_path(user_id: int, order_id: str | None = None, directory: Path | str = PREVIEW_DIR) -> Path:
    preview_dir = Path(directory)
    preview_dir.mkdir(parents=True, exist_ok=True)
    safe_order = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(order_id or "order")).strip("-")[:48] or "order"
    unique = uuid.uuid4().hex[:10]
    return preview_dir / f"restaurant_preview_{int(user_id)}_{int(time.time())}_{safe_order}_{unique}.png"


def cleanup_old_previews(directory: Path | str = PREVIEW_DIR, *, max_age_seconds: int = 3600, keep_latest: int = 80) -> None:
    preview_dir = Path(directory)
    if not preview_dir.exists():
        return
    files = sorted(
        (path for path in preview_dir.glob("restaurant_preview_*.png") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    now = time.time()
    for index, path in enumerate(files):
        try:
            too_old = now - path.stat().st_mtime > max_age_seconds
            if index >= keep_latest or too_old:
                path.unlink(missing_ok=True)
        except OSError:
            continue


def _render_config(property_id: str) -> dict[str, float]:
    config = dict(CUSTOMER_RENDER_CONFIG["default"])
    config.update(CUSTOMER_RENDER_CONFIG.get(property_id, {}))
    return config


def _alpha_composite_clipped(base: Any, overlay: Any, x: int, y: int) -> None:
    left = max(0, int(x))
    top = max(0, int(y))
    right = min(base.width, int(x) + overlay.width)
    bottom = min(base.height, int(y) + overlay.height)
    if left >= right or top >= bottom:
        return
    crop_left = left - int(x)
    crop_top = top - int(y)
    crop = overlay.crop((crop_left, crop_top, crop_left + (right - left), crop_top + (bottom - top)))
    base.alpha_composite(crop, (left, top))


def render_restaurant_scene(property_id: str | None, customer_id: str | None, output_path: Path | str) -> RestaurantSceneRenderResult:
    output = Path(output_path)
    resolved_property_id = str(property_id or DEFAULT_PROPERTY_ID)
    missing: list[str] = []
    if resolved_property_id not in _property_asset_map():
        missing.append(f"property:{resolved_property_id}")
        resolved_property_id = DEFAULT_PROPERTY_ID

    background_path = get_property_background_path(resolved_property_id)
    customer_path = get_customer_sprite_path(customer_id)
    if customer_id and customer_path is None:
        missing.append(f"customer:{customer_id}")
    if Image is None or ImageDraw is None or ImageFilter is None:
        return RestaurantSceneRenderResult(output, resolved_property_id, customer_id, background_path, customer_path, tuple(missing + ["pillow"]), False)

    if background_path is not None:
        background = Image.open(background_path).convert("RGBA")
    else:
        missing.append(f"property:{DEFAULT_PROPERTY_ID}")
        background = Image.new("RGBA", (1672, 941), (42, 38, 33, 255))
    foreground = background.copy()

    if customer_path is not None:
        sprite = Image.open(customer_path).convert("RGBA")
        bbox = sprite.getbbox()
        if bbox:
            sprite = sprite.crop(bbox)
        config = _render_config(resolved_property_id)
        target_height = max(1, int(background.height * float(config["height_ratio"])))
        scale = target_height / max(1, sprite.height)
        target_width = max(1, int(sprite.width * scale))
        max_width = max(1, int(background.width * float(config["max_width_ratio"])))
        if target_width > max_width:
            scale = max_width / max(1, sprite.width)
            target_width = max_width
            target_height = max(1, int(sprite.height * scale))
        resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
        sprite = sprite.resize((target_width, target_height), resample)
        paste_x = int(background.width * float(config["x_ratio"]) - target_width / 2)
        paste_y = int(background.height * float(config["bottom_ratio"]) - target_height)
        paste_x = max(0, min(background.width - target_width, paste_x))
        paste_y = max(-target_height + 1, min(background.height - 1, paste_y))

        shadow = Image.new("RGBA", background.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(shadow)
        shadow_y = paste_y + int(target_height * 0.90)
        draw.ellipse(
            (
                paste_x + int(target_width * 0.15),
                shadow_y,
                paste_x + int(target_width * 0.85),
                shadow_y + max(14, int(target_height * 0.08)),
            ),
            fill=(0, 0, 0, 70),
        )
        background.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
        _alpha_composite_clipped(background, sprite, paste_x, paste_y)

        foreground_top = int(background.height * float(config.get("foreground_top_ratio", 1.0)))
        if 0 <= foreground_top < background.height:
            counter_layer = foreground.crop((0, foreground_top, background.width, background.height))
            background.alpha_composite(counter_layer, (0, foreground_top))

    output.parent.mkdir(parents=True, exist_ok=True)
    background.save(output, "PNG")
    return RestaurantSceneRenderResult(output, resolved_property_id, customer_id, background_path, customer_path, tuple(missing), True)
