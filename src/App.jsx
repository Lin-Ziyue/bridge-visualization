import Header from './components/Header'
import BridgeViewport from './components/BridgeViewport'
import KpiGrid from './components/KpiGrid'
import MonitorChart from './components/MonitorChart'
import SensorTable from './components/SensorTable'
import './App.css'

export default function App() {
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
              <span className="live-badge"><i />实时</span>
              <span className="model-chip">MODEL 30205080</span>
            </div>
          </div>

          <div className="viewport-stage">
            <BridgeViewport />

            <div className="heat-legend">
              <div className="legend-head">
                <span>应变 strain_xx</span>
                <span>με</span>
              </div>
              <div className="legend-bar" />
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
                <h3>监测点应变趋势</h3>
                <p>近 12 小时 · 单位 με</p>
              </div>
              <span className="panel-tag">LIVE</span>
            </div>
            <MonitorChart />
          </section>

          <section className="table-panel panel">
            <div className="panel-heading">
              <div>
                <h3>传感器实时数据</h3>
                <p>6 个测点 · 采样频率 1 Hz</p>
              </div>
              <span className="panel-tag">SENSORS</span>
            </div>
            <SensorTable />
          </section>
        </aside>
      </main>

      <footer className="status-bar">
        <span className="footer-state"><i />数据链路正常</span>
        <span>模型 30205080 · 4221 节点</span>
        <span>视图 strain_xx</span>
        <span className="footer-spacer" />
        <span>BRIDGE MONITOR v1.0</span>
      </footer>
    </div>
  )
}
