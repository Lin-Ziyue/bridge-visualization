export const kpis = [
  { label: '最大应变', value: '5.81', unit: 'με', tone: 'cyan', trend: '+0.42', hint: 'S-02 跨中' },
  { label: '平均应变', value: '1.92', unit: 'με', tone: 'blue', trend: '-0.08', hint: '全桥 6 个测点' },
  { label: '在线传感器', value: '6/6', unit: '', tone: 'green', trend: '100%', hint: '采样频率 80 Hz' },
  { label: '今日告警', value: '1', unit: '条', tone: 'amber', trend: '关注', hint: 'S-02 超阈值' },
]

export const timeLabels = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
]

const flatHistory = (value) => Array(timeLabels.length).fill(value)

export const sensors = [
  {
    id: 'S-00',
    name: '0# 墩顶',
    coord: { x: 0.05, y: -0.05, z: 0 },
    strain: -5.81,
    status: 'normal',
    history: flatHistory(-5.81),
  },
  {
    id: 'S-01',
    name: '1/4 跨',
    coord: { x: 0.55, y: -0.05, z: 0 },
    strain: 3.24,
    status: 'normal',
    history: flatHistory(3.24),
  },
  {
    id: 'S-02',
    name: '1/2 跨中',
    coord: { x: 1.0, y: -0.05, z: 0 },
    strain: 5.12,
    status: 'warning',
    history: flatHistory(5.12),
  },
  {
    id: 'S-03',
    name: '3/4 跨',
    coord: { x: 1.45, y: -0.05, z: 0 },
    strain: 2.66,
    status: 'normal',
    history: flatHistory(2.66),
  },
  {
    id: 'S-04',
    name: '边跨',
    coord: { x: 1.9, y: -0.05, z: 0 },
    strain: 1.08,
    status: 'normal',
    history: flatHistory(1.08),
  },
  {
    id: 'S-05',
    name: '支座',
    coord: { x: 0.3, y: 0.05, z: 0.03 },
    strain: -0.84,
    status: 'normal',
    history: flatHistory(-0.84),
  },
]

export const statusText = {
  normal: '正常',
  warning: '关注',
  offline: '离线',
}
