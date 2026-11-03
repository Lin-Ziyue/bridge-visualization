import { sensors, statusText } from '../data/mock'

export default function SensorTable() {
  return (
    <div className="table-scroll">
      <table className="sensor-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>位置</th>
            <th>应变 (με)</th>
            <th>温度</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {sensors.map((sensor) => (
            <tr key={sensor.id}>
              <td>
                <span className="sensor-id">{sensor.id}</span>
              </td>
              <td className="sensor-position">{sensor.position}</td>
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
              <td className="temp-cell">{sensor.temp.toFixed(1)} °C</td>
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
