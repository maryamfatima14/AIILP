import React from 'react'

export default function MetricCard({ title, value, subtitle, icon, gradient, trend }) {
  return (
    <div className={`rounded-xl shadow p-6 text-white bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white/90">{title}</h3>
        {icon && (
          <div className="text-white/80">
            {icon}
          </div>
        )}
      </div>
      <p className="text-3xl font-bold">{value || 0}</p>
      {subtitle && (
        <p className="text-sm text-white/80 mt-1">
          {subtitle}
          {trend && (
            <span className={`ml-2 ${trend > 0 ? 'text-green-200' : trend < 0 ? 'text-red-200' : ''}`}>
              {trend > 0 ? '↑' : trend < 0 ? '↓' : ''} {Math.abs(trend)}%
            </span>
          )}
        </p>
      )}
    </div>
  )
}

