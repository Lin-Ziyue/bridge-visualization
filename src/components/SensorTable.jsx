import { sensors, statusText } from '../data/mock'

function formatCoord(value) {
  return Number(value).toFixed(2)
}

export default function SensorTable({ selected, onSelect }) {
  return (
    <div className="table-scroll">
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
