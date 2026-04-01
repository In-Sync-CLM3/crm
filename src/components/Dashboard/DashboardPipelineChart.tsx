import { memo } from "react";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface PipelineData {
  stage: string;
  count: number;
  value: number;
}

interface DashboardPipelineChartProps {
  data: PipelineData[];
}

const COLORS = ['#01B8AA', '#168980', '#8AD4EB', '#F2C80F', '#A66999', '#FE9666', '#FD625E'];

export const DashboardPipelineChart = memo(function DashboardPipelineChart({ data }: DashboardPipelineChartProps) {
  return (
    <Card className="p-3">
      <div className="mb-2">
        <h3 className="text-sm font-medium">Pipeline Distribution</h3>
        <p className="text-[10px] text-muted-foreground">Contacts across stages</p>
      </div>
      {data.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
          No pipeline data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ stage, percent }) => `${stage}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={60}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
});
