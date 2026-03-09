import { useCallback } from "react";

const CACHE_KEY = "billing_client_details";

export interface CachedBillingDetails {
  invoice_company_name: string;
  gstin: string;
  pan: string;
  billing_address: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
}

function loadCache(): Record<string, CachedBillingDetails> {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {};
}

function saveCache(cache: Record<string, CachedBillingDetails>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export function useBillingClientCache() {
  const getClientBillingDetails = useCallback((clientId: string): CachedBillingDetails | null => {
    const cache = loadCache();
    return cache[clientId] || null;
  }, []);

  const saveClientBillingDetails = useCallback((clientId: string, details: CachedBillingDetails) => {
    // Only save if there's meaningful data
    const hasData = details.gstin || details.pan || details.billing_address || details.state;
    if (!hasData) return;

    const cache = loadCache();
    cache[clientId] = details;
    saveCache(cache);
  }, []);

  const getAllCachedClients = useCallback((): Record<string, CachedBillingDetails> => {
    return loadCache();
  }, []);

  return {
    getClientBillingDetails,
    saveClientBillingDetails,
    getAllCachedClients,
  };
}
