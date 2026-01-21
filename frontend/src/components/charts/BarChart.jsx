import React from 'react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function BarChart({ data, dataKey = 'count', xKey = 'label', bars = [], title, height = 300, horizontal = false, noWrapper = false }) {
  if (!data || data.length === 0) {
    const content = (
      <>
        {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-64 text-gray-500">
          No data available
        </div>
      </>
    )
    return noWrapper ? content : <div className="bg-white rounded-lg shadow p-6">{content}</div>
  }

  const defaultBars = bars.length > 0 ? bars : [
    { key: dataKey, color: '#3b82f6', name: 'Count' }
  ]

  const chartContent = (
    <>
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart 
          data={data} 
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          {horizontal ? (
            <>
              <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis dataKey={xKey} type="category" stroke="#6b7280" style={{ fontSize: '12px' }} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            </>
          )}
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#fff', 
              border: '1px solid #e5e7eb', 
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          {defaultBars.length > 1 && <Legend />}
          {defaultBars.map((bar, index) => (
            <Bar
              key={bar.key || index}
              dataKey={bar.key}
              fill={bar.color}
              name={bar.name}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </>
  )

  return noWrapper ? chartContent : <div className="bg-white rounded-lg shadow p-6">{chartContent}</div>
}

