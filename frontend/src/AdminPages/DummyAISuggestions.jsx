import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import {
  computeDeliveryGap,
  computeCurrentCategory,
  getCurrentCategoryNumber,
  getDateStringInTimeZone,
  getDeliveryGapNumber,
  getPeakFrequencyNumber,
  getTodayEffectiveStatus,
  getTodayDeliveryStatus,
  normalizeDeliveryGap,
  resolvePeakFrequency,
} from "../utils/aiSuggestionEngine";
import {
  generateDummyAISuggestion,
  BUYING_PATTERNS,
  LOGIC_1_PURCHASE_CADENCE,
  LOGIC_2_CUSTOMER_STATE,
  LOGIC_3_PURCHASE_INTENT,
  DEFAULT_LOGIC_1,
  DEFAULT_LOGIC_2,
  DEFAULT_LOGIC_3,
  resolveCleanPattern,
} from "../utils/dummyAiSuggestionEngine";
import {
  getCachedUserInfo,
  patchCachedUserInfoCustomer,
} from "../utils/customerInfoClientCache";
import { exportToExcel } from "../utils/excelExport";
import DummyAISuggestionTable from "../components/DummyAISuggestionTable";

const normalizePotential = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T1";

  const normalized = raw.replace(/T\s*(\d+)/, "T$1");
  const match = normalized.match(/^T(\d+)$/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) && num > 0 ? `T${num}` : "T1";
  }

  return "T1";
};

const getPotentialNumber = (value) => {
  const potential = normalizePotential(value);
  const n = Number(potential.slice(1));
  return Number.isFinite(n) && n > 0 ? n : 1;
};



const compareByName = (a, b) =>
  (a.customer.name || "").localeCompare(b.customer.name || "");

const DummyAISuggestions = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [routePriorityMap, setRoutePriorityMap] = useState({});
  const [businessTypeFilter, setBusinessTypeFilter] = useState("ALL");
  const [businessTypes, setBusinessTypes] = useState([]);
  const [suggestionFilterOption, setSuggestionFilterOption] = useState("ALL");
  const [patternFilter, setPatternFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [routeFilter, setRouteFilter] = useState([]);
  const [activeGapTab, setActiveGapTab] = useState("ALL");
  const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
  const routeDropdownRef = useRef(null);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);
  const priorityDropdownRef = useRef(null);
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (routeDropdownRef.current && !routeDropdownRef.current.contains(event.target)) {
        setIsRouteDropdownOpen(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target)) {
        setIsPriorityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // Default sorting: TOGGLE (ON FIRST) as soon as page opens
  const [sortOption, setSortOption] = useState("TOGGLE_ON_FIRST");

  // INDIVIDUAL PATTERN MAPPING: { customerId: 'Every Day Buyer' }
  const [rowPatterns, setRowPatterns] = useState(() => {
    try {
      const saved = localStorage.getItem("dummyAIPatterns");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [rowSecondaryPatterns, setRowSecondaryPatterns] = useState(() => {
    try {
      const saved = localStorage.getItem("dummyAISecondaryPatterns");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handlePatternChange = useCallback((customerId, newPattern) => {
    setRowPatterns((prev) => {
      const updated = { ...prev, [customerId]: newPattern };
      setTimeout(() => {
        try {
          localStorage.setItem("dummyAIPatterns", JSON.stringify(updated));
        } catch {
          // ignore storage write errors
        }
      }, 0);
      return updated;
    });
  }, []);

  const handleSecondaryPatternChange = useCallback((customerId, newPattern) => {
    setRowSecondaryPatterns((prev) => {
      const updated = { ...prev, [customerId]: newPattern };
      setTimeout(() => {
        try {
          localStorage.setItem("dummyAISecondaryPatterns", JSON.stringify(updated));
        } catch {
          // ignore storage write errors
        }
      }, 0);
      return updated;
    });
  }, []);

  const [rowTertiaryPatterns, setRowTertiaryPatterns] = useState(() => {
    try {
      const saved = localStorage.getItem("dummyAITertiaryPatterns");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleTertiaryPatternChange = useCallback((customerId, newPattern) => {
    setRowTertiaryPatterns((prev) => {
      const updated = { ...prev, [customerId]: newPattern };
      setTimeout(() => {
        try {
          localStorage.setItem("dummyAITertiaryPatterns", JSON.stringify(updated));
        } catch {
          // ignore storage write errors
        }
      }, 0);
      return updated;
    });
  }, []);

  const [currentPage, setCurrentPage] = useState(1);
  const [updatingSuggestionId, setUpdatingSuggestionId] = useState(null);
  const [updatingScheduleId, setUpdatingScheduleId] = useState(null);
  const PAGE_SIZE = 25;

  useEffect(() => {
    setCurrentPage(1);
  }, [priorityFilter, businessTypeFilter, suggestionFilterOption, sortOption, activeGapTab, patternFilter, categoryFilter, routeFilter]);

  useEffect(() => {
    fetchData();
  }, []);


  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all customers through the standard cache
      const userInfoData = await getCachedUserInfo();

      // Fetch business types dynamically
      try {
        const btRes = await axios.get(`${ADMIN_PATH}/business-types`);
        setBusinessTypes(btRes.data || []);
      } catch (err) {
        console.error("Error fetching business types:", err);
      }

      // Fetch priorities and routes dynamically
      try {
        const [prioritiesRes, routeRes] = await Promise.all([
          axios.get(`${ADMIN_PATH}/priorities`).catch(() => ({ data: [] })),
          axios.get(`${ADMIN_PATH}/routes`).catch(() => ({ data: [] })),
        ]);

        const fetchedPriorities = (prioritiesRes.data || []).sort((a, b) => (a.order || 99) - (b.order || 99));
        setPriorities(fetchedPriorities);

        const routeMap = {};
        const routeNames = (routeRes.data || []).map(r => {
          if (!r) return null;
          const name = typeof r === "string" ? r : r.name;
          const pId = r.priorityId || (r.priority && r.priority.id) || null;
          if (name) {
            routeMap[name] = pId;
            routeMap[name.toLowerCase()] = pId;
            routeMap[name.trim()] = pId;
          }
          return name;
        }).filter(Boolean);

        setRoutes(routeNames);
        setRoutePriorityMap(routeMap);
      } catch (err) {
        console.error("Error fetching routes/priorities:", err);
      }

      let allCustomers = [];

      // Backend returns an array if no pagination is requested, or { customers: [...] } 
      if (Array.isArray(userInfoData)) {
        allCustomers = userInfoData;
      } else if (userInfoData && Array.isArray(userInfoData.customers)) {
        allCustomers = userInfoData.customers;
      }

      // Show all customers without exclusions
      const validCustomers = allCustomers.filter((c) => !!c);

      // 2. Store valid customers (Suggestions are dynamically generated by useMemo)
      setCustomers(validCustomers);
    } catch (err) {
      console.error("Error fetching customers for AI suggestions:", err);
      setError("Failed to load AI suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const baseCustomerData = useMemo(() => {
    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");

    const activeCustomers = customers.filter((customer) => {
      const todayStatus = getTodayDeliveryStatus(customer, todayDate);
      return todayStatus !== "delivered" && todayStatus !== "checked";
    });

    return activeCustomers.map((customer) => {
      // Precompute expensive values for sorting & filtering once
      const currentCategory = computeCurrentCategory(customer.last8Days);
      const currentCategoryNumber = getCurrentCategoryNumber(currentCategory);

      const peakFrequencyStr = resolvePeakFrequency(customer);
      const peakFrequencyNumber = getPeakFrequencyNumber(peakFrequencyStr);

      const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
      const deliveryGapStr = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);
      const deliveryGapNumber = getDeliveryGapNumber(deliveryGapStr);

      const potentialNumber = getPotentialNumber(customer.potential);

      return {
        customer: {
          ...customer,
          deliveryGapStr,
          deliveryGapNumber,
        },
        currentCategory,
        currentCategoryNumber,
        peakFrequencyStr,
        peakFrequencyNumber,
        deliveryGapStr,
        deliveryGapNumber,
        potentialNumber,
      };
    });
  }, [customers]);

  const processedData = useMemo(() => {
    const data = baseCustomerData.map((item) => {
      const saved1 = rowPatterns[item.customer.id];
      const customerPattern = resolveCleanPattern(saved1, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
      const saved2 = rowSecondaryPatterns[item.customer.id];
      const secondaryPattern = resolveCleanPattern(saved2, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
      const saved3 = rowTertiaryPatterns[item.customer.id];
      const tertiaryPattern = resolveCleanPattern(saved3, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);

      return {
        ...item,
        suggestion: generateDummyAISuggestion(item.customer, customerPattern, secondaryPattern, tertiaryPattern),
      };
    });

    data.sort((a, b) => {
      if (b.suggestion.confidence !== a.suggestion.confidence) {
        return b.suggestion.confidence - a.suggestion.confidence;
      }
      return (a.customer.name || "").localeCompare(b.customer.name || "");
    });

    return data;
  }, [baseCustomerData, rowPatterns, rowSecondaryPatterns, rowTertiaryPatterns]);

  const filteredData = useMemo(() => {
    return processedData.filter((item) => {
      // Search (left intact; dropdown selection now controls customer type)
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (item.customer.name && item.customer.name.toLowerCase().includes(searchLower)) ||
        (item.customer.custid && item.customer.custid.toLowerCase().includes(searchLower)) ||
        (item.customer.business && item.customer.business.toLowerCase().includes(searchLower));

      // Suggestion dropdown filter (Turn ON/OFF Tomorrow)
      const suggestion = item?.suggestion?.suggestion;
      const filterOption = suggestionFilterOption;
      const isTurnOnToday = filterOption === "TURN_ON_TODAY";
      const isTurnOffToday = filterOption === "TURN_OFF_TODAY";

      // Suggestion dropdown should match against the generated suggestion.
      const matchesSuggestionOption =
        filterOption === "ALL" ||
        (isTurnOnToday && suggestion === "TURN_ON_TODAY") ||
        (isTurnOffToday && suggestion === "TURN_OFF_TODAY");

      // If user selected a Turn ON/OFF option and the row does not match, drop it.

      if (!matchesSuggestionOption) return false;

      // Priority filter (multi-select)
      const customerRoute = String(item.customer?.route || "").trim();
      const customerPriorityId = routePriorityMap[customerRoute] ?? routePriorityMap[customerRoute.toLowerCase()] ?? null;
      const matchesPriority =
        priorityFilter.length === 0 ||
        (customerPriorityId && priorityFilter.includes(customerPriorityId));

      if (!matchesPriority) return false;

      // Customer-type dropdown filter (Kirana/Hotel/etc)
      // AI candidates from backend (`/ai-suggestions/candidates`) may not always include businessType.
      // Try multiple fields used across the app: businessType, business, and zone.businessType (if present).
      const customerBusinessType = String(item.customer?.businessType || "").trim();
      const customerBusiness = String(item.customer?.business || "").trim();
      const customerFromZone = String(item.customer?.zone?.businessType || "").trim();
      const normalizedCustomerType = customerBusinessType || customerBusiness || customerFromZone;

      // Strict match (normalize to be safe)
      const matchesCustomerType =
        businessTypeFilter === "ALL" ||
        String(normalizedCustomerType).trim().toLowerCase() ===
        String(businessTypeFilter).trim().toLowerCase();

      // Pattern filter (Logic Sets)
      const saved1 = rowPatterns[item.customer.id];
      const customerPattern = resolveCleanPattern(saved1, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
      const saved2 = rowSecondaryPatterns[item.customer.id];
      const secondaryPattern = resolveCleanPattern(saved2, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
      const saved3 = rowTertiaryPatterns[item.customer.id];
      const tertiaryPattern = resolveCleanPattern(saved3, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);
      const matchesPattern =
        patternFilter === "ALL" ||
        customerPattern === patternFilter ||
        secondaryPattern === patternFilter ||
        tertiaryPattern === patternFilter;

      // Category filter (All Current Category, D0-D7, D1 to D3, D5 to D7)
      const currentCategory = item.currentCategory;
      let matchesCategory = false;
      if (categoryFilter === "ALL") {
        matchesCategory = true;
      } else if (categoryFilter === "D1_TO_D3" && ["D1", "D2", "D3"].includes(currentCategory)) {
        matchesCategory = true;
      } else if (categoryFilter === "D5_TO_D7" && ["D5", "D6", "D7"].includes(currentCategory)) {
        matchesCategory = true;
      } else if (categoryFilter === currentCategory) {
        matchesCategory = true;
      }

      // Route filter (multi-select)
      const matchesRoute = routeFilter.length === 0 || routeFilter.includes(customerRoute);

      // Delivery Gap filter
      let matchesGap = false;
      if (activeGapTab === "ALL") {
        matchesGap = true;
      } else {
        const gapNum = item.deliveryGapNumber;
        if (activeGapTab === "G0") matchesGap = gapNum === 0;
        else if (activeGapTab === "G1") matchesGap = gapNum === 1;
        else if (activeGapTab === "G2") matchesGap = gapNum === 2;
        else if (activeGapTab === "G3") matchesGap = gapNum === 3;
        else if (activeGapTab === "G4") matchesGap = gapNum === 4;
        else if (activeGapTab === "G5") matchesGap = gapNum === 5;
        else if (activeGapTab === "G6") matchesGap = gapNum === 6;
        else if (activeGapTab === "G7") matchesGap = gapNum === 7;
        else if (activeGapTab === "G7+") matchesGap = gapNum >= 7;
        else if (activeGapTab === "G10+") matchesGap = gapNum >= 10;
        else if (activeGapTab === "G15+") matchesGap = gapNum >= 15;
        else if (activeGapTab === "G20+") matchesGap = gapNum >= 20;
        else if (activeGapTab === "G30+") matchesGap = gapNum >= 30;
      }

      return matchesSearch && matchesPriority && matchesCustomerType && matchesPattern && matchesCategory && matchesRoute && matchesGap;
    });
  }, [processedData, searchQuery, priorityFilter, routePriorityMap, businessTypeFilter, suggestionFilterOption, patternFilter, categoryFilter, routeFilter, activeGapTab, rowPatterns, rowSecondaryPatterns, rowTertiaryPatterns]);


  const sortedData = useMemo(() => {
    const dataToSort = [...filteredData];

    switch (sortOption) {
      case "NAME_ASC":
        return dataToSort.sort((a, b) => (a.customer.name || "").localeCompare(b.customer.name || ""));
      case "NAME_DESC":
        return dataToSort.sort((a, b) => (b.customer.name || "").localeCompare(a.customer.name || ""));
      case "TOGGLE_ON_FIRST":
        return dataToSort.sort((a, b) => {
          const aOn = getTodayEffectiveStatus(a.customer) === "ON" ? 1 : 0;
          const bOn = getTodayEffectiveStatus(b.customer) === "ON" ? 1 : 0;
          return bOn - aOn;
        });
      case "TOGGLE_OFF_FIRST":
        return dataToSort.sort((a, b) => {
          const aOn = getTodayEffectiveStatus(a.customer) === "ON" ? 1 : 0;
          const bOn = getTodayEffectiveStatus(b.customer) === "ON" ? 1 : 0;
          return aOn - bOn;
        });
      case "PEAK_FREQUENCY":
        return dataToSort.sort((a, b) => {
          return b.peakFrequencyNumber - a.peakFrequencyNumber || compareByName(a, b);
        });
      case "CURRENT_CATEGORY":
        return dataToSort.sort((a, b) => {
          return b.currentCategoryNumber - a.currentCategoryNumber || compareByName(a, b);
        });
      case "PEAK_POTENTIAL":
        return dataToSort.sort((a, b) => {
          return b.potentialNumber - a.potentialNumber || compareByName(a, b);
        });
      case "DELIVERY_GAP":
        return dataToSort.sort((a, b) => {
          return a.deliveryGapNumber - b.deliveryGapNumber || compareByName(a, b);
        });
      case "DEFAULT":
      default:
        return dataToSort;
    }
  }, [filteredData, sortOption]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const currentData = sortedData.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  const handleApplySuggestion = async (customer, nextStatus) => {
    if (!customer?.id || updatingSuggestionId === customer.id) return;

    const previousOverride = customer.todayOverride;
    const optimisticOverride = { ...previousOverride, status: nextStatus };

    setCustomers((prev) =>
      prev.map((row) =>
        row.id === customer.id ? { ...row, todayOverride: optimisticOverride } : row
      )
    );

    try {
      setUpdatingSuggestionId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer/toggle-delivery`, {
        id: customer.id,
        status: nextStatus,
      });
      const saved = res?.data?.todayOverride;
      if (saved?.date && saved?.status) {
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          todayOverride: saved,
        }));
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === customer.id ? { ...row, todayOverride: saved } : row
          )
        );
      }
    } catch (err) {
      console.error("AI suggestion apply error:", err);
      setCustomers((prev) =>
        prev.map((row) =>
          row.id === customer.id ? { ...row, todayOverride: previousOverride } : row
        )
      );
    } finally {
      setUpdatingSuggestionId(null);
    }
  };

  const handleUpdateWeeklySchedule = async (customer, day) => {
    if (!customer?.id || updatingScheduleId === customer.id) return;

    const current = customer.weeklySchedule || {
      mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
    };
    const updated = { ...current, [day]: !current[day] };
    const previousSchedule = customer.weeklySchedule;

    // Optimistically update the schedule in local state
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customer.id ? { ...c, weeklySchedule: updated } : c
      )
    );

    try {
      setUpdatingScheduleId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer/weekly-schedule`, {
        id: customer.id,
        weeklySchedule: updated,
      });
      const saved = res?.data?.weeklySchedule;
      if (saved && typeof saved === "object") {
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          weeklySchedule: saved,
        }));
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customer.id ? { ...c, weeklySchedule: saved } : c
          )
        );
      }
    } catch (err) {
      console.error("Weekly schedule update error:", err);
      // Revert if error
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id ? { ...c, weeklySchedule: previousSchedule } : c
        )
      );
    } finally {
      setUpdatingScheduleId(null);
    }
  };

  const handleDownloadExcel = () => {
    exportToExcel(sortedData, "Multiple Patterns (Dummy)");
  };

  const totalCustomers = filteredData.length;
  const suggestOnCount = filteredData.filter((item) => {
    const sugg = item.suggestion?.suggestion || "";
    return sugg.includes("ON");
  }).length;
  const suggestOffCount = totalCustomers - suggestOnCount;

  const suggestOnPercentage = totalCustomers > 0 ? ((suggestOnCount / totalCustomers) * 100).toFixed(1) : 0;
  const suggestOffPercentage = totalCustomers > 0 ? ((suggestOffCount / totalCustomers) * 100).toFixed(1) : 0;

  const currentOnCount = filteredData.filter((item) => getTodayEffectiveStatus(item.customer) === "ON").length;
  const currentOffCount = totalCustomers - currentOnCount;

  const currentOnPercentage = totalCustomers > 0 ? ((currentOnCount / totalCustomers) * 100).toFixed(1) : 0;
  const currentOffPercentage = totalCustomers > 0 ? ((currentOffCount / totalCustomers) * 100).toFixed(1) : 0;

  return (
    <div className="px-2 py-6 bg-[#FAFAFA] min-h-screen font-sans">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Suggestions</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Final daily decision: Turn ON or OFF for today</p>
        </div>
        <div className="flex flex-col items-end gap-3 w-full lg:w-auto">
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors whitespace-nowrap self-end"
            title="Download all details as Excel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Excel
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full">
            <div className="relative" ref={priorityDropdownRef}>
              <button
                onClick={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
                className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm flex items-center justify-between min-w-[150px]"
              >
                <span className="truncate max-w-[120px]">
                  {priorityFilter.length === 0 ? "All Priorities" : `${priorityFilter.length} Selected`}
                </span>
                <svg className="w-4 h-4 ml-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              {isPriorityDropdownOpen && (
                <div className="absolute z-10 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto left-0 lg:right-0">
                  <div className="p-2 flex gap-2 border-b border-gray-100 sticky top-0 bg-white z-20">
                    <button
                      onClick={() => setPriorityFilter(priorities.map((p) => p.id))}
                      className="flex-1 text-xs bg-blue-50 text-blue-600 font-semibold py-1.5 rounded hover:bg-blue-100"
                    >
                      Check All
                    </button>
                    <button
                      onClick={() => setPriorityFilter([])}
                      className="flex-1 text-xs bg-gray-50 text-gray-600 font-semibold py-1.5 rounded hover:bg-gray-100"
                    >
                      Uncheck All
                    </button>
                  </div>
                  <div className="p-1">
                    {priorities.map((p) => (
                      <label key={p.id} className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700">
                        <input
                          type="checkbox"
                          className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={priorityFilter.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPriorityFilter([...priorityFilter, p.id]);
                            } else {
                              setPriorityFilter(priorityFilter.filter((id) => id !== p.id));
                            }
                          }}
                        />
                        <span className="truncate" title={p.name}>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <select
              value={businessTypeFilter}
              onChange={(e) => setBusinessTypeFilter(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
            >
              <option value="ALL">All Customer Types</option>
              {businessTypes.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>

            <div className="relative" ref={routeDropdownRef}>
              <button
                onClick={() => setIsRouteDropdownOpen(!isRouteDropdownOpen)}
                className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm flex items-center justify-between min-w-[150px]"
              >
                <span className="truncate max-w-[120px]">
                  {routeFilter.length === 0 ? "All Routes" : `${routeFilter.length} Selected`}
                </span>
                <svg className="w-4 h-4 ml-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
              
              {isRouteDropdownOpen && (
                <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto right-0">
                  <div className="p-2 flex gap-2 border-b border-gray-100 sticky top-0 bg-white z-20">
                    <button 
                      onClick={() => setRouteFilter([...routes])}
                      className="flex-1 text-xs bg-blue-50 text-blue-600 font-semibold py-1.5 rounded hover:bg-blue-100"
                    >
                      Check All
                    </button>
                    <button 
                      onClick={() => setRouteFilter([])}
                      className="flex-1 text-xs bg-gray-50 text-gray-600 font-semibold py-1.5 rounded hover:bg-gray-100"
                    >
                      Uncheck All
                    </button>
                  </div>
                  <div className="p-1">
                    {routes.map((r) => {
                      const rt = typeof r === "string" ? r : r?.name;
                      if (!rt) return null;
                      return (
                        <label key={rt} className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={routeFilter.includes(rt)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRouteFilter([...routeFilter, rt]);
                              } else {
                                setRouteFilter(routeFilter.filter(r => r !== rt));
                              }
                            }}
                          />
                          <span className="truncate" title={rt}>{rt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <select
              value={patternFilter}
              onChange={(e) => setPatternFilter(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
            >
              <option value="ALL">All Logic Sets</option>
              <optgroup label="Purchase Cadence">
                {LOGIC_1_PURCHASE_CADENCE.map((pattern) => (
                  <option key={pattern} value={pattern}>
                    {pattern}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Customer State">
                {LOGIC_2_CUSTOMER_STATE.map((pattern) => (
                  <option key={pattern} value={pattern}>
                    {pattern}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Purchase Intent">
                {LOGIC_3_PURCHASE_INTENT.map((pattern) => (
                  <option key={pattern} value={pattern}>
                    {pattern}
                  </option>
                ))}
              </optgroup>
            </select>



            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
            >
              <option value="DEFAULT">Sort: Default (AI Confidence)</option>
              <option value="NAME_ASC">Name (A-Z)</option>
              <option value="NAME_DESC">Name (Z-A)</option>
              <option value="TOGGLE_ON_FIRST">Toggle (ON First)</option>
              <option value="TOGGLE_OFF_FIRST">Toggle (OFF First)</option>
              <option value="PEAK_FREQUENCY">Peak Frequency</option>
              <option value="CURRENT_CATEGORY">Current Category (D7 to D0)</option>
              <option value="PEAK_POTENTIAL">Peak Potential</option>
              <option value="DELIVERY_GAP">Delivery Gap (G0 First)</option>
            </select>

            <select
              value={suggestionFilterOption}
              onChange={(e) => setSuggestionFilterOption(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
            >
              <option value="ALL">All Suggestions</option>
              <option value="TURN_ON_TODAY">Turn ON Today</option>
              <option value="TURN_OFF_TODAY">Turn OFF Today</option>
            </select>


          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Card 1 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800">Total Customers</span>
            <div className="text-3xl font-extrabold text-gray-900 mt-1">{totalCustomers}</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800">AI Suggest ON</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{suggestOnCount}</span>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">{suggestOnPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5 flex items-center gap-4 bg-gradient-to-r from-red-50/30 to-white">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 border border-red-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800">AI Suggest OFF</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{suggestOffCount}</span>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">{suggestOffPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Card 4 - Current Toggle ON */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800">Current Toggle ON</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{currentOnCount}</span>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">{currentOnPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Card 5 - Current Toggle OFF */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800">Current Toggle OFF</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{currentOffCount}</span>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-700">{currentOffPercentage}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* CATEGORY FILTERS TABS */}
      <div className="flex gap-2 mb-4 flex-wrap mt-4">
        {["ALL", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${categoryFilter === cat ? "bg-black text-white border-black shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* DELIVERY GAP FILTERS TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["ALL", "G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G7+", "G10+", "G15+", "G20+", "G30+"].map((gap) => (
          <button
            key={gap}
            onClick={() => setActiveGapTab(gap)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeGapTab === gap ? "bg-amber-600 text-white border-amber-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {gap}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-visible">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <span className="text-[13px] text-gray-500 font-semibold">
          </span>
          <div className="flex items-center gap-3">
          </div>
        </div>

        <DummyAISuggestionTable
          data={currentData}
          loading={loading}
          onApplySuggestion={handleApplySuggestion}
          updatingSuggestionId={updatingSuggestionId}
          rowPatterns={rowPatterns}
          onPatternChange={handlePatternChange}
          rowSecondaryPatterns={rowSecondaryPatterns}
          onSecondaryPatternChange={handleSecondaryPatternChange}
          rowTertiaryPatterns={rowTertiaryPatterns}
          onTertiaryPatternChange={handleTertiaryPatternChange}
          updatingScheduleId={updatingScheduleId}
          onUpdateSchedule={handleUpdateWeeklySchedule}
        />
      </div>

      {!loading && !error && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded disabled:opacity-50"
          >
            Previous
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default DummyAISuggestions;
