import { shortDate } from '@/lib/time';
import type { CircleMembershipInfo, CircleSummary } from '@/lib/types';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "4 members · 20 credits/mo", as the web's circle cards read. */
export const circleMeta = (circle: CircleSummary) =>
  [
    plural(circle.member_count ?? 0, 'member', 'members'),
    circle.is_free ? 'Free' : `${circle.monthly_price_credits ?? 0} credits/mo`,
  ].join(' · ');

/** One line on where a membership stands, for the Circles tab. */
export function membershipLine(membership: CircleMembershipInfo): string {
  const renews = shortDate(membership.renews_at);

  if (membership.status === 'paused') return 'Paused · top up to rejoin the chat';
  if (membership.status === 'cancelled') return renews ? `Leaving · access until ${renews}` : 'Left';

  return renews ? `Member · renews ${renews}` : 'Member';
}

export const circleRoute = (circle: Pick<CircleSummary, 'id'>) => ({
  pathname: '/circle/[id]' as const,
  params: { id: String(circle.id) },
});
