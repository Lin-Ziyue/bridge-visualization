import { kpis } from '../data/mock'

const ICONS = {
  cyan: 'M3 17l6-6 4 4 8-8',
  blue: 'M4 18V8m6 10V4m6 14v-7m5 7V6',
  green: 'M20 6L9 17l-5-5',
  amber: 'M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
}

export default function KpiGrid() {
  return (
    <div className="kpi-grid">
      {kpis.map((item) => (
        <article className={`kpi-card tone-${item.tone}`} key={item.label}>
          <div className="kpi-top">
            <span>{item.label}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS[item.tone]} />
            </svg>
          </div>
          <div className="kpi-value">
            {item.value}
            {item.unit && <small>{item.unit}</small>}
          </div>
          <div className="kpi-foot">
            <span className="kpi-trend">{item.trend}</span>
            <span>{item.hint}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
