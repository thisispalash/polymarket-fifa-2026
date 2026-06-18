import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

type DetailOutcome = {
  tokenId: string;
  name: string;
  bestBid: number | null;
  bestAsk: number | null;
  book: {
    bids: { price: number; size: number }[];
    asks: { price: number; size: number }[];
  };
};

type MarketDetail = {
  id: string;
  question: string;
  outcomes: DetailOutcome[];
};

type Props = {
  marketId: string;
  height?: number;
};

export function Sparkline({ marketId, height = 48 }: Props) {
  const { data } = useQuery<MarketDetail>({
    queryKey: ["market-detail", marketId],
    queryFn: () => api.get<MarketDetail>(`/api/markets/${marketId}`),
    staleTime: 10_000,
  });

  const bids = data?.outcomes[0]?.book.bids ?? [];
  const points = bids.length > 0
    ? bids.slice(0, 12).map((b, i) => ({ i, price: b.price }))
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
