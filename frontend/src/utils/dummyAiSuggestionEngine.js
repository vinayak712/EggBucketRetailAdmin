import {
  getDateStringInTimeZone,
  computeDeliveryGap,
  normalizeDeliveryGap,
  getDeliveryGapNumber,
} from "./aiSuggestionEngine.js";

// --- Helper Functions ---

/**
 * Gets the delivery status for a specific date from customer's last8Days
 * Returns: "pending" | "checked" | "delivered"
 */
const getDeliveryStatusForDate = (customer, dateStr) => {
  const last8Days = customer?.last8Days || {};
  const entry = last8Days[dateStr];

  if (!entry) return "pending";

  const apiStatus = String(
    typeof entry === "string" ? entry : entry?.status || entry?.type || "",
  )
    .trim()
    .toLowerCase();

  if (apiStatus === "delivered") return "delivered";

  const checkedStatuses = [
    "checked",
    "reached",
    "price_mismatch",
    "shop_closed",
    "stock_available",
    "other_vendor",
    "confirmed_tomorrow",
  ];

  if (checkedStatuses.includes(apiStatus)) return "checked";

  return "pending";
};

// --- Buying Pattern Functions ---

const everyDayBuyer = (customer) => {
  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "Customer follows an Every Day buying pattern.",
  };
};

const alternateDayBuyer = (customer) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getDateStringInTimeZone(yesterday, "Asia/Kolkata");
  const yesterdayStatus = getDeliveryStatusForDate(customer, yesterdayStr);

  if (yesterdayStatus === "delivered") {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: "Delivery received yesterday. Customer follows an Alternate Day buying pattern, so skip today.",
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "No delivery received yesterday. Customer follows an Alternate Day buying pattern, so send today.",
  };
};

const weekdayBuyer = (targetWeekdayName) => {
  const today = new Date();
  const todayWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(today);

  if (todayWeekdayName === targetWeekdayName) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 100,
      reason: `Today matches the customer's scheduled buying day (${targetWeekdayName}).`,
    };
  }

  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: `Today is ${todayWeekdayName}, not their scheduled buying day (${targetWeekdayName}).`,
  };
};

const exceptWeekdayBuyer = (targetWeekdayName) => {
  const today = new Date();
  const todayWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(today);

  if (todayWeekdayName === targetWeekdayName) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: `${targetWeekdayName} Exception: Today is ${targetWeekdayName}, skipping delivery.`,
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: `${targetWeekdayName} Exception: Today is not ${targetWeekdayName}, proceeding with delivery.`,
  };
};

const lastWeekdayBuyer = (customer) => {
  let latestDeliveryReference = null;
  const today = new Date();

  // Search from 1 to 14 days ago to find the absolute most recent delivery
  for (let i = 1; i <= 14; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, dateStr) === "delivered") {
      latestDeliveryReference = pastDate;
      break;
    }
  }

  if (!latestDeliveryReference) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 50,
      reason: "No delivery found in the last 14 days to determine the pattern.",
    };
  }

  const lastDeliveredDay = latestDeliveryReference.getDay(); // 0 (Sun) to 6 (Sat)
  const todayDay = today.getDay(); // 0 to 6

  // Check if today is lastDeliveredDay, lastDeliveredDay - 1, or lastDeliveredDay + 1 (with wrap around)
  const isMatch =
    todayDay === lastDeliveredDay ||
    todayDay === (lastDeliveredDay + 1) % 7 ||
    todayDay === (lastDeliveredDay + 6) % 7; // +6 is same as -1 with modulo

  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(latestDeliveryReference);

  if (isMatch) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is within +/- 1 day of that.`,
    };
  } else {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is not within +/- 1 day of that.`,
    };
  }
};

const lastAlternateWeekdayBuyer = (customer) => {
  let latestDeliveryReference = null;
  const today = new Date();

  // Search from 1 to 14 days ago to find the absolute most recent delivery
  for (let i = 1; i <= 14; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, dateStr) === "delivered") {
      latestDeliveryReference = pastDate;
      break;
    }
  }

  if (!latestDeliveryReference) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 50,
      reason: "No delivery found in the last 14 days to determine the pattern.",
    };
  }

  const lastDeliveredDay = latestDeliveryReference.getDay(); // 0 (Sun) to 6 (Sat)
  const todayDay = today.getDay(); // 0 to 6

  // Check if today is lastDeliveredDay, lastDeliveredDay - 2, or lastDeliveredDay + 2
  const isMatch =
    todayDay === lastDeliveredDay ||
    todayDay === (lastDeliveredDay + 2) % 7 ||
    todayDay === (lastDeliveredDay + 5) % 7; // +5 is same as -2 with modulo

  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(latestDeliveryReference);

  if (isMatch) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is within +/- 2 days of that.`,
    };
  } else {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is not within +/- 2 days of that.`,
    };
  }
};

const onCallLogicBuyer = (customer) => {
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: "Customer is an On Call Logic Buyer, so always suggest OFF.",
  };
};

const monthEndException = (customer) => {
  const todayStr = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const parts = todayStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const lastDayOfThisMonth = new Date(year, month, 0).getDate();
  const isMonthEnd = day === lastDayOfThisMonth;

  if (isMonthEnd) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: `Month-End Exception: Today is the last day of the month (${todayStr}), skipping delivery.`,
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: `Month-End Exception: Today is not the last day of the month, proceeding with delivery.`,
  };
};

const twoAlternateDayBuyer = (customer) => {
  const today = new Date();
  for (let i = 1; i <= 2; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const pastStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, pastStr) === "delivered") {
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: `Delivery received ${i === 1 ? "yesterday" : "2 days ago"}. 2 Alternate Day pattern, skip today.`,
      };
    }
  }
  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "No delivery in the last 2 days. 2 Alternate Day pattern, send today.",
  };
};

const resolveCustomerDeliveryGapNumber = (customer) => {
  if (typeof customer?.deliveryGapNumber === "number") {
    return customer.deliveryGapNumber;
  }
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
  const deliveryGapStr = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);
  return getDeliveryGapNumber(deliveryGapStr);
};

const weeklyBuyer = (customer) => {
  const gap = resolveCustomerDeliveryGapNumber(customer);
  if (gap > 5) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 100,
      reason: `Delivery gap is G${gap} (> G5), send today.`,
    };
  }
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: `Delivery gap is G${gap} (<= G5), skip today.`,
  };
};

const fortnightBuyer = (customer) => {
  const gap = resolveCustomerDeliveryGapNumber(customer);
  if (gap > 10) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 100,
      reason: `Delivery gap is G${gap} (> G10), send today.`,
    };
  }
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: `Delivery gap is G${gap} (<= G10), skip today.`,
  };
};

const churnBuyer = (customer) => {
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: "Customer is flagged as Churn, so always suggest OFF.",
  };
};

// --- Main Engine Logic Lists ---

export const LOGIC_1_PURCHASE_CADENCE = [
  "Learning",
  "Everyday",
  "Alternate Day",
  "2 Alternate Day",
  "Weekly",
  "For Night",
  "No Pattern",
];

export const LOGIC_2_CUSTOMER_STATE = [
  "Onboarding",
  "Active",
  "At Risk",
  "Reactivating",
  "Need Credit",
  "Pricing Issue",
  "Other Vendor",
  "On Call",
  "Ceased Operations Temporarily",
  "Ceased Operations Permanently",
];

export const LOGIC_3_PURCHASE_INTENT = [
  "Unknown",
  "Stable Purchase",
  "Growing Purchase",
  "Declining Purchase",
  "Variable Purchase",
];

export const DEFAULT_LOGIC_1 = LOGIC_1_PURCHASE_CADENCE[0];
export const DEFAULT_LOGIC_2 = LOGIC_2_CUSTOMER_STATE[0];
export const DEFAULT_LOGIC_3 = LOGIC_3_PURCHASE_INTENT[0];

export const BUYING_PATTERNS = [
  ...LOGIC_1_PURCHASE_CADENCE,
  ...LOGIC_2_CUSTOMER_STATE,
  ...LOGIC_3_PURCHASE_INTENT,
];

export const resolveCleanPattern = (saved, validList, defaultVal) => {
  if (!saved) return defaultVal;
  if (validList.includes(saved)) return saved;
  const stripped = String(saved).replace(/\s*\(.*?\)/g, "").trim();
  if (validList.includes(stripped)) return stripped;

  // Case-insensitive match
  const lower = stripped.toLowerCase();
  const matched = validList.find((item) => item.toLowerCase() === lower);
  if (matched) return matched;

  // For Night aliases
  if (
    validList.includes("For Night") &&
    ["fortnight", "fort night", "for night", "fort-night"].includes(lower)
  ) {
    return "For Night";
  }

  // Everyday aliases
  if (validList.includes("Everyday") && lower === "every day") {
    return "Everyday";
  }

  return defaultVal;
};

const evaluatePattern = (customer, pattern) => {
  switch (pattern) {
    // --- Logic 1: Purchase Cadence ---
    case "Learning":
    case "Learning (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Cadence: Learning (Always ON)",
      };
    case "Everyday":
    case "Everyday (Always ON)":
    case "Every Day Buyer":
      return everyDayBuyer(customer);
    case "Alternate Day":
    case "Alternate Day Buyer":
      return alternateDayBuyer(customer);
    case "2 Alternate Day":
      return twoAlternateDayBuyer(customer);
    case "Weekly":
    case "Weekly (Delivery Gap greater then G5)":
    case "Weekly ( Delivery Gap greater then G5)":
    case "Weekly (Delivery Gap greater than G5)":
    case "Weekly (Delivery Gap > G5)":
      return weeklyBuyer(customer);
    case "For Night":
    case "Fort Night":
    case "FortNight":
    case "Fortnight":
    case "FortNight (Delivery Gap greater then G10)":
    case "FortNight ( Delivery Gap greater then G10)":
    case "FortNight (Delivery Gap greater than G10)":
    case "FortNight (Delivery Gap > G10)":
    case "For Night (Delivery Gap greater then G10)":
      return fortnightBuyer(customer);
    case "No Pattern":
    case "No Pattern (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Cadence: No Pattern (Always ON)",
      };

    // --- Logic 2: Customer State ---
    case "Onboarding":
    case "Onboarding (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer State: Onboarding (Always ON)",
      };
    case "Active":
    case "Active (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer State: Active (Always ON)",
      };
    case "At Risk":
    case "At Risk (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer State: At Risk (Always ON)",
      };
    case "Reactivating":
    case "Reactivating (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer State: Reactivating (Always ON)",
      };
    case "Need Credit":
    case "Need Credit (Always OFF)":
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: "Customer State: Need Credit (Always OFF)",
      };
    case "Pricing Issue":
    case "Pricing Issue (Always ON)":
    case "Pricing Issue(Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer State: Pricing Issue (Always ON)",
      };
    case "Other Vendor":
    case "Other Vendor (Always OFF)":
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: "Customer State: Other Vendor (Always OFF)",
      };
    case "On Call":
    case "On Call (Always OFF)":
    case "On Call Logic Buyer":
      return onCallLogicBuyer(customer);
    case "Ceased Operations Temporarily":
    case "Ceased Operations Temporarily (Always OFF)":
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: "Customer State: Ceased Operations Temporarily (Always OFF)",
      };
    case "Ceased Operations Permanently":
    case "Ceased Operations Permanently (Always OFF)":
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: "Customer State: Ceased Operations Permanently (Always OFF)",
      };

    // --- Logic 3: Purchase Intent ---
    case "Unknown":
    case "Unknown (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Intent: Unknown (Always ON)",
      };
    case "Stable Purchase":
    case "Stable Purchase (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Intent: Stable Purchase (Always ON)",
      };
    case "Growing Purchase":
    case "Growing Purchase (Always On)":
    case "Growing Purchase (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Intent: Growing Purchase (Always ON)",
      };
    case "Declining Purchase":
    case "Declining Purchase (Always OFF)":
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 100,
        reason: "Purchase Intent: Declining Purchase (Always OFF)",
      };
    case "Variable Purchase":
    case "Variable Purchase (Always ON)":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Purchase Intent: Variable Purchase (Always ON)",
      };

    // Legacy fallbacks
    case "Last WeekDay":
    case "Last Weekday Buyer":
      return lastWeekdayBuyer(customer);
    case "Churn (Always OFF)":
    case "Churn":
      return churnBuyer(customer);
    case "Last Alternate Weekday Buyer":
      return lastAlternateWeekdayBuyer(customer);
    case "Month-End Exception":
      return monthEndException(customer);
    case "UnAssigned":
    default:
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Defaulting to ON.",
      };
  }
};

export const generateDummyAISuggestion = (
  customer,
  primaryPattern = DEFAULT_LOGIC_1,
  secondaryPattern = DEFAULT_LOGIC_2,
  tertiaryPattern = DEFAULT_LOGIC_3
) => {
  const skipConfig = customer?.skipConfig || {};

  // RULE: Skip config active (Applies across all patterns)
  if (skipConfig?.days > 0) {
    return {
      suggestion: "KEEP_OFF_TODAY",
      confidence: 100,
      score: 0,
      reason: "Customer currently in skip mode.",
    };
  }

  const primaryResult = evaluatePattern(customer, primaryPattern);
  const secondaryResult = evaluatePattern(customer, secondaryPattern);
  const tertiaryResult = evaluatePattern(customer, tertiaryPattern);

  const isPrimaryOn = primaryResult.suggestion.includes("ON");
  const isSecondaryOn = secondaryResult.suggestion.includes("ON");
  const isTertiaryOn = tertiaryResult.suggestion.includes("ON");

  if (isPrimaryOn && isSecondaryOn && isTertiaryOn) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: Math.min(primaryResult.confidence, secondaryResult.confidence, tertiaryResult.confidence),
      reason: `Purchase Cadence: ${primaryResult.reason} | Customer State: ${secondaryResult.reason} | Purchase Intent: ${tertiaryResult.reason}`,
    };
  } else {
    const offLogics = [];
    if (!isPrimaryOn) offLogics.push(`Purchase Cadence: ${primaryResult.reason}`);
    if (!isSecondaryOn) offLogics.push(`Customer State: ${secondaryResult.reason}`);
    if (!isTertiaryOn) offLogics.push(`Purchase Intent: ${tertiaryResult.reason}`);
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: Math.max(primaryResult.confidence, secondaryResult.confidence, tertiaryResult.confidence),
      reason: `OFF because - ${offLogics.join(" | ")}`,
    };
  }
};
