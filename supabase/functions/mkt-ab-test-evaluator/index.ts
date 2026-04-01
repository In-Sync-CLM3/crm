import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_CONFIDENCE = 0.95;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-ab-test-evaluator');

  try {
    const supabase = getSupabaseClient();

    // Fetch active A/B tests
    const { data: tests, error: testsError } = await supabase
      .from('mkt_ab_tests')
      .select(`
        *,
        mkt_ab_test_results (*)
      `)
      .eq('status', 'active');

    if (testsError) throw testsError;

    if (!tests || tests.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active A/B tests', evaluated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('evaluation-start', { test_count: tests.length });

    let evaluated = 0;
    let winnersFound = 0;

    for (const test of tests) {
      const results = test.mkt_ab_test_results || [];
      if (results.length < 2) continue;

      // Calculate rates for each variant
      const metric = test.metric || 'click_rate';
      const variantStats = results.map((r: Record<string, unknown>) => ({
        variant: r.variant as string,
        sends: (r.sends as number) || 0,
        opens: (r.opens as number) || 0,
        clicks: (r.clicks as number) || 0,
        replies: (r.replies as number) || 0,
        conversions: (r.conversions as number) || 0,
      }));

      // Update calculated rates
      for (const vs of variantStats) {
        if (vs.sends > 0) {
          const rates = {
            open_rate: vs.opens / vs.sends,
            click_rate: vs.clicks / vs.sends,
            reply_rate: vs.replies / vs.sends,
            conversion_rate: vs.conversions / vs.sends,
          };

          await supabase
            .from('mkt_ab_test_results')
            .update(rates)
            .eq('ab_test_id', test.id)
            .eq('variant', vs.variant);
        }
      }

      // Check if minimum samples reached
      const minSamples = test.min_samples || 100;
      const allHaveMinSamples = variantStats.every((v) => v.sends >= minSamples);

      if (!allHaveMinSamples) {
        await logger.info('test-insufficient-samples', {
          test_id: test.id,
          test_name: test.name,
          samples: variantStats.map((v) => ({ variant: v.variant, sends: v.sends })),
          min_required: minSamples,
        });
        continue;
      }

      // Run chi-squared test for statistical significance
      const metricKey = metric.replace('_rate', '') as 'open' | 'click' | 'reply' | 'conversion';
      const successKey = `${metricKey}s` as 'opens' | 'clicks' | 'replies' | 'conversions';

      const chiResult = chiSquaredTest(
        variantStats.map((v) => ({
          successes: (v as Record<string, number>)[successKey] || 0,
          total: v.sends,
        }))
      );

      evaluated++;

      if (chiResult.significant && chiResult.confidence >= MIN_CONFIDENCE) {
        // Find the winner (highest rate)
        const rateKey = metric as string;
        let bestVariant = variantStats[0];
        for (const vs of variantStats) {
          const vsRate = vs.sends > 0 ? ((vs as Record<string, number>)[successKey] || 0) / vs.sends : 0;
          const bestRate = bestVariant.sends > 0 ? ((bestVariant as Record<string, number>)[successKey] || 0) / bestVariant.sends : 0;
          if (vsRate > bestRate) bestVariant = vs;
        }

        // Generate analysis using Sonnet
        let analysis = '';
        try {
          const analysisResponse = await callLLM(
            `Analyze this A/B test result and explain why variant ${bestVariant.variant} won.

Test name: ${test.name}
Metric: ${metric}
Confidence: ${(chiResult.confidence * 100).toFixed(1)}%

Results:
${variantStats.map((v) => {
  const rate = v.sends > 0 ? (((v as Record<string, number>)[successKey] || 0) / v.sends * 100).toFixed(1) : '0';
  return `Variant ${v.variant}: ${v.sends} sends, ${(v as Record<string, number>)[successKey]} ${metricKey}s (${rate}%)`;
}).join('\n')}

In 2-3 sentences, explain what likely made variant ${bestVariant.variant} more effective. Focus on actionable insights.`,
            { model: 'sonnet', max_tokens: 256, temperature: 0.3 }
          );
          analysis = analysisResponse.content;
        } catch {
          analysis = `Variant ${bestVariant.variant} showed statistically significant better performance on ${metric}.`;
        }

        // Declare winner
        await supabase
          .from('mkt_ab_tests')
          .update({
            status: 'completed',
            winner: bestVariant.variant,
            confidence: chiResult.confidence,
            analysis,
            completed_at: new Date().toISOString(),
          })
          .eq('id', test.id);

        winnersFound++;

        await logger.info('winner-declared', {
          test_id: test.id,
          test_name: test.name,
          winner: bestVariant.variant,
          confidence: chiResult.confidence,
          metric,
        });
      } else {
        await logger.info('test-not-significant', {
          test_id: test.id,
          test_name: test.name,
          confidence: chiResult.confidence,
          required: MIN_CONFIDENCE,
        });
      }
    }

    await logger.info('evaluation-complete', { evaluated, winners_found: winnersFound });

    return new Response(
      JSON.stringify({ message: 'A/B evaluation complete', evaluated, winners_found: winnersFound }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('evaluator-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Chi-squared test for independence between variants.
 */
function chiSquaredTest(
  variants: Array<{ successes: number; total: number }>
): { chiSquared: number; confidence: number; significant: boolean } {
  const totalSuccesses = variants.reduce((s, v) => s + v.successes, 0);
  const totalSamples = variants.reduce((s, v) => s + v.total, 0);

  if (totalSamples === 0 || totalSuccesses === 0) {
    return { chiSquared: 0, confidence: 0, significant: false };
  }

  const overallRate = totalSuccesses / totalSamples;

  let chiSquared = 0;
  for (const variant of variants) {
    const expectedSuccess = variant.total * overallRate;
    const expectedFailure = variant.total * (1 - overallRate);

    if (expectedSuccess > 0) {
      chiSquared += Math.pow(variant.successes - expectedSuccess, 2) / expectedSuccess;
    }
    if (expectedFailure > 0) {
      const failures = variant.total - variant.successes;
      chiSquared += Math.pow(failures - expectedFailure, 2) / expectedFailure;
    }
  }

  // Degrees of freedom = (rows - 1) * (cols - 1) = (variants - 1) * 1
  const df = variants.length - 1;

  // Approximate p-value using chi-squared CDF
  const confidence = 1 - chiSquaredCDF(chiSquared, df);

  return {
    chiSquared,
    confidence: 1 - confidence, // Convert p-value to confidence
    significant: confidence < (1 - MIN_CONFIDENCE),
  };
}

/**
 * Approximate chi-squared CDF using the regularized incomplete gamma function.
 * Simple approximation for df=1 (most common case: 2 variants).
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x <= 0) return 0;

  // For df=1, chi-squared CDF = 2 * Phi(sqrt(x)) - 1
  // where Phi is the standard normal CDF
  if (df === 1) {
    return erf(Math.sqrt(x / 2));
  }

  // For other df, use Wilson-Hilferty approximation
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return normalCDF(z / denom);
}

/**
 * Error function approximation.
 */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const result = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? result : -result;
}

/**
 * Standard normal CDF approximation.
 */
function normalCDF(x: number): number {
  return (1 + erf(x / Math.SQRT2)) / 2;
}
