import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { isTerminal } from "./paymentStatus";

export function usePayment(paymentId: string | null) {
  return useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => api.getPayment(paymentId as string),
    enabled: !!paymentId,
    refetchInterval: (q) => (isTerminal(q.state.data?.status) ? false : 2000),
  });
}
