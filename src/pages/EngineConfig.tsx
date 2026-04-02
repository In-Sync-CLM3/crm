import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings,
  Save,
  Loader2,
  Target,
  BarChart3,
  Mail,
  Zap,
  Brain,
  AlertTriangle,
  Play,
  Search,
} from "lucide-react";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useNotification } from "@/hooks/useNotification";
import { LoadingState } from "@/components/common/LoadingState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfigRow {
  id: string;
  org_id: string;
  config_key: string;
  config_value: Record<string, any>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Describes a single field within a config section
interface FieldDef {
  key: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
  suffix?: string;
}

// Describes a config section (one config_key)
interface SectionDef {
  configKey: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  fields: FieldDef[];
  validate?: (values: Record<string, number>) => string | null;
}

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

const SECTIONS: SectionDef[] = [
  {
    configKey: "scoring_weights",
    title: "Scoring Weights",
    description:
      "Control how much each dimension contributes to a lead's overall score. The three weights must add up to 100.",
    icon: <Target className="h-4 w-4 text-white" />,
    iconBg: "bg-violet-500",
    fields: [
      {
        key: "fit",
        label: "Fit Weight",
        description:
          "How much company/industry match matters (company size, industry, location).",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "intent",
        label: "Intent Weight",
        description:
          "How much buying intent signals matter (website visits, content downloads).",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "engagement",
        label: "Engagement Weight",
        description:
          "How much direct engagement matters (email opens, replies, calls answered).",
        min: 0,
        max: 100,
        suffix: "%",
      },
    ],
    validate: (values) => {
      const sum = (values.fit || 0) + (values.intent || 0) + (values.engagement || 0);
      if (sum !== 100)
        return `Weights must add up to 100 (currently ${sum}).`;
      return null;
    },
  },
  {
    configKey: "score_thresholds",
    title: "Score Thresholds",
    description:
      "Define the score boundaries that trigger automatic actions on leads.",
    icon: <BarChart3 className="h-4 w-4 text-white" />,
    iconBg: "bg-blue-500",
    fields: [
      {
        key: "enrollment_min",
        label: "Enrollment Minimum",
        description:
          "Leads must reach this score before they are auto-enrolled into outbound sequences.",
        min: 0,
        max: 100,
      },
      {
        key: "conversion_min",
        label: "Conversion Minimum",
        description:
          "Leads at or above this score are flagged as ready for sales hand-off.",
        min: 0,
        max: 100,
      },
      {
        key: "disqualify_below",
        label: "Disqualify Below",
        description:
          "Leads that drop below this score are automatically disqualified and removed from sequences.",
        min: 0,
        max: 100,
      },
    ],
  },
  {
    configKey: "channel_limits",
    title: "Channel Daily Limits",
    description:
      "Set the maximum number of messages the engine can send per channel each day. Prevents over-messaging and protects sender reputation.",
    icon: <Mail className="h-4 w-4 text-white" />,
    iconBg: "bg-emerald-500",
    fields: [
      {
        key: "email_per_day",
        label: "Emails per Day",
        description: "Maximum outbound emails the engine will send daily.",
        min: 0,
        step: 10,
      },
      {
        key: "whatsapp_per_day",
        label: "WhatsApp per Day",
        description: "Maximum WhatsApp messages sent daily.",
        min: 0,
        step: 10,
      },
      {
        key: "call_per_day",
        label: "Calls per Day",
        description: "Maximum AI-assisted calls initiated daily.",
        min: 0,
        step: 5,
      },
      {
        key: "sms_per_day",
        label: "SMS per Day",
        description: "Maximum SMS messages sent daily.",
        min: 0,
        step: 10,
      },
    ],
  },
  {
    configKey: "rate_limits",
    title: "API Rate Limits",
    description:
      "Rate limits for external APIs. Change these only if your API plan limits have changed.",
    icon: <Zap className="h-4 w-4 text-white" />,
    iconBg: "bg-amber-500",
    fields: [
      {
        key: "apollo_per_hour",
        label: "Apollo Requests / Hour",
        description:
          "Maximum Apollo API requests per hour. Depends on your Apollo plan tier.",
        min: 0,
      },
      {
        key: "resend_per_second",
        label: "Resend Requests / Second",
        description:
          "Maximum Resend email API calls per second. Default is 10 for the Pro plan.",
        min: 0,
      },
      {
        key: "exotel_per_day",
        label: "Exotel Calls / Day",
        description: "Maximum Exotel API calls per day across all campaigns.",
        min: 0,
      },
    ],
  },
  {
    configKey: "llm_token_budget",
    title: "LLM Token Budgets",
    description:
      "Control daily token spend on AI models. The engine will pause LLM tasks when the budget is hit.",
    icon: <Brain className="h-4 w-4 text-white" />,
    iconBg: "bg-pink-500",
    fields: [
      {
        key: "daily_haiku_tokens",
        label: "Haiku Tokens / Day",
        description:
          "Daily token budget for Claude Haiku (used for classification, short replies).",
        min: 0,
        step: 10000,
      },
      {
        key: "daily_sonnet_tokens",
        label: "Sonnet Tokens / Day",
        description:
          "Daily token budget for Claude Sonnet (used for long-form content generation).",
        min: 0,
        step: 10000,
      },
      {
        key: "alert_threshold_pct",
        label: "Alert at % Used",
        description:
          "Send an alert when this percentage of the daily budget has been consumed.",
        min: 0,
        max: 100,
        suffix: "%",
      },
    ],
  },
  {
    configKey: "breakpoint_thresholds",
    title: "Breakpoint Thresholds",
    description:
      "Automated health-check thresholds. If any metric crosses its breakpoint, the engine pauses and alerts you.",
    icon: <AlertTriangle className="h-4 w-4 text-white" />,
    iconBg: "bg-red-500",
    fields: [
      {
        key: "mrr_growth_stall_pct",
        label: "MRR Growth Stall",
        description:
          "Alert when monthly recurring revenue growth drops below this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "revenue_decline_pct",
        label: "Revenue Decline",
        description:
          "Alert when month-over-month revenue declines by more than this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "cac_ceiling_paise",
        label: "CAC Ceiling (paise)",
        description:
          "Maximum acceptable Customer Acquisition Cost in paise (e.g., 1200000 = Rs 12,000).",
        min: 0,
        step: 100000,
      },
      {
        key: "gross_margin_floor_pct",
        label: "Gross Margin Floor",
        description:
          "Alert when gross margin falls below this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "trial_to_paid_floor_pct",
        label: "Trial-to-Paid Floor",
        description:
          "Alert when trial-to-paid conversion rate drops below this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "aha_to_paid_floor_pct",
        label: "Aha-to-Paid Floor",
        description:
          "Alert when aha-moment-to-paid conversion drops below this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "monthly_churn_ceiling_pct",
        label: "Monthly Churn Ceiling",
        description:
          "Alert when monthly churn rate exceeds this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "email_bounce_ceiling_pct",
        label: "Email Bounce Ceiling",
        description:
          "Alert when email bounce rate exceeds this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "wa_optout_ceiling_pct",
        label: "WhatsApp Opt-out Ceiling",
        description:
          "Alert when WhatsApp opt-out rate exceeds this percentage.",
        min: 0,
        max: 100,
        suffix: "%",
      },
      {
        key: "llm_daily_token_ceiling",
        label: "LLM Daily Token Ceiling",
        description:
          "Hard cap on total LLM tokens consumed per day (across all models).",
        min: 0,
        step: 10000,
      },
      {
        key: "dnc_complaint_ceiling_7d",
        label: "DNC Complaints / 7 Days",
        description:
          "Alert when Do-Not-Contact complaints in a 7-day window exceed this count.",
        min: 0,
      },
    ],
  },
  {
    configKey: "sequence_settings",
    title: "Sequence Executor",
    description:
      "Control how the sequence executor processes campaign steps. Larger batches run faster but use more resources.",
    icon: <Play className="h-4 w-4 text-white" />,
    iconBg: "bg-indigo-500",
    fields: [
      {
        key: "batch_size",
        label: "Batch Size",
        description:
          "Number of leads processed per batch when executing sequence steps.",
        min: 1,
        max: 500,
      },
      {
        key: "parallel_batch_size",
        label: "Parallel Batch Size",
        description:
          "Number of batches that run concurrently. Higher values speed up execution but increase API load.",
        min: 1,
        max: 50,
      },
      {
        key: "max_enrollments_per_campaign",
        label: "Max Enrollments / Campaign",
        description:
          "Hard limit on how many leads can be enrolled in a single campaign.",
        min: 1,
        step: 100,
      },
      {
        key: "max_actions_per_day",
        label: "Max Actions / Day",
        description:
          "Total number of sequence actions (across all campaigns) the engine will execute per day.",
        min: 1,
        step: 100,
      },
    ],
  },
  {
    configKey: "apollo_settings",
    title: "Apollo Sourcing",
    description:
      "Configure how the engine searches and enriches leads from Apollo.io.",
    icon: <Search className="h-4 w-4 text-white" />,
    iconBg: "bg-teal-500",
    fields: [
      {
        key: "max_results_per_search",
        label: "Max Leads per Search",
        description:
          "Maximum number of leads returned per Apollo search query.",
        min: 1,
        max: 500,
      },
      {
        key: "dedup_window_days",
        label: "Dedup Window (Days)",
        description:
          "If a lead was sourced within this many days, it will be skipped to prevent duplicates.",
        min: 1,
        max: 365,
      },
      {
        key: "min_enrichment_fields",
        label: "Min Enrichment Fields",
        description:
          "Minimum number of data fields a lead must have after enrichment to be accepted.",
        min: 1,
        max: 20,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// ConfigSection component
// ---------------------------------------------------------------------------

function ConfigSection({
  section,
  configRow,
  onSaveSuccess,
}: {
  section: SectionDef;
  configRow: ConfigRow | undefined;
  onSaveSuccess: () => void;
}) {
  const notify = useNotification();
  const { effectiveOrgId } = useOrgContext();

  // Local form state for this section
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync local state from the fetched configRow
  useEffect(() => {
    if (configRow) {
      const init: Record<string, number> = {};
      for (const field of section.fields) {
        const raw = configRow.config_value[field.key];
        init[field.key] = typeof raw === "number" ? raw : 0;
      }
      setValues(init);
      setDirty(false);
    }
  }, [configRow, section.fields]);

  const handleChange = useCallback(
    (key: string, raw: string) => {
      const num = raw === "" ? 0 : Number(raw);
      if (isNaN(num)) return;
      setValues((prev) => ({ ...prev, [key]: num }));
      setDirty(true);
    },
    []
  );

  const handleSave = async () => {
    // Validation: no negative values
    for (const field of section.fields) {
      const v = values[field.key] ?? 0;
      if (v < 0) {
        notify.error("Validation", `${field.label} cannot be negative.`);
        return;
      }
      if (field.min !== undefined && v < field.min) {
        notify.error("Validation", `${field.label} must be at least ${field.min}.`);
        return;
      }
      if (field.max !== undefined && v > field.max) {
        notify.error("Validation", `${field.label} must be at most ${field.max}.`);
        return;
      }
    }

    // Section-specific validation
    if (section.validate) {
      const err = section.validate(values);
      if (err) {
        notify.error("Validation", err);
        return;
      }
    }

    setSaving(true);

    try {
      // Merge with any existing keys we don't manage (defensive)
      const mergedValue = { ...(configRow?.config_value || {}), ...values };

      if (configRow) {
        // Update existing row
        const { error } = await supabase
          .from("mkt_engine_config")
          .update({ config_value: mergedValue })
          .eq("id", configRow.id);
        if (error) throw error;
      } else {
        // Insert new row (shouldn't normally happen if seeded)
        const { error } = await supabase.from("mkt_engine_config").insert({
          org_id: effectiveOrgId,
          config_key: section.configKey,
          config_value: mergedValue,
          description: section.description,
        });
        if (error) throw error;
      }

      notify.success(`${section.title} saved`);
      setDirty(false);
      onSaveSuccess();
    } catch (err: any) {
      notify.error(`Failed to save ${section.title}`, err);
    } finally {
      setSaving(false);
    }
  };

  // Compute sum hint for scoring weights
  const weightSum =
    section.configKey === "scoring_weights"
      ? (values.fit || 0) + (values.intent || 0) + (values.engagement || 0)
      : null;

  return (
    <Card>
      <CardHeader className="py-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${section.iconBg}`}
            >
              {section.icon}
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                {section.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {section.description}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        {!configRow ? (
          <p className="text-xs text-muted-foreground italic">
            No configuration found. Values will be created on first save.
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {section.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs font-medium">{field.label}</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={values[field.key] ?? ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="text-sm pr-8"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  readOnly={field.readOnly}
                  disabled={field.readOnly}
                />
                {field.suffix && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    {field.suffix}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {field.description}
              </p>
            </div>
          ))}
        </div>

        {/* Weight sum indicator */}
        {weightSum !== null && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
              weightSum === 100
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {weightSum === 100
              ? "Weights sum to 100 — valid."
              : `Weights sum to ${weightSum} — must equal 100.`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export default function EngineConfig() {
  const { effectiveOrgId } = useOrgContext();
  const queryClient = useQueryClient();

  // Fetch all config rows for this org
  const {
    data: configRows = [],
    isLoading,
  } = useQuery({
    queryKey: ["mkt_engine_config", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("mkt_engine_config")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("config_key");
      if (error) throw error;
      return (data || []) as ConfigRow[];
    },
    enabled: !!effectiveOrgId,
  });

  // Build a lookup by config_key
  const configMap: Record<string, ConfigRow> = {};
  for (const row of configRows) {
    configMap[row.config_key] = row;
  }

  const handleSaveSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["mkt_engine_config"] });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!effectiveOrgId) {
    return (
      <DashboardLayout>
        <LoadingState message="Loading organization..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Engine Configuration</h1>
            <p className="text-xs text-muted-foreground">
              Fine-tune the Autonomous Revenue Engine. Changes take effect on
              the next engine run.
            </p>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading configuration..." />
        ) : (
          <div className="space-y-4">
            {SECTIONS.map((section) => (
              <ConfigSection
                key={section.configKey}
                section={section}
                configRow={configMap[section.configKey]}
                onSaveSuccess={handleSaveSuccess}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
