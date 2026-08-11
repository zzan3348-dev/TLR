from __future__ import annotations

from dataclasses import dataclass
import random
from typing import Any


DEFAULT_PROPERTY_ID = "backalley_shop"


@dataclass(frozen=True)
class RestaurantProperty:
    property_id: str
    display_name: str
    grade: str
    price: int
    maintenance_cost: int
    daily_customers: int
    patience_modifier: int
    revenue_multiplier: float
    rating_risk_multiplier: float
    description: str
    customer_type_weights: dict[str, int]
    order_type_weights: dict[str, int]


@dataclass(frozen=True)
class FurnitureDef:
    furniture_id: str
    display_name: str
    emoji: str
    cost: int
    description: str
    effects: dict[str, float]
    min_property_grade: str = "F"
    max_effect_stacks: int = 3


@dataclass(frozen=True)
class OrderRules:
    required_tags: tuple[str, ...] = ()
    preferred_tags: tuple[str, ...] = ()
    banned_tags: tuple[str, ...] = ()
    forbidden_tags: tuple[str, ...] = ()
    exact_recipe_ids: tuple[str, ...] = ()
    hint_lines: tuple[str, ...] = ()


@dataclass(frozen=True)
class CustomerOrderProfile:
    order_id: str
    order_type: str
    dialogue: str
    rules: OrderRules
    difficulty: str = "normal"
    min_reputation: int = 0


@dataclass(frozen=True)
class CustomerProfile:
    customer_id: str
    display_name: str
    customer_type: str
    image_key: str
    main_properties: tuple[str, ...]
    patience: int
    tip_multiplier: float
    rating_impact: float
    reputation_reward: int
    order_pool: tuple[CustomerOrderProfile, ...]
    appearance_weight: int = 10
    is_enabled: bool = True


@dataclass
class ActiveCustomerOrder:
    user_id: int
    customer: CustomerProfile
    order: CustomerOrderProfile
    patience_left: int
    session_id: str


@dataclass(frozen=True)
class SatisfactionResult:
    satisfaction: str
    score: int
    navi_coin_reward: int
    reputation_delta: int
    rating_delta: float
    matched_tags: tuple[str, ...]
    missing_required: tuple[str, ...]
    banned_hits: tuple[str, ...]
    note: str


@dataclass
class BusinessSession:
    session_id: str
    user_id: int
    property_id: str
    remaining_customers: int
    served_customers: int = 0
    successful_orders: int = 0
    failed_orders: int = 0
    today_revenue: int = 0
    reputation_delta: int = 0
    rating_delta: float = 0.0
    current_order: ActiveCustomerOrder | None = None


PROPERTY_GRADE_ORDER = {"F": 0, "D": 1, "C": 2, "B": 3, "A": 4, "S": 5}

PROPERTIES: dict[str, RestaurantProperty] = {
    "backalley_shop": RestaurantProperty("backalley_shop", "낡은 골목 점포", "F", 0, 0, 3, 1, 1.0, 1.0, "시작 점포예요. 손님은 적지만 실수해도 덜 무서워요.", {"student": 14, "regular": 12, "strange": 5}, {"simple_meal": 12, "tag_based": 10, "cheap": 6}),
    "normal_commercial": RestaurantProperty("normal_commercial", "일반상가", "D", 450, 12, 4, 0, 1.08, 1.0, "평범한 만큼 안정적인 상가예요.", {"regular": 10, "student": 8, "worker": 7}, {"tag_based": 12, "preferred_menu": 8}),
    "school_zone": RestaurantProperty("school_zone", "학교 앞 상가", "D", 650, 15, 8, 1, 1.12, 0.90, "학생 손님이 많아 객단가는 낮지만, 회전율이 높고 평점 관리가 쉬운 상권이에요.", {"student": 18, "regular": 8, "parent": 5, "teacher": 5, "worker": 3}, {"fast_order": 18, "cheap": 16, "simple_meal": 12, "tag_based": 8, "dessert": 8, "warm_meal": 5, "premium_order": 1}),
    "station_area": RestaurantProperty("station_area", "역세권 소형 점포", "C", 1200, 40, 6, -1, 1.20, 1.1, "사람은 많지만 아무도 오래 기다려주진 않아요.", {"worker": 16, "student": 8, "traveler": 8}, {"fast_order": 18, "warm_meal": 8}),
    "downtown_first_floor": RestaurantProperty("downtown_first_floor", "번화가 1층 상가", "B", 2400, 85, 6, -1, 1.35, 1.2, "보상은 좋지만 손님 눈높이가 높아요.", {"trendy": 14, "picky": 10, "couple": 7}, {"premium_order": 12, "dessert": 10, "vague": 8}),
    "office_district": RestaurantProperty("office_district", "오피스 상권 식당", "B", 2800, 95, 6, -1, 1.30, 1.15, "직장인 손님이 빠르고 든든한 걸 찾아요.", {"worker": 22, "regular": 6}, {"fast_order": 15, "warm_meal": 14, "simple_meal": 6}),
    "luxury_restaurant": RestaurantProperty("luxury_restaurant", "고급 레스토랑 자리", "A", 5200, 180, 5, 0, 1.75, 1.45, "큰 보상과 큰 리스크가 같이 오는 자리예요.", {"picky": 18, "trendy": 10, "regular": 4}, {"premium_order": 20, "exact_recipe": 8}),
    "food_court": RestaurantProperty("food_court", "복합몰 푸드코트", "B", 3200, 110, 7, 0, 1.18, 0.95, "다양한 손님이 안정적으로 찾아와요.", {"student": 10, "regular": 10, "family": 10, "worker": 6}, {"simple_meal": 12, "dessert": 8, "tag_based": 8}),
}

FURNITURE: dict[str, FurnitureDef] = {
    "small_table": FurnitureDef("small_table", "작은 테이블", "🪑", 80, "하루 손님 +1", {"daily_customers": 1}, "F", 4),
    "flower_pot": FurnitureDef("flower_pot", "화분", "🪴", 60, "손님 인내심 +1", {"patience": 1}, "F", 2),
    "cash_register": FurnitureDef("cash_register", "계산대", "🧾", 150, "매출 +10%", {"revenue_bonus": 0.10}, "D", 2),
    "kitchen_counter": FurnitureDef("kitchen_counter", "주방 작업대", "🍳", 220, "평점 하락 감소", {"rating_loss_reduction": 0.20}, "D", 2),
    "window_decor": FurnitureDef("window_decor", "창가 장식", "🪟", 180, "평점 상승량 +10%", {"rating_gain": 0.10}, "C", 2),
    "mood_light": FurnitureDef("mood_light", "무드등", "💡", 260, "까다로운 손님 등장률 증가", {"picky_rate": 0.10}, "B", 2),
    "navi_decoration": FurnitureDef("navi_decoration", "나비 장식", "🎀", 300, "나비 관련 주문 등장률 증가", {"navi_guest_rate": 0.12}, "B", 2),
}


def _order(order_id: str, order_type: str, dialogue: str, *, required: tuple[str, ...] = (), preferred: tuple[str, ...] = (), banned: tuple[str, ...] = (), forbidden: tuple[str, ...] = (), exact: tuple[str, ...] = (), hints: tuple[str, ...] = (), difficulty: str = "normal", min_reputation: int = 0) -> CustomerOrderProfile:
    return CustomerOrderProfile(order_id, order_type, dialogue, OrderRules(required, preferred, banned, forbidden, exact, hints), difficulty, min_reputation)


COMMON_ORDERS = (
    _order("warm_simple_001", "tag_based", "따뜻하고 든든한 걸로 주세요.", required=("warm", "meal"), preferred=("simple",), hints=("• 따뜻한 음식", "• 식사류")),
    _order("fast_001", "fast_order", "빨리 먹을 수 있는데 배는 좀 찼으면 좋겠어요.", required=("fast",), preferred=("meal", "warm"), hints=("• 빠른 음식", "• 든든하면 보너스")),
    _order("dessert_001", "dessert", "오늘은 달달한 게 필요해요.", required=("dessert",), preferred=("sweet",), banned=("spicy",), hints=("• 디저트", "• 매운 건 피하기")),
    _order("cheap_001", "cheap", "너무 비싸 보이지 않는 걸로 부탁해요.", required=("simple",), preferred=("cheap", "fast"), banned=("advanced",), hints=("• 단순한 음식", "• 고급 음식은 감점")),
    _order("soup_001", "soup", "국물 있는 쪽으로 가능할까요?", required=("soup",), preferred=("warm",), hints=("• 국물 음식", "• 따뜻하면 좋아요")),
    _order("premium_001", "premium_order", "평범한 건 말고 제대로 만든 걸로 주세요.", required=("advanced",), preferred=("meal", "warm"), banned=("simple",), hints=("• 고급 태그", "• 단순하면 감점"), difficulty="hard", min_reputation=80),
    _order("exact_egg_rice_001", "exact_recipe", "계란볶음밥 같은 게 먹고 싶네요.", exact=("egg_fried_rice", "omurice"), required=("rice", "meal"), hints=("• 밥 요리", "• 계란이 들어가면 좋아요")),
    _order("navi_special_001", "navi_special", "나비가 좋아할 만한 걸로 주세요.", required=("navi",), preferred=("sweet", "special"), hints=("• 나비 관련 메뉴", "• 특수/달달함 선호"), difficulty="hard", min_reputation=120),
)


CUSTOMERS: tuple[CustomerProfile, ...] = (
    CustomerProfile("customer_01_happy_young_man", "배고픈 학생", "student", "customer_01_happy_young_man", ("backalley_shop", "school_zone", "food_court"), 4, 1.0, 1.0, 1, COMMON_ORDERS[:4], 14),
    CustomerProfile("customer_02_soft_cute_portrait", "부드러운 학생 손님", "student", "customer_02_soft_cute_portrait", ("school_zone", "food_court"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[2], COMMON_ORDERS[3], COMMON_ORDERS[0]), 10),
    CustomerProfile("customer_03_worried_student", "돈 없는 학생", "student", "customer_03_worried_student", ("backalley_shop", "school_zone"), 3, 0.9, 0.9, 0, (COMMON_ORDERS[3], COMMON_ORDERS[1]), 9),
    CustomerProfile("customer_04_studious_girl", "시험 끝난 학생", "student", "customer_04_studious_girl", ("school_zone", "food_court"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[2], COMMON_ORDERS[0]), 8),
    CustomerProfile("customer_05_urgent_student", "급한 학생", "student", "customer_05_urgent_student", ("school_zone", "station_area"), 2, 1.0, 1.1, 1, (COMMON_ORDERS[1], COMMON_ORDERS[3]), 10),
    CustomerProfile("customer_06_tired_office_worker", "피곤한 직장인", "worker", "customer_06_tired_office_worker", ("station_area", "office_district"), 2, 1.1, 1.1, 1, (COMMON_ORDERS[1], COMMON_ORDERS[0], COMMON_ORDERS[6]), 14),
    CustomerProfile("customer_07_thinking_business_woman", "생각 많은 직장인", "picky", "customer_07_thinking_business_woman", ("downtown_first_floor", "office_district", "luxury_restaurant"), 3, 1.4, 1.3, 2, (COMMON_ORDERS[5], COMMON_ORDERS[6]), 10),
    CustomerProfile("customer_08_relaxed_after_work", "퇴근 후 직장인", "worker", "customer_08_relaxed_after_work", ("office_district", "normal_commercial"), 3, 1.1, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[4]), 8),
    CustomerProfile("customer_09_smiling_boy", "동네 소년 손님", "family", "customer_09_smiling_boy", ("backalley_shop", "food_court"), 4, 0.9, 0.9, 0, (COMMON_ORDERS[2], COMMON_ORDERS[3]), 8),
    CustomerProfile("customer_10_soft_smile_character", "조용한 단골", "regular", "customer_10_soft_smile_character", ("backalley_shop", "normal_commercial"), 5, 1.0, 0.9, 1, (COMMON_ORDERS[0], COMMON_ORDERS[4]), 12),
    CustomerProfile("customer_11_kind_grandmother", "친절한 할머니", "regular", "customer_11_kind_grandmother", ("backalley_shop", "normal_commercial", "food_court"), 5, 1.0, 0.9, 1, (COMMON_ORDERS[4], COMMON_ORDERS[0]), 8),
    CustomerProfile("customer_12_simple_casual_portrait", "무뚝뚝한 학생", "student", "customer_12_simple_casual_portrait", ("school_zone", "station_area"), 3, 1.0, 1.0, 0, (COMMON_ORDERS[1], COMMON_ORDERS[3]), 8),
    CustomerProfile("customer_13_casual_cream_portrait", "캐주얼한 번화가 손님", "trendy", "customer_13_casual_cream_portrait", ("downtown_first_floor", "food_court"), 3, 1.2, 1.1, 1, (COMMON_ORDERS[2], COMMON_ORDERS[5]), 8),
    CustomerProfile("customer_14_relaxed_everyday_man", "느슨한 넥타이 손님", "worker", "customer_14_relaxed_everyday_man", ("office_district", "station_area"), 3, 1.1, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[1]), 8),
    CustomerProfile("customer_15_warm_smile_man", "따뜻한 미소의 남성", "regular", "customer_15_warm_smile_man", ("normal_commercial", "food_court"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[2]), 7),
    CustomerProfile("customer_16_cheerful_casual_girl", "활기찬 운동 손님", "student", "customer_16_cheerful_casual_girl", ("school_zone", "food_court"), 3, 1.0, 1.0, 1, (COMMON_ORDERS[1], COMMON_ORDERS[2]), 8),
    CustomerProfile("customer_17_cute_smile_character", "나비 팬", "trendy", "customer_17_cute_smile_character", ("downtown_first_floor", "food_court", "luxury_restaurant"), 4, 1.3, 1.1, 2, (COMMON_ORDERS[7], COMMON_ORDERS[2]), 7),
    CustomerProfile("customer_18_warm_smile_woman", "따뜻한 안경 여성", "regular", "customer_18_warm_smile_woman", ("normal_commercial", "office_district"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[4]), 7),
    CustomerProfile("customer_19_tired_expression", "수상한 손님", "strange", "customer_19_tired_expression", ("backalley_shop", "downtown_first_floor"), 3, 1.2, 1.2, 1, (COMMON_ORDERS[2], COMMON_ORDERS[5]), 6),
    CustomerProfile("customer_20_kind_casual_woman", "수다쟁이 손님", "regular", "customer_20_kind_casual_woman", ("normal_commercial", "food_court"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[2]), 7),
    CustomerProfile("customer_21_cardigan_girl", "조용한 헤드폰 손님", "student", "customer_21_cardigan_girl", ("school_zone", "normal_commercial"), 4, 1.0, 1.0, 1, (COMMON_ORDERS[2], COMMON_ORDERS[3]), 7),
    CustomerProfile("customer_22_young_delivery_worker", "젊은 배달원", "worker", "customer_22_young_delivery_worker", ("station_area", "office_district"), 2, 1.0, 1.1, 1, (COMMON_ORDERS[1], COMMON_ORDERS[3]), 7),
    CustomerProfile("customer_23_friendly_grandfather", "친근한 할아버지", "regular", "customer_23_friendly_grandfather", ("backalley_shop", "food_court"), 5, 1.0, 0.9, 1, (COMMON_ORDERS[4], COMMON_ORDERS[0]), 7),
    CustomerProfile("customer_24_streetwear_portrait", "스트리트웨어 손님", "trendy", "customer_24_streetwear_portrait", ("downtown_first_floor", "station_area"), 3, 1.2, 1.1, 1, (COMMON_ORDERS[2], COMMON_ORDERS[5]), 7),
    CustomerProfile("customer_25_school_teacher", "학교 선생님", "teacher", "customer_18_warm_smile_woman", ("school_zone", "normal_commercial"), 4, 1.05, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[2], COMMON_ORDERS[4]), 6),
    CustomerProfile("customer_26_parent_guardian", "학부모 손님", "parent", "customer_15_warm_smile_man", ("school_zone", "food_court"), 4, 1.05, 1.0, 1, (COMMON_ORDERS[0], COMMON_ORDERS[2], COMMON_ORDERS[3]), 6),
    CustomerProfile("customer_27_academy_instructor", "학원 강사", "teacher", "customer_14_relaxed_everyday_man", ("school_zone", "office_district"), 3, 1.1, 1.0, 1, (COMMON_ORDERS[1], COMMON_ORDERS[0], COMMON_ORDERS[4]), 5),
)

RESTAURANT_DIALOGUES: dict[str, tuple[str, ...]] = {
    "main_greeting": ("오늘도 장사를 해볼까요? 망하지만 않으면 경험이에요.", "어서 오세요. 나비식당은 오늘도 어떻게든 열었습니다."),
    "customer_arrival": ("손님이 왔어요. 나비가 괜히 긴장되네요.", "새 손님입니다. 이번엔 접시가 살아남길 바라요."),
    "order_repeat": ("다시 들어볼게요. 손님 말투가 약간 수수께끼였거든요.",),
    "recipe_select": ("요리 선택 시간이에요. 손님 표정을 보고 찍으면 안 됩니다. 아마도요.",),
    "very_satisfied": ("손님 표정이 좋아요. 이건 살아남은 주문이에요.",),
    "satisfied": ("무난하게 성공이에요. 나비가 접시를 조용히 자랑하겠습니다.",),
    "neutral": ("틀리진 않았는데 손님 눈빛이 살짝 고민 중이에요.",),
    "unsatisfied": ("으음... 손님 표정이 접시보다 차가워요.",),
    "shop_close": ("오늘도 식당이 무너지진 않았어요. 이 정도면 성공 아닐까요?", "손님들이 살아서 나갔어요. 나비식당 기준으로는 꽤 좋은 하루예요."),
    "property_bought": ("새 가게예요. 이번엔 손님들이 문을 열고 들어와 주겠죠?",),
    "property_fail": ("좋은 자리도 나비코인이 있어야 말을 듣네요.",),
    "furniture_buy_success": ("의자가 생겼어요. 이제 손님이 서서 화내진 않겠네요.",),
    "furniture_buy_fail": ("나비코인이 부족해요. 가구도 돈 냄새를 맡나 봐요.",),
    "furniture_place_success": ("가게가 조금 식당처럼 보이네요. 전에는 창고랑 협상이 필요했거든요.",),
    "low_rating": ("평점이 낮아요. 나비가 접시를 닦으며 현실을 받아들이는 중입니다.",),
    "high_rating": ("오...이 정도면 손님들이 일부러 찾아올지도 몰라요.",),
    "render_fail": ("이미지가 잠깐 도망갔어요. 그래도 장사는 계속합니다.",),
    "no_recipe": ("아직 고를 수 있는 음식이 없어요. 이건 식당 입장에서 꽤 심각합니다.",),
    "other_user_interaction": ("이 식당은 다른 사람의 식당이에요. 남의 가게 계산대는 만지면 안 돼요.",),
    "timeout": ("가게 문이 잠깐 닫혔어요. 버튼도 쉬는 시간이 필요하대요.",),
}


def navi_dialogue(category: str) -> str:
    return random.choice(RESTAURANT_DIALOGUES.get(category) or ("나비가 잠깐 접시를 바라보고 있어요.",))


def property_grade_at_least(current: str, required: str) -> bool:
    return PROPERTY_GRADE_ORDER.get(current, 0) >= PROPERTY_GRADE_ORDER.get(required, 0)


def property_def(property_id: str | None) -> RestaurantProperty:
    return PROPERTIES.get(str(property_id or DEFAULT_PROPERTY_ID), PROPERTIES[DEFAULT_PROPERTY_ID])


def furniture_def(furniture_id: str | None) -> FurnitureDef | None:
    return FURNITURE.get(str(furniture_id)) if furniture_id else None


def recipe_tags(recipe: Any) -> set[str]:
    recipe_id = str(getattr(recipe, "recipe_id", ""))
    display_name = str(getattr(recipe, "display_name", ""))
    tier = str(getattr(recipe, "tier", ""))
    required = dict(getattr(recipe, "required_items", {}) or {})
    tags: set[str] = set()
    if any(item in required for item in ("rice", "bread", "noodles", "meat", "pork", "chicken", "fish", "shrimp", "egg_fried_rice_item")):
        tags.add("meal")
    if any(item in required for item in ("egg", "rice")) or "계란" in display_name:
        tags.add("egg")
    if any(item in required for item in ("rice", "egg_fried_rice_item")) or "밥" in display_name:
        tags.add("rice")
    if any(item in required for item in ("sugar", "honey", "chocolate_chips", "strawberry")):
        tags.update({"sweet", "dessert"})
    if recipe_id in {"cookie", "navi_sincerity_cookie", "navi_birthday_cake", "pancake", "golden_pancake"}:
        tags.update({"dessert", "sweet"})
    if recipe_id in {"ramen", "kimchi_ramen", "tonkotsu_ramen", "soup", "mushroom_soup", "maratang"}:
        tags.update({"soup", "warm", "meal"})
    if recipe_id in {"fried_egg", "toast", "bacon", "onigiri", "cabbage_salad"}:
        tags.update({"simple", "cheap", "fast"})
    if recipe_id in {
        "egg_fried_rice",
        "garlic_fried_rice",
        "kimchi_fried_rice",
        "shrimp_fried_rice",
        "omurice",
        "chicken_sandwich",
        "chicken_salad",
        "grilled_fish",
        "shrimp_tomato_pasta",
        "tonkatsu",
        "tonkatsu_curry",
    }:
        tags.update({"warm", "meal"})
    if recipe_id in {"salad", "cabbage_salad", "chicken_salad"}:
        tags.add("fresh")
    if recipe_id in {"navi_sincerity_cookie", "navi_lunch_box", "navi_dad_special_set", "navi_birthday_cake"}:
        tags.update({"navi", "special"})
    if tier in {"2", "3", "고급", "특수"}:
        tags.add("advanced")
    if "mala" in recipe_id or "kimchi" in recipe_id or "마라" in display_name or "김치" in display_name:
        tags.add("spicy")
    return tags


def choose_customer(property_id: str, reputation: int, rating: float, effects: dict[str, float]) -> CustomerProfile:
    prop = property_def(property_id)
    weighted: list[CustomerProfile] = []
    for customer in CUSTOMERS:
        if not customer.is_enabled:
            continue
        if property_id not in customer.main_properties:
            continue
        weight = customer.appearance_weight + prop.customer_type_weights.get(customer.customer_type, 0)
        if customer.customer_type == "picky":
            weight += round(float(effects.get("picky_rate", 0.0)) * 100)
        if any(order.order_type == "navi_special" for order in customer.order_pool):
            weight += round(float(effects.get("navi_guest_rate", 0.0)) * 100)
        if reputation < 80 and customer.customer_type in {"picky", "trendy"}:
            weight = max(1, weight // 2)
        if rating < 3.0 and customer.customer_type == "picky":
            weight = max(1, weight // 3)
        weighted.extend([customer] * max(1, weight))
    return random.choice(weighted or list(CUSTOMERS))


def order_can_be_satisfied_by_recipe(order: CustomerOrderProfile, recipe: Any) -> bool:
    tags = recipe_tags(recipe)
    rules = order.rules
    exact_recipe_ids = set(rules.exact_recipe_ids)
    if exact_recipe_ids and str(getattr(recipe, "recipe_id", "")) not in exact_recipe_ids:
        return False
    if set(rules.required_tags) - tags:
        return False
    if (set(rules.banned_tags) | set(rules.forbidden_tags)) & tags:
        return False
    return True


def order_can_be_satisfied(order: CustomerOrderProfile, recipes: list[Any] | tuple[Any, ...]) -> bool:
    return any(order_can_be_satisfied_by_recipe(order, recipe) for recipe in recipes)


def choose_order(
    customer: CustomerProfile,
    property_id: str,
    reputation: int,
    available_recipes: list[Any] | tuple[Any, ...] | None = None,
) -> CustomerOrderProfile:
    prop = property_def(property_id)
    candidates = [order for order in customer.order_pool if reputation >= order.min_reputation]
    if not candidates:
        candidates = list(customer.order_pool)
    if available_recipes is not None:
        compatible = [order for order in candidates if order_can_be_satisfied(order, available_recipes)]
        if compatible:
            candidates = compatible
        else:
            common_candidates = [order for order in COMMON_ORDERS if reputation >= order.min_reputation]
            common_compatible = [order for order in common_candidates if order_can_be_satisfied(order, available_recipes)]
            if common_compatible:
                candidates = common_compatible
    weighted: list[CustomerOrderProfile] = []
    for order in candidates:
        weighted.extend([order] * max(1, 10 + prop.order_type_weights.get(order.order_type, 0)))
    return random.choice(weighted or list(COMMON_ORDERS))


def evaluate_order(
    *,
    recipe: Any,
    order: ActiveCustomerOrder,
    property_id: str,
    effects: dict[str, float],
) -> SatisfactionResult:
    tags = recipe_tags(recipe)
    rules = order.order.rules
    required = set(rules.required_tags)
    preferred = set(rules.preferred_tags)
    banned = set(rules.banned_tags) | set(rules.forbidden_tags)
    missing_required = tuple(sorted(required - tags))
    banned_hits = tuple(sorted(banned & tags))
    matched = tuple(sorted((required | preferred) & tags))
    exact_match = str(getattr(recipe, "recipe_id", "")) in set(rules.exact_recipe_ids)

    score = 50
    if exact_match:
        score += 35
    score += 18 * len(required & tags)
    score += 8 * len(preferred & tags)
    score -= 30 * len(missing_required)
    score -= 25 * len(banned_hits)
    score = max(0, min(100, score))

    prop = property_def(property_id)
    if missing_required or banned_hits:
        satisfaction = "불만족"
        multiplier = 0.15
        rep_delta = -1
        rating_delta = -0.10 * prop.rating_risk_multiplier * order.customer.rating_impact
    elif score >= 85:
        satisfaction = "매우 만족"
        multiplier = 1.25
        rep_delta = 3 + order.customer.reputation_reward
        rating_delta = 0.07 * order.customer.rating_impact
    elif score >= 65:
        satisfaction = "만족"
        multiplier = 1.0
        rep_delta = 2
        rating_delta = 0.03 * order.customer.rating_impact
    else:
        satisfaction = "미묘"
        multiplier = 0.55
        rep_delta = 0
        rating_delta = -0.02 * prop.rating_risk_multiplier * order.customer.rating_impact

    if rating_delta < 0:
        rating_delta *= max(0.0, 1.0 - float(effects.get("rating_loss_reduction", 0.0)))
    if rating_delta > 0:
        rating_delta *= 1.0 + float(effects.get("rating_gain", 0.0))
    revenue_bonus = float(effects.get("revenue_bonus", 0.0))
    school_zone_bonus = ""
    if property_id == "school_zone" and satisfaction in {"매우 만족", "만족"}:
        if order.customer.customer_type == "student":
            multiplier *= 1.15
            school_zone_bonus = "학교 앞 학생 손님 보너스가 붙었어요."
        if order.order.order_type == "fast_order":
            multiplier *= 1.10
            school_zone_bonus = "학교 앞 빠른 회전 보너스가 붙었어요." if not school_zone_bonus else school_zone_bonus + " 빠른 회전도 좋았고요."
    base_reward = max(2, int(getattr(recipe, "base_flour_reward", 4) or 4) * 10)
    reward = max(1, round(base_reward * multiplier * prop.revenue_multiplier * order.customer.tip_multiplier * (1 + revenue_bonus)))
    note = {
        "매우 만족": "손님이 꽤 감동한 눈치예요.",
        "만족": "주문 의도는 잘 맞췄어요.",
        "미묘": "틀리진 않았는데 뭔가 아쉬워요.",
        "불만족": "주문 조건을 크게 벗어났어요.",
    }[satisfaction]
    if school_zone_bonus:
        note = f"{note}\n{school_zone_bonus}"
    return SatisfactionResult(satisfaction, score, reward, rep_delta, rating_delta, matched, missing_required, banned_hits, note)
