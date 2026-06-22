import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

type HistoryPoint = { price: number; t: string };

type Props = {
  tokenId: string;
  hours?: number;
  height?: number;
};

// Sparkline backed by the priceHistory table. portfolioSync samples once
// a minute per held token, retention is 7d, so a fresh token will render
// flat until the first sample lands. When no rows exist yet, we draw a
// neutral 0.5 line so the layout still occupies its slot.
export function Sparkline({ tokenId, hours = 24, height = 48 }: Props) {
  const { data } = useQuery<HistoryPoint[]>({
    queryKey: ["price-history", tokenId, hours],
    queryFn: () => api.get<HistoryPoint[]>(`/api/price-history/${tokenId}?hours=${hours}`),
    enabled: !!tokenId,
    staleTime: 30_000,
  });

  const points = (data ?? []).length > 0
    ? data!.map((d, i) => ({ i, price: d.price }))
    : [{ i: 0, price: 0.5 }, { i: 1, price: 0.5 }];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line
          type="monotone"
          dataKey="price"
          dot={false}
          strokeWidth={1.5}
          stroke="hsl(var(--primary))"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
