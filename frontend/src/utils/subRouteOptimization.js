import {
  computeCurrentCategory,
  computeDeliveryGap,
  normalizeDeliveryGap,
  getDeliveryGapNumber,
  normalizePeakFrequency,
} from "./aiSuggestionEngine";

export const extractParentRoute = (routeName) => {
  if (!routeName) return "Other";
  const trimmed = routeName.trim();
  const match = trimmed.match(/^(R\d+)([A-Za-z])?(.*)$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  const parts = trimmed.split(/[\s-]+/);
  if (parts.length > 0 && parts[0]) {
    return parts[0].toUpperCase();
  }
  return trimmed;
};

/**
 * Determine recommended tier (A, B, C, D) strictly based on customer metrics:
 * - Route 1 A: Current Category D4 to D5 customers Only
 * - Route 1 B: Current Category D1 to D3 Customers Only
 * - Route 1 C: Delivery Gap G7 to G10 Customers Only
 * - Route 1 D: Delivery Gap G10+ Customers Only
 */
export function evaluateSubRouteTier(customer, todayDate) {
  const rawGap = computeDeliveryGap(customer?.last8Days, todayDate);
  const gapStr = normalizeDeliveryGap(rawGap);
  const gapNum = getDeliveryGapNumber(gapStr);

  const rawCategory = computeCurrentCategory(customer?.last8Days);
  const categoryStr = normalizePeakFrequency(rawCategory);
  const dNum = parseInt(categoryStr.replace("D", ""), 10) || 0;

  // Rule 1: Delivery Gap G10+ -> Route D Only (strictly gap > 10)
  if (gapNum > 10) {
    return {
      tier: "D",
      tierLabel: "Route D (Gap G10+)",
      reason: `Delivery Gap is ${gapStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 2: Delivery Gap G7 to G10 -> Route C Only (7 <= gap <= 10)
  if (gapNum >= 7 && gapNum <= 10) {
    return {
      tier: "C",
      tierLabel: "Route C (Gap G7-G10)",
      reason: `Delivery Gap is ${gapStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 3: Current Category D4 to D5 (and D6, D7) -> Route A Only
  if (dNum >= 4) {
    return {
      tier: "A",
      tierLabel: "Route A (Current Category D4-D5)",
      reason: `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 4: Current Category D1 to D3 -> Route B Only
  if (dNum >= 1 && dNum <= 3) {
    return {
      tier: "B",
      tierLabel: "Route B (Current Category D1-D3)",
      reason: `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // If none of the conditions match (e.g. D0 with gap < 7), customer does not move
  return null;
}

/**
 * Resolve target sub-route strictly within the same parent route
 */
export function resolveTargetSubRoute(customer, allRoutes, todayDate) {
  const currentRouteName = (customer.route || "").trim();
  if (!currentRouteName) return null;

  const parentKey = extractParentRoute(currentRouteName);
  if (!parentKey || parentKey === "Other") return null;

  // Strictly filter routes belonging to the EXACT SAME parent route
  const parentSubRoutes = allRoutes.filter((r) => {
    const rName = typeof r === "string" ? r : r.name;
    return extractParentRoute(rName) === parentKey;
  });

  // If there is only 1 sub-route or none under this parent, cannot reassign
  if (parentSubRoutes.length <= 1) {
    return null;
  }

  const evaluation = evaluateSubRouteTier(customer, todayDate);
  if (!evaluation) {
    return null;
  }
  const targetLetter = evaluation.tier; // "A", "B", "C", or "D"

  // Find the sub-route belonging to this parent that has the target letter
  // Pattern: starts with parentKey + targetLetter, e.g. R001A, R001B, R001C, R001D
  const matchedRouteObj = parentSubRoutes.find((r) => {
    const rName = (typeof r === "string" ? r : r.name).trim().toUpperCase();
    const regex = new RegExp(`^${parentKey}${targetLetter}`, "i");
    return regex.test(rName);
  });

  if (!matchedRouteObj) {
    // If the parent route doesn't have a sub-route with this tier (e.g. only has A and B, but target is D),
    // do not reassign to a non-existent or wrong parent route!
    return null;
  }

  const matchedRouteName = typeof matchedRouteObj === "string" ? matchedRouteObj : matchedRouteObj.name;

  return {
    customerId: customer.id,
    customerName: customer.shopName || customer.name || "Customer",
    phone: customer.phone || "",
    parentKey,
    currentRoute: currentRouteName,
    targetRoute: matchedRouteName,
    isChanged: currentRouteName !== matchedRouteName,
    ...evaluation,
  };
}

/**
 * Compute all pending sub-route reassignments across all customers
 */
export function computeSubRouteReassignments(customers, allRoutes, todayDate) {
  const allAnalyses = [];
  const pendingChanges = [];

  customers.forEach((customer) => {
    const result = resolveTargetSubRoute(customer, allRoutes, todayDate);
    if (!result) return;

    allAnalyses.push(result);
    if (result.isChanged) {
      pendingChanges.push(result);
    }
  });

  const stats = {
    totalEvaluated: allAnalyses.length,
    totalChanges: pendingChanges.length,
    toTierA: pendingChanges.filter((c) => c.tier === "A").length,
    toTierB: pendingChanges.filter((c) => c.tier === "B").length,
    toTierC: pendingChanges.filter((c) => c.tier === "C").length,
    toTierD: pendingChanges.filter((c) => c.tier === "D").length,
  };

  return {
    stats,
    pendingChanges,
    allAnalyses,
  };
}
