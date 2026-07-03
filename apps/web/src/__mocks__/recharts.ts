const React = require('react');

module.exports = {
  ResponsiveContainer: ({ children, width, height }) =>
    React.createElement('div', { 'data-testid': 'responsive-container', style: { width, height } }, children),
  BarChart: ({ children }) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  LineChart: ({ children }) => React.createElement('div', { 'data-testid': 'line-chart' }, children),
  Line: () => null,
  PieChart: ({ children }) => React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  Pie: () => null,
  Cell: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
};
