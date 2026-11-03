import { useEffect, useRef } from 'react'
import { sensors, statusText } from '../data/mock'

function formatCoord(value) {
  return Number(value).toFixed(2)
}

export default function SensorTable({ selected, onSelect }) {
  const scrollRef = useRef(null)
  const rowRefs = useRef({})

  useEffect(() => {
    const container = scrollRef.current
    const row = rowRefs.current[selected]
    if (!container || !row) return
    const headerHeight = container.querySelector('thead')?.offsetHeight || 0
    container.scrollTo({
      top: Math.max(0, row.offsetTop - headerHeight),
      behavior: 'smooth',
    })
  }, [selected])

  return (
    <div className="table-scroll" ref={scrollRef}>
      <table className="sensor-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>坐标 (m)</th>
            <th>应变 (με)</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {sensors.map((sensor) => (
            <tr
              key={sensor.id}
              ref={(element) => { rowRefs.current[sensor.id] = element }}
              className={sensor.id === selected ? 'is-selected' : ''}
              title={sensor.name}
              tabIndex={0}
              role="button"
              aria-pressed={sensor.id === selected}
              onClick={() => onSelect(sensor.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(sensor.id)
                }
              }}
            >
              <td>
                <span className="sensor-id">{sensor.id}</span>
              </td>
              <td className="coord-cell">
                X {formatCoord(sensor.coord.x)} · Y {formatCoord(sensor.coord.y)} · Z {formatCoord(sensor.coord.z)}
              </td>
              <td>
                <div className="strain-cell">
                  <span className={sensor.strain >= 5 ? 'strain-value is-warning' : 'strain-value'}>
                    {sensor.strain > 0 ? '+' : ''}
                    {sensor.strain.toFixed(2)}
                  </span>
                  <span className="strain-bar">
                    <i style={{ width: `${Math.min(100, (Math.abs(sensor.strain) / 6) * 100)}%` }} />
                  </span>
                </div>
              </td>
              <td>
                <span className={`status-pill stat-${sensor.status}`}>
                  {statusText[sensor.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
