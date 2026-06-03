import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";
import { fetchMeterBalance, formatCredits, parseCredits } from "../lib/metering";

type CreditBalanceProps = {
  collapsed?: boolean;
  className?: string;
};

export function CreditBalance({ collapsed = false, className }: CreditBalanceProps) {
  const { accessToken } = useAuth();

  const balanceQuery = useQuery({
    queryKey: ["metering", "balance"],
    queryFn: () => fetchMeterBalance(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const available = parseCredits(balanceQuery.data?.available_credits);
  const pipelineCost = parseCredits(balanceQuery.data?.rates.pipeline_run_credits);
  const revisionCost = parseCredits(balanceQuery.data?.rates.revision_credits);
  const lowBalance = balanceQuery.isSuccess && available < pipelineCost;

  if (!accessToken) return null;

  const label = balanceQuery.isLoading
    ? "…"
    : balanceQuery.isError
      ? "—"
      : formatCredits(available);

  const title = balanceQuery.isSuccess
    ? `Available: ${formatCredits(available)} credits · Pipeline: ${formatCredits(pipelineCost)} · Revision: ${formatCredits(revisionCost)}`
    : "Credit balance";

  return (
    <div
      className={clsx(
        "credit-balance",
        lowBalance && "credit-balance--low",
        collapsed && "credit-balance--collapsed",
        className,
      )}
      title={title}
    >
      <span className="credit-balance__icon" aria-hidden>
        ◈
      </span>
      {!collapsed ? (
        <span className="credit-balance__text">
          <span className="credit-balance__value">{label}</span>
          <span className="credit-balance__unit">credits</span>
        </span>
      ) : (
        <span className="sr-only">{label} credits available</span>
      )}
    </div>
  );
}
