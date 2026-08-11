from __future__ import annotations

import asyncio
import math
import random
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

from .affection_system import affection_score_text, today_key
from .config import Config, allowed_mentions_for, clean_text, mention_user, no_mentions
from .database import Database, NAVI_OWNER_USER_ID, RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT
from .restaurant_render import PREVIEW_FILE_NAME, cleanup_old_previews, make_preview_output_path, render_restaurant_scene
from .restaurant_tycoon_core import (
    DEFAULT_PROPERTY_ID,
    FURNITURE,
    PROPERTIES,
    ActiveCustomerOrder,
    BusinessSession,
    SatisfactionResult,
    choose_customer,
    choose_order,
    evaluate_order,
    furniture_def,
    navi_dialogue,
    property_def,
    property_grade_at_least,
    recipe_tags,
)
from .utils_time import now_db_time, now_kst, parse_db_time, to_db_time


RESTAURANT_COLOR = discord.Color.from_rgb(245, 158, 11)
KITCHEN_IMAGE = "navi_restaurant_kitchen.png"
SINCERITY_COOKIE_IMAGE = "navi_restaurant_sincerity_cookie.png"
SESSION_SECONDS = 15 * 60
STEP_SECONDS = 10
NAPULNAPUL_DELAY_SECONDS = 4
ORDER_RECIPE_PAGE_SIZE = 20


RESTAURANT_EMOJIS: dict[str, str] = {
    "flour": "<:milgaru:1521885535101255861>",
    "dough": "<:banjuk:1521885527131820162>",
    "rollingPin": "<:milldei:1521885520307945612>",
    "pan": "<:pan:1521885513332559983>",
    "goldenPan": "<:gooldpan:1521885504897814679>",
    "recipeBook": "<:recipe:1521885495112630332>",
    "pot": "<:nambi:1521885483737813064>",
    "oven": "<:oven:1521885475575697478>",
    "fail": "<:fail:1521885468118220962>",
    "secret": "<:secret:1521885457674276884>",
    "egg": "🥚",
    "bread": "🍞",
    "salad": "🥗",
    "cheese": "🧀",
    "tomato": "🍅",
    "chicken": "🍗",
    "bacon": "🥓",
    "rice": "🍚",
    "ramen": "🍜",
    "meat": "🥩",
    "pork": "🥩",
    "honey": "🍯",
    "nuts": "🌰",
    "butter": "🧈",
    "milk": "🥛",
    "salt": "🧂",
    "cake": "🎂",
    "cookie": "🍪",
    "baguette": "🥖",
    "sandwich": "🥪",
    "pancake": "🥞",
    "curry": "🍛",
    "pasta": "🍝",
    "pizza": "🍕",
    "burger": "🍔",
    "onigiri": "🍙",
    "soup": "🍲",
    "potato": "🥔",
    "onion": "🧅",
    "strawberry": "🍓",
    "chocolate": "🍫",
    "soySauce": "🧴",
    "greenOnion": "🟢",
    "mala": "🌶️",
    "garlic": "🧄",
    "kimchi": "🥬",
    "cabbage": "🥬",
    "mushroom": "🍄",
    "shrimp": "🍤",
    "fish": "🐟",
}


def emoji(key: str) -> str:
    return RESTAURANT_EMOJIS.get(str(key), "❔")


def sanitize_restaurant_text(value: object) -> str:
    text = str(value)
    text = re.sub(r"\{navi:[^}]+\}", "❔", text)
    text = re.sub(r"\{recipe:[^}]+\}", "❔", text)
    text = re.sub(r"\{item:[^}]+\}", "❔", text)
    text = re.sub(r"\{emoji:[^}]+\}", "❔", text)
    return discord.utils.escape_mentions(text)


def button_label(value: str) -> str:
    text = sanitize_restaurant_text(value).strip()
    return text[:77] + "..." if len(text) > 80 else text


@dataclass(frozen=True)
class ItemDef:
    display_name: str
    emoji_key: str
    category: str


@dataclass(frozen=True)
class ToolDef:
    display_name: str
    emoji_key: str


@dataclass(frozen=True)
class TimingStage:
    name: str
    difficulty: str
    delay_min_ms: int
    delay_max_ms: int


@dataclass(frozen=True)
class Recipe:
    recipe_id: str
    display_name: str
    button_name: str
    emoji_key: str
    tier: str
    required_items: dict[str, int]
    required_tools: tuple[str, ...]
    steps: tuple[str, ...]
    wrong_actions: tuple[str, ...]
    timing_stages: tuple[TimingStage, ...]
    produces: dict[str, int]
    base_flour_reward: int
    base_affection: int
    unlocks_on_success: tuple[str, ...] = ()
    hint: str = "조금 더 진행하면 알 수 있어요."
    success_text: str | None = None
    failure_text: str | None = None


@dataclass(frozen=True)
class ShopItem:
    item_id: str
    kind: str
    price: int
    unlock_id: str
    hint: str


@dataclass
class CookSession:
    session_id: str
    user_id: int
    recipe_id: str
    current_step_index: int = 0
    mistakes: int = 0
    quality_bonus: int = 0
    state: str = "steps"
    timing_index: int = 0
    timing_ready_at: float | None = None
    expires_at_monotonic: float = field(default_factory=lambda: time.monotonic() + SESSION_SECONDS)
    timing_nonce: int = 0
    business_session_id: str | None = None


TOOLS: dict[str, ToolDef] = {
    "pan": ToolDef("프라이팬", "pan"),
    "rolling_pin": ToolDef("밀대", "rollingPin"),
    "pot": ToolDef("냄비", "pot"),
    "oven": ToolDef("오븐", "oven"),
    "golden_pan": ToolDef("황금 프라이팬", "goldenPan"),
}


ITEMS: dict[str, ItemDef] = {
    "flour": ItemDef("밀가루", "flour", "재료"),
    "dough": ItemDef("반죽", "dough", "재료"),
    "thin_dough": ItemDef("얇은 반죽", "dough", "재료"),
    "egg": ItemDef("계란", "egg", "재료"),
    "rice": ItemDef("밥", "rice", "재료"),
    "bread": ItemDef("식빵", "bread", "요리"),
    "baguette_item": ItemDef("바게트", "baguette", "요리"),
    "butter": ItemDef("버터", "butter", "재료"),
    "milk": ItemDef("우유", "milk", "재료"),
    "salt": ItemDef("소금", "salt", "재료"),
    "sugar": ItemDef("설탕", "cookie", "재료"),
    "soy_sauce": ItemDef("간장", "soySauce", "재료"),
    "green_onion": ItemDef("파", "greenOnion", "재료"),
    "garlic": ItemDef("마늘", "garlic", "재료"),
    "kimchi": ItemDef("김치", "kimchi", "재료"),
    "cabbage": ItemDef("양배추", "cabbage", "재료"),
    "mushroom": ItemDef("버섯", "mushroom", "재료"),
    "shrimp": ItemDef("새우", "shrimp", "재료"),
    "fish": ItemDef("생선", "fish", "재료"),
    "seaweed": ItemDef("김", "salad", "재료"),
    "salad_greens": ItemDef("샐러드 채소", "salad", "재료"),
    "salad_item": ItemDef("샐러드", "salad", "요리"),
    "tomato": ItemDef("토마토", "tomato", "재료"),
    "potato": ItemDef("감자", "potato", "재료"),
    "onion": ItemDef("양파", "onion", "재료"),
    "cheese": ItemDef("치즈", "cheese", "재료"),
    "chicken": ItemDef("닭고기", "chicken", "재료"),
    "bacon_raw": ItemDef("베이컨 재료", "bacon", "재료"),
    "bacon_item": ItemDef("베이컨", "bacon", "요리"),
    "meat": ItemDef("고기", "meat", "재료"),
    "pork": ItemDef("돼지고기", "pork", "재료"),
    "noodles": ItemDef("면", "ramen", "재료"),
    "ramen_item": ItemDef("라멘", "ramen", "요리"),
    "tonkotsu_broth": ItemDef("돈코츠 육수", "soup", "재료"),
    "tonkotsu_ramen_item": ItemDef("돈코츠 라멘", "ramen", "요리"),
    "curry_powder": ItemDef("카레가루", "curry", "재료"),
    "pasta_noodles": ItemDef("파스타 면", "pasta", "재료"),
    "mala_sauce": ItemDef("마라소스", "mala", "재료"),
    "honey": ItemDef("꿀", "honey", "재료"),
    "nuts": ItemDef("견과류", "nuts", "재료"),
    "chocolate_chips": ItemDef("초코칩", "chocolate", "재료"),
    "strawberry": ItemDef("딸기", "strawberry", "재료"),
    "fried_egg_item": ItemDef("계란후라이", "egg", "요리"),
    "egg_fried_rice_item": ItemDef("계란볶음밥", "rice", "요리"),
    "garlic_fried_rice_item": ItemDef("마늘볶음밥", "rice", "요리"),
    "kimchi_fried_rice_item": ItemDef("김치볶음밥", "rice", "요리"),
    "toast_item": ItemDef("토스트", "bread", "요리"),
    "cheese_toast_item": ItemDef("치즈 토스트", "bread", "요리"),
    "omelet_item": ItemDef("오믈렛", "egg", "요리"),
    "mushroom_omelet_item": ItemDef("버섯 오믈렛", "egg", "요리"),
    "pancake_item": ItemDef("팬케이크", "pancake", "요리"),
    "onigiri_item": ItemDef("주먹밥", "onigiri", "요리"),
    "cabbage_salad_item": ItemDef("양배추 샐러드", "salad", "요리"),
    "chicken_salad_item": ItemDef("치킨 샐러드", "salad", "요리"),
    "cookie_item": ItemDef("쿠키", "cookie", "요리"),
    "chicken_sandwich_item": ItemDef("치킨 샌드위치", "sandwich", "요리"),
    "curry_rice_item": ItemDef("카레라이스", "curry", "요리"),
    "tomato_pasta_item": ItemDef("토마토 파스타", "pasta", "요리"),
    "mini_pizza_item": ItemDef("미니 피자", "pizza", "요리"),
    "mini_burger_item": ItemDef("미니 햄버거", "burger", "요리"),
    "soup_item": ItemDef("수프", "soup", "요리"),
    "mushroom_soup_item": ItemDef("버섯 수프", "soup", "요리"),
    "baklava_item": ItemDef("바클라바", "cookie", "요리"),
    "chicken_steak_item": ItemDef("치킨 스테이크", "chicken", "요리"),
    "grilled_fish_item": ItemDef("생선구이", "fish", "요리"),
    "shrimp_fried_rice_item": ItemDef("새우볶음밥", "rice", "요리"),
    "kimchi_ramen_item": ItemDef("김치라멘", "ramen", "요리"),
    "shrimp_tomato_pasta_item": ItemDef("새우 토마토 파스타", "pasta", "요리"),
    "bacon_cheeseburger_item": ItemDef("베이컨 치즈버거", "burger", "요리"),
    "cheese_bomb_pizza_item": ItemDef("치즈 폭탄 피자", "pizza", "요리"),
    "cream_pasta_item": ItemDef("크림 파스타", "pasta", "요리"),
    "tonkatsu_curry_item": ItemDef("돈카츠 카레", "curry", "요리"),
    "tonkatsu_item": ItemDef("돈가스", "pork", "요리"),
    "baguette_sandwich_item": ItemDef("바게트 샌드위치", "sandwich", "요리"),
    "honey_butter_baguette_item": ItemDef("허니버터 바게트", "baguette", "요리"),
    "golden_pancake_item": ItemDef("황금 팬케이크", "pancake", "요리"),
    "navi_lunch_box_item": ItemDef("나비 도시락", "recipeBook", "요리"),
    "navi_dad_special_set_item": ItemDef("나비가 아빠에게 3일 밤낮으로 배운 특제세트", "recipeBook", "요리"),
    "navi_birthday_cake_item": ItemDef("나비 생일케이크", "cake", "요리"),
    "omurice_item": ItemDef("오므라이스", "rice", "요리"),
    "maratang_item": ItemDef("마라탕", "mala", "요리"),
    "cheese_oven_spaghetti_item": ItemDef("치즈 오븐 스파게티", "pasta", "요리"),
    "choco_cookie_item": ItemDef("초코 쿠키", "cookie", "요리"),
    "sincerity_cookie_ticket": ItemDef("정성쿠키 제작권", "recipeBook", "특수"),
    "navi_sincerity_cookie": ItemDef("나비의 정성이 가득 들어간 쿠키", "cookie", "특수"),
    "suspicious_black_lump": ItemDef("수상한 검은 덩어리", "fail", "특수"),
}


def item_label(item_id: str, quantity: int | None = None) -> str:
    item = ITEMS.get(item_id)
    if item is None:
        base = "❔ 알 수 없는 재료"
    else:
        base = f"{emoji(item.emoji_key)} {item.display_name}"
    return f"{base} {quantity}개" if quantity is not None else base


def tool_label(tool_id: str) -> str:
    tool = TOOLS.get(tool_id)
    if tool is None:
        return "❔ 알 수 없는 도구"
    return f"{emoji(tool.emoji_key)} {tool.display_name}"


def shop_item_owned(state: dict[str, Any], shop_item: ShopItem) -> bool:
    return shop_item.kind == "tool" and shop_item.item_id in state["tools"]


def t(name: str, difficulty: str, min_ms: int, max_ms: int) -> TimingStage:
    return TimingStage(name, difficulty, min_ms, max_ms)


def r(
    recipe_id: str,
    display_name: str,
    button_name: str,
    emoji_key: str,
    tier: str,
    required_items: dict[str, int],
    required_tools: tuple[str, ...],
    steps: tuple[str, ...],
    wrong_actions: tuple[str, ...],
    timing_stages: tuple[TimingStage, ...],
    produces: dict[str, int],
    base_flour_reward: int,
    base_affection: int,
    unlocks_on_success: tuple[str, ...] = (),
    hint: str = "조금 더 진행하면 알 수 있어요.",
    success_text: str | None = None,
    failure_text: str | None = None,
) -> Recipe:
    return Recipe(
        recipe_id,
        display_name,
        button_name,
        emoji_key,
        tier,
        required_items,
        required_tools,
        steps,
        wrong_actions,
        timing_stages,
        produces,
        base_flour_reward,
        base_affection,
        unlocks_on_success,
        hint,
        success_text,
        failure_text,
    )


RECIPES: dict[str, Recipe] = {
    recipe.recipe_id: recipe
    for recipe in (
        r("fried_egg", "계란후라이", "계란후라이", "egg", "튜토리얼", {"egg": 1}, ("pan",), ("계란 깨기", "굽기", "소금 뿌리기"), ("물 붓기", "팬 던지기", "불 끄기", "설탕 붓기"), (t("굽기 타이밍", "easy", 1800, 3200),), {"fried_egg_item": 1}, 6, 1, ("shop", "rolling_pin_shop", "egg_shop", "rice_shop", "salt_shop", "soy_sauce_shop", "green_onion_shop", "garlic_shop", "seaweed_shop", "bacon_recipe", "egg_fried_rice_recipe", "garlic_fried_rice_recipe", "omelet_recipe", "onigiri_recipe")),
        r("dough", "반죽", "반죽", "dough", "1", {"flour": 5}, ("rolling_pin",), ("밀가루 붓기", "물 넣기", "밀대로 밀기"), ("프라이팬에 넣기", "갑자기 굽기", "소금 왕창 넣기", "도망가기"), (), {"dough": 1}, 2, 1, ("bread_recipe", "baguette_recipe", "pancake_recipe", "cookie_recipe", "oven_shop", "butter_shop", "milk_shop", "sugar_shop")),
        r("bread", "식빵", "식빵", "bread", "1", {"dough": 1, "butter": 1}, ("pan",), ("반죽 놓기", "버터 바르기", "굽기"), ("반죽 접기", "계란 던지기", "냄비에 넣기", "아무것도 안 하기"), (t("굽기 타이밍", "easy", 2000, 3400),), {"bread": 1}, 4, 1, ("salad_recipe", "toast_recipe", "chicken_sandwich_recipe", "salad_greens_shop", "tomato_shop", "cheese_shop", "chicken_shop", "bacon_raw_shop")),
        r("salad", "샐러드", "샐러드", "salad", "1", {"salad_greens": 1, "tomato": 1}, (), ("채소 씻기", "토마토 넣기", "섞기"), ("오븐에 굽기", "팬에 튀기기", "밀대로 밀기", "꿀 붓기"), (), {"salad_item": 1}, 3, 1, ("cabbage_shop", "cabbage_salad_recipe", "chicken_salad_recipe")),
        r("cabbage_salad", "양배추 샐러드", "양배추샐러드", "salad", "1", {"cabbage": 1, "tomato": 1, "salt": 1}, (), ("양배추 썰기", "토마토 넣기", "소금 살짝 뿌리기", "섞기"), ("오븐에 넣기", "라멘스프 넣기", "팬에 볶기", "꿀 붓기"), (), {"cabbage_salad_item": 1}, 4, 1),
        r("bacon", "베이컨", "베이컨", "bacon", "1", {"bacon_raw": 1}, ("pan",), ("팬 달구기", "베이컨 올리기", "바삭하게 굽기"), ("물에 씻기", "냉장고에 넣기", "설탕 뿌리기", "바로 먹기"), (t("바삭하게 굽기", "easy", 1800, 3200),), {"bacon_item": 1}, 4, 1, ("egg_fried_rice_recipe", "bacon_cheeseburger_recipe")),
        r("egg_fried_rice", "계란볶음밥", "볶음밥", "rice", "1", {"rice": 1, "egg": 1, "green_onion": 1, "soy_sauce": 1}, ("pan",), ("밥 넣기", "계란 넣기", "파 넣기", "간장 뿌리기", "볶기"), ("우유 붓기", "반죽하기", "냄비 덮기", "불 끄고 기다리기"), (t("볶기 타이밍", "easy", 2000, 3400),), {"egg_fried_rice_item": 1}, 7, 1, ("kimchi_shop", "kimchi_fried_rice_recipe", "shrimp_fried_rice_recipe", "navi_dad_special_set_condition")),
        r("garlic_fried_rice", "마늘볶음밥", "마늘볶음밥", "rice", "1", {"rice": 1, "egg": 1, "garlic": 1, "soy_sauce": 1}, ("pan",), ("마늘 볶기", "밥 넣기", "계란 넣기", "간장 뿌리기", "볶기"), ("우유 붓기", "반죽하기", "오븐에 넣기", "물 붓기"), (t("볶기 타이밍", "easy", 2000, 3400),), {"garlic_fried_rice_item": 1}, 7, 1),
        r("kimchi_fried_rice", "김치볶음밥", "김치볶음밥", "rice", "2", {"rice": 1, "kimchi": 1, "egg": 1, "green_onion": 1}, ("pan",), ("김치 볶기", "밥 넣기", "계란 넣기", "파 넣기", "마저 볶기"), ("우유 붓기", "설탕 왕창 넣기", "냄비에 숨기기", "불 끄기"), (t("볶기 타이밍", "normal", 2100, 3600),), {"kimchi_fried_rice_item": 1}, 10, 2),
        r("toast", "토스트", "토스트", "bread", "1", {"bread": 1, "butter": 1}, ("pan",), ("식빵 올리기", "버터 바르기", "노릇하게 굽기"), ("물 붓기", "꿀통 던지기", "면 넣기", "팬 덮기"), (t("굽기 타이밍", "easy", 1800, 3200),), {"toast_item": 1}, 5, 1, ("cheese_toast_recipe",)),
        r("cheese_toast", "치즈 토스트", "치즈토스트", "bread", "2", {"bread": 1, "cheese": 1, "butter": 1}, ("pan",), ("식빵 올리기", "버터 바르기", "치즈 올리기", "노릇하게 굽기"), ("물 붓기", "냄비에 삶기", "초코칩 뿌리기", "그냥 접기"), (t("치즈 녹이기", "normal", 2300, 3800),), {"cheese_toast_item": 1}, 9, 2),
        r("omelet", "오믈렛", "오믈렛", "egg", "2", {"egg": 2, "milk": 1, "butter": 1}, ("pan",), ("계란 풀기", "우유 넣기", "버터 녹이기", "부드럽게 접기"), ("바게트로 누르기", "냄비에 끓이기", "간장 들이붓기", "딸기 올리기"), (t("접기 타이밍", "normal", 2200, 3600),), {"omelet_item": 1}, 10, 2, ("mushroom_shop", "mushroom_omelet_recipe")),
        r("mushroom_omelet", "버섯 오믈렛", "버섯오믈렛", "egg", "2", {"egg": 2, "mushroom": 1, "milk": 1, "butter": 1}, ("pan",), ("버섯 볶기", "계란 풀기", "우유 넣기", "부드럽게 접기"), ("김치 덮기", "라멘스프 넣기", "오븐에 던지기", "밥으로 누르기"), (t("접기 타이밍", "normal", 2200, 3700),), {"mushroom_omelet_item": 1}, 12, 2),
        r("pancake", "팬케이크", "팬케이크", "pancake", "1", {"flour": 5, "egg": 1, "milk": 1}, ("pan",), ("밀가루 붓기", "계란 넣기", "우유 붓기", "반죽 섞기", "굽기"), ("라멘스프 넣기", "냄비에 던지기", "오븐 끄기", "소금 왕창 넣기"), (t("뒤집기", "easy", 2000, 3500),), {"pancake_item": 1}, 7, 1, ("golden_pancake_condition", "navi_birthday_cake_condition")),
        r("onigiri", "주먹밥", "주먹밥", "onigiri", "1", {"rice": 1, "seaweed": 1, "salt": 1}, (), ("밥 놓기", "소금 뿌리기", "김으로 감싸기"), ("오븐에 굽기", "밀대로 밀기", "우유 붓기", "꿀 바르기"), (), {"onigiri_item": 1}, 5, 1),
        r("cookie", "쿠키", "쿠키", "cookie", "2", {"dough": 1, "sugar": 1, "butter": 1}, ("oven",), ("반죽 놓기", "설탕 넣기", "버터 섞기", "모양 잡기", "오븐에 굽기"), ("냄비에 삶기", "라멘스프 넣기", "팬으로 누르기", "식빵에 끼우기"), (t("굽기 타이밍", "normal", 2500, 4000),), {"cookie_item": 1}, 8, 1, ("navi_birthday_cake_condition", "chocolate_chips_shop")),
        r("chicken_sandwich", "치킨 샌드위치", "치킨샌드", "sandwich", "2", {"bread": 2, "chicken": 1, "salad_item": 1, "cheese": 1}, ("pan",), ("닭고기 굽기", "식빵 놓기", "샐러드 넣기", "치즈 넣기", "식빵 덮기"), ("빵부터 태우기", "면 넣기", "꿀 뿌리기", "오븐에 던지기"), (t("닭고기 굽기", "normal", 2500, 4000),), {"chicken_sandwich_item": 1}, 10, 2, ("pot_shop", "ramen_recipe", "soup_recipe", "curry_rice_recipe", "tomato_pasta_recipe", "mushroom_soup_recipe", "grilled_fish_recipe", "noodles_shop", "potato_shop", "onion_shop", "curry_powder_shop", "pasta_noodles_shop", "fish_shop", "shrimp_shop")),
        r("chicken_salad", "치킨 샐러드", "치킨샐러드", "salad", "2", {"salad_greens": 1, "chicken": 1, "tomato": 1}, ("pan",), ("닭고기 굽기", "채소 씻기", "토마토 넣기", "닭고기 올리기"), ("면 넣기", "오븐에 태우기", "꿀 붓기", "라멘스프 뿌리기"), (t("닭고기 굽기", "normal", 2300, 3800),), {"chicken_salad_item": 1}, 9, 2),
        r("baguette", "바게트", "바게트", "baguette", "2", {"dough": 2, "salt": 1}, ("rolling_pin", "oven"), ("반죽 길게 밀기", "소금 뿌리기", "칼집 내기", "오븐에 넣기"), ("냄비에 삶기", "계란으로 덮기", "치즈만 먹기", "밀가루 뿌리고 끝내기"), (t("오븐 굽기", "normal", 2500, 4200),), {"baguette_item": 1}, 9, 2, ("thin_dough_recipe", "honey_shop", "nuts_shop", "strawberry_shop", "baklava_recipe", "honey_butter_baguette_recipe")),
        r("honey_butter_baguette", "허니버터 바게트", "허니바게트", "baguette", "3", {"baguette_item": 1, "honey": 1, "butter": 1}, ("oven",), ("바게트 자르기", "버터 바르기", "꿀 바르기", "오븐에 굽기"), ("카레가루 바르기", "냄비에 삶기", "면으로 감기", "소금 왕창 뿌리기"), (t("오븐 굽기", "hard", 2400, 3900),), {"honey_butter_baguette_item": 1}, 14, 3),
        r("ramen", "라멘", "라멘", "ramen", "2", {"noodles": 1, "egg": 1, "green_onion": 1}, ("pot",), ("물 끓이기", "면 넣기", "계란 넣기", "파 올리기"), ("밀대로 치기", "오븐에 굽기", "치즈 3장 넣기", "불 끄고 시작하기"), (t("면 익힘", "normal", 2500, 4000),), {"ramen_item": 1}, 9, 2, ("tonkotsu_broth_shop", "pork_shop", "meat_shop", "kimchi_ramen_recipe", "tonkotsu_ramen_recipe")),
        r("kimchi_ramen", "김치라멘", "김치라멘", "ramen", "3", {"noodles": 1, "kimchi": 1, "egg": 1, "green_onion": 1}, ("pot",), ("물 끓이기", "김치 넣기", "면 넣기", "계란 넣기", "파 올리기"), ("우유 붓기", "빵 넣기", "오븐에 굽기", "설탕 뿌리기"), (t("면 익힘", "normal", 2400, 3900),), {"kimchi_ramen_item": 1}, 13, 3),
        r("curry_rice", "카레라이스", "카레", "curry", "2", {"rice": 1, "potato": 1, "onion": 1, "meat": 1, "curry_powder": 1}, ("pot",), ("감자 넣기", "양파 넣기", "고기 넣기", "카레가루 넣기", "밥 위에 붓기"), ("딸기 올리기", "반죽으로 덮기", "오븐에 넣기", "꿀 뿌리기"), (t("카레 졸이기", "normal", 2500, 4200),), {"curry_rice_item": 1}, 11, 2, ("tonkatsu_curry_recipe", "tonkatsu_recipe")),
        r("tomato_pasta", "토마토 파스타", "파스타", "pasta", "2", {"pasta_noodles": 1, "tomato": 1, "cheese": 1}, ("pot",), ("면 삶기", "토마토 넣기", "치즈 뿌리기", "섞기"), ("밥 넣기", "팬케이크처럼 굽기", "김으로 감싸기", "냉장고에 넣기"), (t("면 삶기", "normal", 2500, 4000),), {"tomato_pasta_item": 1}, 10, 2, ("cream_pasta_recipe", "shrimp_tomato_pasta_recipe")),
        r("shrimp_tomato_pasta", "새우 토마토 파스타", "새우파스타", "pasta", "3", {"pasta_noodles": 1, "shrimp": 1, "tomato": 1, "garlic": 1}, ("pot", "pan"), ("면 삶기", "마늘 볶기", "새우 굽기", "토마토 넣기", "면 섞기"), ("우유에 담그기", "밥 넣기", "김치로 덮기", "오븐 끄기"), (t("새우 굽기", "hard", 2300, 3800),), {"shrimp_tomato_pasta_item": 1}, 16, 3),
        r("mini_pizza", "미니 피자", "피자", "pizza", "2", {"dough": 1, "cheese": 2, "tomato": 1}, ("oven",), ("반죽 펴기", "토마토 바르기", "치즈 올리기", "오븐에 굽기"), ("냄비에 넣기", "파만 올리기", "설탕에 절이기", "반죽 접기"), (t("오븐 굽기", "normal", 2500, 4200),), {"mini_pizza_item": 1}, 11, 2, ("cheese_bomb_pizza_recipe",)),
        r("mini_burger", "미니 햄버거", "햄버거", "burger", "2", {"bread": 2, "meat": 1, "cheese": 1, "salad_item": 1}, ("pan",), ("고기 굽기", "식빵 놓기", "치즈 올리기", "샐러드 넣기", "덮기"), ("면 넣기", "꿀에 담그기", "오븐에 오래 굽기", "밥으로 감싸기"), (t("패티 굽기", "normal", 2500, 4000),), {"mini_burger_item": 1}, 11, 2, ("bacon_cheeseburger_recipe",)),
        r("soup", "수프", "수프", "soup", "2", {"potato": 1, "onion": 1, "milk": 1}, ("pot",), ("감자 넣기", "양파 넣기", "우유 붓기", "끓이기"), ("팬에 굽기", "식빵으로 덮기", "초코칩 넣기", "밀대로 밀기"), (t("끓이기", "easy", 2200, 3600),), {"soup_item": 1}, 8, 1, ("mushroom_shop", "mushroom_soup_recipe")),
        r("mushroom_soup", "버섯 수프", "버섯수프", "soup", "2", {"mushroom": 1, "onion": 1, "milk": 1, "butter": 1}, ("pot",), ("버섯 넣기", "양파 넣기", "우유 붓기", "버터 넣기", "끓이기"), ("김치 넣기", "면 넣기", "프라이팬에 붓기", "초코칩 넣기"), (t("끓이기", "normal", 2500, 4100),), {"mushroom_soup_item": 1}, 11, 2),
        r("tonkotsu_ramen", "돈코츠 라멘", "돈코츠라멘", "ramen", "3", {"noodles": 1, "tonkotsu_broth": 1, "pork": 1, "egg": 1, "green_onion": 1}, ("pot",), ("육수 끓이기", "면 넣기", "돼지고기 올리기", "계란 올리기", "파 뿌리기"), ("치즈 폭탄 넣기", "식빵으로 덮기", "꿀 붓기", "반죽 넣기"), (t("육수 타이밍", "hard", 2600, 4300), t("면 익힘", "hard", 2500, 4200)), {"tonkotsu_ramen_item": 1}, 15, 3, ("navi_dad_special_set_condition",)),
        r("thin_dough", "얇은 반죽", "얇은반죽", "dough", "중간재료", {"dough": 1, "butter": 1}, ("rolling_pin",), ("반죽 놓기", "버터 바르기", "아주 얇게 밀기"), ("오븐에 태우기", "냄비에 삶기", "치즈로 덮기", "팬에 누르기"), (), {"thin_dough": 1}, 3, 0, ("baklava_recipe",)),
        r("baklava", "바클라바", "바클라바", "cookie", "3", {"thin_dough": 2, "nuts": 1, "honey": 1, "butter": 1}, ("oven",), ("얇은 반죽 깔기", "견과류 넣기", "반죽 덮기", "버터 바르기", "오븐에 굽기", "꿀 뿌리기"), ("라멘스프 넣기", "팬으로 누르기", "김으로 감싸기", "토마토 올리기"), (t("오븐 굽기", "hard", 2600, 4300), t("꿀 뿌리기", "hard", 2200, 3800)), {"baklava_item": 1}, 18, 3),
        r("chicken_steak", "치킨 스테이크", "치킨스테이크", "chicken", "3", {"chicken": 2, "salt": 1, "butter": 1}, ("pan",), ("닭고기 손질하기", "소금 뿌리기", "버터 녹이기", "앞면 굽기", "뒤집기"), ("꿀에 담그기", "반죽으로 감싸기", "면 넣기", "오븐에 숨기기"), (t("뒤집기", "hard", 2400, 4000),), {"chicken_steak_item": 1}, 14, 3, ("navi_dad_special_set_condition", "navi_lunch_box_condition")),
        r("grilled_fish", "생선구이", "생선구이", "fish", "2", {"fish": 1, "salt": 1, "garlic": 1}, ("pan",), ("생선 손질하기", "소금 뿌리기", "마늘 올리기", "앞면 굽기", "뒤집기"), ("우유 붓기", "반죽으로 감싸기", "면 넣기", "꿀 바르기"), (t("뒤집기", "normal", 2300, 3800),), {"grilled_fish_item": 1}, 12, 2),
        r("shrimp_fried_rice", "새우볶음밥", "새우볶음밥", "rice", "3", {"rice": 1, "shrimp": 1, "egg": 1, "green_onion": 1, "soy_sauce": 1}, ("pan",), ("새우 굽기", "밥 넣기", "계란 넣기", "파 넣기", "간장 뿌리기", "볶기"), ("우유 붓기", "오븐에 넣기", "반죽하기", "김치로 덮기"), (t("새우 굽기", "hard", 2200, 3600),), {"shrimp_fried_rice_item": 1}, 15, 3),
        r("bacon_cheeseburger", "베이컨 치즈버거", "베이컨버거", "burger", "3", {"bread": 2, "bacon_item": 1, "meat": 1, "cheese": 1, "salad_item": 1}, ("pan",), ("고기 굽기", "베이컨 굽기", "빵 놓기", "치즈 올리기", "샐러드 넣기", "덮기"), ("라멘 끓이기", "꿀 바르기", "바게트로 때리기", "초코칩 넣기"), (t("고기 굽기", "hard", 2500, 4200), t("베이컨 굽기", "hard", 2300, 3900)), {"bacon_cheeseburger_item": 1}, 16, 3),
        r("cheese_bomb_pizza", "치즈 폭탄 피자", "치즈피자", "pizza", "3", {"dough": 2, "cheese": 3, "tomato": 1}, ("oven",), ("반죽 펴기", "토마토 바르기", "치즈 1층 올리기", "치즈 2층 올리기", "오븐에 굽기"), ("냄비에 끓이기", "면으로 덮기", "계란후라이 올리기", "꿀 뿌리기"), (t("오븐 굽기", "hard", 2600, 4300),), {"cheese_bomb_pizza_item": 1}, 17, 3),
        r("cream_pasta", "크림 파스타", "크림파스타", "pasta", "3", {"pasta_noodles": 1, "milk": 1, "cheese": 1, "bacon_item": 1}, ("pot",), ("면 삶기", "우유 붓기", "치즈 넣기", "베이컨 넣기", "섞기"), ("밀대로 누르기", "오븐에 굽기", "꿀 넣기", "밥으로 바꾸기"), (t("면 삶기", "hard", 2500, 4100),), {"cream_pasta_item": 1}, 15, 3, ("cheese_oven_spaghetti_recipe",)),
        r("tonkatsu", "돈가스", "돈가스", "pork", "3", {"pork": 1, "egg": 1, "flour": 3}, ("pan",), ("돼지고기 손질하기", "밀가루 묻히기", "계란 묻히기", "앞면 튀기기", "뒤집기"), ("꿀에 담그기", "밥으로 감싸기", "오븐에 숨기기", "토마토로 덮기"), (t("튀김 타이밍", "hard", 2300, 3800), t("뒤집기", "hard", 2200, 3700)), {"tonkatsu_item": 1}, 17, 3),
        r("tonkatsu_curry", "돈카츠 카레", "돈카츠카레", "curry", "3", {"rice": 1, "pork": 1, "egg": 1, "curry_powder": 1, "potato": 1}, ("pan", "pot"), ("고기 굽기", "카레 끓이기", "밥 담기", "고기 올리기", "카레 붓기"), ("면 넣기", "꿀 붓기", "딸기 올리기", "반죽으로 감싸기"), (t("고기 굽기", "hard", 2500, 4100), t("카레 졸이기", "hard", 2600, 4300)), {"tonkatsu_curry_item": 1}, 18, 3),
        r("baguette_sandwich", "바게트 샌드위치", "바게트샌드", "sandwich", "3", {"baguette_item": 1, "chicken": 1, "salad_item": 1, "tomato": 1, "cheese": 1}, ("pan",), ("닭고기 굽기", "바게트 자르기", "샐러드 넣기", "토마토 넣기", "치즈 넣기", "덮기"), ("냄비에 넣기", "꿀로 붙이기", "면을 끼우기", "오븐에 숨기기"), (t("닭고기 굽기", "hard", 2500, 4100),), {"baguette_sandwich_item": 1}, 16, 3),
        r("golden_pancake", "황금 팬케이크", "황금팬케이크", "pancake", "특수", {"flour": 8, "egg": 2, "milk": 2, "honey": 1}, ("golden_pan",), ("밀가루 붓기", "계란 넣기", "우유 붓기", "꿀 넣기", "반죽 섞기", "굽기"), ("라멘스프 넣기", "치즈 덩어리 넣기", "냄비에 삶기", "오븐에 버리기"), (t("황금 뒤집기", "hard", 2400, 4000),), {"golden_pancake_item": 1}, 20, 4, hint="황금 프라이팬을 가진 사람만 만들 수 있어요."),
        r("navi_dad_special_set", "나비가 아빠에게 3일 밤낮으로 배운 특제세트", "특제세트", "recipeBook", "특수", {"egg_fried_rice_item": 1, "bacon_item": 1, "chicken_steak_item": 1, "tonkotsu_ramen_item": 1}, ("pan", "pot"), ("볶음밥 담기", "베이컨 올리기", "치킨 스테이크 올리기", "라멘 곁들이기", "나비가 수상하게 자신 있어 하기"), ("다 섞기", "케이크로 덮기", "국물에 볶음밥 빠뜨리기", "아빠한테 다시 배우러 가기"), (t("세트 담기", "hard", 2600, 4300), t("마지막 장식", "hard", 2200, 3800)), {"navi_dad_special_set_item": 1}, 25, 5, hint="볶음밥, 베이컨, 치킨 스테이크, 돈코츠 라멘이 필요해요.", success_text="이건 나비가 아빠한테 3일 밤낮으로 배운 특제세트예요.\n레시피가 왜 이렇게 긴지는 묻지 마세요.\n아빠도 중간에 후회했대요.", failure_text="3일 밤낮의 가르침이 지금 팬 위에서 무너졌어요.\n아빠한테는 비밀로 해주세요."),
        r("navi_birthday_cake", "나비 생일케이크", "생일케이크", "cake", "고급", {"flour": 12, "egg": 2, "milk": 2, "butter": 2, "honey": 1, "strawberry": 1}, ("oven",), ("밀가루 체치기", "계란 넣기", "우유 붓기", "버터 섞기", "오븐에 굽기", "딸기 올리기"), ("라멘스프 넣기", "베이컨으로 덮기", "냄비에 삶기", "김으로 감싸기"), (t("오븐 굽기", "hard", 2600, 4300), t("딸기 장식", "hard", 2200, 3800)), {"navi_birthday_cake_item": 1}, 18, 4, ("navi_sincerity_cookie_condition",), hint="오븐, 쿠키 성공, 팬케이크 성공이 필요해요."),
        r("navi_lunch_box", "나비 도시락", "나비도시락", "recipeBook", "고급", {"egg_fried_rice_item": 1, "fried_egg_item": 1, "bacon_item": 1, "cheese_toast_item": 1, "chicken_steak_item": 1}, ("pan",), ("볶음밥 담기", "계란후라이 올리기", "베이컨 올리기", "치즈 토스트 넣기", "치킨 스테이크 담기", "뚜껑 닫기"), ("마라소스 붓기", "케이크로 덮기", "다시 팬에 붓기", "뚜껑부터 먹기"), (t("도시락 담기", "hard", 2500, 4100), t("뚜껑 닫기", "hard", 2100, 3600)), {"navi_lunch_box_item": 1}, 22, 4, hint="볶음밥, 계란후라이, 베이컨, 치즈 토스트, 치킨 스테이크가 필요해요."),
        r("navi_sincerity_cookie", "나비의 정성이 가득 들어간 쿠키", "정성쿠키", "cookie", "특수", {"flour": 30, "egg": 3, "milk": 2, "butter": 3, "honey": 2, "chocolate_chips": 3, "strawberry": 1, "dough": 2, "sincerity_cookie_ticket": 1}, ("oven", "rolling_pin"), ("밀가루 체치기", "버터 녹이기", "계란 넣기", "우유 조금 붓기", "반죽 접기", "초코칩 넣기", "쿠키 모양 잡기", "오븐 예열하기", "굽기", "식히기", "딸기 장식하기", "조심히 포장하기"), ("라멘스프 넣기", "냄비에 던지기", "프라이팬으로 찍어누르기", "꿀 전부 붓기", "소금 왕창 넣기", "베이컨 올리기", "포장지를 먼저 먹기", "오븐 끄기", "반죽 도망보내기", "나비 몰래 먹기"), (t("오븐 예열", "extreme", 2800, 4600), t("굽기", "extreme", 2600, 4400), t("포장하기", "extreme", 2200, 3800)), {"navi_sincerity_cookie": 1}, 30, 10, hint="오븐, 밀대, 쿠키 3회, 생일케이크 1회, 제작권이 필요해요."),
        r("omurice", "오므라이스", "오므라이스", "rice", "2", {"rice": 1, "egg": 2, "tomato": 1}, ("pan",), ("밥 볶기", "계란 풀기", "계란 덮기", "토마토 소스 올리기"), ("냄비에 삶기", "바게트로 누르기", "꿀 뿌리기", "면 넣기"), (t("계란 덮기", "normal", 2400, 4000),), {"omurice_item": 1}, 10, 2),
        r("maratang", "마라탕", "마라탕", "mala", "고급", {"meat": 1, "noodles": 1, "salad_greens": 1, "mala_sauce": 1}, ("pot",), ("물 끓이기", "마라소스 넣기", "고기 넣기", "면 넣기", "채소 넣기"), ("딸기 넣기", "꿀 넣기", "오븐에 넣기", "식빵으로 덮기"), (t("국물 끓이기", "hard", 2600, 4300), t("재료 익히기", "hard", 2500, 4200)), {"maratang_item": 1}, 20, 4, ("mala_sauce_shop",), hint="라멘과 고급 국물 요리를 더 진행해보세요."),
        r("cheese_oven_spaghetti", "치즈 오븐 스파게티", "오븐스파게티", "pasta", "고급", {"pasta_noodles": 1, "tomato": 1, "cheese": 3, "bacon_item": 1}, ("pot", "oven"), ("면 삶기", "토마토 소스 섞기", "베이컨 넣기", "치즈 올리기", "오븐에 굽기"), ("냄비째 먹기", "꿀 뿌리기", "라멘으로 바꾸기", "반죽으로 덮기"), (t("면 삶기", "hard", 2500, 4100), t("오븐 굽기", "hard", 2600, 4300)), {"cheese_oven_spaghetti_item": 1}, 20, 4),
        r("choco_cookie", "초코 쿠키", "초코쿠키", "cookie", "2", {"dough": 1, "sugar": 1, "butter": 1, "chocolate_chips": 1}, ("oven",), ("반죽 놓기", "설탕 넣기", "버터 섞기", "초코칩 넣기", "오븐에 굽기"), ("라멘스프 넣기", "냄비에 삶기", "소금 왕창 넣기", "식빵으로 누르기"), (t("굽기 타이밍", "normal", 2500, 4000),), {"choco_cookie_item": 1}, 10, 2, ("navi_sincerity_cookie_condition",)),
    )
}


DEFAULT_RECIPE_UNLOCKS = ("fried_egg", "dough")

RECIPE_UNLOCK_HINTS = {
    "bread": "반죽을 만들면 알아낼 수 있을거 같은데...",
    "baguette": "반죽을 만들면 알아낼 수 있을거 같은데...",
    "pancake": "반죽을 만들면 알아낼 수 있을거 같은데...",
    "cookie": "반죽을 만들면 알아낼 수 있을거 같은데...",
    "bacon": "계란후라이를 만들면 알아낼 수 있을거 같은데...",
    "egg_fried_rice": "계란후라이를 만들면 알아낼 수 있을거 같은데...",
    "garlic_fried_rice": "계란후라이를 만들고 마늘 냄새를 맡으면 알아낼 수 있을거 같은데...",
    "kimchi_fried_rice": "계란볶음밥을 만들면 김치 쪽도 알아낼 수 있을거 같은데...",
    "shrimp_fried_rice": "계란볶음밥을 만들고 새우를 보면 알아낼 수 있을거 같은데...",
    "omelet": "계란후라이를 만들면 알아낼 수 있을거 같은데...",
    "mushroom_omelet": "오믈렛을 만들고 버섯을 보면 알아낼 수 있을거 같은데...",
    "onigiri": "계란후라이를 만들고 밥이랑 김을 보면 알아낼 수 있을거 같은데...",
    "salad": "식빵을 만들면 알아낼 수 있을거 같은데...",
    "cabbage_salad": "샐러드를 만들면 양배추 쪽도 알아낼 수 있을거 같은데...",
    "chicken_salad": "샐러드를 만들고 닭고기를 올려보면 알아낼 수 있을거 같은데...",
    "toast": "식빵을 만들면 알아낼 수 있을거 같은데...",
    "chicken_sandwich": "식빵을 만들면 알아낼 수 있을거 같은데...",
    "cheese_toast": "토스트를 만들면 알아낼 수 있을거 같은데...",
    "mini_pizza": "토마토랑 치즈를 올릴 빵 생각을 하면 알아낼 수 있을거 같은데...",
    "mini_burger": "샌드위치를 만들다 보면 고기 끼울 생각도 날거 같은데...",
    "ramen": "치킨 샌드위치를 만들면 알아낼 수 있을거 같은데...",
    "kimchi_ramen": "라멘을 만들고 김치를 보면 알아낼 수 있을거 같은데...",
    "soup": "치킨 샌드위치를 만들면 냄비 쪽도 알아낼 수 있을거 같은데...",
    "mushroom_soup": "수프를 만들고 버섯을 보면 알아낼 수 있을거 같은데...",
    "curry_rice": "치킨 샌드위치를 만들면 카레 냄새가 날거 같은데...",
    "tomato_pasta": "치킨 샌드위치를 만들면 면요리도 알아낼 수 있을거 같은데...",
    "shrimp_tomato_pasta": "토마토 파스타를 만들고 새우를 보면 알아낼 수 있을거 같은데...",
    "thin_dough": "바게트를 만들면 알아낼 수 있을거 같은데...",
    "baklava": "바게트를 만들면 달달한 쪽으로 알아낼 수 있을거 같은데...",
    "honey_butter_baguette": "바게트를 만들면 알아낼 수 있을거 같은데...",
    "baguette_sandwich": "바게트를 만들고 샌드위치를 떠올리면 알아낼 수 있을거 같은데...",
    "tonkotsu_ramen": "라멘을 만들면 알아낼 수 있을거 같은데...",
    "tonkatsu": "카레라이스를 만들면 튀김 쪽도 알아낼 수 있을거 같은데...",
    "tonkatsu_curry": "카레라이스를 만들면 알아낼 수 있을거 같은데...",
    "cream_pasta": "토마토 파스타를 만들면 알아낼 수 있을거 같은데...",
    "cheese_oven_spaghetti": "크림 파스타를 만들면 알아낼 수 있을거 같은데...",
    "choco_cookie": "쿠키를 만들고 초코칩을 보면 알아낼 수 있을거 같은데...",
    "chicken_steak": "닭고기를 계속 굽다 보면 알아낼 수 있을거 같은데...",
    "grilled_fish": "치킨 샌드위치를 만들고 생선을 보면 알아낼 수 있을거 같은데...",
    "bacon_cheeseburger": "베이컨을 만들면 알아낼 수 있을거 같은데...",
    "cheese_bomb_pizza": "미니 피자를 만들면 치즈를 더 올리고 싶어질거 같은데...",
    "omurice": "계란볶음밥을 만들면 알아낼 수 있을거 같은데...",
}


def locked_recipe_hint(recipe: Recipe) -> str:
    return RECIPE_UNLOCK_HINTS.get(recipe.recipe_id, recipe.hint or "조금 더 진행하면 알 수 있을거 같은데...")

SHOP_ITEMS: tuple[ShopItem, ...] = (
    ShopItem("rolling_pin", "tool", 20, "rolling_pin_shop", "처음부터 살 수 있어요."),
    ShopItem("flour", "item", 3, "flour_shop", "처음부터 살 수 있어요."),
    ShopItem("egg", "item", 5, "egg_shop", "계란후라이를 만들면 열려요."),
    ShopItem("rice", "item", 6, "rice_shop", "계란후라이를 만들면 열려요."),
    ShopItem("salt", "item", 3, "salt_shop", "계란후라이를 만들면 열려요."),
    ShopItem("soy_sauce", "item", 4, "soy_sauce_shop", "계란후라이를 만들면 열려요."),
    ShopItem("green_onion", "item", 5, "green_onion_shop", "계란후라이를 만들면 열려요."),
    ShopItem("garlic", "item", 5, "garlic_shop", "계란후라이를 만들면 열려요."),
    ShopItem("seaweed", "item", 5, "seaweed_shop", "계란후라이를 만들면 열려요."),
    ShopItem("kimchi", "item", 7, "kimchi_shop", "계란볶음밥을 만들면 열려요."),
    ShopItem("butter", "item", 8, "butter_shop", "반죽을 만들어보면 알 수 있어요."),
    ShopItem("milk", "item", 8, "milk_shop", "반죽을 만들어보면 알 수 있어요."),
    ShopItem("sugar", "item", 5, "sugar_shop", "반죽을 만들어보면 알 수 있어요."),
    ShopItem("oven", "tool", 120, "oven_shop", "오븐 냄새가 나는데요."),
    ShopItem("salad_greens", "item", 10, "salad_greens_shop", "식빵을 만들어보면 알 수 있어요."),
    ShopItem("cabbage", "item", 7, "cabbage_shop", "샐러드를 만들면 열려요."),
    ShopItem("tomato", "item", 8, "tomato_shop", "식빵을 만들어보면 알 수 있어요."),
    ShopItem("cheese", "item", 12, "cheese_shop", "식빵을 만들어보면 알 수 있어요."),
    ShopItem("chicken", "item", 15, "chicken_shop", "식빵을 만들어보면 알 수 있어요."),
    ShopItem("bacon_raw", "item", 12, "bacon_raw_shop", "식빵을 만들어보면 알 수 있어요."),
    ShopItem("pot", "tool", 60, "pot_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("noodles", "item", 10, "noodles_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("potato", "item", 8, "potato_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("onion", "item", 8, "onion_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("mushroom", "item", 10, "mushroom_shop", "오믈렛이나 수프를 더 해보면 열려요."),
    ShopItem("fish", "item", 14, "fish_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("shrimp", "item", 18, "shrimp_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("curry_powder", "item", 12, "curry_powder_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("pasta_noodles", "item", 12, "pasta_noodles_shop", "치킨 샌드위치를 만들면 열려요."),
    ShopItem("tonkotsu_broth", "item", 18, "tonkotsu_broth_shop", "라멘을 만들면 열려요."),
    ShopItem("pork", "item", 16, "pork_shop", "라멘을 만들면 열려요."),
    ShopItem("meat", "item", 16, "meat_shop", "라멘을 만들면 열려요."),
    ShopItem("honey", "item", 15, "honey_shop", "바게트를 만들면 열려요."),
    ShopItem("nuts", "item", 14, "nuts_shop", "바게트를 만들면 열려요."),
    ShopItem("chocolate_chips", "item", 16, "chocolate_chips_shop", "쿠키를 만들면 열려요."),
    ShopItem("strawberry", "item", 18, "strawberry_shop", "바게트를 만들면 열려요."),
    ShopItem("mala_sauce", "item", 18, "mala_sauce_shop", "마라탕이 가까워지면 열려요."),
)


def recipe_required_item_ids() -> set[str]:
    required: set[str] = set()
    for recipe in RECIPES.values():
        required.update(recipe.required_items)
    return required


def non_storable_completed_food_item_ids() -> set[str]:
    required = recipe_required_item_ids()
    produced: set[str] = set()
    for recipe in RECIPES.values():
        produced.update(recipe.produces)
    return {
        item_id
        for item_id in produced
        if item_id not in required and (ITEMS.get(item_id) and ITEMS[item_id].category == "요리")
    }


def storable_produced_items(produced: dict[str, int]) -> dict[str, int]:
    blocked = non_storable_completed_food_item_ids()
    return {item_id: quantity for item_id, quantity in produced.items() if item_id not in blocked}


GRADE_ORDER = {"실패": 0, "미묘": 1, "성공": 2, "대성공": 3}
TIMING_WINDOWS = {
    "easy": (900, 1600),
    "normal": (650, 1200),
    "hard": (450, 850),
    "extreme": (250, 500),
}
RESTAURANT_DAILY_AFFECTION_LOSS_LIMIT = 5
TIER_FLOUR_REWARD_RATES = {
    "튜토리얼": {"미묘": 0.10, "성공": 0.55, "대성공": 0.75},
    "중간재료": {"미묘": 0.00, "성공": 0.40, "대성공": 0.60},
    "1": {"미묘": 0.80, "성공": 2.50, "대성공": 3.20},
    "2": {"미묘": 0.95, "성공": 2.80, "대성공": 3.80},
    "3": {"미묘": 1.10, "성공": 3.30, "대성공": 4.50},
    "고급": {"미묘": 1.20, "성공": 3.80, "대성공": 5.20},
    "특수": {"미묘": 1.20, "성공": 4.00, "대성공": 5.50},
}
TIER_TRAITS = {
    "튜토리얼": "연습용이라 안전하지만 돈벌이는 거의 안 돼요.",
    "중간재료": "다음 요리를 여는 재료라 수익은 거의 없어요.",
    "1": "초반 연습용이에요. 재료 부담은 낮지만 수익도 낮아요.",
    "2": "본격적인 수급 구간이에요. 재료를 쓰는 대신 나비코인이 제법 돌아와요.",
    "3": "고급 재료가 들어가요. 실패 부담이 커지는 대신 성공 보상이 확실해요.",
    "고급": "시간과 재료를 많이 먹지만 나비코인과 호감도 효율이 좋아요.",
    "특수": "조건이 빡빡한 대신 성공하면 수급과 존재감이 커요.",
}
TIER_AFFECTION_REWARDS = {
    "튜토리얼": {"성공": 1, "대성공": 1},
    "중간재료": {"성공": 0, "대성공": 0},
    "1": {"성공": 1, "대성공": 2},
    "2": {"성공": 3, "대성공": 5},
    "3": {"성공": 5, "대성공": 8},
    "고급": {"성공": 8, "대성공": 12},
    "특수": {"성공": 10, "대성공": 15},
}
MASTERY_LOCK_MESSAGE = "끄앙! 이 음식은 만들기 너무 어려운것 같아요 ㅠ"
MASTERY_LEVEL_THRESHOLDS = {
    1: 0,
    2: 35,
    3: 140,
    4: 380,
    5: 850,
}
RECIPE_MASTERY_LEVELS = {
    "fried_egg": 1,
    "dough": 1,
    "bread": 2,
    "salad": 2,
    "bacon": 2,
    "egg_fried_rice": 2,
    "garlic_fried_rice": 2,
    "kimchi_fried_rice": 2,
    "shrimp_fried_rice": 3,
    "toast": 2,
    "cheese_toast": 3,
    "omelet": 2,
    "mushroom_omelet": 3,
    "pancake": 2,
    "onigiri": 2,
    "cabbage_salad": 2,
    "chicken_salad": 3,
    "cookie": 3,
    "choco_cookie": 3,
    "chicken_sandwich": 3,
    "baguette": 3,
    "ramen": 3,
    "kimchi_ramen": 3,
    "curry_rice": 3,
    "tomato_pasta": 3,
    "shrimp_tomato_pasta": 4,
    "mini_pizza": 3,
    "mini_burger": 3,
    "soup": 3,
    "mushroom_soup": 3,
    "omurice": 3,
    "thin_dough": 3,
    "honey_butter_baguette": 4,
    "tonkotsu_ramen": 4,
    "baklava": 4,
    "chicken_steak": 4,
    "grilled_fish": 3,
    "bacon_cheeseburger": 4,
    "cheese_bomb_pizza": 4,
    "cream_pasta": 4,
    "tonkatsu": 4,
    "tonkatsu_curry": 4,
    "baguette_sandwich": 4,
    "golden_pancake": 4,
    "navi_birthday_cake": 4,
    "navi_lunch_box": 5,
    "maratang": 4,
    "cheese_oven_spaghetti": 4,
    "navi_dad_special_set": 5,
    "navi_sincerity_cookie": 5,
}
MASTERY_REWARDS = {
    1: {"미묘": 0, "성공": 2, "대성공": 3},
    2: {"미묘": 0, "성공": 3, "대성공": 5},
    3: {"미묘": 1, "성공": 4, "대성공": 7},
    4: {"미묘": 1, "성공": 6, "대성공": 10},
    5: {"미묘": 2, "성공": 8, "대성공": 12},
}
SUCCESS_DIALOGUE_TEMPLATES = (
    "{user}님의 마음이 느껴지는 맛이네요!",
    "이거 뭐에유? 빠스인가?...이렇게 하는거 맞죠?",
    "나야. {food}",
    "비비비비 비빔 비빔 빔 비빔 ...아 이거 아닌가요? 어떤 요리하는 프로그램에서 본건데..",
    "이 요리는 아주 even하게 익어졌군요.",
)
FAILURE_DIALOGUE_TEMPLATES = (
    "움...안타깝지만 {user}님은 우리와 함께 가실 수 없을것 같습니다.",
    "음...제 생각에는 이 요리는 너무 even하게 익어지지 않았어요",
    "우웩...네? 비싼 재료로 만든거라구요? 그건 재료가 맛있는거잖아!! 요리가 좋아야지!! 요리가!!!",
)
NAPULNAPUL_TRIGGER = FAILURE_DIALOGUE_TEMPLATES[-1]
NAPULNAPUL_REPLACEMENT = "(나풀나풀)"


class RestaurantStore:
    def __init__(self, db: Database) -> None:
        self.db = db
        self.cleanup_unstored_completed_foods()

    def get_state(self, user_id: int) -> dict[str, Any]:
        user_id = int(user_id)
        self._ensure_profile(user_id)
        self._ensure_tycoon_profile(user_id)
        self._ensure_current_property_layout(user_id)
        self._reset_daily_if_needed(user_id)
        self._ensure_starter_items(user_id)
        self.cleanup_unstored_completed_foods(user_id)
        notice = self._maybe_grant_golden_pan(user_id)
        state = self._read_state(user_id)
        rescue_egg = self._maybe_grant_tutorial_rescue_egg(user_id, state)
        if rescue_egg:
            notice = (notice + "\n" if notice else "") + rescue_egg
            state = self._read_state(user_id)
        emergency = self._maybe_grant_emergency_flour(user_id, state)
        if emergency:
            notice = (notice + "\n" if notice else "") + emergency
            state = self._read_state(user_id)
        state["notice"] = notice
        return state

    def _ensure_tycoon_profile(self, user_id: int) -> None:
        now = now_db_time()
        today = today_key()
        with self.db._connect() as conn:
            profile = conn.execute("SELECT flour FROM restaurant_profiles WHERE user_id = ?", (int(user_id),)).fetchone()
            legacy_flour = int(profile["flour"] or 0) if profile is not None else 0
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_economy (
                    user_id, navi_coin_balance, migrated_from_flour, created_at, updated_at
                ) VALUES (?, ?, 1, ?, ?)
                """,
                (int(user_id), legacy_flour, now, now),
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_tycoon_profiles (
                    user_id, current_property_id, reputation, rating,
                    daily_remaining_customers, last_daily_reset, created_at, updated_at
                ) VALUES (?, ?, 0, 5.0, ?, ?, ?, ?)
                """,
                (int(user_id), DEFAULT_PROPERTY_ID, property_def(DEFAULT_PROPERTY_ID).daily_customers, today, now, now),
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_property_ownership (user_id, property_id, purchased_at)
                VALUES (?, ?, ?)
                """,
                (int(user_id), DEFAULT_PROPERTY_ID, now),
            )
            tycoon = conn.execute(
                "SELECT current_property_id, last_daily_reset FROM restaurant_tycoon_profiles WHERE user_id = ?",
                (int(user_id),),
            ).fetchone()
            current_property = property_def(tycoon["current_property_id"] if tycoon else DEFAULT_PROPERTY_ID)
            if tycoon is None or str(tycoon["last_daily_reset"] or "") != today:
                reset_capacity = self.daily_customer_capacity_for_property_conn(conn, int(user_id), current_property.property_id)
                if current_property.maintenance_cost > 0:
                    conn.execute(
                        """
                        UPDATE restaurant_economy
                        SET navi_coin_balance = MAX(0, navi_coin_balance - ?),
                            updated_at = ?
                        WHERE user_id = ?
                        """,
                        (int(current_property.maintenance_cost), now, int(user_id)),
                    )
                conn.execute(
                    """
                    UPDATE restaurant_tycoon_profiles
                    SET today_customers_served = 0,
                        today_revenue = 0,
                        daily_remaining_customers = ?,
                        last_daily_reset = ?,
                        updated_at = ?
                    WHERE user_id = ?
                    """,
                    (reset_capacity, today, now, int(user_id)),
                )

    def property_slot_count(self, property_id: str) -> int:
        grade = property_def(property_id).grade
        return 4 + max(0, {"F": 0, "D": 1, "C": 2, "B": 4, "A": 6, "S": 8}.get(grade, 0))

    def daily_customer_capacity_from_rows(self, property_id: str, rows: list[dict[str, Any]]) -> int:
        prop = property_def(property_id)
        effects = self.furniture_effects_from_rows(rows)
        return max(1, int(prop.daily_customers) + int(effects.get("daily_customers", 0)))

    def daily_customer_capacity_for_property_conn(self, conn: Any, user_id: int, property_id: str) -> int:
        rows = [
            dict(row)
            for row in conn.execute(
                """
                SELECT furniture_id
                FROM restaurant_furniture_placements
                WHERE user_id = ? AND property_id = ?
                """,
                (int(user_id), property_id),
            ).fetchall()
        ]
        return self.daily_customer_capacity_from_rows(property_id, rows)

    def _ensure_current_property_layout(self, user_id: int) -> None:
        with self.db._connect() as conn:
            row = conn.execute(
                "SELECT current_property_id FROM restaurant_tycoon_profiles WHERE user_id = ?",
                (int(user_id),),
            ).fetchone()
            property_id = str(row["current_property_id"] if row else DEFAULT_PROPERTY_ID)
            slots = self.property_slot_count(property_id)
            existing = {
                int(item["slot_index"])
                for item in conn.execute(
                    "SELECT slot_index FROM restaurant_furniture_placements WHERE user_id = ? AND property_id = ?",
                    (int(user_id), property_id),
                ).fetchall()
            }
            for slot in range(slots):
                if slot in existing:
                    continue
                conn.execute(
                    """
                    INSERT OR IGNORE INTO restaurant_furniture_placements (
                        user_id, property_id, slot_index, furniture_id
                    ) VALUES (?, ?, ?, NULL)
                    """,
                    (int(user_id), property_id, slot),
                )

    def _ensure_profile(self, user_id: int) -> None:
        now = now_db_time()
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_profiles (
                    user_id, flour, tutorial_done, last_daily_reset, created_at, updated_at
                )
                VALUES (?, 25, 0, ?, ?, ?)
                """,
                (user_id, today_key(), now, now),
            )

    def _reset_daily_if_needed(self, user_id: int) -> None:
        today = today_key()
        now = now_db_time()
        with self.db._connect() as conn:
            row = conn.execute("SELECT last_daily_reset FROM restaurant_profiles WHERE user_id = ?", (user_id,)).fetchone()
            if row is None or str(row["last_daily_reset"] or "") == today:
                return
            conn.execute(
                """
                UPDATE restaurant_profiles
                SET daily_cook_count = 0,
                    daily_affection_gain = 0,
                    daily_affection_loss = 0,
                    daily_sincerity_cookie_attempts = 0,
                    last_daily_reset = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (today, now, user_id),
            )

    def _ensure_starter_items(self, user_id: int) -> None:
        now = now_db_time()
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_tools (user_id, tool_id, obtained_at, equipped)
                VALUES (?, 'pan', ?, 1)
                """,
                (user_id, now),
            )
            self._add_item_conn(conn, user_id, "egg", 1, only_if_missing=True)
            self._add_item_conn(conn, user_id, "flour", 10, only_if_missing=True)
            for recipe_id in DEFAULT_RECIPE_UNLOCKS:
                self._unlock_conn(conn, user_id, "recipe", recipe_id)
            self._unlock_conn(conn, user_id, "shop", "rolling_pin_shop")
            self._unlock_conn(conn, user_id, "shop", "flour_shop")

    def _maybe_grant_golden_pan(self, user_id: int) -> str:
        try:
            has_sponsor = any(badge.get("badge_key") == "staff_sponsor" for badge in self.db.list_user_badges(user_id))
        except Exception:
            has_sponsor = False
        if not has_sponsor:
            return ""
        state = self._read_state(user_id)
        if "golden_pan" in state["tools"]:
            return ""
        now = now_db_time()
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO restaurant_tools (user_id, tool_id, obtained_at, equipped)
                VALUES (?, 'golden_pan', ?, 1)
                """,
                (user_id, now),
            )
            self._unlock_conn(conn, user_id, "recipe", "golden_pancake")
        return "황금 프라이팬이 자동 지급됐어요.\n너무 번쩍거려서 음식보다 팬이 더 맛있어 보이는데요."

    def _maybe_grant_emergency_flour(self, user_id: int, state: dict[str, Any]) -> str:
        profile = state["profile"]
        if any(can_start_recipe(state, recipe)[0] for recipe in RECIPES.values() if is_recipe_unlocked(state, recipe)):
            return ""
        if int(state["inventory"].get("flour", 0)) >= 5:
            return ""
        today = today_key()
        if str(profile.get("last_emergency_flour_at") or "") == today:
            return ""
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_profiles
                SET last_emergency_flour_at = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (today, now_db_time(), user_id),
            )
            self._add_item_conn(conn, int(user_id), "flour", 5)
        return "밀가루가 거의 바닥났네요.\n이러면 식당이 아니라 공기식당이에요.\n비상 밀가루 5개 드릴게요. 오늘은 이번만이에요."

    def _maybe_grant_tutorial_rescue_egg(self, user_id: int, state: dict[str, Any]) -> str:
        if int(state["inventory"].get("egg", 0)) > 0:
            return ""
        if "egg_shop" in state["unlocks"].get("shop", set()):
            return ""
        if recipe_success(state["stats"], "fried_egg") > 0:
            return ""
        if "fried_egg" not in state["unlocks"].get("recipe", set()) or "pan" not in state["tools"]:
            return ""
        with self.db._connect() as conn:
            failed_tutorial = conn.execute(
                """
                SELECT 1
                FROM restaurant_cook_logs
                WHERE user_id = ?
                  AND recipe_id = 'fried_egg'
                  AND grade NOT IN ('성공', '대성공')
                LIMIT 1
                """,
                (int(user_id),),
            ).fetchone()
            if failed_tutorial is None:
                return ""
            self._add_item_conn(conn, int(user_id), "egg", 1)
        return "어...음...음식을 만드시다가 저그를 만드시겠는걸요"

    def _read_state(self, user_id: int) -> dict[str, Any]:
        with self.db._connect() as conn:
            profile = dict(conn.execute("SELECT * FROM restaurant_profiles WHERE user_id = ?", (user_id,)).fetchone())
            inventory = {
                str(row["item_id"]): int(row["quantity"] or 0)
                for row in conn.execute(
                    "SELECT item_id, quantity FROM restaurant_inventory WHERE user_id = ? AND quantity > 0",
                    (user_id,),
                ).fetchall()
            }
            tools = {
                str(row["tool_id"])
                for row in conn.execute("SELECT tool_id FROM restaurant_tools WHERE user_id = ?", (user_id,)).fetchall()
            }
            unlocks: dict[str, set[str]] = {"recipe": set(), "shop": set()}
            for row in conn.execute("SELECT unlock_type, unlock_id FROM restaurant_unlocks WHERE user_id = ?", (user_id,)).fetchall():
                unlocks.setdefault(str(row["unlock_type"]), set()).add(str(row["unlock_id"]))
            stats = {
                str(row["recipe_id"]): dict(row)
                for row in conn.execute("SELECT * FROM restaurant_recipe_stats WHERE user_id = ?", (user_id,)).fetchall()
            }
            economy = conn.execute("SELECT * FROM restaurant_economy WHERE user_id = ?", (user_id,)).fetchone()
            tycoon_profile = conn.execute("SELECT * FROM restaurant_tycoon_profiles WHERE user_id = ?", (user_id,)).fetchone()
            current_property_id = str(tycoon_profile["current_property_id"] if tycoon_profile else DEFAULT_PROPERTY_ID)
            owned_properties = {
                str(row["property_id"])
                for row in conn.execute("SELECT property_id FROM restaurant_property_ownership WHERE user_id = ?", (user_id,)).fetchall()
            }
            furniture_inventory = {
                str(row["furniture_id"]): int(row["quantity"] or 0)
                for row in conn.execute(
                    "SELECT furniture_id, quantity FROM restaurant_furniture_inventory WHERE user_id = ? AND quantity > 0",
                    (user_id,),
                ).fetchall()
            }
            furniture_placements = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT property_id, slot_index, furniture_id
                    FROM restaurant_furniture_placements
                    WHERE user_id = ?
                    ORDER BY property_id, slot_index
                    """,
                    (user_id,),
                ).fetchall()
            ]
            current_placements = [row for row in furniture_placements if str(row.get("property_id")) == current_property_id]
        return {
            "profile": profile,
            "inventory": inventory,
            "tools": tools,
            "unlocks": unlocks,
            "stats": stats,
            "navi_coin_balance": int(economy["navi_coin_balance"] or 0) if economy else 0,
            "tycoon_profile": dict(tycoon_profile) if tycoon_profile else {},
            "owned_properties": owned_properties,
            "furniture_inventory": furniture_inventory,
            "furniture_placements": furniture_placements,
            "current_furniture_placements": current_placements,
            "furniture_effects": self.furniture_effects_from_rows(current_placements),
        }

    def furniture_effects_from_rows(self, rows: list[dict[str, Any]]) -> dict[str, float]:
        counts: dict[str, int] = {}
        for row in rows:
            furniture_id = row.get("furniture_id")
            if furniture_id:
                counts[str(furniture_id)] = counts.get(str(furniture_id), 0) + 1
        effects: dict[str, float] = {}
        for furniture_id, count in counts.items():
            furniture = furniture_def(furniture_id)
            if furniture is None:
                continue
            stacks = min(count, furniture.max_effect_stacks)
            for key, value in furniture.effects.items():
                effects[key] = effects.get(key, 0.0) + float(value) * stacks
        return effects

    def navi_coin_balance(self, user_id: int) -> int:
        self._ensure_profile(int(user_id))
        self._ensure_tycoon_profile(int(user_id))
        with self.db._connect() as conn:
            row = conn.execute("SELECT navi_coin_balance FROM restaurant_economy WHERE user_id = ?", (int(user_id),)).fetchone()
        return int(row["navi_coin_balance"] or 0) if row else 0

    def add_navi_coin(self, user_id: int, amount: int) -> None:
        if int(amount) == 0:
            return
        self._ensure_profile(int(user_id))
        self._ensure_tycoon_profile(int(user_id))
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_economy
                SET navi_coin_balance = MAX(0, navi_coin_balance + ?), updated_at = ?
                WHERE user_id = ?
                """,
                (int(amount), now_db_time(), int(user_id)),
            )

    def spend_navi_coin(self, user_id: int, amount: int) -> bool:
        self._ensure_profile(int(user_id))
        self._ensure_tycoon_profile(int(user_id))
        with self.db._connect() as conn:
            row = conn.execute("SELECT navi_coin_balance FROM restaurant_economy WHERE user_id = ?", (int(user_id),)).fetchone()
            if row is None or int(row["navi_coin_balance"] or 0) < int(amount):
                return False
            conn.execute(
                """
                UPDATE restaurant_economy
                SET navi_coin_balance = navi_coin_balance - ?, updated_at = ?
                WHERE user_id = ?
                """,
                (int(amount), now_db_time(), int(user_id)),
            )
        return True

    def add_flour(self, user_id: int, amount: int) -> None:
        self.add_item(user_id, "flour", amount)

    def add_legacy_currency_as_navi_coin(self, user_id: int, amount: int) -> None:
        self.add_navi_coin(user_id, amount)

    def claim_daily_visit_navi_coin(self, user_id: int, amount: int = 5) -> bool:
        self._ensure_profile(user_id)
        self._ensure_tycoon_profile(user_id)
        today = today_key()
        with self.db._connect() as conn:
            cursor = conn.execute(
                """
                UPDATE restaurant_profiles
                SET last_daily_visit_reward_at = ?,
                    updated_at = ?
                WHERE user_id = ?
                  AND COALESCE(last_daily_visit_reward_at, '') != ?
                """,
                (today, now_db_time(), int(user_id), today),
            )
            if cursor.rowcount <= 0:
                return False
            conn.execute(
                """
                UPDATE restaurant_economy
                SET navi_coin_balance = navi_coin_balance + ?, updated_at = ?
                WHERE user_id = ?
                """,
                (int(amount), now_db_time(), int(user_id)),
            )
        return True

    def add_item(self, user_id: int, item_id: str, quantity: int) -> None:
        with self.db._connect() as conn:
            self._add_item_conn(conn, int(user_id), item_id, int(quantity))

    def consume_item(self, user_id: int, item_id: str, quantity: int) -> bool:
        user_id = int(user_id)
        quantity = int(quantity)
        with self.db._connect() as conn:
            row = conn.execute(
                "SELECT quantity FROM restaurant_inventory WHERE user_id = ? AND item_id = ?",
                (user_id, item_id),
            ).fetchone()
            if row is None or int(row["quantity"] or 0) < quantity:
                return False
            conn.execute(
                """
                UPDATE restaurant_inventory
                SET quantity = quantity - ?, updated_at = ?
                WHERE user_id = ? AND item_id = ?
                """,
                (quantity, now_db_time(), user_id, item_id),
            )
            return True

    def buy_shop_item(self, user_id: int, shop_item: ShopItem) -> tuple[bool, str]:
        state = self.get_state(user_id)
        if shop_item.unlock_id not in state["unlocks"].get("shop", set()):
            return False, "아직 판매대에 안 올라온 물건이에요."
        with self.db._connect() as conn:
            if shop_item.kind == "tool":
                owned = conn.execute(
                    "SELECT 1 FROM restaurant_tools WHERE user_id = ? AND tool_id = ?",
                    (int(user_id), shop_item.item_id),
                ).fetchone()
                if owned is not None:
                    return False, "이미 보유한 장비예요. 나비식당도 중복구매는 환불이 어렵다구요."
            economy = conn.execute(
                "SELECT navi_coin_balance FROM restaurant_economy WHERE user_id = ?",
                (int(user_id),),
            ).fetchone()
            if economy is None or int(economy["navi_coin_balance"] or 0) < shop_item.price:
                return False, "나비코인이 부족해요. 재료도 돈이 있어야 말을 듣거든요."
            if shop_item.kind == "tool":
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO restaurant_tools (user_id, tool_id, obtained_at, equipped)
                    VALUES (?, ?, ?, 1)
                    """,
                    (int(user_id), shop_item.item_id, now_db_time()),
                )
                if cursor.rowcount == 0:
                    return False, "이미 보유한 장비예요. 나비식당도 중복구매는 환불이 어렵다구요."
            conn.execute(
                "UPDATE restaurant_economy SET navi_coin_balance = navi_coin_balance - ?, updated_at = ? WHERE user_id = ?",
                (shop_item.price, now_db_time(), int(user_id)),
            )
            if shop_item.kind != "tool":
                self._add_item_conn(conn, int(user_id), shop_item.item_id, 1)
        return True, "구매 완료예요. 충동구매가 아니라 전략적 투자라고 해둘게요."

    def spend_regular_requirements(self, user_id: int, recipe: Recipe) -> bool:
        state = self.get_state(user_id)
        ok, _ = can_start_recipe(state, recipe)
        if not ok:
            return False
        with self.db._connect() as conn:
            for item_id, quantity in recipe.required_items.items():
                conn.execute(
                    """
                    UPDATE restaurant_inventory
                    SET quantity = quantity - ?, updated_at = ?
                    WHERE user_id = ? AND item_id = ?
                    """,
                    (quantity, now_db_time(), int(user_id), item_id),
                )
        return True

    def reserve_sincerity_ticket(self, user_id: int) -> bool:
        state = self.get_state(user_id)
        profile = state["profile"]
        if int(profile.get("daily_sincerity_cookie_attempts") or 0) >= 1:
            return False
        if int(state["inventory"].get("sincerity_cookie_ticket", 0)) <= 0:
            return False
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_profiles
                SET daily_sincerity_cookie_attempts = daily_sincerity_cookie_attempts + 1,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (now_db_time(), int(user_id)),
            )
            conn.execute(
                """
                UPDATE restaurant_inventory
                SET quantity = quantity - 1, updated_at = ?
                WHERE user_id = ? AND item_id = 'sincerity_cookie_ticket'
                """,
                (now_db_time(), int(user_id)),
            )
        return True

    def consume_sincerity_materials(self, user_id: int, recipe: Recipe, *, partial: bool) -> None:
        for item_id, quantity in recipe.required_items.items():
            if item_id == "sincerity_cookie_ticket":
                continue
            amount = max(1, math.ceil(quantity / 2)) if partial else quantity
            self.consume_item(user_id, item_id, amount)

    def create_session(self, session: CookSession) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO restaurant_cook_sessions (
                    session_id, user_id, recipe_id, current_step_index, mistakes,
                    quality_bonus, state, timing_ready_at, expires_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.session_id,
                    session.user_id,
                    session.recipe_id,
                    session.current_step_index,
                    session.mistakes,
                    session.quality_bonus,
                    session.state,
                    session.timing_ready_at,
                    to_db_time(now_kst() + timedelta(seconds=SESSION_SECONDS)),
                    now_db_time(),
                    now_db_time(),
                ),
            )

    def update_session(self, session: CookSession) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_cook_sessions
                SET current_step_index = ?, mistakes = ?, quality_bonus = ?,
                    state = ?, timing_ready_at = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (
                    session.current_step_index,
                    session.mistakes,
                    session.quality_bonus,
                    session.state,
                    session.timing_ready_at,
                    now_db_time(),
                    session.session_id,
                ),
            )

    def finish_session(
        self,
        *,
        user_id: int,
        recipe: Recipe,
        grade: str,
        mistakes: int,
        quality_bonus: int,
        affection_delta: int,
        flour_reward: int,
        mastery_gain: int,
        produced: dict[str, int],
        unlock_success: bool,
    ) -> None:
        now = now_db_time()
        produced = storable_produced_items(produced)
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_profiles
                SET mastery_points = mastery_points + ?,
                    tutorial_done = CASE WHEN ? = 'fried_egg' THEN 1 ELSE tutorial_done END,
                    daily_cook_count = daily_cook_count + 1,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (int(mastery_gain), recipe.recipe_id, now, int(user_id)),
            )
            conn.execute(
                """
                UPDATE restaurant_economy
                SET navi_coin_balance = navi_coin_balance + ?, updated_at = ?
                WHERE user_id = ?
                """,
                (int(flour_reward), now, int(user_id)),
            )
            for item_id, quantity in produced.items():
                self._add_item_conn(conn, int(user_id), item_id, int(quantity))
            if unlock_success:
                for token in recipe.unlocks_on_success:
                    self._apply_unlock_token_conn(conn, int(user_id), token)
                self._record_recipe_success_conn(conn, int(user_id), recipe.recipe_id, grade)
            if recipe.recipe_id == "fried_egg":
                row = conn.execute("SELECT tutorial_done FROM restaurant_profiles WHERE user_id = ?", (int(user_id),)).fetchone()
                if row is not None:
                    self._unlock_conn(conn, int(user_id), "recipe", "dough")
            conn.execute(
                """
                INSERT INTO restaurant_cook_logs (
                    user_id, recipe_id, grade, mistakes, quality_bonus,
                    affection_delta, flour_reward, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (int(user_id), recipe.recipe_id, grade, mistakes, quality_bonus, affection_delta, flour_reward, now),
            )

    def cleanup_unstored_completed_foods(self, user_id: int | None = None) -> None:
        blocked = sorted(non_storable_completed_food_item_ids())
        if not blocked:
            return
        placeholders = ",".join("?" for _ in blocked)
        params: list[Any] = list(blocked)
        where = f"item_id IN ({placeholders})"
        if user_id is not None:
            where += " AND user_id = ?"
            params.append(int(user_id))
        try:
            with self.db._connect() as conn:
                conn.execute(f"DELETE FROM restaurant_inventory WHERE {where}", params)
        except Exception:
            return

    def add_failure_lump_chance(self, user_id: int) -> bool:
        if random.randint(1, 100) > 20:
            return False
        state = self.get_state(user_id)
        if state["inventory"].get("suspicious_black_lump", 0) > 0:
            return False
        self.add_item(user_id, "suspicious_black_lump", 1)
        return True

    def apply_restaurant_affection(
        self,
        *,
        user_id: int,
        delta: int,
        reason: str,
        guild_id: int | None,
        channel_id: int | None,
        message_id: int | None,
        special: bool = False,
    ) -> int:
        delta = int(delta)
        if delta == 0:
            return 0
        applied = delta
        state = self.get_state(user_id)
        profile = state["profile"]
        if delta > 0:
            remaining = max(
                0,
                RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT - int(profile.get("daily_affection_gain") or 0),
            )
            applied = min(delta, remaining)
        else:
            remaining = max(
                0,
                RESTAURANT_DAILY_AFFECTION_LOSS_LIMIT - int(profile.get("daily_affection_loss") or 0),
            )
            applied = -min(abs(delta), remaining)
        if applied == 0:
            return 0
        with self.db._connect() as conn:
            if applied > 0:
                conn.execute(
                    """
                    UPDATE restaurant_profiles
                    SET daily_affection_gain = daily_affection_gain + ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (applied, now_db_time(), int(user_id)),
                )
            else:
                conn.execute(
                    """
                    UPDATE restaurant_profiles
                    SET daily_affection_loss = daily_affection_loss + ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (abs(applied), now_db_time(), int(user_id)),
                )
        self.db.record_affection_interaction(
            user_id=int(user_id),
            date_key=today_key(),
            delta=applied,
            reason=reason,
            guild_id=guild_id,
            channel_id=channel_id,
            message_id=message_id,
            gain_limit=999 if special else 999,
            count_daily=False,
        )
        return applied

    def sincerity_affection_delta(self, user_id: int, requested: int) -> tuple[int, bool]:
        state = self.get_state(user_id)
        raw = state["profile"].get("last_sincerity_cookie_reward_at")
        on_cooldown = False
        if raw:
            try:
                on_cooldown = now_kst() - parse_db_time(str(raw)) < timedelta(days=7)
            except ValueError:
                on_cooldown = False
        applied = min(int(requested), 3) if on_cooldown and requested > 0 else int(requested)
        return applied, on_cooldown

    def mark_sincerity_reward_used(self, user_id: int) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE restaurant_profiles
                SET last_sincerity_cookie_reward_at = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (now_db_time(), now_db_time(), int(user_id)),
            )

    def use_sincerity_cookie(
        self,
        *,
        user_id: int,
        guild_id: int | None,
        channel_id: int | None,
        message_id: int | None,
    ) -> tuple[bool, str]:
        if not self.consume_item(user_id, "navi_sincerity_cookie", 1):
            return False, "쓸 정성쿠키가 없어요."
        delta, cooldown = self.sincerity_affection_delta(user_id, 10)
        applied = self.apply_restaurant_affection(
            user_id=user_id,
            delta=delta,
            reason="restaurant_sincerity_cookie_use",
            guild_id=guild_id,
            channel_id=channel_id,
            message_id=message_id,
            special=True,
        )
        if not cooldown and applied >= 10:
            self.mark_sincerity_reward_used(user_id)
        if cooldown:
            return True, f"정성쿠키는 너무 강해서 자주 먹으면 안 돼요.\n이번에는 호감도 {affection_score_text(applied)}만 적용할게요."
        return True, f"정성쿠키를 먹었어요.\n호감도 {affection_score_text(applied)} 적용 완료예요."

    def owner_grant(self, *, owner_id: int, target_id: int, item_id: str, quantity: int, target_type: str = "user") -> None:
        self._ensure_profile(int(target_id))
        self._ensure_tycoon_profile(int(target_id))
        now = now_db_time()
        with self.db._connect() as conn:
            if item_id == "NAVI_COIN":
                conn.execute(
                    "UPDATE restaurant_economy SET navi_coin_balance = navi_coin_balance + ?, updated_at = ? WHERE user_id = ?",
                    (int(quantity), now, int(target_id)),
                )
            else:
                self._add_item_conn(conn, int(target_id), item_id, int(quantity))
            conn.execute(
                """
                INSERT INTO restaurant_owner_grants (
                    owner_id, target_type, target_id, item_id, quantity, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (int(owner_id), target_type, int(target_id), item_id, int(quantity), now),
            )

    def buy_property(self, user_id: int, property_id: str) -> tuple[bool, str]:
        self._ensure_profile(user_id)
        self._ensure_tycoon_profile(user_id)
        prop = property_def(property_id)
        now = now_db_time()
        with self.db._connect() as conn:
            profile = conn.execute("SELECT current_property_id FROM restaurant_tycoon_profiles WHERE user_id = ?", (int(user_id),)).fetchone()
            if profile and str(profile["current_property_id"]) == prop.property_id:
                return False, "이미 여기서 장사 중이에요."
            owned = conn.execute(
                "SELECT 1 FROM restaurant_property_ownership WHERE user_id = ? AND property_id = ?",
                (int(user_id), prop.property_id),
            ).fetchone()
            if owned is None:
                economy = conn.execute("SELECT navi_coin_balance FROM restaurant_economy WHERE user_id = ?", (int(user_id),)).fetchone()
                if economy is None or int(economy["navi_coin_balance"] or 0) < prop.price:
                    return False, navi_dialogue("property_fail")
                conn.execute(
                    "UPDATE restaurant_economy SET navi_coin_balance = navi_coin_balance - ?, updated_at = ? WHERE user_id = ?",
                    (prop.price, now, int(user_id)),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO restaurant_property_ownership (user_id, property_id, purchased_at) VALUES (?, ?, ?)",
                    (int(user_id), prop.property_id, now),
                )
            conn.execute(
                """
                UPDATE restaurant_tycoon_profiles
                SET current_property_id = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (prop.property_id, now, int(user_id)),
            )
        self._ensure_current_property_layout(int(user_id))
        return True, f"{prop.display_name}(으)로 이전했어요.\n오늘 영업 한도는 그대로 유지되고, 새 점포 효과는 다음 영업일부터 적용돼요.\n{navi_dialogue('property_bought')}"

    def buy_furniture(self, user_id: int, furniture_id: str) -> tuple[bool, str]:
        self._ensure_profile(user_id)
        self._ensure_tycoon_profile(user_id)
        furniture = furniture_def(furniture_id)
        if furniture is None:
            return False, "알 수 없는 가구예요."
        state = self._read_state(int(user_id))
        current_property = property_def((state.get("tycoon_profile") or {}).get("current_property_id"))
        if not property_grade_at_least(current_property.grade, furniture.min_property_grade):
            return False, f"{furniture.display_name}은(는) {furniture.min_property_grade}등급 점포부터 살 수 있어요."
        now = now_db_time()
        with self.db._connect() as conn:
            economy = conn.execute("SELECT navi_coin_balance FROM restaurant_economy WHERE user_id = ?", (int(user_id),)).fetchone()
            if economy is None or int(economy["navi_coin_balance"] or 0) < furniture.cost:
                return False, navi_dialogue("furniture_buy_fail")
            conn.execute(
                "UPDATE restaurant_economy SET navi_coin_balance = navi_coin_balance - ?, updated_at = ? WHERE user_id = ?",
                (furniture.cost, now, int(user_id)),
            )
            conn.execute(
                """
                INSERT INTO restaurant_furniture_inventory (user_id, furniture_id, quantity)
                VALUES (?, ?, 1)
                ON CONFLICT(user_id, furniture_id) DO UPDATE SET quantity = quantity + 1
                """,
                (int(user_id), furniture.furniture_id),
            )
        return True, f"{furniture.emoji} {furniture.display_name} 구매 완료!\n{navi_dialogue('furniture_buy_success')}"

    def place_furniture(self, user_id: int, slot_index: int, furniture_id: str, *, replace: bool = False) -> tuple[bool, str]:
        self._ensure_profile(user_id)
        self._ensure_tycoon_profile(user_id)
        self._ensure_current_property_layout(user_id)
        furniture = furniture_def(furniture_id)
        if furniture is None:
            return False, "알 수 없는 가구예요."
        state = self._read_state(int(user_id))
        property_id = str((state.get("tycoon_profile") or {}).get("current_property_id") or DEFAULT_PROPERTY_ID)
        slot_count = self.property_slot_count(property_id)
        if int(slot_index) < 0 or int(slot_index) >= slot_count:
            return False, "없는 배치 칸이에요."
        now = now_db_time()
        with self.db._connect() as conn:
            slot = conn.execute(
                """
                SELECT furniture_id FROM restaurant_furniture_placements
                WHERE user_id = ? AND property_id = ? AND slot_index = ?
                """,
                (int(user_id), property_id, int(slot_index)),
            ).fetchone()
            current_furniture_id = str(slot["furniture_id"]) if slot and slot["furniture_id"] else None
            if current_furniture_id and not replace:
                return False, "이미 가구가 있는 칸이에요. 교체 확인이 필요해요."
            inventory = conn.execute(
                "SELECT quantity FROM restaurant_furniture_inventory WHERE user_id = ? AND furniture_id = ?",
                (int(user_id), furniture.furniture_id),
            ).fetchone()
            if inventory is None or int(inventory["quantity"] or 0) <= 0:
                return False, "보유하지 않은 가구예요."
            conn.execute(
                "UPDATE restaurant_furniture_inventory SET quantity = quantity - 1 WHERE user_id = ? AND furniture_id = ?",
                (int(user_id), furniture.furniture_id),
            )
            if current_furniture_id:
                conn.execute(
                    """
                    INSERT INTO restaurant_furniture_inventory (user_id, furniture_id, quantity)
                    VALUES (?, ?, 1)
                    ON CONFLICT(user_id, furniture_id) DO UPDATE SET quantity = quantity + 1
                    """,
                    (int(user_id), current_furniture_id),
                )
            conn.execute(
                """
                INSERT INTO restaurant_furniture_placements (user_id, property_id, slot_index, furniture_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, property_id, slot_index) DO UPDATE SET furniture_id = excluded.furniture_id
                """,
                (int(user_id), property_id, int(slot_index), furniture.furniture_id),
            )
        return True, f"{slot_index + 1}번 칸에 {furniture.emoji} {furniture.display_name} 배치 완료!\n{navi_dialogue('furniture_place_success')}"

    def apply_customer_result(
        self,
        user_id: int,
        property_id: str,
        order: ActiveCustomerOrder,
        recipe_id: str | None,
        result: SatisfactionResult,
    ) -> dict[str, Any]:
        now = now_db_time()
        with self.db._connect() as conn:
            profile = conn.execute("SELECT rating FROM restaurant_tycoon_profiles WHERE user_id = ?", (int(user_id),)).fetchone()
            rating = max(0.0, min(5.0, float(profile["rating"] if profile else 5.0) + float(result.rating_delta)))
            conn.execute(
                """
                UPDATE restaurant_tycoon_profiles
                SET reputation = MAX(0, reputation + ?),
                    rating = ?,
                    total_revenue = total_revenue + ?,
                    today_revenue = today_revenue + ?,
                    today_customers_served = today_customers_served + 1,
                    daily_remaining_customers = MAX(0, daily_remaining_customers - 1),
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    int(result.reputation_delta),
                    rating,
                    int(result.navi_coin_reward),
                    int(result.navi_coin_reward),
                    now,
                    int(user_id),
                ),
            )
            conn.execute(
                "UPDATE restaurant_economy SET navi_coin_balance = navi_coin_balance + ?, updated_at = ? WHERE user_id = ?",
                (int(result.navi_coin_reward), now, int(user_id)),
            )
            conn.execute(
                """
                INSERT INTO restaurant_customer_logs (
                    user_id, property_id, customer_id, order_id, selected_recipe_id, satisfaction,
                    navi_coin_reward, reputation_delta, rating_delta, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(user_id),
                    property_id,
                    order.customer.customer_id,
                    order.order.order_id,
                    recipe_id,
                    result.satisfaction,
                    int(result.navi_coin_reward),
                    int(result.reputation_delta),
                    float(result.rating_delta),
                    now,
                ),
            )
        return self.get_state(int(user_id))

    def _add_item_conn(self, conn: Any, user_id: int, item_id: str, quantity: int, *, only_if_missing: bool = False) -> None:
        if quantity <= 0:
            return
        if only_if_missing:
            existing = conn.execute(
                "SELECT quantity FROM restaurant_inventory WHERE user_id = ? AND item_id = ?",
                (int(user_id), item_id),
            ).fetchone()
            if existing is not None:
                return
        now = now_db_time()
        conn.execute(
            """
            INSERT INTO restaurant_inventory (user_id, item_id, quantity, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, item_id) DO UPDATE SET
                quantity = restaurant_inventory.quantity + excluded.quantity,
                updated_at = excluded.updated_at
            """,
            (int(user_id), item_id, int(quantity), now),
        )

    def _unlock_conn(self, conn: Any, user_id: int, unlock_type: str, unlock_id: str) -> None:
        conn.execute(
            """
            INSERT OR IGNORE INTO restaurant_unlocks (user_id, unlock_type, unlock_id, unlocked_at)
            VALUES (?, ?, ?, ?)
            """,
            (int(user_id), unlock_type, unlock_id, now_db_time()),
        )

    def _apply_unlock_token_conn(self, conn: Any, user_id: int, token: str) -> None:
        token = str(token)
        if token == "없음":
            return
        if token.endswith("_recipe"):
            recipe_id = token.removesuffix("_recipe")
            if recipe_id in RECIPES:
                self._unlock_conn(conn, user_id, "recipe", recipe_id)
            return
        if token.endswith("_shop"):
            self._unlock_conn(conn, user_id, "shop", token)
            return
        if token.endswith("_condition"):
            condition_recipe = token.removesuffix("_condition")
            if condition_recipe in RECIPES:
                self._unlock_conn(conn, user_id, "recipe", condition_recipe)
            return
        if token == "shop":
            return
        if token in RECIPES:
            self._unlock_conn(conn, user_id, "recipe", token)

    def _record_recipe_success_conn(self, conn: Any, user_id: int, recipe_id: str, grade: str) -> None:
        now = now_db_time()
        row = conn.execute(
            "SELECT success_count, best_grade, first_success_at FROM restaurant_recipe_stats WHERE user_id = ? AND recipe_id = ?",
            (int(user_id), recipe_id),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO restaurant_recipe_stats (
                    user_id, recipe_id, success_count, best_grade, first_success_at, last_success_at
                )
                VALUES (?, ?, 1, ?, ?, ?)
                """,
                (int(user_id), recipe_id, grade, now, now),
            )
            return
        best = str(row["best_grade"] or grade)
        if GRADE_ORDER.get(grade, 0) > GRADE_ORDER.get(best, 0):
            best = grade
        conn.execute(
            """
            UPDATE restaurant_recipe_stats
            SET success_count = success_count + 1,
                best_grade = ?,
                last_success_at = ?
            WHERE user_id = ? AND recipe_id = ?
            """,
            (best, now, int(user_id), recipe_id),
        )


def recipe_count(state: dict[str, Any]) -> int:
    return sum(1 for recipe in RECIPES.values() if is_recipe_unlocked(state, recipe))


def is_recipe_unlocked(state: dict[str, Any], recipe: Recipe) -> bool:
    recipe_id = recipe.recipe_id
    if recipe_id in state["unlocks"].get("recipe", set()):
        return True
    tools = state["tools"]
    stats = state["stats"]
    inv = state["inventory"]
    if recipe_id == "golden_pancake":
        return "golden_pan" in tools
    if recipe_id == "navi_birthday_cake":
        return "oven" in tools and recipe_success(stats, "cookie") >= 1 and recipe_success(stats, "pancake") >= 1
    if recipe_id == "navi_sincerity_cookie":
        return (
            "oven" in tools
            and "rolling_pin" in tools
            and recipe_success(stats, "cookie") >= 3
            and recipe_success(stats, "navi_birthday_cake") >= 1
            and int(inv.get("sincerity_cookie_ticket", 0)) > 0
        )
    if recipe_id == "navi_dad_special_set":
        required = RECIPES[recipe_id].required_items
        return all(int(inv.get(item_id, 0)) >= quantity for item_id, quantity in required.items()) and {"pan", "pot"}.issubset(tools)
    if recipe_id == "maratang":
        return "mala_sauce_shop" in state["unlocks"].get("shop", set()) or recipe_success(stats, "tonkotsu_ramen") >= 1
    return False


def recipe_success(stats: dict[str, dict[str, Any]], recipe_id: str) -> int:
    return int((stats.get(recipe_id) or {}).get("success_count") or 0)


def mastery_points(state: dict[str, Any]) -> int:
    return max(0, int(state["profile"].get("mastery_points") or 0))


def mastery_level_for(points: int) -> int:
    points = max(0, int(points))
    level = 1
    for candidate, threshold in sorted(MASTERY_LEVEL_THRESHOLDS.items()):
        if points >= threshold:
            level = candidate
    return min(5, level)


def mastery_next_threshold(points: int) -> int | None:
    level = mastery_level_for(points)
    if level >= 5:
        return None
    return MASTERY_LEVEL_THRESHOLDS[level + 1]


def recipe_mastery_level(recipe: Recipe) -> int:
    return RECIPE_MASTERY_LEVELS.get(recipe.recipe_id, 1)


def has_recipe_mastery(state: dict[str, Any], recipe: Recipe) -> bool:
    return mastery_level_for(mastery_points(state)) >= recipe_mastery_level(recipe)


def can_start_recipe(state: dict[str, Any], recipe: Recipe) -> tuple[bool, list[str]]:
    missing: list[str] = []
    if not is_recipe_unlocked(state, recipe):
        missing.append("아직 발견하지 못한 레시피예요.")
    if not has_recipe_mastery(state, recipe):
        missing.append(f"숙련도 Lv.{recipe_mastery_level(recipe)} 필요")
    for tool_id in recipe.required_tools:
        if tool_id not in state["tools"]:
            missing.append(f"{tool_label(tool_id)} 필요")
    for item_id, quantity in recipe.required_items.items():
        owned = int(state["inventory"].get(item_id, 0))
        if owned < quantity:
            missing.append(f"{item_label(item_id)} {quantity - owned}개 부족")
    if recipe.recipe_id == "navi_sincerity_cookie" and int(state["profile"].get("daily_sincerity_cookie_attempts") or 0) >= 1:
        missing.append("정성쿠키는 하루 1번만 도전할 수 있어요.")
    return not missing, missing


def missing_summary(missing: list[str], *, limit: int | None = None) -> str:
    if not missing:
        return "제작 가능"
    items = missing if limit is None else missing[:limit]
    text = ", ".join(items)
    if limit is not None and len(missing) > limit:
        text += f" 외 {len(missing) - limit}개"
    return text


def missing_block(missing: list[str]) -> str:
    if not missing:
        return "바로 만들 수 있어요."
    return "\n".join(f"- {item}" for item in missing)


def recipe_label(recipe: Recipe) -> str:
    return f"{emoji(recipe.emoji_key)} {recipe.display_name}"


def affection_delta_display(delta: int) -> str:
    return affection_score_text(delta)


def restaurant_daily_affection_gain(state: dict[str, Any]) -> int:
    return max(0, int(state["profile"].get("daily_affection_gain") or 0))


def restaurant_daily_affection_progress_line(value: int) -> str:
    value = max(0, min(RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT, int(value)))
    return f"{value}/{RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT}"


def tier_trait(recipe: Recipe) -> str:
    return TIER_TRAITS.get(recipe.tier, "기본 요리예요.")


class RestaurantView(discord.ui.View):
    def __init__(self, cog: RestaurantCommands, user_id: int, *, timeout: float = 180) -> None:
        super().__init__(timeout=timeout)
        self.cog = cog
        self.user_id = int(user_id)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if int(interaction.user.id) == self.user_id:
            return True
        await interaction.response.send_message("이건 다른 사람의 나비식당이에요.", ephemeral=True)
        return False


class LegacyHomeView(RestaurantView):
    @discord.ui.button(label="🧑‍🍳 주방", style=discord.ButtonStyle.primary)
    async def kitchen(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_kitchen(interaction, self.user_id)

    @discord.ui.button(label="🛒 상점", style=discord.ButtonStyle.success)
    async def shop(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_shop(interaction, self.user_id)

    @discord.ui.button(label="🎒 인벤토리", style=discord.ButtonStyle.secondary)
    async def inventory(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_inventory(interaction, self.user_id)


class HomeView(RestaurantView):
    @discord.ui.button(label="영업 시작", style=discord.ButtonStyle.primary, row=0)
    async def business(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.start_business(interaction, self.user_id)

    @discord.ui.button(label="내 식당", style=discord.ButtonStyle.secondary, row=0)
    async def my_restaurant(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_my_restaurant(interaction, self.user_id)

    @discord.ui.button(label="레시피", style=discord.ButtonStyle.secondary, row=0)
    async def recipes(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_kitchen(interaction, self.user_id)

    @discord.ui.button(label="가게 관리", style=discord.ButtonStyle.success, row=1)
    async def manage(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_management(interaction, self.user_id)

    @discord.ui.button(label="부동산", style=discord.ButtonStyle.success, row=1)
    async def property(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_property(interaction, self.user_id)

    @discord.ui.button(label="재료 상점", style=discord.ButtonStyle.success, row=1)
    async def shop(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_shop(interaction, self.user_id)

    @discord.ui.button(label="도움말", style=discord.ButtonStyle.secondary, row=2)
    async def help(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_restaurant_help(interaction, self.user_id)


class MyRestaurantView(RestaurantView):
    @discord.ui.button(label="영업 시작", style=discord.ButtonStyle.primary, row=0)
    async def business(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.start_business(interaction, self.user_id)

    @discord.ui.button(label="가게 관리", style=discord.ButtonStyle.success, row=0)
    async def manage(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_management(interaction, self.user_id)

    @discord.ui.button(label="부동산", style=discord.ButtonStyle.success, row=0)
    async def property(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_property(interaction, self.user_id)

    @discord.ui.button(label="레시피", style=discord.ButtonStyle.secondary, row=1)
    async def recipes(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_kitchen(interaction, self.user_id)

    @discord.ui.button(label="처음", style=discord.ButtonStyle.secondary, row=1)
    async def home(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_home(interaction, self.user_id)


class KitchenView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, page: int) -> None:
        super().__init__(cog, user_id)
        self.page = page
        recipes = list(RECIPES.values())
        page_count = max(1, math.ceil(len(recipes) / 8))
        page = max(0, min(page, page_count - 1))
        for recipe in recipes[page * 8 : page * 8 + 8]:
            state = cog.store.get_state(user_id)
            if is_recipe_unlocked(state, recipe):
                self.add_item(RecipeButton(recipe.recipe_id))
        self.add_item(PageButton("◀", "kitchen", page - 1, disabled=page <= 0))
        self.add_item(PageButton("▶", "kitchen", page + 1, disabled=page >= page_count - 1))
        self.add_item(HomeButton())


class RecipeButton(discord.ui.Button):
    def __init__(self, recipe_id: str) -> None:
        recipe = RECIPES[recipe_id]
        super().__init__(label=button_label(recipe.button_name), style=discord.ButtonStyle.primary)
        self.recipe_id = recipe_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_recipe_detail(interaction, self.view.user_id, self.recipe_id)


class ShopView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, page: int, session_id: str | None = None) -> None:
        super().__init__(cog, user_id)
        self.session_id = session_id
        page_count = max(1, math.ceil(len(SHOP_ITEMS) / 8))
        page = max(0, min(page, page_count - 1))
        state = cog.store.get_state(user_id)
        for item in SHOP_ITEMS[page * 8 : page * 8 + 8]:
            if item.unlock_id in state["unlocks"].get("shop", set()) and not shop_item_owned(state, item):
                self.add_item(BuyButton(item.item_id, session_id))
        if session_id is None:
            self.add_item(PageButton("◀", "shop", page - 1, disabled=page <= 0))
            self.add_item(PageButton("▶", "shop", page + 1, disabled=page >= page_count - 1))
            self.add_item(HomeButton())
        else:
            self.add_item(BusinessShopPageButton("◀", session_id, page - 1, disabled=page <= 0))
            self.add_item(BusinessShopPageButton("▶", session_id, page + 1, disabled=page >= page_count - 1))
            self.add_item(BusinessBackToOrderButton(session_id))


class BuyButton(discord.ui.Button):
    def __init__(self, item_id: str, session_id: str | None = None) -> None:
        shop_item = next(item for item in SHOP_ITEMS if item.item_id == item_id)
        label = TOOLS[item_id].display_name if shop_item.kind == "tool" else ITEMS[item_id].display_name
        super().__init__(label=button_label(f"구매: {label}"), style=discord.ButtonStyle.success)
        self.item_id = item_id
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.buy_item(interaction, self.view.user_id, self.item_id, session_id=self.session_id)


class InventoryView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        state = cog.store.get_state(user_id)
        if state["inventory"].get("navi_sincerity_cookie", 0) > 0:
            self.add_item(UseSincerityCookieButton())
        self.add_item(HomeButton())


class UseSincerityCookieButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="🍪 정성쿠키 사용", style=discord.ButtonStyle.success)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.use_sincerity_cookie(interaction, self.view.user_id)


class RecipeDetailView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, recipe_id: str) -> None:
        super().__init__(cog, user_id)
        self.add_item(StartCookingButton(recipe_id))
        self.add_item(BackKitchenButton())
        self.add_item(HomeButton())


class StartCookingButton(discord.ui.Button):
    def __init__(self, recipe_id: str) -> None:
        super().__init__(label="요리 시작", style=discord.ButtonStyle.danger)
        self.recipe_id = recipe_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.start_cooking(interaction, self.view.user_id, self.recipe_id)


class StepView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str, actions: list[str]) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        for action in actions:
            self.add_item(StepButton(session_id, action))


class StepButton(discord.ui.Button):
    def __init__(self, session_id: str, action: str) -> None:
        super().__init__(label=button_label(action), style=discord.ButtonStyle.secondary)
        self.session_id = session_id
        self.action = action

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.handle_step(interaction, self.view.user_id, self.session_id, self.action)


class TimingWaitView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        self.add_item(TimingEarlyButton(session_id))


class TimingEarlyButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="기다리기", style=discord.ButtonStyle.secondary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.handle_timing_early(interaction, self.view.user_id, self.session_id)


class TimingReadyView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        self.add_item(TimingNowButton(session_id))


class TimingNowButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="지금!", style=discord.ButtonStyle.danger)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.handle_timing_now(interaction, self.view.user_id, self.session_id)


class ResultView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        self.add_item(HomeButton())
        self.add_item(BackKitchenButton())
        self.add_item(InventoryButton())


class PageButton(discord.ui.Button):
    def __init__(self, label: str, target: str, page: int, *, disabled: bool) -> None:
        super().__init__(label=label, style=discord.ButtonStyle.secondary, disabled=disabled)
        self.target = target
        self.page = page

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        if self.target == "shop":
            await self.view.cog.show_shop(interaction, self.view.user_id, self.page)
        else:
            await self.view.cog.show_kitchen(interaction, self.view.user_id, self.page)


class HomeButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="처음", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_home(interaction, self.view.user_id)


class BackKitchenButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="주방", style=discord.ButtonStyle.primary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_kitchen(interaction, self.view.user_id)


class InventoryButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="인벤토리", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_inventory(interaction, self.view.user_id)


class BusinessCustomerView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        self.session_id = session_id
        self.add_item(BusinessChooseRecipeButton(session_id))
        self.add_item(BusinessShopButton(session_id))
        self.add_item(BusinessRepeatOrderButton(session_id))
        self.add_item(BusinessStatusButton(session_id))
        self.add_item(BusinessEndButton(session_id))
        self.add_item(HomeButton())


class BusinessChooseRecipeButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="음식 고르기", style=discord.ButtonStyle.primary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_recipe_picker(interaction, self.view.user_id, self.session_id, 0)


class BusinessShopButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="재료 상점", style=discord.ButtonStyle.success)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_shop(interaction, self.view.user_id, self.session_id, 0)


class BusinessRepeatOrderButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="주문 다시 듣기", style=discord.ButtonStyle.secondary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.repeat_business_order(interaction, self.view.user_id, self.session_id)


class BusinessEndButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="영업 종료", style=discord.ButtonStyle.danger)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_end_confirm(interaction, self.view.user_id, self.session_id)


class BusinessStatusButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="가게 현황", style=discord.ButtonStyle.secondary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_status(interaction, self.view.user_id, self.session_id)


class BusinessStatusView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        self.add_item(BusinessBackToOrderButton(session_id))
        self.add_item(BusinessShopButton(session_id))
        self.add_item(BusinessEndButton(session_id))
        self.add_item(HomeButton())


class BusinessBackToOrderButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="영업 화면", style=discord.ButtonStyle.primary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_current_business_order(interaction, self.view.user_id, self.session_id)


class BusinessEndConfirmView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        self.add_item(BusinessEndConfirmButton(session_id))
        self.add_item(BusinessBackToOrderButton(session_id))


class BusinessEndConfirmButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="영업 종료 확정", style=discord.ButtonStyle.danger)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.finish_business(interaction, self.view.user_id, self.session_id)


class OrderRecipeView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str, page: int) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        recipes = cog.available_order_recipes(user_id)
        page_count = max(1, math.ceil(len(recipes) / ORDER_RECIPE_PAGE_SIZE))
        page = max(0, min(page, page_count - 1))
        sliced = recipes[page * ORDER_RECIPE_PAGE_SIZE : page * ORDER_RECIPE_PAGE_SIZE + ORDER_RECIPE_PAGE_SIZE]
        if sliced:
            self.add_item(OrderRecipeSelect(session_id, page, sliced))
        self.add_item(OrderRecipePageButton("◀", session_id, page - 1, disabled=page <= 0))
        self.add_item(OrderRecipePageButton("▶", session_id, page + 1, disabled=page >= page_count - 1))
        self.add_item(BusinessShopButton(session_id))
        self.add_item(BusinessBackToOrderButton(session_id))
        self.add_item(BusinessRepeatOrderButton(session_id))
        self.add_item(BusinessEndButton(session_id))


class OrderRecipeSelect(discord.ui.Select):
    def __init__(self, session_id: str, page: int, recipes: list[Recipe]) -> None:
        self.session_id = session_id
        self.page = page
        options = [
            discord.SelectOption(
                label=recipe.display_name[:100],
                value=recipe.recipe_id,
                description=f"{recipe.tier}등급 · {tier_trait(recipe)}"[:100],
            )
            for recipe in recipes
        ]
        super().__init__(placeholder="손님에게 낼 음식을 골라주세요.", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.select_business_recipe(interaction, self.view.user_id, self.session_id, str(self.values[0]))


class OrderRecipePageButton(discord.ui.Button):
    def __init__(self, label: str, session_id: str, page: int, *, disabled: bool) -> None:
        super().__init__(label=label, style=discord.ButtonStyle.secondary, disabled=disabled)
        self.session_id = session_id
        self.page = page

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_recipe_picker(interaction, self.view.user_id, self.session_id, self.page)


class BusinessShopPageButton(discord.ui.Button):
    def __init__(self, label: str, session_id: str, page: int, *, disabled: bool) -> None:
        super().__init__(label=label, style=discord.ButtonStyle.secondary, disabled=disabled)
        self.session_id = session_id
        self.page = page

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_business_shop(interaction, self.view.user_id, self.session_id, self.page)


class BusinessResultView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, session_id: str, *, can_continue: bool) -> None:
        super().__init__(cog, user_id, timeout=SESSION_SECONDS)
        if can_continue:
            self.add_item(BusinessNextButton(session_id))
            self.add_item(BusinessShopButton(session_id))
        self.add_item(BusinessStatusButton(session_id))
        self.add_item(BusinessEndButton(session_id))
        self.add_item(HomeButton())


class BusinessNextButton(discord.ui.Button):
    def __init__(self, session_id: str) -> None:
        super().__init__(label="다음 손님", style=discord.ButtonStyle.primary)
        self.session_id = session_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_next_customer(interaction, self.view.user_id, self.session_id)


class PropertyView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        self.add_item(PropertySelect(cog, user_id))
        self.add_item(HomeButton())


class PropertySelect(discord.ui.Select):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        state = cog.store.get_state(user_id)
        current_id = str((state.get("tycoon_profile") or {}).get("current_property_id") or DEFAULT_PROPERTY_ID)
        owned = set(state.get("owned_properties") or set())
        options: list[discord.SelectOption] = []
        for prop in PROPERTIES.values():
            status = "현재 점포" if prop.property_id == current_id else "보유" if prop.property_id in owned else f"{prop.price:,} 코인"
            options.append(
                discord.SelectOption(
                    label=f"{prop.display_name} [{prop.grade}]",
                    value=prop.property_id,
                    description=f"{status} · 하루 손님 {prop.daily_customers}명"[:100],
                )
            )
        super().__init__(placeholder="확인할 점포를 골라주세요.", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_property_detail(interaction, self.view.user_id, str(self.values[0]))


class PropertyDetailView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, property_id: str) -> None:
        super().__init__(cog, user_id)
        state = cog.store.get_state(user_id)
        current_id = str((state.get("tycoon_profile") or {}).get("current_property_id") or DEFAULT_PROPERTY_ID)
        prop = property_def(property_id)
        owned = property_id in set(state.get("owned_properties") or set())
        if property_id != current_id:
            label = "이 점포로 이전" if owned else f"{prop.price:,} 코인으로 구매"
            self.add_item(PropertyActionButton(property_id, label))
        self.add_item(PropertyBackButton())
        self.add_item(HomeButton())


class PropertyActionButton(discord.ui.Button):
    def __init__(self, property_id: str, label: str) -> None:
        super().__init__(label=button_label(label), style=discord.ButtonStyle.success)
        self.property_id = property_id

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.buy_or_move_property(interaction, self.view.user_id, self.property_id)


class PropertyBackButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="부동산 목록", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_property(interaction, self.view.user_id)


class ManagementView(RestaurantView):
    @discord.ui.button(label="가구 상점", style=discord.ButtonStyle.success, row=0)
    async def furniture_shop(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_furniture_shop(interaction, self.user_id)

    @discord.ui.button(label="가구 배치", style=discord.ButtonStyle.primary, row=0)
    async def furniture_place(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_furniture_slots(interaction, self.user_id)

    @discord.ui.button(label="인벤토리", style=discord.ButtonStyle.secondary, row=0)
    async def inventory(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_inventory(interaction, self.user_id)

    @discord.ui.button(label="처음", style=discord.ButtonStyle.secondary, row=1)
    async def home(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.show_home(interaction, self.user_id)


class FurnitureShopView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        self.add_item(FurnitureBuySelect(cog, user_id))
        self.add_item(ManagementBackButton())
        self.add_item(HomeButton())


class FurnitureBuySelect(discord.ui.Select):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        state = cog.store.get_state(user_id)
        prop = property_def((state.get("tycoon_profile") or {}).get("current_property_id"))
        options: list[discord.SelectOption] = []
        for furniture in FURNITURE.values():
            locked = not property_grade_at_least(prop.grade, furniture.min_property_grade)
            prefix = "잠김 · " if locked else ""
            options.append(
                discord.SelectOption(
                    label=f"{furniture.emoji} {furniture.display_name}"[:100],
                    value=furniture.furniture_id,
                    description=f"{prefix}{furniture.cost:,} 코인 · {furniture.description}"[:100],
                )
            )
        super().__init__(placeholder="구매할 가구를 골라주세요.", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.buy_furniture(interaction, self.view.user_id, str(self.values[0]))


class FurnitureSlotsView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        self.add_item(FurnitureSlotSelect(cog, user_id))
        self.add_item(ManagementBackButton())
        self.add_item(HomeButton())


class FurnitureSlotSelect(discord.ui.Select):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        state = cog.store.get_state(user_id)
        placements = sorted(state.get("current_furniture_placements") or [], key=lambda row: int(row.get("slot_index") or 0))
        options: list[discord.SelectOption] = []
        for row in placements:
            slot_index = int(row.get("slot_index") or 0)
            furniture = furniture_def(row.get("furniture_id"))
            label = f"{slot_index + 1}번 칸"
            desc = f"현재: {furniture.emoji} {furniture.display_name}" if furniture else "현재: 비어 있음"
            options.append(discord.SelectOption(label=label, value=str(slot_index), description=desc[:100]))
        if not options:
            options.append(discord.SelectOption(label="배치 칸 없음", value="-1", description="점포 정보를 다시 확인해 주세요."))
        super().__init__(placeholder="가구를 놓을 칸을 골라주세요.", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        slot_index = int(self.values[0])
        if slot_index < 0:
            await interaction.response.send_message("배치할 칸이 없어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        await self.view.cog.show_furniture_slot(interaction, self.view.user_id, slot_index)


class FurnitureSlotView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int, slot_index: int) -> None:
        super().__init__(cog, user_id)
        state = cog.store.get_state(user_id)
        choices = [(fid, qty) for fid, qty in sorted((state.get("furniture_inventory") or {}).items()) if qty > 0]
        if choices:
            self.add_item(FurnitureForSlotSelect(slot_index, choices))
        self.add_item(FurnitureSlotsBackButton())
        self.add_item(HomeButton())


class FurnitureForSlotSelect(discord.ui.Select):
    def __init__(self, slot_index: int, choices: list[tuple[str, int]]) -> None:
        self.slot_index = int(slot_index)
        options = []
        for furniture_id, quantity in choices[:25]:
            furniture = furniture_def(furniture_id)
            if furniture is None:
                continue
            options.append(
                discord.SelectOption(
                    label=f"{furniture.emoji} {furniture.display_name}"[:100],
                    value=furniture_id,
                    description=f"보유 {quantity}개 · {furniture.description}"[:100],
                )
            )
        super().__init__(placeholder="이 칸에 놓을 가구를 골라주세요.", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.place_furniture(interaction, self.view.user_id, self.slot_index, str(self.values[0]))


class FurnitureSlotsBackButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="배치 칸 목록", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_furniture_slots(interaction, self.view.user_id)


class ManagementBackButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="가게 관리", style=discord.ButtonStyle.secondary)

    async def callback(self, interaction: discord.Interaction) -> None:
        assert isinstance(self.view, RestaurantView)
        await self.view.cog.show_management(interaction, self.view.user_id)


class HelpView(RestaurantView):
    def __init__(self, cog: RestaurantCommands, user_id: int) -> None:
        super().__init__(cog, user_id)
        self.add_item(HomeButton())
        self.add_item(BackKitchenButton())
        self.add_item(ManagementBackButton())


class RestaurantCommands(commands.Cog):
    def __init__(self, bot: commands.Bot, db: Database, config: Config) -> None:
        self.bot = bot
        self.db = db
        self.config = config
        self.store = RestaurantStore(db)
        self.sessions: dict[str, CookSession] = {}
        self.business_sessions: dict[str, BusinessSession] = {}
        self.asset_dir = Path(__file__).with_name("assets")

    @app_commands.command(name="나비식당", description="나비식당을 엽니다.")
    @app_commands.guild_only()
    async def restaurant(self, interaction: discord.Interaction) -> None:
        user_id = int(interaction.user.id)
        claimed_visit_reward = self.store.claim_daily_visit_navi_coin(user_id, amount=5)
        state = self.store.get_state(user_id)
        rollback = bool(getattr(self.config, "restaurant_tycoon_rollback_mode", False))
        embed = self.legacy_home_embed(state) if rollback else self.home_embed(state)
        view = LegacyHomeView(self, user_id) if rollback else HomeView(self, user_id)
        file = self.image_file(KITCHEN_IMAGE) if rollback else self.restaurant_preview_file(user_id, state)
        await interaction.response.send_message(
            embed=embed,
            view=view,
            file=file,
            allowed_mentions=no_mentions(),
        )
        if claimed_visit_reward and interaction.channel is not None:
            try:
                await interaction.channel.send(
                    f"{mention_user(user_id)}님! 오늘도 나비식당을 방문하셨군요! 제가 나비코인 5개 준비해놨답니다~",
                    allowed_mentions=allowed_mentions_for(user_id),
                )
            except discord.HTTPException:
                pass

    async def show_home(self, interaction: discord.Interaction, user_id: int) -> None:
        state = self.store.get_state(user_id)
        if getattr(self.config, "restaurant_tycoon_rollback_mode", False):
            await self.edit_screen(interaction, self.legacy_home_embed(state), LegacyHomeView(self, user_id), image=KITCHEN_IMAGE)
            return
        await self.edit_screen(interaction, self.home_embed(state), HomeView(self, user_id), file=self.restaurant_preview_file(user_id, state))

    async def show_my_restaurant(self, interaction: discord.Interaction, user_id: int) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(
            interaction,
            self.my_restaurant_embed(state),
            MyRestaurantView(self, user_id),
            file=self.restaurant_preview_file(user_id, state),
        )

    async def show_kitchen(self, interaction: discord.Interaction, user_id: int, page: int = 0) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.kitchen_embed(state, page), KitchenView(self, user_id, page))

    async def show_shop(self, interaction: discord.Interaction, user_id: int, page: int = 0) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.shop_embed(state, page), ShopView(self, user_id, page))

    async def show_business_shop(
        self,
        interaction: discord.Interaction,
        user_id: int,
        session_id: str,
        page: int = 0,
        *,
        notice: str = "",
    ) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 영업은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        state = self.store.get_state(user_id)
        await self.edit_screen(
            interaction,
            self.shop_embed(state, page, notice=notice),
            ShopView(self, user_id, page, session_id=session_id),
        )

    async def show_inventory(self, interaction: discord.Interaction, user_id: int) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.inventory_embed(state), InventoryView(self, user_id))

    async def show_recipe_detail(self, interaction: discord.Interaction, user_id: int, recipe_id: str) -> None:
        recipe = RECIPES[recipe_id]
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.recipe_detail_embed(state, recipe), RecipeDetailView(self, user_id, recipe_id))

    async def start_business(self, interaction: discord.Interaction, user_id: int) -> None:
        active = self.active_business_for(user_id)
        if active is not None:
            if active.current_order is None:
                await self.show_next_customer(interaction, user_id, active.session_id)
            else:
                await self.show_current_business_order(interaction, user_id, active.session_id)
            return
        state = self.store.get_state(user_id)
        tycoon = state.get("tycoon_profile") or {}
        remaining = int(tycoon.get("daily_remaining_customers") or 0)
        if remaining <= 0:
            await interaction.response.send_message(
                "오늘 받을 수 있는 손님은 다 받았어요. 나비도 일단 설거지부터 해야 해요.",
                ephemeral=True,
                allowed_mentions=no_mentions(),
            )
            return
        property_id = str(tycoon.get("current_property_id") or DEFAULT_PROPERTY_ID)
        session = BusinessSession(str(uuid.uuid4()), int(user_id), property_id, remaining)
        self.business_sessions[session.session_id] = session
        await self.show_next_customer(interaction, user_id, session.session_id)

    async def show_next_customer(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 영업은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.remaining_customers <= 0:
            await self.finish_business(interaction, user_id, session_id)
            return
        state = self.store.get_state(user_id)
        tycoon = state.get("tycoon_profile") or {}
        property_id = str(tycoon.get("current_property_id") or session.property_id or DEFAULT_PROPERTY_ID)
        effects = state.get("furniture_effects") or {}
        customer = choose_customer(
            property_id,
            int(tycoon.get("reputation") or 0),
            float(tycoon.get("rating") or 5.0),
            effects,
        )
        available_recipes = self.available_order_recipes(user_id)
        order = choose_order(customer, property_id, int(tycoon.get("reputation") or 0), available_recipes)
        prop = property_def(property_id)
        patience = max(1, int(customer.patience) + int(prop.patience_modifier) + int(effects.get("patience", 0)))
        active_order = ActiveCustomerOrder(int(user_id), customer, order, patience, session_id)
        session.property_id = property_id
        session.current_order = active_order
        embed = self.customer_order_embed(state, session, active_order)
        await self.edit_screen(
            interaction,
            embed,
            BusinessCustomerView(self, user_id, session_id),
            file=self.restaurant_preview_file(user_id, state, customer_id=customer.image_key, order_id=order.order_id),
        )

    async def show_current_business_order(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 영업은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.current_order is None:
            await self.show_next_customer(interaction, user_id, session_id)
            return
        state = self.store.get_state(user_id)
        await self.edit_screen(
            interaction,
            self.customer_order_embed(state, session, session.current_order),
            BusinessCustomerView(self, user_id, session_id),
            file=self.restaurant_preview_file(
                user_id,
                state,
                customer_id=session.current_order.customer.image_key,
                order_id=session.current_order.order.order_id,
            ),
        )

    async def repeat_business_order(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None or session.current_order is None:
            await interaction.response.send_message("지금 듣고 있는 주문이 없어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        order = session.current_order
        hints = "\n".join(order.order.rules.hint_lines) if order.order.rules.hint_lines else "힌트 없음"
        await interaction.response.send_message(
            f"{order.customer.display_name}: {order.order.dialogue}\n{hints}",
            ephemeral=True,
            allowed_mentions=no_mentions(),
        )

    async def show_business_status(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 영업은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.business_status_embed(state, session), BusinessStatusView(self, user_id, session_id))

    async def show_business_end_confirm(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 영업은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        embed = self.basic_embed(
            "🌙 영업 종료 확인",
            "정말 오늘 영업을 여기서 마칠까요?\n\n나비:\n불판은 식어도 장부는 남아요. 신중하게 누르세요.",
        )
        await self.edit_screen(interaction, embed, BusinessEndConfirmView(self, user_id, session_id))

    async def show_business_recipe_picker(self, interaction: discord.Interaction, user_id: int, session_id: str, page: int = 0) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None or session.current_order is None:
            await interaction.response.send_message("이 주문은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        state = self.store.get_state(user_id)
        await self.edit_screen(
            interaction,
            self.order_recipe_picker_embed(state, session, page),
            OrderRecipeView(self, user_id, session_id, page),
        )

    async def select_business_recipe(self, interaction: discord.Interaction, user_id: int, session_id: str, recipe_id: str) -> None:
        session = self.get_business_session(session_id, user_id)
        if session is None or session.current_order is None:
            await interaction.response.send_message("이 주문은 이미 끝났어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        recipe = RECIPES.get(recipe_id)
        if recipe is None:
            await interaction.response.send_message("없는 레시피예요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        state = self.store.get_state(user_id)
        ok, missing = can_start_recipe(state, recipe)
        if not ok:
            await interaction.response.send_message(f"그 음식은 지금 못 내요.\n{missing_block(missing)}", ephemeral=True, allowed_mentions=no_mentions())
            return
        if recipe.recipe_id == "navi_sincerity_cookie":
            await interaction.response.send_message("정성쿠키는 손님 응대용으로 쓰기엔 너무 사건이에요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        await self.start_cooking(interaction, user_id, recipe_id, business_session_id=session_id)

    async def finish_business(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.business_sessions.pop(session_id, None)
        state = self.store.get_state(user_id)
        if session is None:
            await self.edit_screen(interaction, self.home_embed(state), HomeView(self, user_id), file=self.restaurant_preview_file(user_id, state))
            return
        await self.edit_screen(interaction, self.business_summary_embed(state, session), HomeView(self, user_id), file=self.restaurant_preview_file(user_id, state))

    async def show_management(self, interaction: discord.Interaction, user_id: int) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.management_embed(state), ManagementView(self, user_id))

    async def show_property(self, interaction: discord.Interaction, user_id: int) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.property_embed(state), PropertyView(self, user_id))

    async def show_property_detail(self, interaction: discord.Interaction, user_id: int, property_id: str) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(
            interaction,
            self.property_detail_embed(state, property_id),
            PropertyDetailView(self, user_id, property_id),
            file=self.restaurant_preview_file(user_id, state | {"tycoon_profile": {**(state.get("tycoon_profile") or {}), "current_property_id": property_id}}),
        )

    async def buy_or_move_property(self, interaction: discord.Interaction, user_id: int, property_id: str) -> None:
        ok, message = self.store.buy_property(user_id, property_id)
        state = self.store.get_state(user_id)
        embed = self.property_detail_embed(state, property_id, notice=message)
        await self.edit_screen(interaction, embed, PropertyDetailView(self, user_id, property_id), file=self.restaurant_preview_file(user_id, state))

    async def show_furniture_shop(self, interaction: discord.Interaction, user_id: int, notice: str = "") -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.furniture_shop_embed(state, notice=notice), FurnitureShopView(self, user_id))

    async def buy_furniture(self, interaction: discord.Interaction, user_id: int, furniture_id: str) -> None:
        ok, message = self.store.buy_furniture(user_id, furniture_id)
        if not ok:
            await interaction.response.send_message(message, ephemeral=True, allowed_mentions=no_mentions())
            return
        await self.show_furniture_shop(interaction, user_id, notice=message)

    async def show_furniture_slots(self, interaction: discord.Interaction, user_id: int, notice: str = "") -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.furniture_slots_embed(state, notice=notice), FurnitureSlotsView(self, user_id))

    async def show_furniture_slot(self, interaction: discord.Interaction, user_id: int, slot_index: int) -> None:
        state = self.store.get_state(user_id)
        await self.edit_screen(interaction, self.furniture_slot_embed(state, slot_index), FurnitureSlotView(self, user_id, slot_index))

    async def place_furniture(self, interaction: discord.Interaction, user_id: int, slot_index: int, furniture_id: str) -> None:
        ok, message = self.store.place_furniture(user_id, slot_index, furniture_id, replace=True)
        if not ok:
            await interaction.response.send_message(message, ephemeral=True, allowed_mentions=no_mentions())
            return
        await self.show_furniture_slots(interaction, user_id, notice=message)

    async def show_restaurant_help(self, interaction: discord.Interaction, user_id: int) -> None:
        await self.edit_screen(interaction, self.restaurant_help_embed(), HelpView(self, user_id))

    async def buy_item(
        self,
        interaction: discord.Interaction,
        user_id: int,
        item_id: str,
        *,
        session_id: str | None = None,
    ) -> None:
        shop_item = next(item for item in SHOP_ITEMS if item.item_id == item_id)
        ok, message = self.store.buy_shop_item(user_id, shop_item)
        if not ok:
            await interaction.response.send_message(message, ephemeral=True, allowed_mentions=no_mentions())
            return
        if session_id is not None and self.get_business_session(session_id, user_id) is not None:
            await self.show_business_shop(interaction, user_id, session_id, notice=message)
            return
        await self.show_shop(interaction, user_id)

    async def use_sincerity_cookie(self, interaction: discord.Interaction, user_id: int) -> None:
        ok, message = self.store.use_sincerity_cookie(
            user_id=user_id,
            guild_id=interaction.guild_id,
            channel_id=getattr(interaction.channel, "id", None),
            message_id=getattr(interaction.message, "id", None),
        )
        if not ok:
            await interaction.response.send_message(message, ephemeral=True, allowed_mentions=no_mentions())
            return
        embed = self.basic_embed("🍪 정성쿠키 사용", f"나비:\n{message}")
        await self.edit_screen(interaction, embed, ResultView(self, user_id))

    async def start_cooking(
        self,
        interaction: discord.Interaction,
        user_id: int,
        recipe_id: str,
        *,
        business_session_id: str | None = None,
    ) -> None:
        recipe = RECIPES[recipe_id]
        active = self.active_session_for(user_id)
        if active is not None:
            await interaction.response.send_message("이미 요리 중이에요. 팬은 하나인데 손은 두 개뿐이거든요.", ephemeral=True)
            return
        state = self.store.get_state(user_id)
        if not has_recipe_mastery(state, recipe):
            await interaction.response.send_message(MASTERY_LOCK_MESSAGE, ephemeral=True, allowed_mentions=no_mentions())
            return
        ok, missing = can_start_recipe(state, recipe)
        if not ok:
            await interaction.response.send_message(f"부족한 게 있어요.\n{missing_block(missing)}", ephemeral=True, allowed_mentions=no_mentions())
            return
        if recipe_id == "navi_sincerity_cookie":
            if not self.store.reserve_sincerity_ticket(user_id):
                await interaction.response.send_message("정성쿠키는 제작권이 있어야 하고 하루 1번만 도전할 수 있어요.", ephemeral=True)
                return
        elif not self.store.spend_regular_requirements(user_id, recipe):
            await interaction.response.send_message("재료가 부족해서 시작할 수 없어요.", ephemeral=True)
            return
        session = CookSession(str(uuid.uuid4()), int(user_id), recipe_id, business_session_id=business_session_id)
        self.sessions[session.session_id] = session
        self.store.create_session(session)
        await self.show_step(interaction, session)

    async def handle_step(self, interaction: discord.Interaction, user_id: int, session_id: str, action: str) -> None:
        session = self.get_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 요리 세션은 끝났거나 만료됐어요.", ephemeral=True)
            return
        if session.state != "steps":
            await interaction.response.send_message("지금은 그 순서 버튼을 누를 때가 아니에요.", ephemeral=True)
            return
        recipe = RECIPES[session.recipe_id]
        if session.current_step_index >= len(recipe.steps):
            await interaction.response.send_message("이미 이 단계는 지나갔어요.", ephemeral=True)
            return
        expected = recipe.steps[session.current_step_index]
        if action != expected:
            session.mistakes += 1
        session.timing_nonce += 1
        session.current_step_index += 1
        self.store.update_session(session)
        if session.current_step_index < len(recipe.steps):
            await self.show_step(interaction, session)
            return
        if recipe.timing_stages:
            session.state = "timing_wait"
            session.timing_index = 0
            await self.show_timing_wait(interaction, session)
            return
        await self.finish_with_interaction(interaction, session)

    async def handle_timing_early(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 요리 세션은 끝났거나 만료됐어요.", ephemeral=True)
            return
        if session.state != "timing_wait":
            await interaction.response.send_message("지금은 그 버튼이 아니에요.", ephemeral=True)
            return
        session.mistakes += 1
        session.timing_nonce += 1
        self.store.update_session(session)
        await self.advance_timing_after_result(interaction, session, "아직이에요! 나비 말 좀 들어요!")

    async def handle_timing_now(self, interaction: discord.Interaction, user_id: int, session_id: str) -> None:
        session = self.get_session(session_id, user_id)
        if session is None:
            await interaction.response.send_message("이 요리 세션은 끝났거나 만료됐어요.", ephemeral=True)
            return
        if session.state != "timing_ready" or session.timing_ready_at is None:
            await interaction.response.send_message("아직 신호 안 줬어요.", ephemeral=True)
            return
        recipe = RECIPES[session.recipe_id]
        stage = recipe.timing_stages[session.timing_index]
        diff_ms = abs((time.monotonic() - session.timing_ready_at) * 1000)
        perfect, good = TIMING_WINDOWS.get(stage.difficulty, TIMING_WINDOWS["normal"])
        if diff_ms <= perfect:
            session.quality_bonus += 1
            line = "방금 타이밍 좋았어요.\n조금 멋있어서 짜증나요."
        elif diff_ms <= good:
            line = "괜찮았어요.\n나비가 봐줄 정도는 되네요."
        else:
            session.mistakes += 1
            line = "타이밍이 살짝 갔어요.\n음식도 같이 갔는지는 곧 알게 될 거예요."
        session.timing_nonce += 1
        self.store.update_session(session)
        await self.advance_timing_after_result(interaction, session, line)

    async def advance_timing_after_result(self, interaction: discord.Interaction, session: CookSession, line: str) -> None:
        recipe = RECIPES[session.recipe_id]
        session.timing_index += 1
        session.timing_ready_at = None
        if session.timing_index < len(recipe.timing_stages):
            session.state = "timing_wait"
            self.store.update_session(session)
            await self.show_timing_wait(interaction, session, prefix=line)
            return
        await self.finish_with_interaction(interaction, session, prefix=line)

    async def show_step(self, interaction: discord.Interaction, session: CookSession) -> None:
        recipe = RECIPES[session.recipe_id]
        expected = recipe.steps[session.current_step_index]
        choices = [expected] + random.sample(list(recipe.wrong_actions), k=min(3, len(recipe.wrong_actions)))
        random.shuffle(choices)
        session.state = "steps"
        session.timing_ready_at = None
        session.timing_nonce += 1
        nonce = session.timing_nonce
        self.store.update_session(session)
        description = (
            f"{recipe_label(recipe)} 조리 중...\n\n"
            f"나비:\n{self.step_line(recipe, session.current_step_index)}\n\n"
            f"진행: {session.current_step_index + 1}/{len(recipe.steps)}\n"
            f"남은 시간: {STEP_SECONDS}초\n"
            f"실수: {session.mistakes}회"
        )
        embed = self.basic_embed(f"{emoji(recipe.emoji_key)} {recipe.display_name}", description)
        await self.edit_screen(interaction, embed, StepView(self, session.user_id, session.session_id, choices))
        if interaction.message is not None:
            asyncio.create_task(self.arm_step_timeout(interaction.message, session.session_id, nonce))

    async def arm_step_timeout(self, message: discord.Message, session_id: str, nonce: int) -> None:
        await asyncio.sleep(STEP_SECONDS)
        session = self.sessions.get(session_id)
        if session is None or session.timing_nonce != nonce or session.state != "steps":
            return
        recipe = RECIPES[session.recipe_id]
        session.mistakes += 3
        session.current_step_index = len(recipe.steps)
        session.timing_nonce += 1
        self.store.update_session(session)
        await self.finish_by_message(message, session, prefix="시간 초과예요.\n재료 넣는 순서에서 탈락입니다.")

    async def show_timing_wait(self, interaction: discord.Interaction, session: CookSession, *, prefix: str = "") -> None:
        recipe = RECIPES[session.recipe_id]
        stage = recipe.timing_stages[session.timing_index]
        session.state = "timing_wait"
        session.timing_nonce += 1
        nonce = session.timing_nonce
        self.store.update_session(session)
        lines = []
        if prefix:
            lines.append(f"나비:\n{prefix}\n")
        lines.append(f"{recipe_label(recipe)} 타이밍 단계")
        lines.append("")
        lines.append(f"나비:\n{stage.name} 준비 중이에요.\n나비가 신호하면 바로 눌러요.")
        lines.append("")
        lines.append(f"실수: {session.mistakes}회")
        embed = self.basic_embed("⏳ 기다리는 중...", "\n".join(lines))
        await self.edit_screen(interaction, embed, TimingWaitView(self, session.user_id, session.session_id))
        if interaction.message is not None:
            asyncio.create_task(self.arm_timing(interaction.message, session.session_id, nonce))

    async def arm_timing(self, message: discord.Message, session_id: str, nonce: int) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        recipe = RECIPES[session.recipe_id]
        stage = recipe.timing_stages[session.timing_index]
        await asyncio.sleep(random.randint(stage.delay_min_ms, stage.delay_max_ms) / 1000)
        session = self.sessions.get(session_id)
        if session is None or session.timing_nonce != nonce or session.state != "timing_wait":
            return
        session.state = "timing_ready"
        session.timing_ready_at = time.monotonic()
        self.store.update_session(session)
        embed = self.basic_embed(
            "🔥 지금!",
            f"{recipe_label(recipe)} 타이밍 단계\n\n나비:\n지금이에요!\n아니 진짜 지금!\n\n실수: {session.mistakes}회",
        )
        try:
            await message.edit(embed=embed, view=TimingReadyView(self, session.user_id, session.session_id), attachments=[])
        except discord.HTTPException:
            return
        await asyncio.sleep(4)
        session = self.sessions.get(session_id)
        if session is None or session.timing_nonce != nonce or session.state != "timing_ready":
            return
        session.mistakes += 1
        session.timing_nonce += 1
        session.timing_ready_at = None
        line = "타이밍이 너무 늦었어요.\n음식이 기다리다가 먼저 퇴근했어요."
        recipe = RECIPES[session.recipe_id]
        session.timing_index += 1
        if session.timing_index < len(recipe.timing_stages):
            session.state = "timing_wait"
            self.store.update_session(session)
            await self.show_timing_wait_by_message(message, session, prefix=line)
            return
        await self.finish_by_message(message, session, prefix=line)

    async def show_timing_wait_by_message(self, message: discord.Message, session: CookSession, *, prefix: str = "") -> None:
        recipe = RECIPES[session.recipe_id]
        stage = recipe.timing_stages[session.timing_index]
        session.state = "timing_wait"
        session.timing_nonce += 1
        nonce = session.timing_nonce
        self.store.update_session(session)
        embed = self.basic_embed(
            "⏳ 기다리는 중...",
            f"나비:\n{prefix}\n\n{recipe_label(recipe)} 타이밍 단계\n\n나비:\n{stage.name} 준비 중이에요.\n나비가 신호하면 바로 눌러요.\n\n실수: {session.mistakes}회",
        )
        await message.edit(embed=embed, view=TimingWaitView(self, session.user_id, session.session_id), attachments=[])
        asyncio.create_task(self.arm_timing(message, session.session_id, nonce))

    async def finish_with_interaction(self, interaction: discord.Interaction, session: CookSession, *, prefix: str = "") -> None:
        embed, view, image, file, napulnapul = self.finish_session(session, interaction=interaction, prefix=prefix)
        await self.edit_screen(interaction, embed, view, image=image, file=file)
        if napulnapul and interaction.message is not None:
            asyncio.create_task(self.replace_result_with_napulnapul(interaction.message, embed, view))

    async def finish_by_message(self, message: discord.Message, session: CookSession, *, prefix: str = "") -> None:
        embed, view, image, file, napulnapul = self.finish_session(session, message=message, prefix=prefix)
        attachments = [file] if file is not None else [self.image_file(image)] if image else []
        await message.edit(embed=embed, view=view, attachments=attachments)
        if napulnapul:
            asyncio.create_task(self.replace_result_with_napulnapul(message, embed, view))

    async def replace_result_with_napulnapul(
        self,
        message: discord.Message,
        embed: discord.Embed,
        view: discord.ui.View,
    ) -> None:
        await asyncio.sleep(NAPULNAPUL_DELAY_SECONDS)
        updated = embed.copy()
        if updated.description:
            updated.description = updated.description.replace(NAPULNAPUL_TRIGGER, NAPULNAPUL_REPLACEMENT)
        try:
            await message.edit(embed=updated, view=view)
        except discord.HTTPException:
            return

    def customer_result_after_cooking_grade(self, result: SatisfactionResult, grade: str) -> SatisfactionResult:
        if grade == "대성공":
            return SatisfactionResult(
                result.satisfaction,
                min(100, int(result.score) + 5),
                max(1, round(int(result.navi_coin_reward) * 1.10)),
                result.reputation_delta,
                result.rating_delta,
                result.matched_tags,
                result.missing_required,
                result.banned_hits,
                result.note + "\n조리까지 깔끔해서 손님 반응이 조금 더 좋아졌어요.",
            )
        if grade == "성공":
            return result
        if grade == "미묘":
            score = max(0, min(60, int(result.score) - 20))
            satisfaction = "미묘" if score >= 35 else "불만족"
            return SatisfactionResult(
                satisfaction,
                score,
                max(1, round(int(result.navi_coin_reward) * 0.55)),
                min(int(result.reputation_delta), 0),
                min(float(result.rating_delta), -0.03),
                result.matched_tags,
                result.missing_required,
                result.banned_hits,
                result.note + "\n조리가 아슬아슬해서 손님 반응도 같이 흔들렸어요.",
            )
        return SatisfactionResult(
            "불만족",
            min(20, int(result.score)),
            max(1, round(int(result.navi_coin_reward) * 0.15)),
            min(int(result.reputation_delta), -1),
            min(float(result.rating_delta), -0.10),
            result.matched_tags,
            result.missing_required,
            result.banned_hits,
            "요리가 제대로 완성되지 않아서 손님 표정이 식었어요.",
        )

    def finish_business_order_from_cooking(
        self,
        session: CookSession,
        recipe: Recipe,
        grade: str,
        *,
        cooking_reward: int,
        cooking_affection_delta: int,
        cooking_note: str,
    ) -> tuple[discord.Embed, discord.ui.View, str | None, discord.File | None, bool] | None:
        if session.business_session_id is None:
            return None
        business = self.get_business_session(session.business_session_id, session.user_id)
        if business is None or business.current_order is None:
            return None
        completed_order = business.current_order
        state = self.store.get_state(session.user_id)
        result = evaluate_order(
            recipe=recipe,
            order=completed_order,
            property_id=business.property_id,
            effects=state.get("furniture_effects") or {},
        )
        result = self.customer_result_after_cooking_grade(result, grade)
        updated = self.store.apply_customer_result(session.user_id, business.property_id, completed_order, recipe.recipe_id, result)
        business.served_customers += 1
        business.remaining_customers = max(0, business.remaining_customers - 1)
        business.today_revenue += int(result.navi_coin_reward)
        business.reputation_delta += int(result.reputation_delta)
        business.rating_delta += float(result.rating_delta)
        if result.satisfaction in {"매우 만족", "만족"}:
            business.successful_orders += 1
        else:
            business.failed_orders += 1
        business.current_order = None
        can_continue = business.remaining_customers > 0 and int((updated.get("tycoon_profile") or {}).get("daily_remaining_customers") or 0) > 0
        embed = self.business_result_embed(
            updated,
            business,
            recipe,
            result,
            can_continue=can_continue,
            cooking_grade=grade,
            cooking_reward=cooking_reward,
            cooking_affection_delta=cooking_affection_delta,
            cooking_note=cooking_note,
        )
        file = self.restaurant_preview_file(
            session.user_id,
            updated,
            customer_id=completed_order.customer.image_key,
            order_id=completed_order.order.order_id,
        )
        return embed, BusinessResultView(self, session.user_id, business.session_id, can_continue=can_continue), None, file, False

    def finish_session(
        self,
        session: CookSession,
        *,
        interaction: discord.Interaction | None = None,
        message: discord.Message | None = None,
        prefix: str = "",
    ) -> tuple[discord.Embed, discord.ui.View, str | None, discord.File | None, bool]:
        recipe = RECIPES[session.recipe_id]
        state = self.store.get_state(session.user_id)
        raw_mistakes = session.mistakes
        golden_used = self.golden_pan_applies(state, recipe) and raw_mistakes > 0
        mistakes = max(0, raw_mistakes - 1) if golden_used else raw_mistakes
        grade, produced, flour_reward, affection_delta, unlock_success, image = self.calculate_result(
            recipe,
            state,
            mistakes,
            raw_mistakes,
        )
        inventory_produced = storable_produced_items(produced)
        before_mastery_points = mastery_points(state)
        before_mastery_level = mastery_level_for(before_mastery_points)
        mastery_gain = self.mastery_gain(recipe, grade)
        after_mastery_level = mastery_level_for(before_mastery_points + mastery_gain)
        guild_id = interaction.guild_id if interaction else getattr(getattr(message, "guild", None), "id", None)
        channel_id = getattr(interaction.channel if interaction else getattr(message, "channel", None), "id", None)
        message_id = getattr(interaction.message if interaction else message, "id", None)
        if recipe.recipe_id == "navi_sincerity_cookie":
            self.finish_sincerity_materials(session.user_id, recipe, grade)
            if affection_delta > 0:
                affection_delta, cooldown = self.store.sincerity_affection_delta(session.user_id, affection_delta)
            else:
                cooldown = False
            applied_affection = self.store.apply_restaurant_affection(
                user_id=session.user_id,
                delta=affection_delta,
                reason=f"restaurant:{recipe.recipe_id}:{grade}",
                guild_id=guild_id,
                channel_id=channel_id,
                message_id=message_id,
                special=True,
            )
            if not cooldown and applied_affection >= 10:
                self.store.mark_sincerity_reward_used(session.user_id)
        else:
            cooldown = False
            applied_affection = self.store.apply_restaurant_affection(
                user_id=session.user_id,
                delta=affection_delta,
                reason=f"restaurant:{recipe.recipe_id}:{grade}",
                guild_id=guild_id,
                channel_id=channel_id,
                message_id=message_id,
            )
        daily_affection_after = restaurant_daily_affection_gain(state) + max(0, applied_affection)
        self.store.finish_session(
            user_id=session.user_id,
            recipe=recipe,
            grade=grade,
            mistakes=mistakes,
            quality_bonus=session.quality_bonus,
            affection_delta=applied_affection,
            flour_reward=flour_reward,
            mastery_gain=mastery_gain,
            produced=inventory_produced,
            unlock_success=unlock_success,
        )
        if grade == "실패" and recipe.recipe_id != "navi_sincerity_cookie":
            self.store.add_failure_lump_chance(session.user_id)
        self.sessions.pop(session.session_id, None)
        business_result = self.finish_business_order_from_cooking(
            session,
            recipe,
            grade,
            cooking_reward=flour_reward,
            cooking_affection_delta=applied_affection,
            cooking_note=prefix,
        )
        if business_result is not None:
            return business_result
        lines = []
        if prefix:
            lines.append(f"나비:\n{prefix}\n")
        intro = self.result_intro(
            recipe,
            grade,
            self.result_user_name(session.user_id, interaction=interaction, message=message),
        )
        napulnapul = NAPULNAPUL_TRIGGER in intro
        lines.extend(
            self.result_lines(
                intro,
                recipe,
                grade,
                inventory_produced,
                flour_reward,
                applied_affection,
                daily_affection_after,
                mastery_gain,
                before_mastery_level,
                after_mastery_level,
                mistakes,
                raw_mistakes,
                golden_used,
                cooldown,
            )
        )
        embed = self.basic_embed(f"{emoji(recipe.emoji_key)} {recipe.display_name} 결과", "\n".join(lines))
        if image:
            embed.set_image(url=f"attachment://{image}")
        return embed, ResultView(self, session.user_id), image, None, napulnapul

    def calculate_result(
        self,
        recipe: Recipe,
        state: dict[str, Any],
        mistakes: int,
        raw_mistakes: int,
    ) -> tuple[str, dict[str, int], int, int, bool, str | None]:
        if recipe.recipe_id == "navi_sincerity_cookie":
            if raw_mistakes <= 1:
                return "대성공", {"navi_sincerity_cookie": 1}, 30, 10, True, SINCERITY_COOKIE_IMAGE
            if raw_mistakes == 2:
                return "성공", {"navi_sincerity_cookie": 1}, 20, 10, True, SINCERITY_COOKIE_IMAGE
            if raw_mistakes == 3:
                return "미묘", {}, 5, 3, False, None
            return "실패", {}, 1, -2, False, None
        if mistakes <= 0:
            return "대성공", dict(recipe.produces), self.flour_reward(recipe, "대성공"), self.affection_reward(recipe, "대성공"), True, None
        if mistakes == 1:
            return "성공", dict(recipe.produces), self.flour_reward(recipe, "성공"), self.affection_reward(recipe, "성공"), True, None
        if mistakes == 2:
            produced = dict(recipe.produces) if random.choice([True, False]) else {}
            return "미묘", produced, self.flour_reward(recipe, "미묘"), 0, False, None
        return "실패", {}, 1, -1, False, None

    def flour_reward(self, recipe: Recipe, grade: str) -> int:
        rates = TIER_FLOUR_REWARD_RATES.get(recipe.tier, TIER_FLOUR_REWARD_RATES["1"])
        rate = rates.get(grade, 0)
        if rate <= 0:
            return 0
        return max(1, math.floor(recipe.base_flour_reward * rate))

    def affection_reward(self, recipe: Recipe, grade: str) -> int:
        rewards = TIER_AFFECTION_REWARDS.get(recipe.tier)
        if rewards is None:
            return max(0, int(recipe.base_affection or 0))
        return int(rewards.get(grade, 0))

    def mastery_gain(self, recipe: Recipe, grade: str) -> int:
        rewards = MASTERY_REWARDS.get(recipe_mastery_level(recipe), MASTERY_REWARDS[1])
        return int(rewards.get(grade, 0))

    def finish_sincerity_materials(self, user_id: int, recipe: Recipe, grade: str) -> None:
        if grade in {"대성공", "성공"}:
            self.store.consume_sincerity_materials(user_id, recipe, partial=False)
        elif grade == "미묘":
            self.store.add_item(user_id, "sincerity_cookie_ticket", 1)
            self.store.consume_sincerity_materials(user_id, recipe, partial=True)
        else:
            self.store.consume_sincerity_materials(user_id, recipe, partial=True)

    def result_user_name(
        self,
        user_id: int,
        *,
        interaction: discord.Interaction | None = None,
        message: discord.Message | None = None,
    ) -> str:
        user = interaction.user if interaction is not None else getattr(message, "author", None)
        if user is not None and int(getattr(user, "id", 0) or 0) == int(user_id):
            return clean_text(getattr(user, "display_name", None) or getattr(user, "name", None) or "손님")
        guild = interaction.guild if interaction is not None else getattr(message, "guild", None)
        member = guild.get_member(int(user_id)) if guild is not None else None
        if member is not None:
            return clean_text(getattr(member, "display_name", None) or getattr(member, "name", None) or "손님")
        return "손님"

    def result_intro(self, recipe: Recipe, grade: str, user_name: str) -> str:
        if recipe.recipe_id == "navi_sincerity_cookie" and grade in {"대성공", "성공"}:
            if grade == "대성공":
                return "나비:\n와.\n이건 나비가 봐도 조금 감동인데요.\n이건 진짜 잘했어요."
            return "나비:\n이건... 나비의 정성이 가득 들어간 쿠키예요.\n장난 아니고 진짜로요.\n소중히 먹어주세요."
        if recipe.recipe_id == "navi_sincerity_cookie":
            return "나비:\n정성이 너무 들어가서 쿠키가 부담스러웠나 봐요.\n일단 창문 좀 열게요."
        if grade in {"대성공", "성공"} and recipe.success_text:
            return f"나비:\n{recipe.success_text}"
        if grade == "실패" and recipe.failure_text:
            return f"나비:\n{recipe.failure_text}"
        if grade in {"대성공", "성공"}:
            template = random.choice(SUCCESS_DIALOGUE_TEMPLATES)
            return f"나비:\n{template.format(user=user_name, food=recipe.display_name)}"
        if grade == "미묘":
            return "나비:\n음...먹을 수는 있는데요.\n먹고 나서 생각이 많아질 맛이에요."
        template = random.choice(FAILURE_DIALOGUE_TEMPLATES)
        return f"나비:\n{template.format(user=user_name, food=recipe.display_name)}"

    def result_lines(
        self,
        intro: str,
        recipe: Recipe,
        grade: str,
        produced: dict[str, int],
        flour_reward: int,
        affection_delta: int,
        daily_affection_after: int,
        mastery_gain: int,
        before_mastery_level: int,
        after_mastery_level: int,
        mistakes: int,
        raw_mistakes: int,
        golden_used: bool,
        sincerity_cooldown: bool,
    ) -> list[str]:
        lines = [
            intro,
            "",
            f"등급: **{grade}**",
            f"실수: {mistakes}회" + (f" (황금 프라이팬이 {raw_mistakes - mistakes}회 수습)" if golden_used else ""),
            f"나비코인 보상: {self.navi_coin_text(flour_reward)}",
            f"호감도 변화: {affection_delta_display(affection_delta)}",
            "오늘 나비식당으로 얻을 수 있는 호감도",
            restaurant_daily_affection_progress_line(daily_affection_after),
            f"숙련도: +{mastery_gain}점"
            + (f" (Lv.{after_mastery_level} 달성)" if after_mastery_level > before_mastery_level else ""),
        ]
        if sincerity_cooldown and affection_delta > 0:
            lines.append("정성쿠키 호감도 보상은 7일 제한 중이라 ❤️ +3만 적용됐어요.")
        if produced:
            lines.append("획득: " + ", ".join(item_label(item_id, qty) for item_id, qty in produced.items()))
        else:
            lines.append("획득한 음식은 없어요.")
        return lines

    def golden_pan_applies(self, state: dict[str, Any], recipe: Recipe) -> bool:
        if "golden_pan" not in state["tools"]:
            return False
        if recipe.recipe_id in {"navi_sincerity_cookie", "navi_birthday_cake"}:
            return False
        return "pan" in recipe.required_tools

    def active_session_for(self, user_id: int) -> CookSession | None:
        now = time.monotonic()
        for session in list(self.sessions.values()):
            if session.user_id != int(user_id):
                continue
            if session.expires_at_monotonic < now:
                self.sessions.pop(session.session_id, None)
                continue
            return session
        return None

    def active_business_for(self, user_id: int) -> BusinessSession | None:
        for session in self.business_sessions.values():
            if session.user_id == int(user_id):
                return session
        return None

    def get_business_session(self, session_id: str, user_id: int) -> BusinessSession | None:
        session = self.business_sessions.get(session_id)
        if session is None or session.user_id != int(user_id):
            return None
        return session

    def available_order_recipes(self, user_id: int) -> list[Recipe]:
        state = self.store.get_state(user_id)
        recipes = [
            recipe
            for recipe in RECIPES.values()
            if recipe.recipe_id != "navi_sincerity_cookie" and is_recipe_unlocked(state, recipe) and has_recipe_mastery(state, recipe)
        ]
        return sorted(recipes, key=lambda recipe: (recipe_mastery_level(recipe), recipe.display_name))

    def navi_coin_text(self, amount: int | float) -> str:
        return f"{self.config.navi_coin_emoji} {int(amount):,}개"

    def daily_customer_capacity(self, state: dict[str, Any]) -> int:
        _, _, total = self.daily_customer_capacity_breakdown(state)
        return total

    def daily_customer_capacity_breakdown(self, state: dict[str, Any]) -> tuple[int, int, int]:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(tycoon.get("current_property_id"))
        effects = state.get("furniture_effects") or {}
        base = int(prop.daily_customers)
        furniture_bonus = int(effects.get("daily_customers", 0))
        return base, furniture_bonus, max(1, base + furniture_bonus)

    def today_customer_counts(self, state: dict[str, Any]) -> tuple[int, int, int]:
        tycoon = state.get("tycoon_profile") or {}
        served = max(0, int(tycoon.get("today_customers_served") or 0))
        remaining = max(0, int(tycoon.get("daily_remaining_customers") or 0))
        return served, remaining, max(1, served + remaining)

    def restaurant_preview_file(
        self,
        user_id: int,
        state: dict[str, Any],
        *,
        customer_id: str | None = None,
        order_id: str | None = None,
    ) -> discord.File | None:
        tycoon = state.get("tycoon_profile") or {}
        property_id = str(tycoon.get("current_property_id") or DEFAULT_PROPERTY_ID)
        try:
            cleanup_old_previews()
            output_path = make_preview_output_path(int(user_id), order_id)
            result = render_restaurant_scene(property_id, customer_id, output_path)
        except Exception:
            return None
        if not result.output_path.exists():
            return None
        return discord.File(str(result.output_path), filename=PREVIEW_FILE_NAME)

    def get_session(self, session_id: str, user_id: int) -> CookSession | None:
        session = self.sessions.get(session_id)
        if session is None or session.user_id != int(user_id):
            return None
        if session.expires_at_monotonic < time.monotonic():
            self.sessions.pop(session_id, None)
            return None
        return session

    def step_line(self, recipe: Recipe, index: int) -> str:
        if index == 0:
            return "자, 첫 손놀림이 중요해요. 뭐부터 할까요?"
        if index == len(recipe.steps) - 1:
            return "마지막이에요. 여기서 이상한 선택하면 나비가 표정 관리 못 해요."
        return "좋아요. 아직 주방은 멀쩡해요. 다음은요?"

    def home_embed(self, state: dict[str, Any]) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(tycoon.get("current_property_id"))
        inventory = state.get("inventory") or {}
        served, remaining, today_total = self.today_customer_counts(state)
        base_capacity, furniture_bonus, next_capacity = self.daily_customer_capacity_breakdown(state)
        rating = float(tycoon.get("rating") or 5.0)
        lines = [
            "어서 오세요, 나비식당이에요.",
            "오늘은 굽기만 하는 게 아니라 장사도 해볼 시간이에요.",
            "",
            f"현재 점포: **{prop.display_name}** [{prop.grade}]",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"보유 밀가루: {emoji('flour')} {int(inventory.get('flour') or 0)}개",
            f"발견한 레시피: {emoji('recipeBook')} {recipe_count(state)}개",
            f"평판/평점: {int(tycoon.get('reputation') or 0)} / {rating:.2f}",
            f"오늘 실제 영업 가능: {remaining}명 남음 / 오늘 한도 {today_total}명",
            f"점포 기준 한도: 기본 {base_capacity}명 + 가구 {furniture_bonus:+d}명 = 총 {next_capacity}명",
            f"오늘 매출: {self.navi_coin_text(tycoon.get('today_revenue') or 0)}",
            "오늘 나비식당으로 얻을 수 있는 호감도",
            restaurant_daily_affection_progress_line(restaurant_daily_affection_gain(state)),
        ]
        if next_capacity != today_total:
            lines.insert(10, "점포/가구 변경분은 다음 일일 초기화 때 오늘 한도에 맞춰져요.")
        if state.get("notice"):
            lines.extend(["", f"나비:\n{state['notice']}"])
        embed = self.basic_embed("🍽️ 나비식당", "\n".join(lines))
        embed.set_image(url=f"attachment://{PREVIEW_FILE_NAME}")
        return embed

    def legacy_home_embed(self, state: dict[str, Any]) -> discord.Embed:
        inventory = state["inventory"]
        tools = ", ".join(tool_label(tool_id) for tool_id in sorted(state["tools"])) or "없음"
        lines = [
            "어서 오세요, 나비식당이에요.",
            "오늘도 굽고, 태우고, 수습해볼 시간이에요.",
            "",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"보유 밀가루: {emoji('flour')} {int(inventory.get('flour') or 0)}개",
            f"발견한 레시피: {emoji('recipeBook')} {recipe_count(state)}개",
            "오늘 나비식당으로 얻을 수 있는 호감도",
            restaurant_daily_affection_progress_line(restaurant_daily_affection_gain(state)),
            f"보유 도구: {tools}",
        ]
        if state.get("notice"):
            lines.extend(["", f"나비:\n{state['notice']}"])
        embed = self.basic_embed("🍽️ 나비식당", "\n".join(lines))
        embed.set_image(url=f"attachment://{KITCHEN_IMAGE}")
        return embed

    def my_restaurant_embed(self, state: dict[str, Any]) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(tycoon.get("current_property_id"))
        placements = sorted(state.get("current_furniture_placements") or [], key=lambda row: int(row.get("slot_index") or 0))
        base_capacity, furniture_bonus, next_capacity = self.daily_customer_capacity_breakdown(state)
        served, remaining, today_total = self.today_customer_counts(state)
        furniture_lines = []
        for row in placements:
            furniture = furniture_def(row.get("furniture_id"))
            if furniture:
                furniture_lines.append(f"{int(row.get('slot_index') or 0) + 1}. {furniture.emoji} {furniture.display_name}")
            else:
                furniture_lines.append(f"{int(row.get('slot_index') or 0) + 1}. 비어 있음")
        lines = [
            f"점포: **{prop.display_name}** [{prop.grade}]",
            prop.description,
            "",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"평판: {int(tycoon.get('reputation') or 0)}",
            f"평점: {float(tycoon.get('rating') or 5.0):.2f}",
            f"누적 매출: {self.navi_coin_text(tycoon.get('total_revenue') or 0)}",
            f"오늘 손님: {served}/{today_total}명 응대, {remaining}명 남음",
            f"점포 기준 한도: 기본 {base_capacity}명 + 가구 {furniture_bonus:+d}명 = 총 {next_capacity}명",
            "",
            "**배치 가구**",
            "\n".join(furniture_lines) if furniture_lines else "아직 놓인 가구가 없어요.",
        ]
        embed = self.basic_embed("🏪 내 식당", "\n".join(lines))
        embed.set_image(url=f"attachment://{PREVIEW_FILE_NAME}")
        return embed

    def kitchen_embed(self, state: dict[str, Any], page: int) -> discord.Embed:
        recipes = list(RECIPES.values())
        page_count = max(1, math.ceil(len(recipes) / 8))
        page = max(0, min(page, page_count - 1))
        lines = [f"주방 메뉴판이에요. ({page + 1}/{page_count})", ""]
        for recipe in recipes[page * 8 : page * 8 + 8]:
            if is_recipe_unlocked(state, recipe):
                ok, missing = can_start_recipe(state, recipe)
                mark = "✅" if ok else "🔒" if not has_recipe_mastery(state, recipe) else "🔓"
                extra = "제작 가능" if ok else missing_summary(missing, limit=4)
                lines.append(f"{mark} {recipe_label(recipe)} - {extra}")
            else:
                lines.append(f"{emoji('secret')} ???: {locked_recipe_hint(recipe)}")
        return self.basic_embed("🧑‍🍳 주방", "\n".join(lines))

    def shop_embed(self, state: dict[str, Any], page: int, *, notice: str = "") -> discord.Embed:
        page_count = max(1, math.ceil(len(SHOP_ITEMS) / 8))
        page = max(0, min(page, page_count - 1))
        lines = [
            f"재료 상점이에요. 이제 밀가루는 재료고, 계산은 나비코인으로 해요. ({page + 1}/{page_count})",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"보유 밀가루: {emoji('flour')} {int((state.get('inventory') or {}).get('flour') or 0)}개",
            "",
        ]
        for shop_item in SHOP_ITEMS[page * 8 : page * 8 + 8]:
            unlocked = shop_item.unlock_id in state["unlocks"].get("shop", set())
            if not unlocked:
                lines.append(f"{emoji('secret')} ??? : {shop_item.hint}")
                continue
            label = tool_label(shop_item.item_id) if shop_item.kind == "tool" else item_label(shop_item.item_id)
            if shop_item_owned(state, shop_item):
                lines.append(f"✅ {label} - 보유 중")
                continue
            lines.append(f"🛒 {label} - {self.navi_coin_text(shop_item.price)}")
        if notice:
            lines.extend(["", f"나비:\n{notice}"])
        return self.basic_embed("🧺 재료 상점", "\n".join(lines))

    def inventory_embed(self, state: dict[str, Any]) -> discord.Embed:
        inventory = state["inventory"]
        points = mastery_points(state)
        level = mastery_level_for(points)
        next_threshold = mastery_next_threshold(points)
        mastery_line = (
            f"숙련도 Lv.{level} MAX ({points}점)"
            if next_threshold is None
            else f"숙련도 Lv.{level} ({points}/{next_threshold}점)"
        )
        lines = [
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"보유 밀가루: {emoji('flour')} {int(inventory.get('flour') or 0)}개",
            mastery_line,
            "오늘 나비식당으로 얻을 수 있는 호감도",
            restaurant_daily_affection_progress_line(restaurant_daily_affection_gain(state)),
            "",
            "**보유 도구**",
            ", ".join(tool_label(tool_id) for tool_id in sorted(state["tools"])) or "없음",
            "",
        ]
        for category in ("재료", "요리", "특수"):
            entries = [
                item_label(item_id, quantity)
                for item_id, quantity in sorted(inventory.items())
                if quantity > 0 and ITEMS.get(item_id, ItemDef("", "", "")).category == category
            ]
            lines.append(f"**{category}**")
            lines.append(", ".join(entries) if entries else "없음")
            lines.append("")
        found = [recipe_label(recipe) for recipe in RECIPES.values() if is_recipe_unlocked(state, recipe)]
        lines.append("**발견한 레시피**")
        lines.append(", ".join(found[:20]) + (" ..." if len(found) > 20 else ""))
        return self.basic_embed("🎒 인벤토리", "\n".join(lines))

    def recipe_detail_embed(self, state: dict[str, Any], recipe: Recipe) -> discord.Embed:
        ok, missing = can_start_recipe(state, recipe)
        required_items = ", ".join(item_label(item_id, quantity) for item_id, quantity in recipe.required_items.items()) or "없음"
        required_tools = ", ".join(tool_label(tool_id) for tool_id in recipe.required_tools) or "없음"
        timing = "있음" if recipe.timing_stages else "없음"
        required_mastery = recipe_mastery_level(recipe)
        current_mastery = mastery_level_for(mastery_points(state))
        lines = [
            f"{recipe_label(recipe)}",
            "",
            f"필요 숙련도: Lv.{required_mastery} (현재 Lv.{current_mastery})",
            f"티어 특징: {tier_trait(recipe)}",
            f"필요 재료: {required_items}",
            f"필요 도구: {required_tools}",
            "제작 비용: 없음",
            f"타이밍 단계: {timing}",
            "",
            "상태: " + ("바로 만들 수 있어요." if ok else "\n" + missing_block(missing)),
        ]
        return self.basic_embed("📋 레시피 확인", "\n".join(lines))

    def customer_order_embed(self, state: dict[str, Any], session: BusinessSession, order: ActiveCustomerOrder) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(session.property_id)
        hint_lines = "\n".join(order.order.rules.hint_lines) if order.order.rules.hint_lines else "• 손님의 말을 잘 보고 골라주세요."
        lines = [
            f"점포: **{prop.display_name}**",
            f"남은 손님: {session.remaining_customers}명",
            f"평판/평점: {int(tycoon.get('reputation') or 0)} / {float(tycoon.get('rating') or 5.0):.2f}",
            "",
            f"손님: **{order.customer.display_name}**",
            f"인내심: {order.patience_left}",
            "",
            f"손님:\n{order.order.dialogue}",
            "",
            "**힌트**",
            hint_lines,
        ]
        embed = self.basic_embed("🍽️ 나비식당 영업 중", "\n".join(lines))
        embed.set_image(url=f"attachment://{PREVIEW_FILE_NAME}")
        return embed

    def order_recipe_picker_embed(self, state: dict[str, Any], session: BusinessSession, page: int) -> discord.Embed:
        order = session.current_order
        recipes = self.available_order_recipes(session.user_id)
        page_count = max(1, math.ceil(len(recipes) / ORDER_RECIPE_PAGE_SIZE))
        page = max(0, min(page, page_count - 1))
        lines = [
            f"주문: {order.order.dialogue if order else '주문 없음'}",
            f"선택 가능한 레시피: {len(recipes)}개 ({page + 1}/{page_count})",
            "",
        ]
        for recipe in recipes[page * ORDER_RECIPE_PAGE_SIZE : page * ORDER_RECIPE_PAGE_SIZE + ORDER_RECIPE_PAGE_SIZE]:
            ok, missing = can_start_recipe(state, recipe)
            mark = "✅" if ok else "🔒"
            lines.append(f"{mark} {recipe_label(recipe)} - {'제공 가능' if ok else missing_summary(missing, limit=2)}")
        if not recipes:
            lines.append("아직 제공할 수 있는 레시피가 없어요.")
        return self.basic_embed("🍳 손님에게 낼 음식 선택", "\n".join(lines))

    def business_result_embed(
        self,
        state: dict[str, Any],
        session: BusinessSession,
        recipe: Recipe,
        result: SatisfactionResult,
        *,
        can_continue: bool,
        cooking_grade: str | None = None,
        cooking_reward: int | None = None,
        cooking_affection_delta: int | None = None,
        cooking_note: str = "",
    ) -> discord.Embed:
        lines = [
            f"제공한 음식: {recipe_label(recipe)}",
            f"조리 결과: **{cooking_grade}**" if cooking_grade else "",
            f"손님 반응: **{result.satisfaction}** ({result.score}점)",
            result.note,
            "",
            f"손님 매출: {self.navi_coin_text(result.navi_coin_reward)}" if cooking_reward is not None else f"나비코인 보상: {self.navi_coin_text(result.navi_coin_reward)}",
        ]
        if cooking_reward is not None:
            lines.append(f"조리 보상: {self.navi_coin_text(cooking_reward)}")
        if cooking_affection_delta is not None and cooking_affection_delta != 0:
            lines.append(f"조리 호감도 변화: {affection_delta_display(cooking_affection_delta)}")
        if cooking_note:
            lines.append("조리 메모: " + " ".join(str(cooking_note).split()))
        lines.extend(
            [
            f"평판 변화: {result.reputation_delta:+d}",
            f"평점 변화: {result.rating_delta:+.2f}",
            ]
        )
        if result.matched_tags:
            lines.append("맞춘 조건: " + ", ".join(result.matched_tags))
        if result.missing_required:
            lines.append("빠진 조건: " + ", ".join(result.missing_required))
        if result.banned_hits:
            lines.append("피했어야 할 조건: " + ", ".join(result.banned_hits))
        lines.extend(
            [
                "",
                f"이번 영업 매출: {self.navi_coin_text(session.today_revenue)}",
                f"남은 손님: {session.remaining_customers}명",
                "나비:\n" + ("다음 손님 받을 수 있어요. 이번엔 태우지 말고요." if can_continue else "오늘 손님은 여기까지예요. 나비도 잠깐 숨 좀 돌릴게요."),
            ]
        )
        title = "✅ 주문 결과" if result.satisfaction in {"매우 만족", "만족"} else "⚠️ 주문 결과"
        embed = self.basic_embed(title, "\n".join(lines))
        embed.set_image(url=f"attachment://{PREVIEW_FILE_NAME}")
        return embed

    def business_status_embed(self, state: dict[str, Any], session: BusinessSession) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(session.property_id)
        effects = state.get("furniture_effects") or {}
        effect_lines = []
        for key, value in sorted(effects.items()):
            effect_lines.append(f"• {key}: +{value:g}")
        lines = [
            f"현재 점포: **{prop.display_name}** [{prop.grade}]",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"평판/평점: {int(tycoon.get('reputation') or 0)} / {float(tycoon.get('rating') or 5.0):.2f}",
            "",
            f"이번 영업 손님: {session.served_customers}명 응대 / {session.remaining_customers}명 남음",
            f"성공/아쉬움: {session.successful_orders}/{session.failed_orders}",
            f"이번 영업 매출: {self.navi_coin_text(session.today_revenue)}",
            "",
            "**가구 효과**",
            "\n".join(effect_lines) if effect_lines else "아직 적용 중인 가구 효과가 없어요.",
        ]
        return self.basic_embed("📋 가게 현황", "\n".join(lines))

    def business_summary_embed(self, state: dict[str, Any], session: BusinessSession) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        lines = [
            "오늘 영업 정산이에요.",
            "",
            f"응대한 손님: {session.served_customers}명",
            f"성공/아쉬움: {session.successful_orders}/{session.failed_orders}",
            f"이번 영업 매출: {self.navi_coin_text(session.today_revenue)}",
            f"평판 합계: {session.reputation_delta:+d}",
            f"평점 합계: {session.rating_delta:+.2f}",
            "",
            f"현재 보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            f"오늘 총매출: {self.navi_coin_text(tycoon.get('today_revenue') or 0)}",
            "나비:\n장사는 끝났고 설거지는...음, 누가 할까요?",
        ]
        return self.basic_embed("🌙 오늘의 영업 종료", "\n".join(lines))

    def management_embed(self, state: dict[str, Any]) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        prop = property_def(tycoon.get("current_property_id"))
        effects = state.get("furniture_effects") or {}
        base_capacity, furniture_bonus, next_capacity = self.daily_customer_capacity_breakdown(state)
        effect_lines = []
        for key, value in sorted(effects.items()):
            effect_lines.append(f"- {key}: +{value:g}")
        lines = [
            f"현재 점포: **{prop.display_name}** [{prop.grade}]",
            f"배치 칸: {self.store.property_slot_count(prop.property_id)}칸",
            f"점포 기준 한도: 기본 {base_capacity}명 + 가구 {furniture_bonus:+d}명 = 총 {next_capacity}명",
            "오늘 실제 영업 가능 수는 메인 화면의 오늘 한도를 따라가요.",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            "",
            "**적용 중인 가구 효과**",
            "\n".join(effect_lines) if effect_lines else "아직 가구 효과가 없어요.",
        ]
        return self.basic_embed("🛠️ 가게 관리", "\n".join(lines))

    def property_embed(self, state: dict[str, Any]) -> discord.Embed:
        tycoon = state.get("tycoon_profile") or {}
        current_id = str(tycoon.get("current_property_id") or DEFAULT_PROPERTY_ID)
        owned = set(state.get("owned_properties") or set())
        lines = [f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}", ""]
        for prop in PROPERTIES.values():
            if prop.property_id == current_id:
                status = "현재"
            elif prop.property_id in owned:
                status = "보유"
            else:
                status = self.navi_coin_text(prop.price)
            lines.append(f"{prop.display_name} [{prop.grade}] - {status}")
        return self.basic_embed("🏘️ 나비식당 부동산", "\n".join(lines))

    def property_detail_embed(self, state: dict[str, Any], property_id: str, *, notice: str = "") -> discord.Embed:
        prop = property_def(property_id)
        current_id = str((state.get("tycoon_profile") or {}).get("current_property_id") or DEFAULT_PROPERTY_ID)
        owned = property_id in set(state.get("owned_properties") or set())
        status = "현재 영업 중" if property_id == current_id else "보유 중" if owned else f"구매가 {self.navi_coin_text(prop.price)}"
        lines = [
            f"점포: **{prop.display_name}** [{prop.grade}]",
            status,
            prop.description,
            "",
            f"하루 손님: {prop.daily_customers}명",
            f"손님 인내심 보정: {prop.patience_modifier:+d}",
            f"유지비: {self.navi_coin_text(prop.maintenance_cost)}",
            f"매출 배율: x{prop.revenue_multiplier:g}",
            f"평점 리스크: x{prop.rating_risk_multiplier:g}",
            "이전 후 한도 반영: 다음 영업일부터",
        ]
        if notice:
            lines.extend(["", f"나비:\n{notice}"])
        embed = self.basic_embed("🏘️ 점포 상세", "\n".join(lines))
        embed.set_image(url=f"attachment://{PREVIEW_FILE_NAME}")
        return embed

    def furniture_shop_embed(self, state: dict[str, Any], *, notice: str = "") -> discord.Embed:
        prop = property_def((state.get("tycoon_profile") or {}).get("current_property_id"))
        lines = [
            f"현재 점포 등급: {prop.grade}",
            f"보유 나비코인: {self.navi_coin_text(state.get('navi_coin_balance') or 0)}",
            "",
        ]
        for furniture in FURNITURE.values():
            locked = not property_grade_at_least(prop.grade, furniture.min_property_grade)
            mark = "🔒" if locked else "🪑"
            lines.append(f"{mark} {furniture.emoji} {furniture.display_name} - {self.navi_coin_text(furniture.cost)} / {furniture.description}")
        if notice:
            lines.extend(["", f"나비:\n{notice}"])
        return self.basic_embed("🪑 가구 상점", "\n".join(lines))

    def furniture_slots_embed(self, state: dict[str, Any], *, notice: str = "") -> discord.Embed:
        placements = sorted(state.get("current_furniture_placements") or [], key=lambda row: int(row.get("slot_index") or 0))
        lines = []
        for row in placements:
            furniture = furniture_def(row.get("furniture_id"))
            if furniture:
                lines.append(f"{int(row.get('slot_index') or 0) + 1}번: {furniture.emoji} {furniture.display_name}")
            else:
                lines.append(f"{int(row.get('slot_index') or 0) + 1}번: 비어 있음")
        if notice:
            lines.extend(["", f"나비:\n{notice}"])
        return self.basic_embed("🧩 가구 배치", "\n".join(lines) if lines else "배치 칸이 없어요.")

    def furniture_slot_embed(self, state: dict[str, Any], slot_index: int) -> discord.Embed:
        inventory = state.get("furniture_inventory") or {}
        lines = [f"{slot_index + 1}번 칸에 놓을 가구를 골라주세요.", ""]
        choices = []
        for furniture_id, quantity in sorted(inventory.items()):
            if quantity <= 0:
                continue
            furniture = furniture_def(furniture_id)
            if furniture:
                choices.append(f"{furniture.emoji} {furniture.display_name} x{quantity}")
        lines.extend(choices or ["보유 중인 배치 가능 가구가 없어요."])
        return self.basic_embed("🧩 가구 선택", "\n".join(lines))

    def restaurant_help_embed(self) -> discord.Embed:
        lines = [
            "나비식당은 레시피를 만들고, 손님 주문에 맞는 음식을 골라 매출을 올리는 기능이에요.",
            "",
            "1. 재료 상점에서 재료를 사고 레시피를 제작해요.",
            "2. 영업 시작을 누르면 손님이 주문을 말해요.",
            "3. 손님 말에 맞는 음식을 고르면 나비코인, 평판, 평점이 올라가요.",
            "4. 부동산을 사면 손님 수와 보상 구조가 바뀌어요.",
            "5. 가구는 손님 수, 인내심, 매출, 평점 변화에 영향을 줘요.",
            "",
            "[재화 개편] 기존 밀가루 재화는 나비코인으로 이전됐고, 밀가루는 이제 요리 재료로만 써요.",
        ]
        return self.basic_embed("📘 나비식당 도움말", "\n".join(lines))

    def basic_embed(self, title: str, description: str) -> discord.Embed:
        embed = discord.Embed(
            title=sanitize_restaurant_text(title),
            description=sanitize_restaurant_text(description) or "\u200b",
            color=RESTAURANT_COLOR,
        )
        embed.set_author(name="NAVI 나비식당")
        embed.set_footer(text="주방에서 뛰지 마세요. 나비도 가끔 미끄러집니다.")
        return embed

    async def edit_screen(
        self,
        interaction: discord.Interaction,
        embed: discord.Embed,
        view: discord.ui.View,
        *,
        image: str | None = None,
        file: discord.File | None = None,
    ) -> None:
        attachments = [file] if file is not None else [self.image_file(image)] if image else []
        if interaction.response.is_done():
            await interaction.followup.send(
                embed=embed,
                view=view,
                file=file,
                ephemeral=True,
                allowed_mentions=no_mentions(),
            )
            return
        await interaction.response.edit_message(
            embed=embed,
            view=view,
            attachments=attachments,
            allowed_mentions=no_mentions(),
        )

    def image_file(self, filename: str) -> discord.File:
        return discord.File(str(self.asset_dir / filename), filename=filename)


OWNER_GRANT_RE = re.compile(
    r"^\s*나비야\s+(?P<item>정성쿠키권|정성쿠키|밀가루|나비코인)\s+(?P<mode>역할지급|지급)\s+(?P<target><@!?\d+>|<@&\d+>)\s*(?P<quantity>\d+)?\s*$"
)


def is_restaurant_owner_grant_command(content: str) -> bool:
    return OWNER_GRANT_RE.match(str(content or "")) is not None


async def handle_restaurant_owner_grant_command(bot: commands.Bot, db: Database, message: discord.Message) -> bool:
    match = OWNER_GRANT_RE.match(str(message.content or ""))
    if match is None:
        return False
    if int(message.author.id) != NAVI_OWNER_USER_ID:
        await message.reply(
            "나비:\n그건 아빠만 할 수 있어요.\n나비가 아무한테나 정성쿠키를 풀면 식당 경제가 무너져요.",
            allowed_mentions=no_mentions(),
            mention_author=False,
        )
        return True
    item_name = match.group("item")
    if item_name == "정성쿠키권":
        item_id = "sincerity_cookie_ticket"
    elif item_name == "정성쿠키":
        item_id = "navi_sincerity_cookie"
    elif item_name == "나비코인":
        item_id = "NAVI_COIN"
    else:
        item_id = "flour"
    default_quantity = 25 if item_id in {"flour", "NAVI_COIN"} else 1
    max_quantity = 100000 if item_id == "NAVI_COIN" else 1000 if item_id == "flour" else 10
    quantity = max(1, min(max_quantity, int(match.group("quantity") or default_quantity)))
    mode = match.group("mode")
    store = RestaurantStore(db)
    granted = 0
    if mode == "지급":
        if not message.mentions:
            await message.reply("나비:\n대상 유저를 멘션해 주세요.", allowed_mentions=no_mentions(), mention_author=False)
            return True
        target = message.mentions[0]
        if target.bot:
            await message.reply("나비:\n봇한테는 주방 출입증을 안 줘요.", allowed_mentions=no_mentions(), mention_author=False)
            return True
        store.get_state(target.id)
        store.owner_grant(owner_id=message.author.id, target_id=target.id, item_id=item_id, quantity=quantity)
        granted = 1
    else:
        if not message.role_mentions:
            await message.reply("나비:\n대상 역할을 멘션해 주세요.", allowed_mentions=no_mentions(), mention_author=False)
            return True
        role = message.role_mentions[0]
        members: dict[int, discord.Member] = {member.id: member for member in role.members}
        if message.guild is not None:
            try:
                async for member in message.guild.fetch_members(limit=None):
                    if role in getattr(member, "roles", []):
                        members[int(member.id)] = member
            except discord.HTTPException:
                pass
        for member in members.values():
            if member.bot:
                continue
            store.get_state(member.id)
            store.owner_grant(
                owner_id=message.author.id,
                target_id=member.id,
                item_id=item_id,
                quantity=quantity,
                target_type="role",
            )
            granted += 1
    if item_id == "NAVI_COIN" and mode == "지급":
        text = "나비:\n나비코인 지급 완료예요.\n식당 장부에 숫자가 반짝하고 늘었답니다."
    elif item_id == "NAVI_COIN":
        text = "나비:\n해당 역할 사람들에게 나비코인을 추가했어요.\n나비 경제부 장관, 잠깐 일했습니다."
    elif item_id == "flour" and mode == "지급":
        text = "나비:\n밀가루 지급 완료예요.\n이걸로 주방 파산은 잠깐 미뤄졌습니다."
    elif item_id == "flour":
        text = "나비:\n해당 역할 사람들에게 밀가루를 추가했어요.\n초반 주방 구조대 출동 완료예요."
    elif item_id == "sincerity_cookie_ticket" and mode == "지급":
        text = "나비:\n정성쿠키 제작권 지급 완료예요.\n이제 진짜 만들 수 있는지는 별개의 문제지만요."
    elif item_id == "navi_sincerity_cookie" and mode == "지급":
        text = "나비:\n완성된 정성쿠키를 지급했어요.\n이건 거의 사건이에요."
    else:
        text = "나비:\n해당 역할 사람들에게 나눠줬어요.\n이제 주방이 조금 소란스러워질 예정이에요."
    await message.reply(
        f"{text}\n\n지급 대상: {granted}명\n수량: {quantity}개",
        allowed_mentions=no_mentions(),
        mention_author=False,
    )
    return True
