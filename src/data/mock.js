export const kpis = [
  { label: '最大应变', value: '5.81', unit: 'με', tone: 'cyan', trend: '+0.42', hint: 'S-02 跨中' },
  { label: '平均应变', value: '1.92', unit: 'με', tone: 'blue', trend: '-0.08', hint: '全桥 6 个测点' },
  { label: '在线传感器', value: '6/6', unit: '', tone: 'green', trend: '100%', hint: '采样频率 1 Hz' },
  { label: '今日告警', value: '1', unit: '条', tone: 'amber', trend: '关注', hint: 'S-02 超阈值' },
]

export const trend = {
  times: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  series: [
    { name: 'S-00 墩顶', color: '#38d6ff', data: [-4.92, -5.08, -5.21, -5.34, -5.18, -5.42, -5.55, -5.61, -5.48, -5.72, -5.66, -5.81] },
    { name: 'S-02 跨中', color: '#3f7bff', data: [3.12, 3.36, 3.58, 3.72, 3.64, 3.91, 4.12, 4.26, 4.08, 4.35, 4.52, 4.68] },
    { name: 'S-04 边跨', color: '#ffb547', data: [0.82, 0.91, 0.88, 1.02, 1.12, 1.04, 1.18, 1.22, 1.16, 1.28, 1.24, 1.31] },
  ],
}

export const sensors = [
  { id: 'S-00', position: '0# 墩顶', strain: -5.81, temp: 18.4, status: 'normal' },
  { id: 'S-01', position: '1/4 跨', strain: 3.24, temp: 18.7, status: 'normal' },
  { id: 'S-02', position: '1/2 跨中', strain: 5.12, temp: 19.1, status: 'warning' },
  { id: 'S-03', position: '3/4 跨', strain: 2.66, temp: 18.9, status: 'normal' },
  { id: 'S-04', position: '边跨', strain: 1.08, temp: 18.2, status: 'normal' },
  { id: 'S-05', position: '支座', strain: -0.84, temp: 17.9, status: 'normal' },
]

export const statusText = {
  normal: '正常',
  warning: '关注',
  offline: '离线',
}
