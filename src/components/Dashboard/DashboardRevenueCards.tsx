import { memo } from "react";
import { Card } from "@/components/ui/card";
import { IndianRupee, Clock, Percent, Scissors } from "lucide-react";

interface RevenueStats {
  totalInvoiced: number;
  totalReceived: number;
  totalPending: number;
  totalGST: number;
  totalTDS: number;
  dueToDept: number;
}

export type RevenueCardType = "invoiced" | "received" | "pending" | "gst" | "tds";

interface DashboardRevenueCardsProps {
  revenueStats: RevenueStats;
  formatCurrency: (amount: number) => string;
  onCardClick?: (cardType: RevenueCardType) => void;
}

export const DashboardRevenueCards = memo(function DashboardRevenueCards({ revenueStats, formatCurrency, onCardClick }: DashboardRevenueCardsProps) {
  const handleClick = (cardType: RevenueCardType) => {
    if (onCardClick) {
      onCardClick(cardType);
    }
  };

  return (
    <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <Card 
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50 active:scale-[0.98]"
        onClick={() => handleClick("invoiced")}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">Total Invoiced</span>
          <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
        </div>
        <div className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 truncate">{formatCurrency(revenueStats.totalInvoiced)}</div>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">All invoices raised</p>
      </Card>

      <Card 
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow hover:border-green-500/50 active:scale-[0.98]"
        onClick={() => handleClick("received")}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">Received</span>
          <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
        </div>
        <div className="text-lg sm:text-2xl font-bold text-green-600 mt-1 sm:mt-2 truncate">{formatCurrency(revenueStats.totalReceived)}</div>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">Paid invoices</p>
      </Card>

      <Card 
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow hover:border-amber-500/50 active:scale-[0.98]"
        onClick={() => handleClick("pending")}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">Pending</span>
          <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
        </div>
        <div className="text-lg sm:text-2xl font-bold text-amber-600 mt-1 sm:mt-2 truncate">{formatCurrency(revenueStats.totalPending)}</div>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">Awaiting payment</p>
      </Card>

      {/* Due to Dept - Orange themed card */}
      <Card 
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow hover:border-orange-500/50 active:scale-[0.98] bg-gradient-to-br from-orange-50 to-background border-orange-200"
        onClick={() => handleClick("gst")}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-orange-600">Due to Dept</span>
          <div className="p-1.5 bg-orange-100 rounded-md">
            <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-bold text-orange-700 mt-1 sm:mt-2 truncate">{formatCurrency(revenueStats.dueToDept)}</div>
        <p className="text-[10px] sm:text-xs text-orange-500 mt-0.5 sm:mt-1 hidden sm:block">Pending to pay</p>
      </Card>

      <Card 
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow hover:border-purple-500/50 active:scale-[0.98] col-span-2 sm:col-span-1"
        onClick={() => handleClick("tds")}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">TDS</span>
          <Scissors className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
        </div>
        <div className="text-lg sm:text-2xl font-bold text-purple-600 mt-1 sm:mt-2 truncate">{formatCurrency(revenueStats.totalTDS)}</div>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">Total TDS deducted</p>
      </Card>
    </div>
  );
});
