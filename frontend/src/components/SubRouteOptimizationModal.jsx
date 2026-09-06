import React, { useState, useMemo } from "react";
import axios from "axios";
import {
  FiX,
  FiCheck,
  FiArrowRight,
  FiSearch,
  FiFilter,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";
import { ADMIN_PATH } from "../constant";
import { invalidateClientUserInfoCache } from "../utils/customerInfoClientCache";

export default function SubRouteOptimizationModal({
  isOpen,
  onClose,
  pendingChanges = [],
  stats = {},
  onSuccess,
}) {
  const [selectedIds, setSelectedIds] = useState(() =>
    new Set(pendingChanges.map((c) => c.customerId))
  );
  const [parentFilter, setParentFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Sync selectedIds when pendingChanges change
  React.useEffect(() => {
    setSelectedIds(new Set(pendingChanges.map((c) => c.customerId)));
  }, [pendingChanges]);

  // Extract unique parent routes in the pending list
  const parentRoutes = useMemo(() => {
    const set = new Set(pendingChanges.map((c) => c.parentKey));
    return Array.from(set).sort();
  }, [pendingChanges]);

  // Filter pending changes based on controls
  const filteredChanges = useMemo(() => {
    return pendingChanges.filter((item) => {
      if (parentFilter !== "ALL" && item.parentKey !== parentFilter) return false;
      if (tierFilter !== "ALL" && item.tier !== tierFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.customerName.toLowerCase().includes(q);
        const matchesPhone = item.phone.toLowerCase().includes(q);
        const matchesCurrent = item.currentRoute.toLowerCase().includes(q);
        const matchesTarget = item.targetRoute.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCurrent && !matchesTarget) return false;
      }
      return true;
    });
  }, [pendingChanges, parentFilter, tierFilter, searchQuery]);

  const isAllFilteredSelected =
    filteredChanges.length > 0 &&
    filteredChanges.every((item) => selectedIds.has(item.customerId));

  const toggleSelectAll = () => {
    const newSet = new Set(selectedIds);
    if (isAllFilteredSelected) {
      filteredChanges.forEach((item) => newSet.delete(item.customerId));
    } else {
      filteredChanges.forEach((item) => newSet.add(item.customerId));
    }
    setSelectedIds(newSet);
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleApply = async () => {
    const selectedChanges = pendingChanges.filter((item) => selectedIds.has(item.customerId));
    if (selectedChanges.length === 0) {
      alert("No customers selected for update.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const updates = selectedChanges.map((item) => ({
        id: item.customerId,
        route: item.targetRoute,
      }));

      // Call backend batch update endpoint
      await axios.post(`${ADMIN_PATH}/customers/batch-update-routes`, { updates });

      // Invalidate frontend cache
      invalidateClientUserInfoCache();

      if (onSuccess) {
        onSuccess(selectedChanges);
      }
      onClose();
    } catch (err) {
      console.error("Batch update failed:", err);
      setSubmitError(err.response?.data?.message || "Failed to update customer routes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const tierColors = {
    A: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", badge: "bg-emerald-600" },
    B: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", badge: "bg-blue-600" },
    C: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", badge: "bg-amber-600" },
    D: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", badge: "bg-purple-600" },
  };

  const getCurrentCategoryColor = (category) => {
    const match = String(category || "").match(/^D(\d+)$/);
    if (!match) return "#FF3B30";
    const num = Number(match[1]);
    if (!Number.isFinite(num)) return "#FF3B30";

    if (num <= 2) return "#FF3B30"; // red: D0-D2
    if (num <= 4) return "#FB8C00"; // yellow/orange: D3-D4
    return "#0F9D58"; // green: D5-D7
  };

  const getDeliveryGapColor = (gap) => {
    const match = String(gap || "").match(/^G?(\d+)$/);
    if (!match) return "#FF3B30";
    const num = Number(match[1]);
    if (!Number.isFinite(num)) return "#FF3B30";

    if (num === 0) return "#0F9D58"; // green: G0
    if (num <= 2) return "#FB8C00"; // yellow/orange: G1-G2
    return "#FF3B30"; // red: G3+
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3 bg-white">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                Auto-Sort Customer Sub-Routes
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {pendingChanges.length} Pending Moves
                </span>
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* RULES QUICK BAR */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center gap-2 flex-wrap text-[11px] text-gray-600">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-gray-700">Rules Applied:</span>
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Route A: Current Category D4 to D5
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Route B: Current Category D1 to D3
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Route C: Delivery Gap G7 to G10
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              Route D: Delivery Gap G10+
            </span>
          </div>
        </div>

        {/* STAT KPI CARDS */}
        <div className="p-4 sm:p-5 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-white">
          <div className="bg-slate-50 border border-gray-200/80 rounded-xl p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Changes</span>
            <span className="text-xl font-extrabold text-gray-900 mt-0.5">{pendingChanges.length}</span>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">To Sub-Route A</span>
            <span className="text-xl font-extrabold text-emerald-700 mt-0.5">{stats.toTierA || 0}</span>
          </div>
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">To Sub-Route B</span>
            <span className="text-xl font-extrabold text-blue-700 mt-0.5">{stats.toTierB || 0}</span>
          </div>
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">To Sub-Route C</span>
            <span className="text-xl font-extrabold text-amber-700 mt-0.5">{stats.toTierC || 0}</span>
          </div>
          <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">To Sub-Route D</span>
            <span className="text-xl font-extrabold text-purple-700 mt-0.5">{stats.toTierD || 0}</span>
          </div>
        </div>

        {/* FILTER CONTROLS */}
        <div className="p-3 sm:px-5 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs relative">
            <FiSearch size={14} className="absolute left-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer, route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold text-[11px]">Parent:</span>
              <select
                value={parentFilter}
                onChange={(e) => setParentFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Parents</option>
                {parentRoutes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold text-[11px]">Target Tier:</span>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Routes</option>
                <option value="A">Route A (Current Category D4-D5)</option>
                <option value="B">Route B (Current Category D1-D3)</option>
                <option value="C">Route C (Delivery Gap G7-G10)</option>
                <option value="D">Route D (Delivery Gap G10+)</option>
              </select>
            </div>

            <button
              onClick={toggleSelectAll}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {isAllFilteredSelected ? "Deselect Filtered" : "Select Filtered"}
            </button>
          </div>
        </div>

        {/* ERROR NOTICE */}
        {submitError && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <FiAlertCircle size={15} className="flex-shrink-0 text-red-500" />
            <span>{submitError}</span>
          </div>
        )}

        {/* TABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredChanges.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              {pendingChanges.length === 0
                ? "All customers are already in their optimal sub-routes! No changes needed."
                : "No customers match the current filter criteria."}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-bold text-gray-500">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllFilteredSelected}
                        onChange={toggleSelectAll}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Parent Route</th>
                    <th className="p-3">Current Sub-Route</th>
                    <th className="p-3 text-center w-6"></th>
                    <th className="p-3">Recommended Sub-Route</th>
                    <th className="p-3 text-center">Current Category</th>
                    <th className="p-3 text-center">Delivery Gap</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredChanges.map((item) => {
                    const isChecked = selectedIds.has(item.customerId);
                    const tierStyle = tierColors[item.tier] || tierColors.A;

                    return (
                      <tr
                        key={item.customerId}
                        onClick={() => toggleSelectOne(item.customerId)}
                        className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                          isChecked ? "bg-blue-50/20" : ""
                        }`}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOne(item.customerId)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-gray-900">{item.customerName}</p>
                          {item.phone && <p className="text-[10px] text-gray-400">{item.phone}</p>}
                        </td>
                        <td className="p-3 font-extrabold text-slate-700">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px]">
                            {item.parentKey}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 font-medium max-w-[170px] truncate" title={item.currentRoute}>
                          {item.currentRoute}
                        </td>
                        <td className="p-3 text-center text-gray-400">
                          <FiArrowRight size={13} className="inline text-blue-500" />
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-1 rounded-md border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}
                            title={item.targetRoute}
                          >
                            <span className={`w-2 h-2 rounded-full ${tierStyle.badge}`}></span>
                            <span className="truncate max-w-[200px]">{item.targetRoute}</span>
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: getCurrentCategoryColor(item.category) }}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: getDeliveryGapColor(item.gap) }}
                          >
                            {item.gap}
                          </span>
                        </td>
                        <td className="p-3 text-[11px] font-medium text-gray-500">
                          {item.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:px-5 sm:py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 font-medium">
            <span className="font-bold text-gray-900">{selectedIds.size}</span> of{" "}
            <span className="font-bold text-gray-900">{pendingChanges.length}</span> customers selected for update
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isSubmitting || selectedIds.size === 0}
              className={`px-5 py-2 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all ${
                isSubmitting || selectedIds.size === 0
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-blue-500/20"
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Applying Changes...</span>
                </>
              ) : (
                <>
                  <FiCheckCircle size={14} />
                  <span>Apply Changes ({selectedIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
