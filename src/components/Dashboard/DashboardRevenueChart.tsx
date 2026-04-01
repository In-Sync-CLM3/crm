import { memo } from "react";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from "recharts";

interface DashboardRevenueChartProps {
  data: Array<{ month: string; [key: string]: string | number }>;
  clients: string[];
  formatCurrency: (amount: number) => string;
}

// Color palette for clients
const clientColors = [
  "#01B8AA",
  "#F2C80F",
  "#FD625E",
  "#8073AC",
  "#5F6B6D",
  "#00B294",
  "#E66C37",
  "#B6479B",
  "#4B7BEC",
  "#20BF6B",
];

export const DashboardRevenueChart = memo(function DashboardRevenueChart({ data, clients, formatCurrency }: DashboardRevenueChartProps) {
  return (
    <Card className="p-3">
      <div className="mb-2">
        <h3 className="text-sm font-medium">Monthly Revenue by Client</h3>
        <p className="text-[10px] text-muted-foreground">Revenue breakdown by client (last 6 months)</p>
      </div>
      {data.length === 0 || clients.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs">
          No revenue data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {clients.map((client, index) => (
                <linearGradient key={client} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={clientColors[index % clientColors.length]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={clientColors[index % clientColors.length]} stopOpacity={0.1}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis 
              tick={{ fontSize: 10 }} 
              className="text-muted-foreground"
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '11px'
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px' }} 
              formatter={(value) => value.length > 15 ? `${value.substring(0, 15)}...` : value}
            />
            {clients.map((client, index) => (
              <Area 
                key={client}
                type="monotone"
                dataKey={client}
                name={client}
                stackId="1"
                stroke={clientColors[index % clientColors.length]}
                fill={`url(#gradient-${index})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
});