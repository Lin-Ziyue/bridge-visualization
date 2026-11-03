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

export const sensors = [
  {
    id: 'S-00',
    name: '0# 墩顶',
    coord: { x: 0.05, y: -0.05, z: 0 },
    strain: -5.81,
    status: 'normal',
    history: [-4.92, -5.08, -5.21, -5.34, -5.18, -5.42, -5.55, -5.61, -5.48, -5.72, -5.66, -5.81],
  },
  {
    id: 'S-01',
    name: '1/4 跨',
    coord: { x: 0.55, y: -0.05, z: 0 },
    strain: 3.24,
    status: 'normal',
    history: [2.71, 2.84, 2.92, 3.05, 2.96, 3.12, 3.21, 3.18, 3.29, 3.36, 3.3, 3.24],
  },
  {
    id: 'S-02',
    name: '1/2 跨中',
    coord: { x: 1.0, y: -0.05, z: 0 },
    strain: 5.12,
    status: 'warning',
    history: [3.12, 3.36, 3.58, 3.72, 3.64, 3.91, 4.12, 4.26, 4.08, 4.35, 4.52, 5.12],
  },
  {
    id: 'S-03',
    name: '3/4 跨',
    coord: { x: 1.45, y: -0.05, z: 0 },
    strain: 2.66,
    status: 'normal',
    history: [2.12, 2.24, 2.3, 2.41, 2.36, 2.48, 2.55, 2.51, 2.6, 2.63, 2.59, 2.66],
  },
  {
    id: 'S-04',
    name: '边跨',
    coord: { x: 1.9, y: -0.05, z: 0 },
    strain: 1.08,
    status: 'normal',
    history: [0.82, 0.91, 0.88, 1.02, 1.12, 1.04, 1.18, 1.22, 1.16, 1.28, 1.24, 1.08],
  },
  {
    id: 'S-05',
    name: '支座',
    coord: { x: 0.3, y: 0.05, z: 0.03 },
    strain: -0.84,
    status: 'normal',
    history: [-0.62, -0.68, -0.71, -0.69, -0.74, -0.78, -0.8, -0.76, -0.82, -0.79, -0.81, -0.84],
  },
]

export const statusText = {
  normal: '正常',
  warning: '关注',
  offline: '离线',
}
