import React, { useState } from "react";
import { FiCalendar } from "react-icons/fi";
import {
  computeCurrentCategory,
  getTodayEffectiveStatus,
} from "../utils/aiSuggestionEngine";
import {
  BUYING_PATTERNS,
  LOGIC_1_PURCHASE_CADENCE,
  LOGIC_2_CUSTOMER_STATE,
  LOGIC_3_PURCHASE_INTENT,
  DEFAULT_LOGIC_1,
  DEFAULT_LOGIC_2,
  DEFAULT_LOGIC_3,
} from "../utils/dummyAiSuggestionEngine";
import ExecutionCalendarModal from "./ExecutionCalendarModal";

const getSuggestionConfig = (suggestion, reason, score) => {
  const scoreReason = String(reason || "").includes("AI Score")
    ? reason
    : `AI Score: ${score} - ${reason}`;

  switch (suggestion) {
    case "TURN_ON_TODAY":
      return {
        colorClass: "text-green-600",
        dotClass: "bg-green-500",
        text: "Turn ON",
        subText: `(${scoreReason})`
      };
    case "TURN_OFF_TODAY":
      return {
        colorClass: "text-red-600",
        dotClass: "bg-red-500",
        text: "Turn OFF",
        subText: `(${reason})`
      };
    case "KEEP_ON_TODAY":
      return {
        colorClass: "text-green-600",
        dotClass: "bg-green-500",
        text: "Keep ON",
        subText: ""
      };
    case "KEEP_OFF_TODAY":
      return {
        colorClass: "text-orange-500",
        dotClass: "bg-orange-500",
        text: "Keep OFF",
        subText: ""
      };
    default:
      return {
        colorClass: "text-gray-500",
        dotClass: "bg-gray-500",
        text: "Unknown",
        subText: ""
      };
  }
};

const normalizePeakFrequency = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;

  return "D0";
};

const getPeakFrequencyColor = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));

  if (n <= 2) return "#FF3B30"; // red
  if (n <= 4) return "#FB8C00"; // orange
  return "#0F9D58"; // green
};

const getCurrentCategoryColor = (value) => {
  const currentCategory = normalizePeakFrequency(value);
  const n = Number(currentCategory.slice(1));

  if (n <= 2) return "#FF3B30";
  if (n <= 4) return "#FB8C00";
  return "#0F9D58";
};

const getSuggestionStatus = (suggestion) => {
  switch (suggestion) {
    case "TURN_ON_TODAY":
    case "KEEP_ON_TODAY":
      return "ON";
    case "TURN_OFF_TODAY":
    case "KEEP_OFF_TODAY":
      return "OFF";
    default:
      return null;
  }
};

const getPeakFrequencyNumber = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
};

const computePeakFrequency = (last8Days) => {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let count = 0;
  const today = new Date();

  for (let i = 0; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    const entry = last8Days[dateStr];
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status === "delivered") count++;
  }

  return `D${Math.min(count, 7)}`;
};

const resolvePeakFrequency = (customer) => {
  const savedPeak = normalizePeakFrequency(
    customer?.Peak_Frequency || customer?.peakFrequency || customer?.peak_frequency,
  );
  const currentPeak = computePeakFrequency(customer?.last8Days);

  return getPeakFrequencyNumber(savedPeak) >= getPeakFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
};

const computePeakPotential = (last8Days) => {
  if (!last8Days || typeof last8Days !== "object") return "T1";
  let maxTrays = 0;
  Object.values(last8Days).forEach((entry) => {
    if (!entry) return;
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();
    if (status !== "delivered") return;
    const trays =
      entry.traysDelivered ??
      entry.trays ??
      entry.quantity ??
      entry?.deliveredTrays ??
      0;
    const numTrays = Number(trays);
    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  });
  return maxTrays > 0 ? `T${maxTrays}` : "T1";
};

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

const getPotentialColor = (value) => {
  const potential = normalizePotential(value);
  const num = parseInt(potential.slice(1), 10);

  // T1-T7 = red, T8-T15 = orange, T20+ = green
  if (num <= 7) return "#FF3B30"; // red
  if (num <= 15) return "#FB8C00"; // orange
  return "#0F9D58"; // green
};

function getDateStringInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (error) {}
  return new Date().toISOString().slice(0, 10);
}

function getDateDayNumber(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time)) return null;
  return Math.floor(time / 86400000);
}

function computeDeliveryGap(last8Days, todayDate) {
  if (!last8Days || typeof last8Days !== "object") return "G10";
  const todayDayNumber = getDateDayNumber(todayDate);
  if (todayDayNumber === null) return "G10";
  let latestDeliveredDayNumber = null;
  Object.entries(last8Days).forEach(([dateStr, entry]) => {
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    ).trim().toLowerCase();
    if (status !== "delivered") return;
    const dayNumber = getDateDayNumber(dateStr);
    if (dayNumber === null || dayNumber > todayDayNumber) return;
    if (latestDeliveredDayNumber === null || dayNumber > latestDeliveredDayNumber) {
      latestDeliveredDayNumber = dayNumber;
    }
  });
  if (latestDeliveredDayNumber === null) return "G10";
  return `G${todayDayNumber - latestDeliveredDayNumber}`;
}

function normalizeDeliveryGap(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/^G?(\d+)$/);
  if (!match) return "G10";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return "G10";
  return `G${Math.floor(n)}`;
}

function getDeliveryGapNumber(value) {
  const gap = normalizeDeliveryGap(value);
  const n = Number(gap.slice(1));
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

function getDeliveryGapColor(value) {
  const n = getDeliveryGapNumber(value);
  if (n === 0) return "#0F9D58";
  if (n <= 2) return "#FB8C00";
  return "#FF3B30";
}

const DummyAISuggestionRow = ({
  customer,
  suggestionData,
  onApplySuggestion,
  isUpdating = false,
  customerPattern = DEFAULT_LOGIC_1,
  onPatternChange,
  secondaryPattern = DEFAULT_LOGIC_2,
  onSecondaryPatternChange,
  tertiaryPattern = DEFAULT_LOGIC_3,
  onTertiaryPatternChange,
  updatingScheduleId,
  onUpdateSchedule
}) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openSchedule, setOpenSchedule] = useState(false);
  const isTodayOn = getTodayEffectiveStatus(customer) === "ON";
  const suggestedStatus = getSuggestionStatus(suggestionData.suggestion);
  const alreadyApplied = suggestedStatus === (isTodayOn ? "ON" : "OFF");
  const peakFrequency = resolvePeakFrequency(customer);
  const currentCategory = computeCurrentCategory(customer?.last8Days);
  const computedPotential = customer?.potential || computePeakPotential(customer?.last8Days);
  const peakPotential = normalizePotential(computedPotential);
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
  const deliveryGap = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);
  const { dotClass, text, subText } = getSuggestionConfig(
    suggestionData.suggestion,
    suggestionData.reason,
    suggestionData.score
  );

  return (
    <tr className={`border-b border-gray-300 hover:bg-gray-50/50 bg-white text-center transition-colors ${calendarOpen ? 'relative z-50' : ''}`}>
      <td className="px-1.5 py-2 text-xs text-gray-600 font-medium">{customer.custid}</td>
      <td className="px-1.5 py-2 text-xs text-gray-900 font-bold uppercase leading-tight min-w-[80px]">{customer.name}</td>
      <td className="px-1.5 py-2 text-[10.5px] text-gray-700 font-medium max-w-[110px] break-words whitespace-normal leading-tight">{customer.route || "-"}</td>

      <td className="px-1.5 py-2 text-gray-700 font-medium">
        {(() => {
          const isOpen = openSchedule;
          const isUpdating = updatingScheduleId === customer.id;
          const schedule = customer?.weeklySchedule || {
            mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
          };
          const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
          const labels = {
            mon: "MON", tue: "TUE", wed: "WED", thu: "THU", fri: "FRI", sat: "SAT", sun: "SUN",
          };
          const activeDaysCount = Object.values(schedule).filter(Boolean).length;
          return (
            <div className="relative inline-block">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenSchedule((prev) => !prev);
                }}
                className="px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 transition whitespace-nowrap"
                disabled={isUpdating}
              >
                {activeDaysCount} Days {isOpen ? "▲" : "▼"}
              </button>
              {isOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 p-1.5 min-w-[80px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {days.map((day) => (
                    <button
                      key={day}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onUpdateSchedule) {
                          onUpdateSchedule(customer, day);
                        }
                      }}
                      disabled={isUpdating}
                      className={`block w-full text-center px-1.5 py-0.5 rounded mb-1 last:mb-0 font-medium text-[11px] transition ${schedule[day]
                        ? "bg-green-500 text-white border border-green-600"
                        : "bg-red-500 text-white border border-red-600"
                        } ${isUpdating
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer hover:opacity-90"
                        }`}
                    >
                      {labels[day]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </td>

      <td className="px-1.5 py-2 text-gray-700 font-medium">
        <span
          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: getPotentialColor(peakPotential) }}
        >
          {peakPotential}
        </span>
      </td>

      <td className="px-1.5 py-2 text-gray-700 font-medium">
        <span
          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: getPeakFrequencyColor(peakFrequency) }}
        >
          {peakFrequency}
        </span>
      </td>

      <td className="px-1.5 py-2 text-gray-700 font-medium">
        <span
          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: getDeliveryGapColor(deliveryGap) }}
        >
          {deliveryGap}
        </span>
      </td>

      <td className="px-1.5 py-2 text-gray-700 font-medium">
        <span
          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: getCurrentCategoryColor(currentCategory) }}
        >
          {currentCategory}
        </span>
      </td>

      {/* Current Toggle Column */}
      <td className="px-1.5 py-2">
        <div className="flex items-center justify-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${isTodayOn ? "bg-green-500" : "bg-gray-400"} shadow-sm`}></div>
          <span className="text-xs text-gray-700 font-medium">
            {isTodayOn ? "ON" : "OFF"}
          </span>
        </div>
      </td>

      <td className="px-1.5 py-2">
        <select
          value={customerPattern || DEFAULT_LOGIC_1}
          onChange={(e) => onPatternChange(customer.id, e.target.value)}
          className="border border-gray-300 px-1 py-0.5 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm appearance-none cursor-pointer hover:bg-gray-50 w-[120px] overflow-hidden text-ellipsis whitespace-nowrap"
          title={customerPattern || DEFAULT_LOGIC_1}
        >
          {LOGIC_1_PURCHASE_CADENCE.map(pattern => (
            <option key={pattern} value={pattern}>{pattern}</option>
          ))}
        </select>
      </td>

      <td className="px-1.5 py-2">
        <select
          value={secondaryPattern || DEFAULT_LOGIC_2}
          onChange={(e) => onSecondaryPatternChange(customer.id, e.target.value)}
          className="border border-gray-300 px-1 py-0.5 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm appearance-none cursor-pointer hover:bg-gray-50 w-[120px] overflow-hidden text-ellipsis whitespace-nowrap"
          title={secondaryPattern || DEFAULT_LOGIC_2}
        >
          {LOGIC_2_CUSTOMER_STATE.map(pattern => (
            <option key={`sec-${pattern}`} value={pattern}>{pattern}</option>
          ))}
        </select>
      </td>

      <td className="px-1.5 py-2">
        <select
          value={tertiaryPattern || DEFAULT_LOGIC_3}
          onChange={(e) => onTertiaryPatternChange(customer.id, e.target.value)}
          className="border border-gray-300 px-1 py-0.5 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm appearance-none cursor-pointer hover:bg-gray-50 w-[120px] overflow-hidden text-ellipsis whitespace-nowrap"
          title={tertiaryPattern || DEFAULT_LOGIC_3}
        >
          {LOGIC_3_PURCHASE_INTENT.map(pattern => (
            <option key={`ter-${pattern}`} value={pattern}>{pattern}</option>
          ))}
        </select>
      </td>

      {/* AI Suggestion Badge */}
      <td className="px-1.5 py-2">
        {suggestedStatus === "ON" ? (
          <div className="inline-flex items-center justify-center border border-green-500 text-green-700 rounded-full px-2 py-0.5 font-bold bg-green-50/80 min-w-[46px] text-xs shadow-sm">
             ON
          </div>
        ) : suggestedStatus === "OFF" ? (
          <div className="inline-flex items-center justify-center border border-red-300 text-red-600 rounded-full px-2 py-0.5 font-bold bg-red-50/80 min-w-[46px] text-xs shadow-sm">
             OFF
          </div>
        ) : (
          <div className="inline-flex items-center justify-center border border-gray-300 text-gray-500 rounded-full px-2 py-0.5 font-bold bg-gray-50 min-w-[46px] text-xs">
             --
          </div>
        )}
      </td>

      <td className="px-1.5 py-2">
        <div className="flex items-center justify-center">
          <label
            className={`relative inline-flex items-center ${
              isUpdating ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isTodayOn}
              disabled={isUpdating}
              onChange={() => onApplySuggestion?.(customer, isTodayOn ? "OFF" : "ON")}
              aria-label="Toggle Delivery"
            />
            <div className="w-8 h-4.5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-colors shadow-inner" />
            <div className="absolute left-[2px] top-[2px].5 w-3.5 h-3.5 bg-white rounded-full transition-transform peer-checked:translate-x-3.5 shadow-sm" />
          </label>
        </div>
      </td>

      {/* Execution Calendar */}
      <td className="px-1.5 py-2">
        <div className={`relative inline-block ${calendarOpen ? 'z-50' : ''}`}>
          <button
            className="flex justify-center items-center cursor-pointer p-1 rounded transition-colors mx-auto text-blue-500 hover:text-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              setCalendarOpen((prev) => !prev);
            }}
            title="Click to view full calendar"
          >
            <FiCalendar className="w-4.5 h-4.5" />
          </button>
          {calendarOpen && (
            <ExecutionCalendarModal
              customer={customer}
              onClose={() => setCalendarOpen(false)}
            />
          )}
        </div>
      </td>
    </tr>
  );
};

export default React.memo(DummyAISuggestionRow);
