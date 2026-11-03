import { useEffect, useState } from 'react'

const NAV = ['总览', '结构监测', '数据分析', '告警中心']

export default function Header() {
  const [now, setNow] = useState(new Date())
  const [active, setActive] = useState('总览')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <h1>桥梁结构健康监测平台</h1>
          <p>BRIDGE STRUCTURAL HEALTH MONITORING</p>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        {NAV.map((item) => (
          <button
            key={item}
            type="button"
            className={active === item ? 'nav-item is-active' : 'nav-item'}
            onClick={() => setActive(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="topbar-meta">
        <div className="system-state">
          <span className="state-dot" />
          系统在线
        </div>
        <div className="clock">
          <span>{date}</span>
          <strong>{time}</strong>
        </div>
        <div className="avatar" title="Lin-Ziyue">LZ</div>
      </div>
    </header>
  )
}
