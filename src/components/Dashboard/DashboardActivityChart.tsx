import { memo } from "react";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface DailyActivityData {
  date: string;
  calls: number;
  emails: number;
  whatsapp: number;
  sms: number;
}

interface DashboardActivityChartProps {
  data: DailyActivityData[];
  isLoading?: boolean;
}

export const DashboardActivityChart = memo(function DashboardActivityChart({ data, isLoading }: DashboardActivityChartProps) {
  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="mb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </div>
        <Skeleton className="h-[180px] w-full" />
      </Card>
    );
  }

  const hasData = data.some(d => d.calls > 0 || d.emails > 0 || d.whatsapp > 0 || d.sms > 0);

  return (
    <Card className="p-3">
      <div className="mb-2">
        <h3 className="text-sm font-medium">Communication Activity</h3>
        <p className="text-[10px] text-muted-foreground">Daily trends for calls, emails, WhatsApp & SMS</p>
      </div>
      {!hasData ? (
        <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
          No activity data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 9 }} 
              className="text-muted-foreground" 
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              tick={{ fontSize: 9 }} 
              className="text-muted-foreground" 
              width={30}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '11px'
              }}
              labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px' }}
              iconSize={8}
            />
            <Line 
              type="monotone" 
              dataKey="calls" 
              stroke="#8B5CF6" 
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="Calls"
            />
            <Line 
              type="monotone" 
              dataKey="emails" 
              stroke="#F97316" 
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="Emails"
            />
            <Line 
              type="monotone" 
              dataKey="whatsapp" 
              stroke="#22C55E" 
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="WhatsApp"
            />
            <Line 
              type="monotone" 
              dataKey="sms" 
              stroke="#EC4899" 
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="SMS"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
});
