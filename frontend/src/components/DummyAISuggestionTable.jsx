import React from "react";
import DummyAISuggestionRow from "./DummyAISuggestionRow";
import {
  DEFAULT_LOGIC_1,
  DEFAULT_LOGIC_2,
  DEFAULT_LOGIC_3,
} from "../utils/dummyAiSuggestionEngine";

const DummyAISuggestionTable = ({ data, loading, onApplySuggestion, updatingSuggestionId, rowPatterns, onPatternChange, rowSecondaryPatterns, onSecondaryPatternChange, rowTertiaryPatterns, onTertiaryPatternChange, updatingScheduleId, onUpdateSchedule }) => {
  if (loading) {
    return (
      <div className="overflow-x-auto bg-white shadow rounded mt-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-800">Customer ID</th>
              <th className="p-3 text-left font-semibold text-gray-800">Customer Name</th>
              <th className="p-3 text-left font-semibold text-gray-800">Route</th>
              <th className="p-3 text-left font-semibold text-gray-800">Weekly Schedule</th>
              <th className="p-3 text-left font-semibold text-gray-800">Peak_Potential</th>
              <th className="p-3 text-left font-semibold text-gray-800">Peak_Frequency</th>
              <th className="p-3 text-left font-semibold text-gray-800">Delivery_Gap</th>
              <th className="p-3 text-left font-semibold text-gray-800">Current Category</th>
              <th className="p-3 text-left font-semibold text-gray-800">Current Toggle</th>
              <th className="p-3 text-left font-semibold text-gray-800">Purchase Cadence</th>
              <th className="p-3 text-left font-semibold text-gray-800">Customer State</th>
              <th className="p-3 text-left font-semibold text-gray-800">Purchase Intent</th>
              <th className="p-3 text-left font-semibold text-gray-800">AI Suggestion</th>
              <th className="p-3 text-left font-semibold text-gray-800">Apply AI Suggestion</th>
              <th className="p-3 text-left font-semibold text-gray-800">Execution Calendar</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, index) => (
              <tr key={index} className="border-b border-gray-100 animate-pulse">
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-6 bg-gray-200 rounded-full w-12 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-6 bg-gray-200 rounded-full w-8 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-6 bg-gray-200 rounded-full w-8 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-6 bg-gray-200 rounded-full w-8 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-6 bg-gray-200 rounded-full w-8 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div></td>
                <td className="p-4 py-6"><div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full bg-white shadow-sm rounded-lg border border-gray-200 mt-6 p-8 text-center text-gray-500">
        No AI suggestions available
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs table-auto border-collapse min-w-[1150px]">
          <thead className="bg-gray-50 border-b border-gray-100 text-xs">
            <tr>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Customer<br/>ID</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight min-w-[90px]">Customer<br/>Name</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight max-w-[130px]">Route</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Weekly<br/>Schedule</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Peak<br/>Potential</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Peak<br/>Frequency</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Delivery<br/>Gap</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Current<br/>Category</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Current<br/>Toggle</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight min-w-[122px]">Purchase Cadence</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight min-w-[122px]">Customer State</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight min-w-[122px]">Purchase Intent</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">AI<br/>Suggestion</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Apply AI<br/>Suggestion</th>
              <th className="px-1.5 py-2 text-center font-semibold text-gray-800 leading-tight">Execution<br/>Calendar</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <DummyAISuggestionRow
                key={item.customer.id}
                customer={item.customer}
                suggestionData={item.suggestion}
                onApplySuggestion={onApplySuggestion}
                isUpdating={updatingSuggestionId === item.customer.id}
                customerPattern={rowPatterns[item.customer.id] || DEFAULT_LOGIC_1}
                onPatternChange={onPatternChange}
                secondaryPattern={rowSecondaryPatterns[item.customer.id] || DEFAULT_LOGIC_2}
                onSecondaryPatternChange={onSecondaryPatternChange}
                tertiaryPattern={rowTertiaryPatterns[item.customer.id] || DEFAULT_LOGIC_3}
                onTertiaryPatternChange={onTertiaryPatternChange}
                updatingScheduleId={updatingScheduleId}
                onUpdateSchedule={onUpdateSchedule}
              />
            ))}
          </tbody>
        </table>
    </div>
  );
};

export default DummyAISuggestionTable;
