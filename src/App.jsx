import { useState } from 'react'
import Header from './components/Header'
import BridgeViewport from './components/BridgeViewport'
import KpiGrid from './components/KpiGrid'
import MonitorChart from './components/MonitorChart'
import SensorTable from './components/SensorTable'
import { sensors } from './data/mock'
import { gradientCss, palettes } from './data/palettes'
import './App.css'

export default function App() {
  const [paletteName, setPaletteName] = useState('ocean')
  const [selectedSensor, setSelectedSensor] = useState('S-02')
  const activeSensor = sensors.find((sensor) => sensor.id === selectedSensor) || sensors[0]
  const palette = palettes[paletteName]

  return (
    <div className="app-shell">
      <Header />

      <main className="dashboard">
        <section className="viewport-panel panel">
          <div className="viewport-head">
            <div className="viewport-title">
              <span className="eyebrow">REAL-TIME FINITE ELEMENT VIEW</span>
              <h2>桥梁三维热力模型</h2>
              <p>实时应变云图 · 拖拽旋转查看结构响应</p>
            </div>
            <div className="viewport-badges">
              <label className="palette-control">
                <span>配色</span>
                <select value={paletteName} onChange={(event) => setPaletteName(event.target.value)}>
                  {Object.entries(palettes).map(([name, item]) => (
                    <option key={name} value={name}>{item.label}</option>
                  ))}
                </select>
              </label>
              <span className="live-badge"><i />实时</span>
              <span className="model-chip">MODEL 30205080</span>
            </div>
          </div>

          <div className="viewport-stage">
            <BridgeViewport
              paletteName={paletteName}
              selectedSensor={selectedSensor}
              onSelectSensor={setSelectedSensor}
            />

            <div className="heat-legend">
              <div className="legend-head">
                <span>应变 strain_xx</span>
                <span>{palette.label} · με</span>
              </div>
              <div className="legend-bar" style={{ background: gradientCss(palette.stops) }} />
              <div className="legend-ticks">
                <span>-5.81</span>
                <span>0</span>
                <span>+5.81</span>
              </div>
            </div>

            <div className="viewport-hint">拖拽旋转 · 滚轮缩放</div>
          </div>
        </section>

        <aside className="side-panel">
          <KpiGrid />

          <section className="chart-panel panel">
            <div className="panel-heading">
              <div>
                <h3>应变历史记录</h3>
                <p>{activeSensor.id} · 近 12 小时 · 单位 με</p>
              </div>
              <span className="panel-tag">HISTORY</span>
            </div>

            <div className="sensor-chips">
              {sensors.map((sensor) => (
                <button
                  key={sensor.id}
                  type="button"
                  className={sensor.id === selectedSensor ? 'sensor-chip is-active' : 'sensor-chip'}
                  onClick={() => setSelectedSensor(sensor.id)}
                >
                  {sensor.id}
                </button>
              ))}
            </div>

            <MonitorChart sensor={activeSensor} />
          </section>

          <section className="table-panel panel">
            <div className="panel-heading">
              <div>
                <h3>传感器实时数据</h3>
                <p>6 个测点 · 采样频率 80 Hz</p>
              </div>
              <span className="panel-tag">SENSORS</span>
            </div>
            <SensorTable selected={selectedSensor} onSelect={setSelectedSensor} />
          </section>
        </aside>
      </main>

      <footer className="status-bar">
        <span className="footer-state"><i />数据链路正常</span>
        <span>模型 30205080 · 4221 节点</span>
        <span>视图 strain_xx</span>
        <span>采样 80 Hz</span>
        <span className="footer-spacer" />
        <span>BRIDGE MONITOR v1.0</span>
      </footer>
    </div>
  )
}
